/**
 * Mock implementation of IDialogService
 * For web development and testing without Electron
 */

import type {
  IDialogService,
  DialogResult,
  OpenFileOptions,
} from "../../interfaces/IDialogService";
import type { ServiceResult } from "../../types";

export class MockDialogService implements IDialogService {
  async openDirectory(): Promise<ServiceResult<DialogResult>> {
    // In web mode, use a prompt to simulate directory selection
    const path = prompt("Enter project directory path:", "/Users/demo/project");
    return {
      success: true,
      data: {
        canceled: !path,
        filePaths: path ? [path] : [],
      },
    };
  }

  async openFile(_options?: OpenFileOptions): Promise<ServiceResult<DialogResult>> {
    const path = prompt("Enter file path:");
    return {
      success: true,
      data: {
        canceled: !path,
        filePaths: path ? [path] : [],
      },
    };
  }
}
