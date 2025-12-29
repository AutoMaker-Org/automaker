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
import { getSettingsEnv, hasSettingsFileAuth } from '../lib/claude-settings.js';

/**
 * Helper to get Anthropic API key from in-memory storage.
 * Used as fallback when no env var or settings file is available.
 */
function getInMemoryApiKey(): string | undefined {
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
    const settingsEnv = await getSettingsEnv();

    // Set environment variables from settings file if available
    if (settingsEnv) {
      for (const [key, value] of Object.entries(settingsEnv)) {
        // Save original value if it exists
        if (key in process.env) {
          originalEnv[key] = process.env[key];
        }
        envKeysToRestore.push(key);
        // Set the environment variable
        process.env[key] = value;
      }
      // Map ANTHROPIC_AUTH_TOKEN to ANTHROPIC_API_KEY if present
      if (settingsEnv.ANTHROPIC_AUTH_TOKEN && !settingsEnv.ANTHROPIC_API_KEY) {
        if ('ANTHROPIC_API_KEY' in process.env) {
          originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        }
        if (!envKeysToRestore.includes('ANTHROPIC_API_KEY')) {
          envKeysToRestore.push('ANTHROPIC_API_KEY');
        }
        process.env.ANTHROPIC_API_KEY = settingsEnv.ANTHROPIC_AUTH_TOKEN;
      }
    }

    // If no API key env var is set yet (from settings or original env), try in-memory storage
    if (!process.env.ANTHROPIC_API_KEY) {
      const inMemoryApiKey = getInMemoryApiKey();
      if (inMemoryApiKey) {
        originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        envKeysToRestore.push('ANTHROPIC_API_KEY');
        process.env.ANTHROPIC_API_KEY = inMemoryApiKey;
      }
    }

    // Build Claude SDK options
    // MCP permission logic - determines how to handle tool permissions when MCP servers are configured.
    // This logic mirrors buildMcpOptions() in sdk-options.ts but is applied here since
    // the provider is the final point where SDK options are constructed.
    const hasMcpServers = options.mcpServers && Object.keys(options.mcpServers).length > 0;
    // Default to true for autonomous workflow. Security is enforced when adding servers
    // via the security warning dialog that explains the risks.
    const mcpAutoApprove = options.mcpAutoApproveTools ?? true;
    const mcpUnrestricted = options.mcpUnrestrictedTools ?? true;
    const defaultTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'];

    // Determine permission mode based on settings
    const shouldBypassPermissions = hasMcpServers && mcpAutoApprove;
    // Determine if we should restrict tools (only when no MCP or unrestricted is disabled)
    const shouldRestrictTools = !hasMcpServers || !mcpUnrestricted;

    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      // Only restrict tools if explicitly set OR (no MCP / unrestricted disabled)
      ...(allowedTools && shouldRestrictTools && { allowedTools }),
      ...(!allowedTools && shouldRestrictTools && { allowedTools: defaultTools }),
      // When MCP servers are configured and auto-approve is enabled, use bypassPermissions
      permissionMode: shouldBypassPermissions ? 'bypassPermissions' : 'default',
      // Required when using bypassPermissions mode
      ...(shouldBypassPermissions && { allowDangerouslySkipPermissions: true }),
      abortController,
      // Resume existing SDK session if we have a session ID
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
      // Forward settingSources for CLAUDE.md file loading
      ...(options.settingSources && { settingSources: options.settingSources }),
      // Forward sandbox configuration
      ...(options.sandbox && { sandbox: options.sandbox }),
      // Forward MCP servers configuration
      ...(options.mcpServers && { mcpServers: options.mcpServers }),
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
      console.error('[ClaudeProvider] ERROR: executeQuery() error during execution:', error);
      console.error('[ClaudeProvider] ERROR stack:', (error as Error).stack);
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
    const hasEnvApiKey = !!process.env.ANTHROPIC_API_KEY;
    const hasInMemoryApiKey = !!getInMemoryApiKey();
    const hasSettingsAuth = await hasSettingsFileAuth();

    // Authenticated if we have any auth source
    const authenticated = hasEnvApiKey || hasInMemoryApiKey || hasSettingsAuth;

    const status: InstallationStatus = {
      installed: true,
      method: 'sdk',
      hasApiKey: hasEnvApiKey || hasInMemoryApiKey,
      authenticated,
      // Additional info about auth method
      authMethod: hasSettingsAuth
        ? 'settings_file'
        : hasEnvApiKey || hasInMemoryApiKey
          ? 'api_key'
          : 'none',
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
