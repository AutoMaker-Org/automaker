/**
 * Automaker Paths - Utilities for managing automaker data storage
 *
 * Provides functions to construct paths for:
 * - Project-level data stored in {projectPath}/.automaker/
 * - Global user data stored in app userData directory
 *
 * All returned paths are absolute and ready to use with fs module.
 * Directory creation is handled separately by ensure* functions.
 */

import * as secureFs from './secure-fs.js';
import path from 'path';

/**
 * Get the automaker data directory root for a project
 *
 * All project-specific automaker data is stored under {projectPath}/.automaker/
 * This directory is created when needed via ensureAutomakerDir().
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker
 */
export function getAutomakerDir(projectPath: string): string {
  return path.join(projectPath, '.automaker');
}

/**
 * Get the features directory for a project
 *
 * Contains subdirectories for each feature, keyed by featureId.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/features
 */
export function getFeaturesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'features');
}

/**
 * Get the directory for a specific feature
 *
 * Contains feature-specific data like generated code, tests, and logs.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns Absolute path to {projectPath}/.automaker/features/{featureId}
 */
export function getFeatureDir(projectPath: string, featureId: string): string {
  return path.join(getFeaturesDir(projectPath), featureId);
}

/**
 * Get the images directory for a feature
 *
 * Stores screenshots, diagrams, or other images related to the feature.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns Absolute path to {projectPath}/.automaker/features/{featureId}/images
 */
export function getFeatureImagesDir(projectPath: string, featureId: string): string {
  return path.join(getFeatureDir(projectPath, featureId), 'images');
}

/**
 * Get the board directory for a project
 *
 * Contains board-related data like background images and customization files.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/board
 */
export function getBoardDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'board');
}

/**
 * Get the general images directory for a project
 *
 * Stores project-level images like background images or shared assets.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/images
 */
export function getImagesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'images');
}

/**
 * Get the context files directory for a project
 *
 * Stores user-uploaded context files for reference during generation.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/context
 */
export function getContextDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'context');
}

/**
 * Get the worktrees metadata directory for a project
 *
 * Stores information about git worktrees associated with the project.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/worktrees
 */
export function getWorktreesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'worktrees');
}

/**
 * Get the validations directory for a project
 *
 * Stores GitHub issue validation results, organized by issue number.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/validations
 */
export function getValidationsDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'validations');
}

/**
 * Get the directory for a specific issue validation
 *
 * Contains validation result and metadata for a GitHub issue.
 *
 * @param projectPath - Absolute path to project directory
 * @param issueNumber - GitHub issue number
 * @returns Absolute path to {projectPath}/.automaker/validations/{issueNumber}
 */
export function getValidationDir(projectPath: string, issueNumber: number): string {
  return path.join(getValidationsDir(projectPath), String(issueNumber));
}

/**
 * Get the validation result file path for a GitHub issue
 *
 * Stores the JSON validation result including verdict, analysis, and metadata.
 *
 * @param projectPath - Absolute path to project directory
 * @param issueNumber - GitHub issue number
 * @returns Absolute path to {projectPath}/.automaker/validations/{issueNumber}/validation.json
 */
export function getValidationPath(projectPath: string, issueNumber: number): string {
  return path.join(getValidationDir(projectPath, issueNumber), 'validation.json');
}

/**
 * Get the app spec file path for a project
 *
 * Stores the application specification document used for generation.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/app_spec.txt
 */
export function getAppSpecPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'app_spec.txt');
}

/**
 * Get the branch tracking file path for a project
 *
 * Stores JSON metadata about active git branches and worktrees.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/active-branches.json
 */
export function getBranchTrackingPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'active-branches.json');
}

/**
 * Create the automaker directory structure for a project if it doesn't exist
 *
 * Creates {projectPath}/.automaker with all subdirectories recursively.
 * Safe to call multiple times - uses recursive: true.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Promise resolving to the created automaker directory path
 */
export async function ensureAutomakerDir(projectPath: string): Promise<string> {
  const automakerDir = getAutomakerDir(projectPath);
  await secureFs.mkdir(automakerDir, { recursive: true });
  return automakerDir;
}

// ============================================================================
// Global Settings Paths (stored in DATA_DIR from app.getPath('userData'))
// ============================================================================

/**
 * Get the global settings file path
 *
 * Stores user preferences, keyboard shortcuts, AI profiles, and project history.
 * Located in the platform-specific userData directory.
 *
 * Default locations:
 * - macOS: ~/Library/Application Support/automaker
 * - Windows: %APPDATA%\automaker
 * - Linux: ~/.config/automaker
 *
 * @param dataDir - User data directory (from app.getPath('userData'))
 * @returns Absolute path to {dataDir}/settings.json
 */
export function getGlobalSettingsPath(dataDir: string): string {
  return path.join(dataDir, 'settings.json');
}

/**
 * Get the credentials file path
 *
 * Stores sensitive API keys separately from other settings for security.
 * Located in the platform-specific userData directory.
 *
 * @param dataDir - User data directory (from app.getPath('userData'))
 * @returns Absolute path to {dataDir}/credentials.json
 */
export function getCredentialsPath(dataDir: string): string {
  return path.join(dataDir, 'credentials.json');
}

/**
 * Get the project settings file path
 *
 * Stores project-specific settings that override global settings.
 * Located within the project's .automaker directory.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/settings.json
 */
export function getProjectSettingsPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'settings.json');
}

/**
 * Create the global data directory if it doesn't exist
 *
 * Creates the userData directory for storing global settings and credentials.
 * Safe to call multiple times - uses recursive: true.
 *
 * @param dataDir - User data directory path to create
 * @returns Promise resolving to the created data directory path
 */
export async function ensureDataDir(dataDir: string): Promise<string> {
  await secureFs.mkdir(dataDir, { recursive: true });
  return dataDir;
}
