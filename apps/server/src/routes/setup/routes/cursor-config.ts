/**
 * Cursor CLI configuration routes
 *
 * Provides endpoints for managing Cursor CLI configuration:
 * - GET /api/setup/cursor-config - Get current configuration
 * - POST /api/setup/cursor-config/default-model - Set default model
 * - POST /api/setup/cursor-config/models - Set enabled models
 *
 * Cursor CLI Permissions endpoints:
 * - GET /api/setup/cursor-permissions - Get permissions config
 * - POST /api/setup/cursor-permissions/profile - Apply a permission profile
 * - POST /api/setup/cursor-permissions/custom - Set custom permissions
 * - DELETE /api/setup/cursor-permissions - Delete project permissions (use global)
 */

import type { Request, Response } from 'express';
import path from 'path';
import { CursorConfigManager } from '../../../providers/cursor-config-manager.js';
import {
  CURSOR_MODEL_MAP,
  CURSOR_PERMISSION_PROFILES,
  type CursorModelId,
  type CursorPermissionProfile,
  type CursorCliPermissions,
} from '@automaker/types';
import {
  readGlobalConfig,
  readProjectConfig,
  getEffectivePermissions,
  applyProfileToProject,
  applyProfileGlobally,
  writeProjectConfig,
  deleteProjectConfig,
  detectProfile,
  hasProjectConfig,
  getAvailableProfiles,
  generateExampleConfig,
} from '../../../services/cursor-config-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Validate that a project path is safe (no path traversal)
 * @throws Error if path contains traversal sequences
 */
function validateProjectPath(projectPath: string): void {
  // Resolve to absolute path and check for traversal
  const resolved = path.resolve(projectPath);
  const normalized = path.normalize(projectPath);

  // Check for obvious traversal attempts
  if (normalized.includes('..') || projectPath.includes('..')) {
    throw new Error('Invalid project path: path traversal not allowed');
  }

  // Ensure the resolved path doesn't escape intended boundaries
  // by checking if it starts with the normalized path components
  if (!resolved.startsWith(path.resolve(normalized))) {
    throw new Error('Invalid project path: path traversal detected');
  }
}

/**
 * Creates handler for GET /api/setup/cursor-config
 * Returns current Cursor configuration and available models
 */
