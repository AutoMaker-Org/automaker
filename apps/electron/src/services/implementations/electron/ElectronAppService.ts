/**
 * Electron implementation of IAppService
 * Wraps window.electronAPI app utility methods
 */

import type { IAppService, SaveImageResult } from "../../interfaces/IAppService";
import type { ServiceResult } from "../../types";

export class ElectronAppService implements IAppService {
  async ping(): Promise<ServiceResult<string>> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.ping();
    return { success: true, data: result };
  }

  async openExternalLink(url: string): Promise<ServiceResult> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.openExternalLink(url);
    return { success: result.success, error: result.error };
  }

  async getPath(name: string): Promise<ServiceResult<string>> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const path = await window.electronAPI.getPath(name);
    return { success: true, data: path };
  }

  async saveImageToTemp(
    data: string,
    filename: string,
    mimeType: string,
    projectPath?: string
  ): Promise<ServiceResult<SaveImageResult>> {
    if (!window.electronAPI?.saveImageToTemp) {
      return { success: false, error: "Save image not available" };
    }

    const result = await window.electronAPI.saveImageToTemp(
      data,
      filename,
      mimeType,
      projectPath
    );

    if (result.success && result.path) {
      return { success: true, data: { path: result.path } };
    }

    return { success: false, error: result.error || "Failed to save image" };
  }
}
