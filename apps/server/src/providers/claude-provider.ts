/**
 * Claude Provider - Executes queries using Claude Agent SDK
 *
 * Wraps the @anthropic-ai/claude-agent-sdk for seamless integration
 * with the provider architecture.
 *
 * Supports authentication via:
 * 1. ~/.claude/settings.json - Loads env variables from settings file
 * 2. Claude CLI (via claude login) - uses OAuth tokens from ~/.claude/
 * 3. Anthropic API Key - via ANTHROPIC_API_KEY env var or in-memory storage
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Load Claude settings from ~/.claude/settings.json
 * Returns the env section if it exists
 */
async function loadClaudeSettings(): Promise<Record<string, string> | null> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    return settings.env || null;
  } catch {
    return null;
  }
}

/**
 * Check if ~/.claude/settings.json exists and has auth token
 *
 * Checks multiple locations:
 * 1. env section (env.ANTHROPIC_AUTH_TOKEN) - Claude Code format
 * 2. OAuth tokens at root level (oauthToken, oauth_token)
 * 3. API keys at root level (apiKey, api_key, primaryApiKey)
 */
async function hasClaudeSettingsWithAuth(): Promise<boolean> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);

    // Check env section (Claude Code format)
    if (settings.env?.ANTHROPIC_AUTH_TOKEN) {
      return true;
    }

    // Check for OAuth tokens at root level
    if (settings.oauthToken || settings.oauth_token) {
      return true;
    }

    // Check for API keys at root level
    if (settings.apiKey || settings.api_key || settings.primaryApiKey) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Helper to get Anthropic API key from multiple sources.
 * Checks in-memory storage first (from UI setup), then env var.
 */
function getAnthropicApiKey(): string | undefined {
  // Try environment variable first
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Try dynamic import of in-memory storage
  try {
    // Dynamic import to avoid circular dependency
    const setupCommon = require('../routes/setup/common.js');
    const apiKey = setupCommon.getApiKey?.('anthropic');
    if (apiKey) {
      return apiKey;
    }
  } catch {
    // Setup routes not available
  }

  return undefined;
}

export class ClaudeProvider extends BaseProvider {
  getName(): string {
    return 'claude';
  }

  /**
   * Execute a query using Claude Agent SDK
   *
   * Loads environment variables from ~/.claude/settings.json if available.
   * This allows the SDK to use authentication tokens and other settings.
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory,
      sdkSessionId,
    } = options;

    // Track original environment to restore later
    const originalEnv: Record<string, string | undefined> = {};
    const envKeysToRestore: string[] = [];

    // Load settings from ~/.claude/settings.json
    const settingsEnv = await loadClaudeSettings();

    // Set environment variables from settings file if available
    if (settingsEnv) {
      for (const [key, value] of Object.entries(settingsEnv)) {
        // Save original value if it exists
        if (key in process.env) {
          originalEnv[key] = process.env[key];
          envKeysToRestore.push(key);
        }
        // Set the environment variable
        process.env[key] = value;
      }
    }

    // If no settings file and no API key env var, try in-memory storage
    const hasEnvApiKey = !!process.env.ANTHROPIC_API_KEY;
    if (!hasEnvApiKey && !settingsEnv) {
      const inMemoryApiKey = getAnthropicApiKey();
      if (inMemoryApiKey) {
        process.env.ANTHROPIC_API_KEY = inMemoryApiKey;
        envKeysToRestore.push('ANTHROPIC_API_KEY');
      }
    }

    // Build Claude SDK options
    const defaultTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'];
    const toolsToUse = allowedTools || defaultTools;

    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      allowedTools: toolsToUse,
      permissionMode: 'acceptEdits',
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      },
      abortController,
      // Resume existing SDK session if we have a session ID
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
    };

    // Build prompt payload
    let promptPayload: string | AsyncIterable<any>;

    if (Array.isArray(prompt)) {
      // Multi-part prompt (with images)
      promptPayload = (async function* () {
        const multiPartPrompt = {
          type: 'user' as const,
          session_id: '',
          message: {
            role: 'user' as const,
            content: prompt,
          },
          parent_tool_use_id: null,
        };
        yield multiPartPrompt;
      })();
    } else {
      // Simple text prompt
      promptPayload = prompt;
    }

    // Execute via Claude Agent SDK
    try {
      const stream = query({ prompt: promptPayload, options: sdkOptions });

      // Stream messages directly - they're already in the correct format
      for await (const msg of stream) {
        yield msg as ProviderMessage;
      }
    } catch (error) {
      console.error('[ClaudeProvider] executeQuery() error during execution:', error);
      throw error;
    } finally {
      // Restore original environment
      for (const key of envKeysToRestore) {
        if (originalEnv[key] !== undefined) {
          process.env[key] = originalEnv[key];
        } else {
          delete process.env[key];
        }
      }
    }
  }

  /**
   * Detect Claude SDK installation (always available via npm)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    // Claude SDK is always available since it's a dependency
    // Check for authentication from multiple sources
    const hasApiKey = !!getAnthropicApiKey();
    const hasSettingsAuth = await hasClaudeSettingsWithAuth();

    // Authenticated if we have either API key or settings file with auth
    const authenticated = hasApiKey || hasSettingsAuth;

    const status: InstallationStatus = {
      installed: true,
      method: 'sdk',
      hasApiKey,
      authenticated,
      // Additional info about auth method
      authMethod: hasSettingsAuth ? 'settings_file' : hasApiKey ? 'api_key' : 'none',
    };

    return status;
  }

  /**
   * Get available Claude models
   */
  getAvailableModels(): ModelDefinition[] {
    const models = [
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        modelString: 'claude-opus-4-5-20251101',
        provider: 'anthropic',
        description: 'Most capable Claude model',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
        default: true,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        modelString: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        description: 'Balanced performance and cost',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        modelString: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        description: 'Fast and capable',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        modelString: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        description: 'Fastest Claude model',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ] satisfies ModelDefinition[];
    return models;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'thinking'];
    return supportedFeatures.includes(feature);
  }
}
