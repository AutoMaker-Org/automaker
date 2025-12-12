/**
 * Model Provider Abstraction Layer
 *
 * This module provides an abstract interface for model providers (Claude, Codex, etc.)
 * allowing the application to use different AI models through a unified API.
 */

/**
 * Base class for model providers
 * Concrete implementations should extend this class
 */
class ModelProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
  }

  /**
   * Get provider name
   * @returns {string} Provider name
   */
  getName() {
    return this.name;
  }

  /**
   * Execute a query with the model provider
   * @param {Object} options Query options
   * @param {string} options.prompt The prompt to send
   * @param {string} options.model The model to use
   * @param {string} options.systemPrompt System prompt
   * @param {string} options.cwd Working directory
   * @param {number} options.maxTurns Maximum turns
   * @param {string[]} options.allowedTools Allowed tools
   * @param {Object} options.mcpServers MCP servers configuration
   * @param {AbortController} options.abortController Abort controller
   * @param {Object} options.thinking Thinking configuration
   * @returns {AsyncGenerator} Async generator yielding messages
   */
  async *executeQuery(options) {
    throw new Error('executeQuery must be implemented by subclass');
  }

  /**
   * Detect if this provider's CLI/SDK is installed
   * @returns {Promise<Object>} Installation status
   */
  async detectInstallation() {
    throw new Error('detectInstallation must be implemented by subclass');
  }

  /**
   * Get list of available models for this provider
   * @returns {Array<Object>} Array of model definitions
   */
  getAvailableModels() {
    throw new Error('getAvailableModels must be implemented by subclass');
  }

  /**
   * Validate provider configuration
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validateConfig() {
    throw new Error('validateConfig must be implemented by subclass');
  }

  /**
   * Get the full model string for a model key
   * @param {string} modelKey Short model key (e.g., 'opus', 'gpt-5.1-codex')
   * @returns {string} Full model string
   */
  getModelString(modelKey) {
    throw new Error('getModelString must be implemented by subclass');
  }

  /**
   * Check if provider supports a specific feature
   * @param {string} feature Feature name (e.g., 'thinking', 'tools', 'streaming')
   * @returns {boolean} Whether the feature is supported
   */
  supportsFeature(feature) {
    return false;
  }
}

/**
 * Claude Provider - Uses Anthropic Claude Agent SDK
 */
