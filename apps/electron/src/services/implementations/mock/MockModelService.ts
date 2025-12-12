/**
 * Mock implementation of IModelService
 * For web development and testing without Electron
 */

import type {
  IModelService,
  ModelDefinition,
  ProviderStatus,
} from "../../interfaces/IModelService";
import type { ServiceResult } from "../../types";

export class MockModelService implements IModelService {
  async getAvailable(): Promise<ServiceResult<ModelDefinition[]>> {
    console.log("[Mock] Getting available models");
    return { success: true, data: [] };
  }

  async checkProviders(): Promise<ServiceResult<Record<string, ProviderStatus>>> {
    console.log("[Mock] Checking providers");
    return { success: true, data: {} };
  }
}
