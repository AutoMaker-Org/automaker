/**
 * Linear Validation Storage - CRUD operations for Linear issue validation results
 *
 * Stores validation results in .automaker/linear-validations/{identifier}/validation.json
 * Results include the validation verdict, metadata, and timestamp for cache invalidation.
 */

import * as secureFs from './secure-fs.js';
import {
  getLinearValidationsDir,
  getLinearValidationDir,
  getLinearValidationPath,
} from '@automaker/platform';
import type { StoredLinearValidation } from '@automaker/types';

// Re-export StoredLinearValidation for convenience
export type { StoredLinearValidation };

/** Number of hours before a validation is considered stale */
const VALIDATION_CACHE_TTL_HOURS = 24;

/**
 * Write Linear validation result to storage
 *
 * Creates the validation directory if needed and stores the result as JSON.
 *
 * @param projectPath - Absolute path to project directory
 * @param identifier - Linear issue identifier (e.g., "ALE-1")
 * @param data - Validation data to store
 */
export async function writeLinearValidation(
  projectPath: string,
  identifier: string,
  data: StoredLinearValidation
): Promise<void> {
  const validationDir = getLinearValidationDir(projectPath, identifier);
  const validationPath = getLinearValidationPath(projectPath, identifier);

  // Ensure directory exists
  await secureFs.mkdir(validationDir, { recursive: true });

  // Write validation result
  await secureFs.writeFile(validationPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Read Linear validation result from storage
 *
 * @param projectPath - Absolute path to project directory
 * @param identifier - Linear issue identifier (e.g., "ALE-1")
 * @returns Stored validation or null if not found
 */
export async function readLinearValidation(
  projectPath: string,
  identifier: string
): Promise<StoredLinearValidation | null> {
  try {
    const validationPath = getLinearValidationPath(projectPath, identifier);
    const content = (await secureFs.readFile(validationPath, 'utf-8')) as string;
    return JSON.parse(content) as StoredLinearValidation;
  } catch {
    // File doesn't exist or can't be read
    return null;
  }
}

/**
 * Get all stored Linear validations for a project
 *
 * @param projectPath - Absolute path to project directory
 * @returns Array of stored validations
 */
export async function getAllLinearValidations(
  projectPath: string
): Promise<StoredLinearValidation[]> {
  const validationsDir = getLinearValidationsDir(projectPath);

  try {
    const dirs = await secureFs.readdir(validationsDir, { withFileTypes: true });

    // Read all validation files in parallel for better performance
    const promises = dirs
      .filter((dir) => dir.isDirectory())
      .map((dir) => {
        // dir.name is the sanitized identifier
        return readLinearValidationByDir(projectPath, dir.name);
      });

    const results = await Promise.all(promises);
    const validations = results.filter((v): v is StoredLinearValidation => v !== null);

    // Sort by validatedAt date (newest first)
    validations.sort(
      (a, b) => new Date(b.validatedAt).getTime() - new Date(a.validatedAt).getTime()
    );

    return validations;
  } catch {
    // Directory doesn't exist
    return [];
  }
}

/**
 * Read validation by directory name (internal helper)
 */
async function readLinearValidationByDir(
  projectPath: string,
  dirName: string
): Promise<StoredLinearValidation | null> {
  try {
    const validationPath = `${getLinearValidationsDir(projectPath)}/${dirName}/validation.json`;
    const content = (await secureFs.readFile(validationPath, 'utf-8')) as string;
    return JSON.parse(content) as StoredLinearValidation;
  } catch {
    return null;
  }
}

/**
 * Delete a Linear validation from storage
 *
 * @param projectPath - Absolute path to project directory
 * @param identifier - Linear issue identifier (e.g., "ALE-1")
 * @returns true if validation was deleted, false if not found
 */
export async function deleteLinearValidation(
  projectPath: string,
  identifier: string
): Promise<boolean> {
  try {
    const validationDir = getLinearValidationDir(projectPath, identifier);
    await secureFs.rm(validationDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a Linear validation is stale (older than TTL)
 *
 * @param validation - Stored validation to check
 * @returns true if validation is older than 24 hours
 */
export function isLinearValidationStale(validation: StoredLinearValidation): boolean {
  const validatedAt = new Date(validation.validatedAt);
  const now = new Date();
  const hoursDiff = (now.getTime() - validatedAt.getTime()) / (1000 * 60 * 60);
  return hoursDiff > VALIDATION_CACHE_TTL_HOURS;
}

/**
 * Get Linear validation with freshness info
 *
 * @param projectPath - Absolute path to project directory
 * @param identifier - Linear issue identifier (e.g., "ALE-1")
 * @returns Object with validation and isStale flag, or null if not found
 */
export async function getLinearValidationWithFreshness(
  projectPath: string,
  identifier: string
): Promise<{ validation: StoredLinearValidation; isStale: boolean } | null> {
  const validation = await readLinearValidation(projectPath, identifier);
  if (!validation) {
    return null;
  }

  return {
    validation,
    isStale: isLinearValidationStale(validation),
  };
}

/**
 * Mark a Linear validation as viewed by the user
 *
 * @param projectPath - Absolute path to project directory
 * @param identifier - Linear issue identifier (e.g., "ALE-1")
 * @returns true if validation was marked as viewed, false if not found
 */
export async function markLinearValidationViewed(
  projectPath: string,
  identifier: string
): Promise<boolean> {
  const validation = await readLinearValidation(projectPath, identifier);
  if (!validation) {
    return false;
  }

  validation.viewedAt = new Date().toISOString();
  await writeLinearValidation(projectPath, identifier, validation);
  return true;
}