class ClaudeProvider extends ModelProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'claude';
    this.sdk = null;
  }

  /**
   * Try to load credentials from the app's own credentials.json file.
   * This is where we store OAuth tokens and API keys that users enter in the setup wizard.
   * Returns { oauthToken, apiKey } or null values if not found.
   */
  loadTokenFromAppCredentials() {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const credentialsPath = path.join(app.getPath('userData'), 'credentials.json');

      if (!fs.existsSync(credentialsPath)) {
        console.log('[ClaudeProvider] App credentials file does not exist:', credentialsPath);
        return { oauthToken: null, apiKey: null };
      }

      const raw = fs.readFileSync(credentialsPath, 'utf-8');
      const parsed = JSON.parse(raw);

      // Check for OAuth token first (from claude setup-token), then API key
      const oauthToken = parsed.anthropic_oauth_token || null;
      const apiKey = parsed.anthropic || parsed.anthropic_api_key || null;

      console.log('[ClaudeProvider] App credentials check - OAuth token:', !!oauthToken, ', API key:', !!apiKey);
      return { oauthToken, apiKey };
    } catch (err) {
      console.warn('[ClaudeProvider] Failed to read app credentials:', err?.message);
      return { oauthToken: null, apiKey: null };
    }
  }

  /**
   * Try to load a Claude OAuth token from the local CLI config (~/.claude/config.json).
   * Returns the token string or null if not found.
   * NOTE: Claude's credentials.json is encrypted, so we only try config.json
   */
  loadTokenFromCliConfig() {
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(require('os').homedir(), '.claude', 'config.json');
      if (!fs.existsSync(configPath)) {
        return null;
      }
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      // CLI config stores token as oauth_token (newer) or token (older)
      return parsed.oauth_token || parsed.token || null;
    } catch (err) {
      console.warn('[ClaudeProvider] Failed to read CLI config token:', err?.message);
      return null;
    }
  }

  ensureAuthEnv() {
    // If API key or token already present in environment, keep as-is.
    if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      console.log('[ClaudeProvider] Auth already present in environment');
      return true;
    }

    // Priority 1: Try to load from app's own credentials (setup wizard)
    const appCredentials = this.loadTokenFromAppCredentials();
    if (appCredentials.oauthToken) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = appCredentials.oauthToken;
      console.log('[ClaudeProvider] Loaded CLAUDE_CODE_OAUTH_TOKEN from app credentials');
      return true;
    }
    if (appCredentials.apiKey) {
      process.env.ANTHROPIC_API_KEY = appCredentials.apiKey;
      console.log('[ClaudeProvider] Loaded ANTHROPIC_API_KEY from app credentials');
      return true;
    }

    // Priority 2: Try to hydrate from CLI login config (legacy)
    const token = this.loadTokenFromCliConfig();
    if (token) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
      console.log('[ClaudeProvider] Loaded CLAUDE_CODE_OAUTH_TOKEN from ~/.claude/config.json');
      return true;
    }

    // Check if CLI is installed but not logged in
    try {
      const claudeCliDetector = require('./claude-cli-detector');
      const detection = claudeCliDetector.detectClaudeInstallation();
      if (detection.installed && detection.method === 'cli') {
        console.error('[ClaudeProvider] Claude CLI is installed but not authenticated. Use the setup wizard or set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN environment variable.');
      } else {
        console.error('[ClaudeProvider] No Anthropic auth found. Use the setup wizard or set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.');
      }
    } catch (err) {
      console.error('[ClaudeProvider] No Anthropic auth found. Use the setup wizard or set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.');
    }
    return false;
  }

  /**
   * Lazily load the Claude SDK
   */
  loadSdk() {
    if (!this.sdk) {
      this.sdk = require('@anthropic-ai/claude-agent-sdk');
    }
    return this.sdk;
  }

  async *executeQuery(options) {
    // Ensure we have auth; fall back to app credentials or CLI login token if available.
    if (!this.ensureAuthEnv()) {
      // Check if CLI is installed to provide better error message
      let msg = 'Missing Anthropic auth. Go to Settings > Setup to configure your Claude authentication.';
      try {
        const claudeCliDetector = require('./claude-cli-detector');
        const detection = claudeCliDetector.detectClaudeInstallation();
        if (detection.installed && detection.method === 'cli') {
          msg = 'Claude CLI is installed but not authenticated. Go to Settings > Setup to provide your subscription token (from `claude setup-token`) or API key.';
        } else {
          msg = 'Missing Anthropic auth. Go to Settings > Setup to configure your Claude authentication, or set ANTHROPIC_API_KEY environment variable.';
        }
      } catch (err) {
        // Fallback to default message
      }
      console.error(`[ClaudeProvider] ${msg}`);
      yield { type: 'error', error: msg };
      return;
    }

    const { query } = this.loadSdk();

    const sdkOptions = {
      model: options.model,
      systemPrompt: options.systemPrompt,
      maxTurns: options.maxTurns || 1000,
      cwd: options.cwd,
      mcpServers: options.mcpServers,
      allowedTools: options.allowedTools,
      permissionMode: options.permissionMode || 'acceptEdits',
      sandbox: options.sandbox,
      abortController: options.abortController,
    };

    // Add thinking configuration if enabled
    if (options.thinking) {
      sdkOptions.thinking = options.thinking;
    }

    const currentQuery = query({ prompt: options.prompt, options: sdkOptions });

    for await (const msg of currentQuery) {
      yield msg;
    }
  }

  async detectInstallation() {
    const claudeCliDetector = require('./claude-cli-detector');
    return claudeCliDetector.getFullStatus();
  }

  getAvailableModels() {
    return [
      {
        id: 'haiku',
        name: 'Claude Haiku',
        modelString: 'claude-haiku-4-5',
        provider: 'claude',
        description: 'Fast and efficient for simple tasks',
        tier: 'basic'
      },
      {
        id: 'sonnet',
        name: 'Claude Sonnet',
        modelString: 'claude-sonnet-4-20250514',
        provider: 'claude',
        description: 'Balanced performance and capabilities',
        tier: 'standard'
      },
      {
        id: 'opus',
        name: 'Claude Opus 4.5',
        modelString: 'claude-opus-4-5-20251101',
        provider: 'claude',
        description: 'Most capable model for complex tasks',
        tier: 'premium'
      }
    ];
  }

  validateConfig() {
    const errors = [];

    // Ensure auth is available (try to auto-load from app credentials or CLI config)
    this.ensureAuthEnv();

    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
      errors.push('No Claude authentication found. Go to Settings > Setup to configure your subscription token or API key.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getModelString(modelKey) {
    const modelMap = {
      haiku: 'claude-haiku-4-5',
      sonnet: 'claude-sonnet-4-20250514',
      opus: 'claude-opus-4-5-20251101'
    };
    return modelMap[modelKey] || modelMap.opus;
  }

  supportsFeature(feature) {
    const supportedFeatures = ['thinking', 'tools', 'streaming', 'mcp'];
    return supportedFeatures.includes(feature);
  }
}

/**
 * Codex Provider - Uses OpenAI Codex CLI
 */
