/**
 * App Service Interface
 * General application utilities
 */

import type { ServiceResult, IService } from "../types";

export interface SaveImageResult {
  path: string;
}

export interface IAppService extends IService {
  /**
   * Ping the backend (connectivity check)
   */
  ping(): Promise<ServiceResult<string>>;

  /**
   * Open a URL in the default browser
   */
  openExternalLink(url: string): Promise<ServiceResult>;

  /**
   * Get app-specific paths (userData, temp, etc.)
   */
  getPath(name: string): Promise<ServiceResult<string>>;

  /**
   * Save an image to the project's .automaker/images directory
   */
  saveImageToTemp(
    data: string,
    filename: string,
    mimeType: string,
    projectPath?: string
  ): Promise<ServiceResult<SaveImageResult>>;
}
