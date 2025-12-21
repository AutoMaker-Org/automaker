/**
 * Secure File System Adapter
 *
 * All file I/O operations must go through this adapter to enforce
 * ALLOWED_ROOT_DIRECTORY restrictions at the actual access point,
 * not just at the API layer. This provides defense-in-depth security.
 */

import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { validatePath } from "./security.js";

/**
 * Wrapper around fs.access that validates path first
 */
export async function access(filePath: string, mode?: number): Promise<void> {
  const validatedPath = validatePath(filePath);
  return fs.access(validatedPath, mode);
}

/**
 * Wrapper around fs.readFile that validates path first
 */
export async function readFile(
  filePath: string,
  encoding?: BufferEncoding
): Promise<string | Buffer> {
  const validatedPath = validatePath(filePath);
  if (encoding) {
    return fs.readFile(validatedPath, encoding);
  }
  return fs.readFile(validatedPath);
}

/**
 * Wrapper around fs.writeFile that validates path first
 */
export async function writeFile(
  filePath: string,
  data: string | Buffer,
  encoding?: BufferEncoding
): Promise<void> {
  const validatedPath = validatePath(filePath);
  return fs.writeFile(validatedPath, data, encoding);
}

/**
 * Wrapper around fs.mkdir that validates path first
 */
export async function mkdir(
  dirPath: string,
  options?: { recursive?: boolean; mode?: number }
): Promise<string | undefined> {
  const validatedPath = validatePath(dirPath);
  return fs.mkdir(validatedPath, options);
}

/**
 * Wrapper around fs.readdir that validates path first
 */
export async function readdir(
  dirPath: string,
  options?: { withFileTypes?: false; encoding?: BufferEncoding }
): Promise<string[]>;
export async function readdir(
  dirPath: string,
  options: { withFileTypes: true; encoding?: BufferEncoding }
): Promise<Dirent[]>;
export async function readdir(
  dirPath: string,
  options?: { withFileTypes?: boolean; encoding?: BufferEncoding }
): Promise<string[] | Dirent[]> {
  const validatedPath = validatePath(dirPath);
  if (options?.withFileTypes === true) {
    return fs.readdir(validatedPath, { withFileTypes: true });
  }
  return fs.readdir(validatedPath);
}

/**
 * Wrapper around fs.stat that validates path first
 */
export async function stat(filePath: string): Promise<any> {
  const validatedPath = validatePath(filePath);
  return fs.stat(validatedPath);
}

/**
 * Wrapper around fs.rm that validates path first
 */
export async function rm(
  filePath: string,
  options?: { recursive?: boolean; force?: boolean }
): Promise<void> {
  const validatedPath = validatePath(filePath);
  return fs.rm(validatedPath, options);
}

/**
 * Wrapper around fs.unlink that validates path first
 */
export async function unlink(filePath: string): Promise<void> {
  const validatedPath = validatePath(filePath);
  return fs.unlink(validatedPath);
}

/**
 * Wrapper around fs.copyFile that validates both paths first
 */
export async function copyFile(
  src: string,
  dest: string,
  mode?: number
): Promise<void> {
  const validatedSrc = validatePath(src);
  const validatedDest = validatePath(dest);
  return fs.copyFile(validatedSrc, validatedDest, mode);
}

/**
 * Wrapper around fs.appendFile that validates path first
 */
export async function appendFile(
  filePath: string,
  data: string | Buffer,
  encoding?: BufferEncoding
): Promise<void> {
  const validatedPath = validatePath(filePath);
  return fs.appendFile(validatedPath, data, encoding);
}

/**
 * Wrapper around fs.rename that validates both paths first
 */
export async function rename(
  oldPath: string,
  newPath: string
): Promise<void> {
  const validatedOldPath = validatePath(oldPath);
  const validatedNewPath = validatePath(newPath);
  return fs.rename(validatedOldPath, validatedNewPath);
}

/**
 * Wrapper around fs.lstat that validates path first
 * Returns file stats without following symbolic links
 */
export async function lstat(filePath: string): Promise<any> {
  const validatedPath = validatePath(filePath);
  return fs.lstat(validatedPath);
}

/**
 * Wrapper around path.join that returns resolved path
 * Does NOT validate - use this for path construction, then pass to other operations
 */
export function joinPath(...pathSegments: string[]): string {
  return path.join(...pathSegments);
}

/**
 * Wrapper around path.resolve that returns resolved path
 * Does NOT validate - use this for path construction, then pass to other operations
 */
export function resolvePath(...pathSegments: string[]): string {
  return path.resolve(...pathSegments);
}
