/**
 * Project initialization utilities
 *
 * Handles the setup of the .automaker directory structure when opening
 * new or existing projects.
 */

import { services, isBootstrapped } from "@/services";

export interface ProjectInitResult {
  success: boolean;
  isNewProject: boolean;
  error?: string;
  createdFiles?: string[];
  existingFiles?: string[];
}

/**
 * Required files and directories in the .automaker directory
 * Note: app_spec.txt is NOT created automatically - user must set it up via the spec editor
 */
const REQUIRED_STRUCTURE: {
  directories: string[];
  files: Record<string, string>;
} = {
  directories: [
    ".automaker",
    ".automaker/context",
    ".automaker/features",
    ".automaker/images",
  ],
  files: {},
};

/**
 * Initializes the .automaker directory structure for a project
 *
 * @param projectPath - The root path of the project
 * @returns Result indicating what was created or if the project was already initialized
 */
export async function initializeProject(
  projectPath: string
): Promise<ProjectInitResult> {
  if (!isBootstrapped()) {
    return {
      success: false,
      isNewProject: false,
      error: "Services not initialized",
    };
  }

  const createdFiles: string[] = [];
  const existingFiles: string[] = [];

  try {
    // Create all required directories
    for (const dir of REQUIRED_STRUCTURE.directories) {
      const fullPath = `${projectPath}/${dir}`;
      await services.fileSystem.mkdir(fullPath);
    }

    // Check and create required files
    for (const [relativePath, defaultContent] of Object.entries(
      REQUIRED_STRUCTURE.files
    )) {
      const fullPath = `${projectPath}/${relativePath}`;
      const fileExists = await services.fileSystem.exists(fullPath);

      if (!fileExists) {
        await services.fileSystem.writeFile(fullPath, defaultContent as string);
        createdFiles.push(relativePath);
      } else {
        existingFiles.push(relativePath);
      }
    }

    // Determine if this is a new project (no files needed to be created since features/ is empty by default)
    const isNewProject =
      createdFiles.length === 0 && existingFiles.length === 0;

    return {
      success: true,
      isNewProject,
      createdFiles,
      existingFiles,
    };
  } catch (error) {
    console.error("[project-init] Failed to initialize project:", error);
    return {
      success: false,
      isNewProject: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Checks if a project has the required .automaker structure
 *
 * @param projectPath - The root path of the project
 * @returns true if all required files/directories exist
 */
export async function isProjectInitialized(
  projectPath: string
): Promise<boolean> {
  if (!isBootstrapped()) {
    return false;
  }

  try {
    // Check all required directories exist (no files required - features/ folder is source of truth)
    for (const dir of REQUIRED_STRUCTURE.directories) {
      const fullPath = `${projectPath}/${dir}`;
      const dirExists = await services.fileSystem.exists(fullPath);
      if (!dirExists) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(
      "[project-init] Error checking project initialization:",
      error
    );
    return false;
  }
}

/**
 * Gets a summary of what needs to be initialized for a project
 *
 * @param projectPath - The root path of the project
 * @returns List of missing files/directories
 */
export async function getProjectInitStatus(projectPath: string): Promise<{
  initialized: boolean;
  missingFiles: string[];
  existingFiles: string[];
}> {
  if (!isBootstrapped()) {
    return {
      initialized: false,
      missingFiles: REQUIRED_STRUCTURE.directories,
      existingFiles: [],
    };
  }

  const missingFiles: string[] = [];
  const existingFiles: string[] = [];

  try {
    // Check directories (no files required - features/ folder is source of truth)
    for (const dir of REQUIRED_STRUCTURE.directories) {
      const fullPath = `${projectPath}/${dir}`;
      const dirExists = await services.fileSystem.exists(fullPath);
      if (dirExists) {
        existingFiles.push(dir);
      } else {
        missingFiles.push(dir);
      }
    }

    return {
      initialized: missingFiles.length === 0,
      missingFiles,
      existingFiles,
    };
  } catch (error) {
    console.error("[project-init] Error getting project status:", error);
    return {
      initialized: false,
      missingFiles: REQUIRED_STRUCTURE.directories,
      existingFiles: [],
    };
  }
}

/**
 * Checks if the app_spec.txt file exists for a project
 *
 * @param projectPath - The root path of the project
 * @returns true if app_spec.txt exists
 */
export async function hasAppSpec(projectPath: string): Promise<boolean> {
  if (!isBootstrapped()) {
    return false;
  }

  try {
    const fullPath = `${projectPath}/.automaker/app_spec.txt`;
    return await services.fileSystem.exists(fullPath);
  } catch (error) {
    console.error("[project-init] Error checking app_spec.txt:", error);
    return false;
  }
}

/**
 * Checks if the .automaker directory exists for a project
 *
 * @param projectPath - The root path of the project
 * @returns true if .automaker directory exists
 */
export async function hasAutomakerDir(projectPath: string): Promise<boolean> {
  if (!isBootstrapped()) {
    return false;
  }

  try {
    const fullPath = `${projectPath}/.automaker`;
    return await services.fileSystem.exists(fullPath);
  } catch (error) {
    console.error("[project-init] Error checking .automaker dir:", error);
    return false;
  }
}
