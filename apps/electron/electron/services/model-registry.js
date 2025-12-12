/**
 * Model Registry - Centralized model definitions and metadata
 *
 * This module provides a central registry of all available models
 * across different providers (Claude, Codex/OpenAI).
 */

/**
 * Model Categories
 */
const MODEL_CATEGORIES = {
  CLAUDE: 'claude',
  OPENAI: 'openai',
  CODEX: 'codex'
};

/**
 * Model Tiers (capability levels)
 */
const MODEL_TIERS = {
  BASIC: 'basic',      // Fast, cheap, simple tasks
  STANDARD: 'standard', // Balanced performance
  PREMIUM: 'premium'    // Most capable, complex tasks
};

const CODEX_MODEL_IDS = [
  'gpt-5.1-codex-max',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5.1'
];

/**
 * All available models with full metadata
 */
const MODELS = {
  // Claude Models
  haiku: {
    id: 'haiku',
    name: 'Claude Haiku',
    modelString: 'claude-haiku-4-5',
    provider: 'claude',
    category: MODEL_CATEGORIES.CLAUDE,
    tier: MODEL_TIERS.BASIC,
    description: 'Fast and efficient for simple tasks',
    capabilities: ['code', 'text', 'tools'],
    maxTokens: 8192,
    contextWindow: 200000,
    supportsThinking: true,
    requiresAuth: 'CLAUDE_CODE_OAUTH_TOKEN'
  },
  sonnet: {
    id: 'sonnet',
    name: 'Claude Sonnet',
    modelString: 'claude-sonnet-4-20250514',
    provider: 'claude',
    category: MODEL_CATEGORIES.CLAUDE,
    tier: MODEL_TIERS.STANDARD,
    description: 'Balanced performance and capabilities',
    capabilities: ['code', 'text', 'tools', 'analysis'],
    maxTokens: 8192,
    contextWindow: 200000,
    supportsThinking: true,
    requiresAuth: 'CLAUDE_CODE_OAUTH_TOKEN'
  },
  opus: {
    id: 'opus',
    name: 'Claude Opus 4.5',
    modelString: 'claude-opus-4-5-20251101',
    provider: 'claude',
    category: MODEL_CATEGORIES.CLAUDE,
    tier: MODEL_TIERS.PREMIUM,
    description: 'Most capable model for complex tasks',
    capabilities: ['code', 'text', 'tools', 'analysis', 'reasoning'],
    maxTokens: 8192,
    contextWindow: 200000,
    supportsThinking: true,
    requiresAuth: 'CLAUDE_CODE_OAUTH_TOKEN',
    default: true
  },

  // OpenAI GPT-5.1 Codex Models
  'gpt-5.1-codex-max': {
    id: 'gpt-5.1-codex-max',
    name: 'GPT-5.1 Codex Max',
    modelString: 'gpt-5.1-codex-max',
    provider: 'codex',
    category: MODEL_CATEGORIES.OPENAI,
    tier: MODEL_TIERS.PREMIUM,
    description: 'Latest flagship - deep and fast reasoning for coding',
    capabilities: ['code', 'text', 'tools', 'reasoning'],
    maxTokens: 32768,
    contextWindow: 128000,
    supportsThinking: false,
    requiresAuth: 'OPENAI_API_KEY',
    codexDefault: true
  },
  'gpt-5.1-codex': {
    id: 'gpt-5.1-codex',
    name: 'GPT-5.1 Codex',
    modelString: 'gpt-5.1-codex',
    provider: 'codex',
    category: MODEL_CATEGORIES.OPENAI,
    tier: MODEL_TIERS.STANDARD,
    description: 'Optimized for code generation',
    capabilities: ['code', 'text', 'tools'],
    maxTokens: 32768,
    contextWindow: 128000,
    supportsThinking: false,
    requiresAuth: 'OPENAI_API_KEY'
  },
  'gpt-5.1-codex-mini': {
    id: 'gpt-5.1-codex-mini',
    name: 'GPT-5.1 Codex Mini',
    modelString: 'gpt-5.1-codex-mini',
    provider: 'codex',
    category: MODEL_CATEGORIES.OPENAI,
    tier: MODEL_TIERS.BASIC,
    description: 'Faster and cheaper option',
    capabilities: ['code', 'text'],
    maxTokens: 16384,
    contextWindow: 128000,
    supportsThinking: false,
    requiresAuth: 'OPENAI_API_KEY'
  },
  'gpt-5.1': {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    modelString: 'gpt-5.1',
    provider: 'codex',
    category: MODEL_CATEGORIES.OPENAI,
    tier: MODEL_TIERS.STANDARD,
    description: 'Broad world knowledge with strong reasoning',
    capabilities: ['code', 'text', 'reasoning'],
    maxTokens: 32768,
    contextWindow: 128000,
    supportsThinking: false,
    requiresAuth: 'OPENAI_API_KEY'
  }
};

