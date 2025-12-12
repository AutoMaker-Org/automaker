/**
 * Model Service Interface
 * Available AI models and provider status
 */

import type { ServiceResult, IService } from "../types";

export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsImages?: boolean;
  supportsTools?: boolean;
}

export interface ProviderStatus {
  available: boolean;
  name: string;
  hasApiKey?: boolean;
  models?: string[];
}

export interface IModelService extends IService {
  /**
   * Get all available models
   */
  getAvailable(): Promise<ServiceResult<ModelDefinition[]>>;

  /**
   * Check status of model providers
   */
  checkProviders(): Promise<ServiceResult<Record<string, ProviderStatus>>>;
}