class CodexProvider extends ModelProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'codex';
  }

  async *executeQuery(options) {
    const codexExecutor = require('./codex-executor');

    // Validate that we're not receiving a Claude model string
    if (options.model && options.model.startsWith('claude-')) {
      const errorMsg = `Codex provider cannot use Claude model '${options.model}'. Codex only supports OpenAI models (gpt-5.1-codex-max, gpt-5.1-codex, gpt-5.1-codex-mini, gpt-5.1).`;
      console.error(`[CodexProvider] ${errorMsg}`);
      yield {
        type: 'error',
        error: errorMsg
      };
      return;
    }

    const executeOptions = {
      prompt: options.prompt,
      model: options.model,
      cwd: options.cwd,
      systemPrompt: options.systemPrompt,
      maxTurns: options.maxTurns || 20,
      allowedTools: options.allowedTools,
      mcpServers: options.mcpServers, // Pass MCP servers config to executor
      env: {
        ...process.env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY
      }
    };

    // Execute and yield results
    const generator = codexExecutor.execute(executeOptions);
    for await (const msg of generator) {
      yield msg;
    }
  }

  async detectInstallation() {
    const codexCliDetector = require('./codex-cli-detector');
    return codexCliDetector.getInstallationInfo();
  }

  getAvailableModels() {
    return [
      {
        id: 'gpt-5.1-codex-max',
        name: 'GPT-5.1 Codex Max',
        modelString: 'gpt-5.1-codex-max',
        provider: 'codex',
        description: 'Latest flagship - deep and fast reasoning for coding',
        tier: 'premium',
        default: true
      },
      {
        id: 'gpt-5.1-codex',
        name: 'GPT-5.1 Codex',
        modelString: 'gpt-5.1-codex',
        provider: 'codex',
        description: 'Optimized for code generation',
        tier: 'standard'
      },
      {
        id: 'gpt-5.1-codex-mini',
        name: 'GPT-5.1 Codex Mini',
        modelString: 'gpt-5.1-codex-mini',
        provider: 'codex',
        description: 'Faster and cheaper option',
        tier: 'basic'
      },
      {
        id: 'gpt-5.1',
        name: 'GPT-5.1',
        modelString: 'gpt-5.1',
        provider: 'codex',
        description: 'Broad world knowledge with strong reasoning',
        tier: 'standard'
      }
    ];
  }

  validateConfig() {
    const errors = [];
    const codexCliDetector = require('./codex-cli-detector');
    const installation = codexCliDetector.detectCodexInstallation();

    if (!installation.installed && !process.env.OPENAI_API_KEY) {
      errors.push('Codex CLI not installed and no OPENAI_API_KEY found.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getModelString(modelKey) {
    // Codex models use the key directly as the model string
    const modelMap = {
      'gpt-5.1-codex-max': 'gpt-5.1-codex-max',
      'gpt-5.1-codex': 'gpt-5.1-codex',
      'gpt-5.1-codex-mini': 'gpt-5.1-codex-mini',
      'gpt-5.1': 'gpt-5.1'
    };
    return modelMap[modelKey] || 'gpt-5.1-codex-max';
  }

  supportsFeature(feature) {
    const supportedFeatures = ['tools', 'streaming'];
    return supportedFeatures.includes(feature);
  }
}

/**
 * Model Provider Factory
 * Creates the appropriate provider based on model or provider name
 */
class ModelProviderFactory {
  static providers = {
    claude: ClaudeProvider,
    codex: CodexProvider
  };

  /**
   * Get provider for a specific model
   * @param {string} modelId Model ID (e.g., 'opus', 'gpt-5.1-codex')
   * @returns {ModelProvider} Provider instance
   */
  static getProviderForModel(modelId) {
    // Check if it's a Claude model
    const claudeModels = ['haiku', 'sonnet', 'opus'];
    if (claudeModels.includes(modelId)) {
      return new ClaudeProvider();
    }

    // Check if it's a Codex/OpenAI model
    const codexModels = [
      'gpt-5.1-codex-max', 'gpt-5.1-codex', 'gpt-5.1-codex-mini', 'gpt-5.1'
    ];
    if (codexModels.includes(modelId)) {
      return new CodexProvider();
    }

    // Default to Claude
    return new ClaudeProvider();
  }

  /**
   * Get provider by name
   * @param {string} providerName Provider name ('claude' or 'codex')
   * @returns {ModelProvider} Provider instance
   */
  static getProvider(providerName) {
    const ProviderClass = this.providers[providerName];
    if (!ProviderClass) {
      throw new Error(`Unknown provider: ${providerName}`);
    }
    return new ProviderClass();
  }

  /**
   * Get all available providers
   * @returns {string[]} List of provider names
   */
  static getAvailableProviders() {
    return Object.keys(this.providers);
  }

  /**
   * Get all available models across all providers
   * @returns {Array<Object>} All available models
   */
  static getAllModels() {
    const allModels = [];
    for (const providerName of this.getAvailableProviders()) {
      const provider = this.getProvider(providerName);
      const models = provider.getAvailableModels();
      allModels.push(...models);
    }
    return allModels;
  }

  /**
   * Check installation status for all providers
   * @returns {Promise<Object>} Installation status for each provider
   */
  static async checkAllProviders() {
    const status = {};
    for (const providerName of this.getAvailableProviders()) {
      const provider = this.getProvider(providerName);
      status[providerName] = await provider.detectInstallation();
    }
    return status;
  }
}

module.exports = {
  ModelProvider,
  ClaudeProvider,
  CodexProvider,
  ModelProviderFactory
};