/**
 * Model Registry class for querying and managing models
 */
class ModelRegistry {
  /**
   * Get all registered models
   * @returns {Object} All models
   */
  static getAllModels() {
    return MODELS;
  }

  /**
   * Get model by ID
   * @param {string} modelId Model ID
   * @returns {Object|null} Model definition or null
   */
  static getModel(modelId) {
    return MODELS[modelId] || null;
  }

  /**
   * Get models by provider
   * @param {string} provider Provider name ('claude' or 'codex')
   * @returns {Object[]} Array of models for the provider
   */
  static getModelsByProvider(provider) {
    return Object.values(MODELS).filter(m => m.provider === provider);
  }

  /**
   * Get models by category
   * @param {string} category Category name
   * @returns {Object[]} Array of models in the category
   */
  static getModelsByCategory(category) {
    return Object.values(MODELS).filter(m => m.category === category);
  }

  /**
   * Get models by tier
   * @param {string} tier Tier name
   * @returns {Object[]} Array of models in the tier
   */
  static getModelsByTier(tier) {
    return Object.values(MODELS).filter(m => m.tier === tier);
  }

  /**
   * Get default model for a provider
   * @param {string} provider Provider name
   * @returns {Object|null} Default model or null
   */
  static getDefaultModel(provider = 'claude') {
    const models = this.getModelsByProvider(provider);
    if (provider === 'claude') {
      return models.find(m => m.default) || models[0];
    }
    if (provider === 'codex') {
      return models.find(m => m.codexDefault) || models[0];
    }
    return models[0];
  }

  /**
   * Get model string (full model name) for a model ID
   * @param {string} modelId Model ID
   * @returns {string} Full model string
   */
  static getModelString(modelId) {
    const model = this.getModel(modelId);
    return model ? model.modelString : modelId;
  }

  /**
   * Determine provider for a model ID
   * @param {string} modelId Model ID
   * @returns {string} Provider name ('claude' or 'codex')
   */
  static getProviderForModel(modelId) {
    const model = this.getModel(modelId);
    if (model) {
      return model.provider;
    }

    // Fallback detection for models not explicitly registered (keeps legacy Codex IDs working)
    if (CODEX_MODEL_IDS.includes(modelId)) {
      return 'codex';
    }

    return 'claude';
  }

  /**
   * Check if a model is a Claude model
   * @param {string} modelId Model ID
   * @returns {boolean} Whether it's a Claude model
   */
  static isClaudeModel(modelId) {
    return this.getProviderForModel(modelId) === 'claude';
  }

  /**
   * Check if a model is a Codex/OpenAI model
   * @param {string} modelId Model ID
   * @returns {boolean} Whether it's a Codex model
   */
  static isCodexModel(modelId) {
    return this.getProviderForModel(modelId) === 'codex';
  }

  /**
   * Get models grouped by provider for UI display
   * @returns {Object} Models grouped by provider
   */
  static getModelsGroupedByProvider() {
    return {
      claude: this.getModelsByProvider('claude'),
      codex: this.getModelsByProvider('codex')
    };
  }

  /**
   * Get all model IDs as an array
   * @returns {string[]} Array of model IDs
   */
  static getAllModelIds() {
    return Object.keys(MODELS);
  }

  /**
   * Check if model supports a specific capability
   * @param {string} modelId Model ID
   * @param {string} capability Capability name
   * @returns {boolean} Whether the model supports the capability
   */
  static modelSupportsCapability(modelId, capability) {
    const model = this.getModel(modelId);
    return model ? model.capabilities.includes(capability) : false;
  }

  /**
   * Check if model supports extended thinking
   * @param {string} modelId Model ID
   * @returns {boolean} Whether the model supports thinking
   */
  static modelSupportsThinking(modelId) {
    const model = this.getModel(modelId);
    return model ? model.supportsThinking : false;
  }

  /**
   * Get required authentication for a model
   * @param {string} modelId Model ID
   * @returns {string|null} Required auth env variable name
   */
  static getRequiredAuth(modelId) {
    const model = this.getModel(modelId);
    return model ? model.requiresAuth : null;
  }

  /**
   * Check if authentication is available for a model
   * @param {string} modelId Model ID
   * @returns {boolean} Whether auth is available
   */
  static hasAuthForModel(modelId) {
    const authVar = this.getRequiredAuth(modelId);
    if (!authVar) return false;
    return !!process.env[authVar];
  }
}

module.exports = {
  MODEL_CATEGORIES,
  MODEL_TIERS,
  MODELS,
  ModelRegistry
};
