/**
 * Electron implementation of IModelService
 * Wraps window.electronAPI.model methods
 */

import type {
  IModelService,
  ModelDefinition,
  ProviderStatus,
} from "../../interfaces/IModelService";
import type { ServiceResult } from "../../types";

export class ElectronModelService implements IModelService {
  async getAvailable(): Promise<ServiceResult<ModelDefinition[]>> {
    if (!window.electronAPI?.model) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.model.getAvailable();

    if (result.success && result.models) {
      return { success: true, data: result.models };
    }

    return { success: false, error: result.error || "Failed to get models" };
  }

  async checkProviders(): Promise<ServiceResult<Record<string, ProviderStatus>>> {
    if (!window.electronAPI?.model) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.model.checkProviders();

    if (result.success && result.providers) {
      return { success: true, data: result.providers };
    }

    return { success: false, error: result.error || "Failed to check providers" };
  }
}
