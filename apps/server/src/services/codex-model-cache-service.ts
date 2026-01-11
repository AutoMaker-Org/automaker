import path from 'path';
import { secureFs } from '@automaker/platform';
import { createLogger } from '@automaker/utils';
import type { AppServerModel } from '@automaker/types';
import type { CodexAppServerService } from './codex-app-server-service.js';

const logger = createLogger('CodexModelCache');

/**
 * Codex model with UI-compatible format
 */
export interface CodexModel {
  id: string;
  label: string;
  description: string;
  hasThinking: boolean;
  supportsVision: boolean;
  tier: 'premium' | 'standard' | 'basic';
  isDefault: boolean;
}

/**
 * Cache structure stored on disk
 */
interface CodexModelCache {
  models: CodexModel[];
  cachedAt: number;
  ttl: number;
}

/**
 * CodexModelCacheService
 *
 * Caches Codex models fetched from app-server with TTL-based invalidation and disk persistence.
 *
 * Features:
 * - 1-hour TTL (configurable)
 * - Atomic file writes (temp file + rename)
 * - Thread-safe (deduplicates concurrent refresh requests)
 * - Auto-bootstrap on service creation
 * - Graceful fallback (returns empty array on errors)
 */
export class CodexModelCacheService {
  private cacheFilePath: string;
  private ttl: number;
  private appServerService: CodexAppServerService;
  private inFlightRefresh: Promise<CodexModel[]> | null = null;

  constructor(
    dataDir: string,
    appServerService: CodexAppServerService,
    ttl: number = 3600000 // 1 hour default
  ) {
    this.cacheFilePath = path.join(dataDir, 'codex-models-cache.json');
    this.ttl = ttl;
    this.appServerService = appServerService;
  }

  /**
   * Get models from cache or fetch if stale
   *
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   * @returns Array of Codex models (empty array if unavailable)
   */
  async getModels(forceRefresh = false): Promise<CodexModel[]> {
    // If force refresh, skip cache
    if (forceRefresh) {
      return this.refreshModels();
    }

    // Try to load from cache
    const cached = await this.loadFromCache();
    if (cached) {
      const age = Date.now() - cached.cachedAt;
      const isStale = age > cached.ttl;

      if (!isStale) {
        logger.info(
          `[getModels] ✓ Using cached models (${cached.models.length} models, age: ${Math.round(age / 60000)}min)`
        );
        return cached.models;
      }
    }

    // Cache is stale or missing, refresh
    return this.refreshModels();
  }

  /**
   * Get models with cache metadata
   *
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   * @returns Object containing models and cache timestamp
   */
  async getModelsWithMetadata(
    forceRefresh = false
  ): Promise<{ models: CodexModel[]; cachedAt: number }> {
    const models = await this.getModels(forceRefresh);

    // Try to get the actual cache timestamp
    const cached = await this.loadFromCache();
    const cachedAt = cached?.cachedAt ?? Date.now();

    return { models, cachedAt };
  }

  /**
   * Refresh models from app-server and update cache
   *
   * Thread-safe: Deduplicates concurrent refresh requests
   */
  async refreshModels(): Promise<CodexModel[]> {
    // Deduplicate concurrent refresh requests
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    // Start new refresh
    this.inFlightRefresh = this.doRefresh();

    try {
      const models = await this.inFlightRefresh;
      return models;
    } finally {
      this.inFlightRefresh = null;
    }
  }

  /**
   * Clear the cache file
   */
  async clearCache(): Promise<void> {
    logger.info('[clearCache] Clearing cache...');

    try {
      await secureFs.unlink(this.cacheFilePath);
      logger.info('[clearCache] Cache cleared');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('[clearCache] Failed to clear cache:', error);
      }
    }
  }

  /**
   * Internal method to perform the actual refresh
   */
  private async doRefresh(): Promise<CodexModel[]> {
    try {
      // Check if app-server is available
      const isAvailable = await this.appServerService.isAvailable();
      if (!isAvailable) {
        return [];
      }

      // Fetch models from app-server
      const response = await this.appServerService.getModels();
      if (!response || !response.data) {
        return [];
      }

      // Transform models to UI format
      const models = response.data.map((model) => this.transformModel(model));

      // Save to cache
      await this.saveToCache(models);

      logger.info(`[refreshModels] ✓ Fetched fresh models (${models.length} models)`);

      return models;
    } catch (error) {
      logger.error('[doRefresh] Refresh failed:', error);
      return [];
    }
  }

  /**
   * Transform app-server model to UI-compatible format
   */
  private transformModel(appServerModel: AppServerModel): CodexModel {
    return {
      id: `codex-${appServerModel.id}`, // Add 'codex-' prefix for compatibility
      label: appServerModel.displayName,
      description: appServerModel.description,
      hasThinking: appServerModel.supportedReasoningEfforts.length > 0,
      supportsVision: true, // All Codex models support vision
      tier: this.inferTier(appServerModel.id),
      isDefault: appServerModel.isDefault,
    };
  }

  /**
   * Infer tier from model ID
   */
  private inferTier(modelId: string): 'premium' | 'standard' | 'basic' {
    if (modelId.includes('max') || modelId.includes('gpt-5.2-codex')) {
      return 'premium';
    }
    if (modelId.includes('mini')) {
      return 'basic';
    }
    return 'standard';
  }

  /**
   * Load cache from disk
   */
  private async loadFromCache(): Promise<CodexModelCache | null> {
    try {
      const content = await secureFs.readFile(this.cacheFilePath, 'utf-8');
      const cache = JSON.parse(content.toString()) as CodexModelCache;

      // Validate cache structure
      if (!Array.isArray(cache.models) || typeof cache.cachedAt !== 'number') {
        logger.warn('[loadFromCache] Invalid cache structure, ignoring');
        return null;
      }

      return cache;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('[loadFromCache] Failed to read cache:', error);
      }
      return null;
    }
  }

  /**
   * Save cache to disk (atomic write)
   */
  private async saveToCache(models: CodexModel[]): Promise<void> {
    const cache: CodexModelCache = {
      models,
      cachedAt: Date.now(),
      ttl: this.ttl,
    };

    const tempPath = `${this.cacheFilePath}.tmp.${Date.now()}`;

    try {
      // Write to temp file
      const content = JSON.stringify(cache, null, 2);
      await secureFs.writeFile(tempPath, content, 'utf-8');

      // Atomic rename
      await secureFs.rename(tempPath, this.cacheFilePath);
    } catch (error) {
      logger.error('[saveToCache] Failed to save cache:', error);

      // Clean up temp file
      try {
        await secureFs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
