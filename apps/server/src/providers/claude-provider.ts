/**
 * Claude Provider - Executes queries using Claude Agent SDK
 *
 * Wraps the @anthropic-ai/claude-agent-sdk for seamless integration
 * with the provider architecture.
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider } from './base-provider.js';
import { classifyError, getUserFriendlyErrorMessage, createLogger } from '@automaker/utils';

const logger = createLogger('ClaudeProvider');
import { getThinkingTokenBudget, validateBareModelId } from '@automaker/types';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';
import type { AWSBedrockConfig } from '@automaker/types';

// Explicit allowlist of environment variables to pass to the SDK.
// Only these vars are passed - nothing else from process.env leaks through.
const ALLOWED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  // AWS Bedrock credentials for enterprise/AWS deployments
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'CLAUDE_CODE_USE_BEDROCK',
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'USER',
  'LANG',
  'LC_ALL',
];

/**
 * Map standard Claude model IDs to AWS Bedrock model IDs
 * Only applies when Bedrock is configured
 */
async function mapToBedrockModel(model: string, provider: ClaudeProvider): Promise<string> {
  // If already a Bedrock model ID, pass through
  if (model.includes('.anthropic.claude-') || model.startsWith('anthropic.claude-')) {
    logger.debug(`Model already in Bedrock format: ${model}`);
    return model;
  }

  // If Bedrock not configured, pass through unchanged
  if (!(await provider['isBedrockConfigured']())) {
    return model;
  }

  // Get AWS region for region-specific model IDs (check ENV first, then credentials)
  let region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    const config = await provider['getBedrockConfig']();
    region = config?.region || 'us-east-1';
  }
  const regionPrefix = region.startsWith('eu-') ? 'eu' : 'us';

  // Map standard Claude model IDs to Bedrock format
  const bedrockModelMap: Record<string, string> = {
    'claude-opus-4-5-20251101': `${regionPrefix}.anthropic.claude-opus-4-5-20251101-v1:0`,
    'claude-sonnet-4-5-20250929': `${regionPrefix}.anthropic.claude-sonnet-4-5-20250929-v1:0`,
    'claude-sonnet-4-20250514': `${regionPrefix}.anthropic.claude-sonnet-4-5-20250929-v1:0`, // Legacy
    'claude-3-5-sonnet-20241022': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'claude-haiku-4-5-20251001': 'anthropic.claude-haiku-4-5-20251001-v1:0',
  };

  const bedrockModel = bedrockModelMap[model];
  if (bedrockModel) {
    logger.info(`Mapped Claude model to Bedrock: ${model} → ${bedrockModel}`);
    return bedrockModel;
  }

  logger.warn(`No Bedrock mapping for model: ${model}, using as-is`);
  return model;
}

export class ClaudeProvider extends BaseProvider {
  private static bedrockConfigCache: AWSBedrockConfig | null = null;
  private static configLoadedAt: number = 0;
  private static readonly CACHE_TTL_MS = 60000; // 1 minute cache

  getName(): string {
    return 'claude';
  }

  /**
   * Load Bedrock configuration from settings (with caching)
   */
  private async getBedrockConfig(): Promise<AWSBedrockConfig | null> {
    const now = Date.now();

    // Return cached config if still valid
    if (
      ClaudeProvider.bedrockConfigCache &&
      now - ClaudeProvider.configLoadedAt < ClaudeProvider.CACHE_TTL_MS
    ) {
      return ClaudeProvider.bedrockConfigCache;
    }

    // Load from settings
    const factory = await import('./provider-factory.js');
    const settingsService = factory.ProviderFactory.getSettingsService();

    if (!settingsService) {
      return null;
    }

    try {
      const credentials = await settingsService.getCredentials();
      ClaudeProvider.bedrockConfigCache = credentials.awsBedrock || null;
      ClaudeProvider.configLoadedAt = now;
      return ClaudeProvider.bedrockConfigCache;
    } catch (error) {
      logger.error('Failed to load Bedrock config:', error);
      return null;
    }
  }

  /**
   * Check if Bedrock is configured via ENV or credentials
   */
  private async isBedrockConfigured(): Promise<boolean> {
    // Check ENV vars first (takes precedence)
    if (
      process.env.CLAUDE_CODE_USE_BEDROCK ||
      (process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID)
    ) {
      return true;
    }

    // Check credentials.json
    const config = await this.getBedrockConfig();
    return !!(config?.enabled && config.accessKeyId && config.region);
  }

  /**
   * Build environment for the SDK with only explicitly allowed variables
   * Merges ENV vars and credentials (ENV takes precedence)
   */
  private async buildEnv(): Promise<Record<string, string | undefined>> {
    const env: Record<string, string | undefined> = {};

    // Start with allowed ENV vars (takes precedence)
    for (const key of ALLOWED_ENV_VARS) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }

    // If AWS credentials not in ENV, use credentials.json
    if (!env.AWS_ACCESS_KEY_ID) {
      const config = await this.getBedrockConfig();
      if (config?.enabled && config.accessKeyId) {
        env.AWS_ACCESS_KEY_ID = config.accessKeyId;
        env.AWS_SECRET_ACCESS_KEY = config.secretAccessKey;
        if (config.sessionToken) {
          env.AWS_SESSION_TOKEN = config.sessionToken;
        }
        env.AWS_REGION = config.region;
        env.CLAUDE_CODE_USE_BEDROCK = 'true';
      }
    }

