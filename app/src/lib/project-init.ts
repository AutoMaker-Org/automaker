/**
 * Project initialization utilities
 *
 * Handles the setup of the .automaker directory structure when opening
 * new or existing projects.
 */

import { getElectronAPI } from "./electron";
import { safeJoin } from "./path-utils";

export interface ProjectInitResult {
  success: boolean;
  isNewProject: boolean;
  error?: string;
  createdFiles?: string[];
  existingFiles?: string[];
}

/**
 * Default app_spec.txt template for new projects
 */
const DEFAULT_APP_SPEC = `<project_specification>
  <project_name>Untitled Project</project_name>

  <overview>
    Describe your project here. This file will be analyzed by an AI agent
    to understand your project structure and tech stack.
  </overview>

  <technology_stack>
    <!-- The AI agent will fill this in after analyzing your project -->
  </technology_stack>

  <core_capabilities>
    <!-- List core features and capabilities -->
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>
`;

/**
 * Default feature_list.json template for new projects
 */
const DEFAULT_FEATURE_LIST = JSON.stringify([], null, 2);

/**
 * Required files and directories in the .automaker directory
 */
const REQUIRED_STRUCTURE = {
  directories: [
    ".automaker",
    ".automaker/context",
    ".automaker/agents-context",
  ],
  files: {
    ".automaker/app_spec.txt": DEFAULT_APP_SPEC,
    ".automaker/feature_list.json": DEFAULT_FEATURE_LIST,
  },
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
  const api = await getElectronAPI();
  if (!api) {
    throw new Error("Failed to get Electron API");
  }
  const createdFiles: string[] = [];
  const existingFiles: string[] = [];

  try {
    // Create all required directories
    for (const dir of REQUIRED_STRUCTURE.directories) {
      const fullPath = safeJoin(projectPath, dir);
      await api.mkdir(fullPath);
    }

    // Check and create required files
    for (const [relativePath, defaultContent] of Object.entries(
      REQUIRED_STRUCTURE.files
    )) {
      const fullPath = safeJoin(projectPath, relativePath);
      const exists = await api.exists(fullPath);

      if (!exists) {
        await api.writeFile(fullPath, defaultContent);
        createdFiles.push(relativePath);
      } else {
        existingFiles.push(relativePath);
      }
    }

    // Determine if this is a new project (all files were created)
    const isNewProject =
      createdFiles.length === Object.keys(REQUIRED_STRUCTURE.files).length;

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
  const api = await getElectronAPI();
  if (!api) {
    console.error("Failed to get Electron API");
    return false;
  }

  try {
    // Check all required files exist
    for (const relativePath of Object.keys(REQUIRED_STRUCTURE.files)) {
      const fullPath = safeJoin(projectPath, relativePath);
      const exists = await api.exists(fullPath);
      if (!exists) {
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
  const api = await getElectronAPI();
  if (!api) {
    console.error("Failed to get Electron API");
    return { initialized: false, missingFiles: [], existingFiles: [] };
  }
  const missingFiles: string[] = [];
  const existingFiles: string[] = [];

  try {
    for (const relativePath of Object.keys(REQUIRED_STRUCTURE.files)) {
      const fullPath = safeJoin(projectPath, relativePath);
      const exists = await api.exists(fullPath);
      if (exists) {
        existingFiles.push(relativePath);
      } else {
        missingFiles.push(relativePath);
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
      missingFiles: Object.keys(REQUIRED_STRUCTURE.files),
      existingFiles: [],
    };
  }
}
