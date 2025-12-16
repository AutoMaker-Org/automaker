/**
 * File system utilities that handle symlinks safely
 */

import fs from "fs/promises";
import path from "path";

/**
 * Create a directory, handling symlinks safely to avoid ELOOP errors.
 * If the path already exists as a directory or symlink, returns success.
 */
export async function mkdirSafe(dirPath: string): Promise<void> {
  const resolvedPath = path.resolve(dirPath);

  // Check if path already exists using lstat (doesn't follow symlinks)
  try {
    const stats = await fs.lstat(resolvedPath);
    // Path exists - if it's a directory or symlink, consider it success
    if (stats.isDirectory() || stats.isSymbolicLink()) {
      return;
    }
    // It's a file - can't create directory
    throw new Error(`Path exists and is not a directory: ${resolvedPath}`);
  } catch (error: any) {
    // ENOENT means path doesn't exist - we should create it
    if (error.code !== "ENOENT") {
      // Some other error (could be ELOOP in parent path)
      // If it's ELOOP, the path involves symlinks - don't try to create
      if (error.code === "ELOOP") {
        console.warn(`[fs-utils] Symlink loop detected at ${resolvedPath}, skipping mkdir`);
        return;
      }
      throw error;
    }
  }

  // Path doesn't exist, create it
  try {
    await fs.mkdir(resolvedPath, { recursive: true });
  } catch (error: any) {
    // Handle race conditions and symlink issues
    if (error.code === "EEXIST" || error.code === "ELOOP") {
      return;
    }
    throw error;
  }
}

/**
 * Check if a path exists, handling symlinks safely.
 * Returns true if the path exists as a file, directory, or symlink.
 */
export async function existsSafe(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return false;
    }
    // ELOOP or other errors - path exists but is problematic
    if (error.code === "ELOOP") {
      return true; // Symlink exists, even if looping
    }
    throw error;
  }
}
