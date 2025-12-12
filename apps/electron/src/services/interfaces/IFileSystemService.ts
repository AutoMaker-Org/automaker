/**
 * File System Service Interface
 * Provides file operations abstracted from the underlying implementation
 */

import type { ServiceResult, IService } from "../types";

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileStats {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: Date;
}

export interface IFileSystemService extends IService {
  /**
   * Read file contents as UTF-8 string
   */
  readFile(filePath: string): Promise<ServiceResult<string>>;

  /**
   * Write content to a file (creates or overwrites)
   */
  writeFile(filePath: string, content: string): Promise<ServiceResult>;

  /**
   * Create a directory (recursive)
   */
  mkdir(dirPath: string): Promise<ServiceResult>;

  /**
   * List directory contents
   */
  readdir(dirPath: string): Promise<ServiceResult<FileEntry[]>>;

  /**
   * Check if a file or directory exists
   */
  exists(filePath: string): Promise<boolean>;

  /**
   * Get file/directory stats
   */
  stat(filePath: string): Promise<ServiceResult<FileStats>>;

  /**
   * Delete a file
   */
  deleteFile(filePath: string): Promise<ServiceResult>;

  /**
   * Move a file to trash (safe delete)
   */
  trashItem(filePath: string): Promise<ServiceResult>;
}
