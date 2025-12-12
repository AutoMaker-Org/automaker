/**
 * Mock implementation of IAppService
 * For web development and testing without Electron
 */

import type { IAppService, SaveImageResult } from "../../interfaces/IAppService";
import type { ServiceResult } from "../../types";
import { mockFileSystem } from "./MockFileSystemService";

export class MockAppService implements IAppService {
  async ping(): Promise<ServiceResult<string>> {
    return { success: true, data: "pong (mock)" };
  }

  async openExternalLink(url: string): Promise<ServiceResult> {
    // In web mode, open in a new tab
    window.open(url, "_blank", "noopener,noreferrer");
    return { success: true };
  }

  async getPath(name: string): Promise<ServiceResult<string>> {
    if (name === "userData") {
      return { success: true, data: "/mock/userData" };
    }
    return { success: true, data: `/mock/${name}` };
  }

  async saveImageToTemp(
    data: string,
    filename: string,
    _mimeType: string,
    projectPath?: string
  ): Promise<ServiceResult<SaveImageResult>> {
    // Generate a mock temp file path
    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const tempFilePath = projectPath
      ? `${projectPath}/.automaker/images/${timestamp}_${safeName}`
      : `/tmp/automaker-images/${timestamp}_${safeName}`;

    // Store the image data in mock file system for testing
    mockFileSystem[tempFilePath] = data;

    console.log("[Mock] Saved image to temp:", tempFilePath);
    return { success: true, data: { path: tempFilePath } };
  }
}
