/**
 * Dialog Service Interface
 * Native file/directory picker dialogs
 */

import type { ServiceResult, IService } from "../types";

export interface DialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface OpenFileOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  properties?: Array<
    | "openFile"
    | "openDirectory"
    | "multiSelections"
    | "showHiddenFiles"
    | "createDirectory"
    | "promptToCreate"
    | "noResolveAliases"
    | "treatPackageAsDirectory"
  >;
}

export interface IDialogService extends IService {
  /**
   * Open a directory picker dialog
   */
  openDirectory(): Promise<ServiceResult<DialogResult>>;

  /**
   * Open a file picker dialog
   */
  openFile(options?: OpenFileOptions): Promise<ServiceResult<DialogResult>>;
}