export function createGetCursorConfigHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      // Validate path to prevent traversal attacks
      validateProjectPath(projectPath);

      const configManager = new CursorConfigManager(projectPath);

      res.json({
        success: true,
        config: configManager.getConfig(),
        availableModels: Object.values(CURSOR_MODEL_MAP),
      });
    } catch (error) {
      logError(error, 'Get Cursor config failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Creates handler for POST /api/setup/cursor-config/default-model
 * Sets the default Cursor model
 */
export function createSetCursorDefaultModelHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { model, projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      // Validate path to prevent traversal attacks
      validateProjectPath(projectPath);

      if (!model || !(model in CURSOR_MODEL_MAP)) {
        res.status(400).json({
          success: false,
          error: `Invalid model ID. Valid models: ${Object.keys(CURSOR_MODEL_MAP).join(', ')}`,
        });
        return;
      }

      const configManager = new CursorConfigManager(projectPath);
      configManager.setDefaultModel(model as CursorModelId);

      res.json({ success: true, model });
    } catch (error) {
      logError(error, 'Set Cursor default model failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Creates handler for POST /api/setup/cursor-config/models
 * Sets the enabled Cursor models list
 */
export function createSetCursorModelsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { models, projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      // Validate path to prevent traversal attacks
      validateProjectPath(projectPath);

      if (!Array.isArray(models)) {
        res.status(400).json({
          success: false,
          error: 'Models must be an array',
        });
        return;
      }

      // Filter to valid models only
      const validModels = models.filter((m): m is CursorModelId => m in CURSOR_MODEL_MAP);

      if (validModels.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid models provided',
        });
        return;
      }

      const configManager = new CursorConfigManager(projectPath);
      configManager.setEnabledModels(validModels);

      res.json({ success: true, models: validModels });
    } catch (error) {
      logError(error, 'Set Cursor models failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

// =============================================================================
// Cursor CLI Permissions Handlers
// =============================================================================

/**
 * Creates handler for GET /api/setup/cursor-permissions
 * Returns current permissions configuration and available profiles
 */
export function createGetCursorPermissionsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string | undefined;

      // Validate path if provided
      if (projectPath) {
        validateProjectPath(projectPath);
      }

      // Get global config
      const globalConfig = await readGlobalConfig();

      // Get project config if path provided
      const projectConfig = projectPath ? await readProjectConfig(projectPath) : null;

      // Get effective permissions
      const effectivePermissions = await getEffectivePermissions(projectPath);

      // Detect which profile is active
      const activeProfile = detectProfile(effectivePermissions);

      // Check if project has its own config
      const hasProject = projectPath ? await hasProjectConfig(projectPath) : false;

      res.json({
        success: true,
        globalPermissions: globalConfig?.permissions || null,
        projectPermissions: projectConfig?.permissions || null,
        effectivePermissions,
        activeProfile,
        hasProjectConfig: hasProject,
        availableProfiles: getAvailableProfiles(),
      });
    } catch (error) {
      logError(error, 'Get Cursor permissions failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Creates handler for POST /api/setup/cursor-permissions/profile
 * Applies a predefined permission profile
 */
export function createApplyPermissionProfileHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { profileId, projectPath, scope } = req.body as {
        profileId: CursorPermissionProfile;
        projectPath?: string;
        scope: 'global' | 'project';
      };

      // Validate profile
      const validProfiles = CURSOR_PERMISSION_PROFILES.map((p) => p.id);
      if (!validProfiles.includes(profileId)) {
        res.status(400).json({
          success: false,
          error: `Invalid profile. Valid profiles: ${validProfiles.join(', ')}`,
        });
        return;
      }

      if (scope === 'project') {
        if (!projectPath) {
          res.status(400).json({
            success: false,
            error: 'projectPath is required for project scope',
          });
          return;
        }
        // Validate path to prevent traversal attacks
        validateProjectPath(projectPath);
        await applyProfileToProject(projectPath, profileId);
      } else {
        await applyProfileGlobally(profileId);
      }

      res.json({
        success: true,
        message: `Applied "${profileId}" profile to ${scope}`,
        scope,
        profileId,
      });
    } catch (error) {
      logError(error, 'Apply Cursor permission profile failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Creates handler for POST /api/setup/cursor-permissions/custom
 * Sets custom permissions for a project
 */
export function createSetCustomPermissionsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, permissions } = req.body as {
        projectPath: string;
        permissions: CursorCliPermissions;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      // Validate path to prevent traversal attacks
      validateProjectPath(projectPath);

      if (!permissions || !Array.isArray(permissions.allow) || !Array.isArray(permissions.deny)) {
        res.status(400).json({
          success: false,
          error: 'permissions must have allow and deny arrays',
        });
        return;
      }

      await writeProjectConfig(projectPath, {
        version: 1,
        permissions,
      });

      res.json({
        success: true,
        message: 'Custom permissions saved',
        permissions,
      });
    } catch (error) {
      logError(error, 'Set custom Cursor permissions failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Creates handler for DELETE /api/setup/cursor-permissions
 * Deletes project-level permissions (falls back to global)
 */
export function createDeleteProjectPermissionsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = req.query.projectPath as string;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      // Validate path to prevent traversal attacks
      validateProjectPath(projectPath);

      await deleteProjectConfig(projectPath);

      res.json({
        success: true,
        message: 'Project permissions deleted, using global config',
      });
    } catch (error) {
      logError(error, 'Delete Cursor project permissions failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Creates handler for GET /api/setup/cursor-permissions/example
 * Returns an example config file for a profile
 */
export function createGetExampleConfigHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const profileId = (req.query.profileId as CursorPermissionProfile) || 'development';

      const exampleConfig = generateExampleConfig(profileId);

      res.json({
        success: true,
        profileId,
        config: exampleConfig,
      });
    } catch (error) {
      logError(error, 'Get example Cursor config failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
