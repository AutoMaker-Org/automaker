/**
 * Electron implementation of IDialogService
 * Wraps window.electronAPI dialog methods
 */

import type {
  IDialogService,
  DialogResult,
  OpenFileOptions,
} from "../../interfaces/IDialogService";
import type { ServiceResult } from "../../types";

export class ElectronDialogService implements IDialogService {
  async openDirectory(): Promise<ServiceResult<DialogResult>> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.openDirectory();

    return {
      success: true,
      data: {
        canceled: result.canceled,
        filePaths: result.filePaths,
      },
    };
  }

  async openFile(options?: OpenFileOptions): Promise<ServiceResult<DialogResult>> {
    if (!window.electronAPI) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.openFile(options);

    return {
      success: true,
      data: {
        canceled: result.canceled,
        filePaths: result.filePaths,
      },
    };
  }
}
