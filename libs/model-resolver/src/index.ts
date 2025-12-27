/**
 * @automaker/model-resolver
 * Model resolution utilities for AutoMaker
 */

// Re-export constants from types
export {
  CLAUDE_MODEL_MAP,
  DEFAULT_MODELS,
  MODEL_EQUIVALENCE,
  getProviderForModel,
  type ModelAlias,
} from '@automaker/types';

// Export resolver functions
export {
  resolveModelString,
  getEffectiveModel,
  getModelForUseCase,
  resolveModelWithProviderAvailability,
  type EnabledProviders,
  type ModelUseCase,
  type ProviderHint,
} from './resolver.js';
