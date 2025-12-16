/**
 * Automaker Paths - Utilities for managing automaker data storage
 *
 * Stores project data in an external location (~/.automaker/projects/{project-id}/)
 * to avoid conflicts with git worktrees and symlink issues.
 *
 * The project-id is derived from the git remote URL (if available) or project path,
 * ensuring each project has a unique storage location that persists across worktrees.
 */

import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);

/**
 * Get the base automaker directory in user's home
 */
export function getAutomakerBaseDir(): string {
  return path.join(os.homedir(), ".automaker");
}

/**
 * Get the projects directory
 */
export function getProjectsDir(): string {
  return path.join(getAutomakerBaseDir(), "projects");
}

/**
 * Generate a project ID from a unique identifier (git remote or path)
 */
function generateProjectId(identifier: string): string {
  const hash = createHash("sha256").update(identifier).digest("hex");
  return hash.substring(0, 16);
}

/**
 * Get the main git repository root path (resolves worktree paths to main repo)
 */
async function getMainRepoPath(projectPath: string): Promise<string> {
  try {
    // Get the main worktree path (handles worktrees)
    const { stdout } = await execAsync(
      "git worktree list --porcelain | head -1 | sed 's/worktree //'",
      { cwd: projectPath }
    );
    const mainPath = stdout.trim();
    return mainPath || projectPath;
  } catch {
    return projectPath;
  }
}

/**
 * Get a unique identifier for a git project
 * Prefers git remote URL, falls back to main repo path
 */
async function getProjectIdentifier(projectPath: string): Promise<string> {
  const mainPath = await getMainRepoPath(projectPath);

  try {
    // Try to get the git remote URL first (most stable identifier)
    const { stdout } = await execAsync("git remote get-url origin", {
      cwd: mainPath,
    });
    const remoteUrl = stdout.trim();
    if (remoteUrl) {
      return remoteUrl;
    }
  } catch {
    // No remote configured, fall through
  }

  // Fall back to the absolute main repo path
  return path.resolve(mainPath);
}

/**
 * Get the automaker data directory for a project
 * This is the external location where all .automaker data is stored
 */
export async function getAutomakerDir(projectPath: string): Promise<string> {
  const identifier = await getProjectIdentifier(projectPath);
  const projectId = generateProjectId(identifier);
  return path.join(getProjectsDir(), projectId);
}

/**
 * Get the features directory for a project
 */
export async function getFeaturesDir(projectPath: string): Promise<string> {
  const automakerDir = await getAutomakerDir(projectPath);
  return path.join(automakerDir, "features");
}

/**
 * Get the directory for a specific feature
 */
export async function getFeatureDir(
  projectPath: string,
  featureId: string
): Promise<string> {
  const featuresDir = await getFeaturesDir(projectPath);
  return path.join(featuresDir, featureId);
}

/**
 * Get the images directory for a feature
 */
export async function getFeatureImagesDir(
  projectPath: string,
  featureId: string
): Promise<string> {
  const featureDir = await getFeatureDir(projectPath, featureId);
  return path.join(featureDir, "images");
}

/**
 * Get the board directory for a project (board backgrounds, etc.)
 */
export async function getBoardDir(projectPath: string): Promise<string> {
  const automakerDir = await getAutomakerDir(projectPath);
  return path.join(automakerDir, "board");
}

/**
 * Get the images directory for a project (general images)
 */
export async function getImagesDir(projectPath: string): Promise<string> {
  const automakerDir = await getAutomakerDir(projectPath);
  return path.join(automakerDir, "images");
}

/**
 * Get the worktrees metadata directory for a project
 */
export async function getWorktreesDir(projectPath: string): Promise<string> {
  const automakerDir = await getAutomakerDir(projectPath);
  return path.join(automakerDir, "worktrees");
}

/**
 * Get the app spec file path for a project
 */
export async function getAppSpecPath(projectPath: string): Promise<string> {
  const automakerDir = await getAutomakerDir(projectPath);
  return path.join(automakerDir, "app_spec.txt");
}

/**
 * Get the branch tracking file path for a project
 */
export async function getBranchTrackingPath(
  projectPath: string
): Promise<string> {
  const automakerDir = await getAutomakerDir(projectPath);
  return path.join(automakerDir, "active-branches.json");
}

/**
 * Ensure the automaker directory structure exists for a project
 */
