/**
 * Pipeline Storage Utility
 * Handles efficient storage and compression of pipeline step results
 */

import * as secureFs from '../lib/secure-fs.js';
import path from 'path';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface PipelineStorageOptions {
  compressionThreshold?: number; // Bytes above which to compress
  maxResultSize?: number; // Maximum result size in bytes
  retentionDays?: number; // Days to keep old results
}

export class PipelineStorage {
  private options: PipelineStorageOptions;
  private dataDir: string;

  constructor(dataDir: string, options: PipelineStorageOptions = {}) {
    this.dataDir = dataDir;
    this.options = {
      compressionThreshold: 1024, // 1KB
      maxResultSize: 1024 * 1024 * 10, // 10MB
      retentionDays: 30,
      ...options,
    };
  }

  /**
   * Save pipeline step result with optional compression
   */
  async saveStepResult(
    projectPath: string,
    featureId: string,
    stepId: string,
    result: any
  ): Promise<void> {
    const resultPath = this.getStepResultPath(projectPath, featureId, stepId);

    // Serialize result
    const serialized = JSON.stringify(result, null, 2);
    const size = Buffer.byteLength(serialized, 'utf8');

    // Check size limits
    if (size > this.options.maxResultSize!) {
      throw new Error(
        `Result size (${size} bytes) exceeds maximum allowed size (${this.options.maxResultSize} bytes)`
      );
    }

    // Compress if above threshold
    let finalData = serialized;
    let compressed = false;

    if (size > this.options.compressionThreshold!) {
      try {
        const compressedBuffer = await gzipAsync(Buffer.from(serialized, 'utf8'));
        finalData = compressedBuffer.toString('base64');
        compressed = true;
        console.log(
          `[Pipeline Storage] Compressed result for ${stepId}: ${size} -> ${compressedBuffer.length} bytes`
        );
      } catch (error) {
        console.warn(`[Pipeline Storage] Compression failed for ${stepId}:`, error);
      }
    }

    // Save with metadata
    const storageData = {
      version: '1.0',
      compressed,
      size,
      compressedSize: compressed ? Buffer.byteLength(finalData, 'utf8') : null,
      data: finalData,
      timestamp: new Date().toISOString(),
    };

    await secureFs.mkdir(path.dirname(resultPath), { recursive: true });
    await secureFs.writeFile(resultPath, JSON.stringify(storageData), 'utf8');
  }

  /**
   * Load pipeline step result with decompression
   */
  async loadStepResult(
    projectPath: string,
    featureId: string,
    stepId: string
  ): Promise<any | null> {
    const resultPath = this.getStepResultPath(projectPath, featureId, stepId);

    try {
      const content = (await secureFs.readFile(resultPath, 'utf8')) as string;
      const storageData = JSON.parse(content);

      // Handle legacy format (no wrapper)
      if (!storageData.version) {
        return storageData;
      }

      // Decompress if needed
      if (storageData.compressed) {
        try {
          const compressedBuffer = Buffer.from(storageData.data, 'base64');
          const decompressedBuffer = await gunzipAsync(compressedBuffer);
          return JSON.parse(decompressedBuffer.toString('utf8'));
        } catch (error) {
          console.error(`[Pipeline Storage] Decompression failed for ${stepId}:`, error);
          return null;
        }
      }

      return JSON.parse(storageData.data);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }
      console.error(`[Pipeline Storage] Failed to load result for ${stepId}:`, error);
      return null;
    }
  }

  /**
   * Delete pipeline step result
   */
  async deleteStepResult(projectPath: string, featureId: string, stepId: string): Promise<void> {
    const resultPath = this.getStepResultPath(projectPath, featureId, stepId);

    try {
      await secureFs.unlink(resultPath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as any).code !== 'ENOENT') {
        console.error(`[Pipeline Storage] Failed to delete result for ${stepId}:`, error);
      }
    }
  }

  /**
   * Clean up old pipeline results
   */
  async cleanupOldResults(projectPath: string): Promise<void> {
    const resultsDir = path.join(projectPath, '.automaker', 'pipeline-results');

    try {
      // Check if directory exists
      try {
        await secureFs.access(resultsDir);
      } catch {
        return; // Directory doesn't exist
      }

      const entries = await secureFs.readdir(resultsDir, { withFileTypes: true });
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.options.retentionDays!);

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featureDir = path.join(resultsDir, entry.name);
          await this.cleanupFeatureResults(featureDir, cutoffDate);
        }
      }
    } catch (error) {
      console.error('[Pipeline Storage] Cleanup failed:', error);
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(projectPath: string): Promise<{
    totalResults: number;
    totalSize: number;
    compressedSize: number;
    compressionRatio: number;
  }> {
    const resultsDir = path.join(projectPath, '.automaker', 'pipeline-results');
    const stats = {
      totalResults: 0,
      totalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
    };

    try {
      // Check if directory exists
      try {
        await secureFs.access(resultsDir);
      } catch {
        return stats; // Directory doesn't exist
      }

      const entries = await secureFs.readdir(resultsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featureDir = path.join(resultsDir, entry.name);
          const featureStats = await this.getFeatureStats(featureDir);
          stats.totalResults += featureStats.totalResults;
          stats.totalSize += featureStats.totalSize;
          stats.compressedSize += featureStats.compressedSize;
        }
      }

      stats.compressionRatio = stats.totalSize > 0 ? stats.compressedSize / stats.totalSize : 0;

      return stats;
    } catch (error) {
      console.error('[Pipeline Storage] Failed to get stats:', error);
      return stats;
    }
  }

  /**
   * Get path for step result file
   */
  private getStepResultPath(projectPath: string, featureId: string, stepId: string): string {
    return path.join(projectPath, '.automaker', 'pipeline-results', featureId, `${stepId}.json`);
  }

  /**
   * Clean up results for a specific feature
   */
  private async cleanupFeatureResults(featureDir: string, cutoffDate: Date): Promise<void> {
    try {
      const entries = await secureFs.readdir(featureDir);

      for (const entry of entries) {
        const filePath = path.join(featureDir, entry);
        const stat = await secureFs.stat(filePath);

        if (stat.mtime < cutoffDate) {
          await secureFs.unlink(filePath);
          console.log(`[Pipeline Storage] Cleaned up old result: ${entry}`);
        }
      }
    } catch (error) {
      console.error('[Pipeline Storage] Feature cleanup failed:', error);
    }
  }

  /**
   * Get statistics for a feature
   */
  private async getFeatureStats(featureDir: string): Promise<{
    totalResults: number;
    totalSize: number;
    compressedSize: number;
  }> {
    const stats = {
      totalResults: 0,
      totalSize: 0,
      compressedSize: 0,
    };

    try {
      const entries = await secureFs.readdir(featureDir);

      for (const entry of entries) {
        const filePath = path.join(featureDir, entry);
        const content = (await secureFs.readFile(filePath, 'utf8')) as string;
        const storageData = JSON.parse(content);

        stats.totalResults++;

        if (storageData.version) {
          stats.totalSize += storageData.size || 0;
          stats.compressedSize += storageData.compressedSize || storageData.size || 0;
        } else {
          // Legacy format
          stats.totalSize += Buffer.byteLength(content, 'utf8');
          stats.compressedSize += Buffer.byteLength(content, 'utf8');
        }
      }
    } catch (error) {
      console.error('[Pipeline Storage] Failed to get feature stats:', error);
    }

    return stats;
  }
}
