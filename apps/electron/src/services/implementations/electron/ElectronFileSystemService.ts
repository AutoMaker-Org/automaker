/**
 * Electron implementation of IFileSystemService
 * Wraps window.electronAPI file system methods
 */

import type {
  IFileSystemService,
  FileEntry,
  FileStats,
} from "../../interfaces/IFileSystemService";
import type { ServiceResult } from "../../types";

export class ElectronFileSystemService implements IFileSystemService {
  async readFile(filePath: string): Promise<ServiceResult<string>> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.readFile(filePath);
    if (result.success && result.content !== undefined) {
      return { success: true, data: result.content };
    }
    return { success: false, error: result.error || "Failed to read file" };
  }

  async writeFile(filePath: string, content: string): Promise<ServiceResult> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.writeFile(filePath, content);
    return { success: result.success, error: result.error };
  }

  async mkdir(dirPath: string): Promise<ServiceResult> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.mkdir(dirPath);
    return { success: result.success, error: result.error };
  }

  async readdir(dirPath: string): Promise<ServiceResult<FileEntry[]>> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.readdir(dirPath);
    if (result.success && result.entries) {
      return { success: true, data: result.entries };
    }
    return { success: false, error: result.error || "Failed to read directory" };
  }

  async exists(filePath: string): Promise<boolean> {
    if (!window.electronAPI) {
      return false;
    }

    return window.electronAPI.exists(filePath);
  }

  async stat(filePath: string): Promise<ServiceResult<FileStats>> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.stat(filePath);
    if (result.success && result.stats) {
      return { success: true, data: result.stats };
    }
    return { success: false, error: result.error || "Failed to get file stats" };
  }

  async deleteFile(filePath: string): Promise<ServiceResult> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.deleteFile(filePath);
    return { success: result.success, error: result.error };
  }

  async trashItem(filePath: string): Promise<ServiceResult> {
    if (!window.electronAPI?.trashItem) {
      return { success: false, error: "Trash item not available" };
    }

    const result = await window.electronAPI.trashItem(filePath);
    return { success: result.success, error: result.error };
  }
}
