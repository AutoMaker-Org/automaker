/**
 * POST /migrate endpoint - Migrate legacy .automaker data to external storage
 *
 * This endpoint checks if there's legacy .automaker data in the project directory
 * and migrates it to the external ~/.automaker/projects/{project-id}/ location.
 */

import type { Request, Response } from "express";
import { getErrorMessage, logError } from "../common.js";
import {
  hasLegacyAutomakerDir,
  migrateLegacyData,
  getAutomakerDir,
  getLegacyAutomakerDir,
} from "../../../lib/automaker-paths.js";

export function createMigrateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: "projectPath is required",
        });
        return;
      }

      // Check if migration is needed
      const hasLegacy = await hasLegacyAutomakerDir(projectPath);

      if (!hasLegacy) {
        const automakerDir = await getAutomakerDir(projectPath);
        res.json({
          success: true,
          migrated: false,
          message: "No legacy .automaker directory found - nothing to migrate",
          externalPath: automakerDir,
        });
        return;
      }

      // Perform migration
      console.log(`[migrate] Starting migration for project: ${projectPath}`);
      const legacyPath = await getLegacyAutomakerDir(projectPath);
      const externalPath = await getAutomakerDir(projectPath);

      await migrateLegacyData(projectPath);

      res.json({
        success: true,
        migrated: true,
        message: "Successfully migrated .automaker data to external storage",
        legacyPath,
        externalPath,
      });
    } catch (error) {
      logError(error, "Migration failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