export async function ensureAutomakerDir(projectPath: string): Promise<string> {
  const automakerDir = await getAutomakerDir(projectPath);
  await fs.mkdir(automakerDir, { recursive: true });
  return automakerDir;
}

/**
 * Check if there's existing .automaker data in the project directory that needs migration
 */
export async function hasLegacyAutomakerDir(
  projectPath: string
): Promise<boolean> {
  const mainPath = await getMainRepoPath(projectPath);
  const legacyPath = path.join(mainPath, ".automaker");

  try {
    const stats = await fs.lstat(legacyPath);
    // Only count it as legacy if it's a directory (not a symlink)
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Get the legacy .automaker path in the project directory
 */
export async function getLegacyAutomakerDir(
  projectPath: string
): Promise<string> {
  const mainPath = await getMainRepoPath(projectPath);
  return path.join(mainPath, ".automaker");
}

/**
 * Migrate data from legacy in-repo .automaker to external location
 * Returns true if migration was performed, false if not needed
 */
export async function migrateLegacyData(projectPath: string): Promise<boolean> {
  if (!(await hasLegacyAutomakerDir(projectPath))) {
    return false;
  }

  const legacyDir = await getLegacyAutomakerDir(projectPath);
  const newDir = await ensureAutomakerDir(projectPath);

  console.log(`[automaker-paths] Migrating data from ${legacyDir} to ${newDir}`);

  try {
    // Copy all contents from legacy to new location
    const entries = await fs.readdir(legacyDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(legacyDir, entry.name);
      const destPath = path.join(newDir, entry.name);

      // Skip if destination already exists
      try {
        await fs.access(destPath);
        console.log(
          `[automaker-paths] Skipping ${entry.name} (already exists in destination)`
        );
        continue;
      } catch {
        // Destination doesn't exist, proceed with copy
      }

      if (entry.isDirectory()) {
        await fs.cp(srcPath, destPath, { recursive: true });
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
      }
      // Skip symlinks
    }

    console.log(`[automaker-paths] Migration complete`);

    // Optionally rename the old directory to mark it as migrated
    const backupPath = path.join(
      path.dirname(legacyDir),
      ".automaker-migrated"
    );
    try {
      await fs.rename(legacyDir, backupPath);
      console.log(
        `[automaker-paths] Renamed legacy directory to .automaker-migrated`
      );
    } catch (error) {
      console.warn(
        `[automaker-paths] Could not rename legacy directory:`,
        error
      );
    }

    return true;
  } catch (error) {
    console.error(`[automaker-paths] Migration failed:`, error);
    throw error;
  }
}

/**
 * Convert a legacy relative path (e.g., ".automaker/features/...")
 * to the new external absolute path
 */
export async function convertLegacyPath(
  projectPath: string,
  legacyRelativePath: string
): Promise<string> {
  // If it doesn't start with .automaker, return as-is
  if (!legacyRelativePath.startsWith(".automaker")) {
    return legacyRelativePath;
  }

  const automakerDir = await getAutomakerDir(projectPath);
  // Remove ".automaker/" prefix and join with new base
  const relativePart = legacyRelativePath.replace(/^\.automaker\/?/, "");
  return path.join(automakerDir, relativePart);
}

/**
 * Get a relative path for display/storage (relative to external automaker dir)
 * The path is prefixed with "automaker:" to indicate it's an external path
 */
export async function getDisplayPath(
  projectPath: string,
  absolutePath: string
): Promise<string> {
  const automakerDir = await getAutomakerDir(projectPath);
  if (absolutePath.startsWith(automakerDir)) {
    const relativePart = absolutePath.substring(automakerDir.length + 1);
    return `automaker:${relativePart}`;
  }
  return absolutePath;
}

/**
 * Resolve a display path back to absolute path
 */
export async function resolveDisplayPath(
  projectPath: string,
  displayPath: string
): Promise<string> {
  if (displayPath.startsWith("automaker:")) {
    const automakerDir = await getAutomakerDir(projectPath);
    const relativePart = displayPath.substring("automaker:".length);
    return path.join(automakerDir, relativePart);
  }
  // Legacy ".automaker" paths
  if (displayPath.startsWith(".automaker")) {
    return convertLegacyPath(projectPath, displayPath);
  }
  // Already absolute or project-relative path
  return displayPath;
}