    return env;
  }

  /**
   * Execute a query using Claude Agent SDK
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    // Validate that model doesn't have a provider prefix
    // AgentService should strip prefixes before passing to providers
    validateBareModelId(options.model, 'ClaudeProvider');

    const {
      prompt,
      model: requestedModel,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory,
      sdkSessionId,
      thinkingLevel,
    } = options;

    // Skip Bedrock mapping for simple text-only queries (they often fail with Bedrock)
    // Use standard Claude models for text generation to avoid SDK exit code 1
    const isSimpleTextQuery = maxTurns === 1 && (!allowedTools || allowedTools.length === 0);
    const skipBedrockMapping = isSimpleTextQuery;
    const model = skipBedrockMapping
      ? requestedModel
      : await mapToBedrockModel(requestedModel, this);

    if (skipBedrockMapping) {
      logger.debug(`Skipping Bedrock mapping for simple text query, using: ${requestedModel}`);
    }

    // Convert thinking level to token budget
    const maxThinkingTokens = getThinkingTokenBudget(thinkingLevel);

    // Build Claude SDK options
    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      // Pass only explicitly allowed environment variables to SDK
      env: await this.buildEnv(),
      // Pass through allowedTools if provided by caller (decided by sdk-options.ts)
      // Only pass if explicitly defined and non-empty to avoid SDK issues
      ...(allowedTools !== undefined && allowedTools.length > 0 ? { allowedTools } : {}),
      // AUTONOMOUS MODE: Always bypass permissions for fully autonomous operation
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController,
      // Resume existing SDK session if we have a session ID
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
      // Forward settingSources for CLAUDE.md file loading
      ...(options.settingSources && { settingSources: options.settingSources }),
      // Forward MCP servers configuration
      ...(options.mcpServers && { mcpServers: options.mcpServers }),
      // Extended thinking configuration
      ...(maxThinkingTokens && { maxThinkingTokens }),
      // Subagents configuration for specialized task delegation
      ...(options.agents && { agents: options.agents }),
      // Pass through outputFormat for structured JSON outputs
      ...(options.outputFormat && { outputFormat: options.outputFormat }),
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
      // Enhance error with user-friendly message and classification
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);

      logger.error('executeQuery() error during execution:', {
        type: errorInfo.type,
        message: errorInfo.message,
        isRateLimit: errorInfo.isRateLimit,
        retryAfter: errorInfo.retryAfter,
        stack: (error as Error).stack,
      });

      // Build enhanced error message with additional guidance for rate limits
      const message = errorInfo.isRateLimit
        ? `${userMessage}\n\nTip: If you're running multiple features in auto-mode, consider reducing concurrency (maxConcurrency setting) to avoid hitting rate limits.`
        : userMessage;

      const enhancedError = new Error(message);
      (enhancedError as any).originalError = error;
      (enhancedError as any).type = errorInfo.type;

      if (errorInfo.isRateLimit) {
        (enhancedError as any).retryAfter = errorInfo.retryAfter;
      }

      throw enhancedError;
    }
  }

  /**
   * Detect Claude SDK installation (always available via npm)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    // Claude SDK is always available since it's a dependency
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    const status: InstallationStatus = {
      installed: true,
      method: 'sdk',
      hasApiKey,
      authenticated: hasApiKey,
    };

    return status;
  }

  /**
   * Get available Claude models (includes Bedrock if configured)
   */
  async getAvailableModels(): Promise<ModelDefinition[]> {
    const anthropicModels: ModelDefinition[] = [
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
    ];

    // Check if Bedrock is configured
    const bedrockConfigured = await this.isBedrockConfigured();

    // Add AWS Bedrock models if configured
    const bedrockModels: ModelDefinition[] = bedrockConfigured
      ? [
          {
            id: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
            name: 'Claude Sonnet 4.5 (AWS Bedrock EU)',
            modelString: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
            provider: 'bedrock',
            description: 'Claude Sonnet 4.5 via AWS Bedrock (eu-central-1)',
            contextWindow: 200000,
            maxOutputTokens: 16000,
            supportsVision: true,
            supportsTools: true,
            tier: 'standard' as const,
          },
          {
            id: 'us.anthropic.claude-opus-4-5-20251101-v1:0',
            name: 'Claude Opus 4.5 (AWS Bedrock US)',
            modelString: 'us.anthropic.claude-opus-4-5-20251101-v1:0',
            provider: 'bedrock',
            description: 'Claude Opus 4.5 via AWS Bedrock (us-east-1)',
            contextWindow: 200000,
            maxOutputTokens: 16000,
            supportsVision: true,
            supportsTools: true,
            tier: 'premium' as const,
          },
          {
            id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
            name: 'Claude 3.5 Sonnet (AWS Bedrock)',
            modelString: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
            provider: 'bedrock',
            description: 'Claude 3.5 Sonnet via AWS Bedrock',
            contextWindow: 200000,
            maxOutputTokens: 8000,
            supportsVision: true,
            supportsTools: true,
            tier: 'standard' as const,
          },
          {
            id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
            name: 'Claude Haiku 4.5 (AWS Bedrock)',
            modelString: 'anthropic.claude-haiku-4-5-20251001-v1:0',
            provider: 'bedrock',
            description: 'Claude Haiku 4.5 via AWS Bedrock',
            contextWindow: 200000,
            maxOutputTokens: 8000,
            supportsVision: true,
            supportsTools: true,
            tier: 'basic' as const,
          },
        ]
      : [];

    return [...anthropicModels, ...bedrockModels];
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'thinking'];
    return supportedFeatures.includes(feature);
  }
}
