/**
 * Claude Settings Routes
 *
 * API endpoints for managing Claude Code settings and configuration.
 *
 * Routes:
 * - GET    /claude-settings          - Get Claude Code settings
 * - PUT    /claude-settings          - Update Claude Code settings
 * - POST   /claude-settings/permission - Add MCP tool permission
 * - DELETE /claude-settings/permission/:tool - Remove MCP tool permission
 * - GET    /claude-settings/env      - Get orchestrator env vars
 * - PUT    /claude-settings/env/:key - Update env var
 * - GET    /claude-settings/summary  - Get settings summary
 */

import { Router, type Request, type Response } from 'express';
import { getClaudeSettingsService } from '../../services/claude-settings-service.js';

/**
 * Create Claude settings routes
 */
export function createClaudeSettingsRoutes(projectRoot: string): Router {
  const router = Router();
  const settingsService = getClaudeSettingsService(projectRoot);

  /**
   * GET /claude-settings
   * Get Claude Code settings
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const settings = settingsService.readSettings();
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * PUT /claude-settings
   * Update Claude Code settings (partial merge)
   */
  router.put('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const updated = settingsService.updateSettings(req.body);
      res.json({
        success: true,
        settings: updated,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /claude-settings/permission
   * Add MCP tool permission
   */
  router.post('/permission', async (req: Request, res: Response): Promise<void> => {
    try {
      const { toolName } = req.body;

      if (!toolName) {
        res.status(400).json({
          success: false,
          error: 'toolName is required',
        });
        return;
      }

      const settings = settingsService.addMCPPermission(toolName);
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * DELETE /claude-settings/permission/:tool
   * Remove MCP tool permission
   */
  router.delete('/permission/:tool', async (req: Request, res: Response): Promise<void> => {
    try {
      const { tool } = req.params;
      const settings = settingsService.removeMCPPermission(tool);
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /claude-settings/plugin/:pluginId/enable
   * Enable a plugin
   */
  router.post('/plugin/:pluginId/enable', async (req: Request, res: Response): Promise<void> => {
    try {
      const { pluginId } = req.params;
      const settings = settingsService.enablePlugin(pluginId);
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /claude-settings/plugin/:pluginId/disable
   * Disable a plugin
   */
  router.post('/plugin/:pluginId/disable', async (req: Request, res: Response): Promise<void> => {
    try {
      const { pluginId } = req.params;
      const settings = settingsService.disablePlugin(pluginId);
      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /claude-settings/env
   * Get orchestrator environment variables
   */
  router.get('/env', async (req: Request, res: Response): Promise<void> => {
    try {
      const envVars = settingsService.readEnvVars();
      res.json({
        success: true,
        envVars,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * PUT /claude-settings/env/:key
   * Update environment variable
   */
  router.put('/env/:key', async (req: Request, res: Response): Promise<void> => {
    try {
      const { key } = req.params;
      const { value } = req.body;

      if (value === undefined) {
        res.status(400).json({
          success: false,
          error: 'value is required',
        });
        return;
      }

      settingsService.updateEnvVar(key, value);
      res.json({
        success: true,
        message: `Environment variable ${key} updated. Restart server for changes to take effect.`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /claude-settings/summary
   * Get settings summary
   */
  router.get('/summary', async (req: Request, res: Response): Promise<void> => {
    try {
      const summary = settingsService.getSettingsSummary();
      res.json({
        success: true,
        summary,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  return router;
}

export default createClaudeSettingsRoutes;
