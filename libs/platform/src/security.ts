/**
 * Security utilities for path validation
 * Enforces ALLOWED_ROOT_DIRECTORY constraint with appData exception
 */

import path from "path";

/**
 * Error thrown when a path is not allowed by security policy
 */
export class PathNotAllowedError extends Error {
  constructor(filePath: string) {
    super(
      `Path not allowed: ${filePath}. Must be within ALLOWED_ROOT_DIRECTORY or DATA_DIR.`
    );
    this.name = "PathNotAllowedError";
  }
}

// Allowed root directory - main security boundary
let allowedRootDirectory: string | null = null;

// Data directory - always allowed for settings/credentials
let dataDirectory: string | null = null;

/**
 * Initialize security settings from environment variables
 * - ALLOWED_ROOT_DIRECTORY: main security boundary
 * - DATA_DIR: appData exception, always allowed
 */
export function initAllowedPaths(): void {
  // Load ALLOWED_ROOT_DIRECTORY
  const rootDir = process.env.ALLOWED_ROOT_DIRECTORY;
  if (rootDir) {
    allowedRootDirectory = path.resolve(rootDir);
    console.log(
      `[Security] ✓ ALLOWED_ROOT_DIRECTORY configured: ${allowedRootDirectory}`
    );
  } else {
    console.log(
      "[Security] ⚠️  ALLOWED_ROOT_DIRECTORY not set - allowing access to all paths"
    );
  }

  // Load DATA_DIR (appData exception - always allowed)
  const dataDir = process.env.DATA_DIR;
  if (dataDir) {
    dataDirectory = path.resolve(dataDir);
    console.log(`[Security] ✓ DATA_DIR configured: ${dataDirectory}`);
  }
}

/**
 * Check if a path is allowed based on ALLOWED_ROOT_DIRECTORY
 * Returns true if:
 * - Path is within ALLOWED_ROOT_DIRECTORY, OR
 * - Path is within DATA_DIR (appData exception), OR
 * - No restrictions are configured (backward compatibility)
 */
export function isPathAllowed(filePath: string): boolean {
  const resolvedPath = path.resolve(filePath);

  // Always allow appData directory (settings, credentials)
  if (dataDirectory && isPathWithinDirectory(resolvedPath, dataDirectory)) {
    return true;
  }

  // If no ALLOWED_ROOT_DIRECTORY restriction is configured, allow all paths
  // Note: DATA_DIR is checked above as an exception, but doesn't restrict other paths
  if (!allowedRootDirectory) {
    return true;
  }

  // Allow if within ALLOWED_ROOT_DIRECTORY
  if (
    allowedRootDirectory &&
    isPathWithinDirectory(resolvedPath, allowedRootDirectory)
  ) {
    return true;
  }

  // If restrictions are configured but path doesn't match, deny
  return false;
}

/**
 * Validate a path - resolves it and checks permissions
 * Throws PathNotAllowedError if path is not allowed
 */
export function validatePath(filePath: string): string {
  const resolvedPath = path.resolve(filePath);

  if (!isPathAllowed(resolvedPath)) {
    throw new PathNotAllowedError(filePath);
  }

  return resolvedPath;
}

/**
 * Check if a path is within a directory, with protection against path traversal
 * Returns true only if resolvedPath is within directoryPath
 */
export function isPathWithinDirectory(
  resolvedPath: string,
  directoryPath: string
): boolean {
  // Get the relative path from directory to the target
  const relativePath = path.relative(directoryPath, resolvedPath);

  // If relative path starts with "..", it's outside the directory
  // If relative path is absolute, it's outside the directory
  // If relative path is empty or ".", it's the directory itself
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

/**
 * Get the configured allowed root directory
 */
export function getAllowedRootDirectory(): string | null {
  return allowedRootDirectory;
}

/**
 * Get the configured data directory
 */
export function getDataDirectory(): string | null {
  return dataDirectory;
}

/**
 * Get list of allowed paths (for debugging)
 */
export function getAllowedPaths(): string[] {
  const paths: string[] = [];
  if (allowedRootDirectory) {
    paths.push(allowedRootDirectory);
  }
  if (dataDirectory) {
    paths.push(dataDirectory);
  }
  return paths;
}
