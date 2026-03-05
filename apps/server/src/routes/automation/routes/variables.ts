/**
 * Automation Variable Routes - API endpoints for variable management
 *
 * Routes:
 * - GET  /api/automation/variables - List available variables (all scopes)
 * - GET  /api/automation/variables/project - Get project variables
 * - POST /api/automation/variables/project - Set project variable
 * - DELETE /api/automation/variables/project/:name - Delete project variable
 */

import { Router, type Request, type Response } from 'express';
import type { WorkflowVariableDefinition } from '@automaker/types';
import type { AutomationVariableService } from '../../../services/automation-variable-service.js';
import { getProjectPath, sendRouteError } from '../common.js';

/**
 * Parse a JSON string query parameter.
 * Returns `{ value }` on success or `{ error }` on parse failure.
 * Returns `{}` when the parameter is absent.
 */
function parseJsonQueryParam(raw: unknown): { value?: unknown; error?: string } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'string') return {};
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { error: 'invalid JSON' };
  }
}

export function createVariablesRoute(variableService: AutomationVariableService): Router {
  const router = Router();

  /**
   * GET /api/automation/variables
   * List all available variables for the variable browser
   *
   * Query params:
   * - includeSystem: 'true' (default) | 'false'
   * - includeProject: 'true' (default) | 'false'
   * - workflowVariables: JSON string of WorkflowVariableDefinition[]
   * - stepOutputs: JSON string of { stepId: string, stepName?: string }[]
   */
  router.get('/variables', async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = getProjectPath(req);

      const includeSystem = req.query.includeSystem !== 'false';
      const includeProject = req.query.includeProject !== 'false';

      const workflowVariablesResult = parseJsonQueryParam(req.query.workflowVariables);
      if (workflowVariablesResult.error) {
        res.status(400).json({ success: false, error: 'Invalid workflowVariables JSON' });
        return;
      }

      const stepOutputsResult = parseJsonQueryParam(req.query.stepOutputs);
      if (stepOutputsResult.error) {
        res.status(400).json({ success: false, error: 'Invalid stepOutputs JSON' });
        return;
      }

      const result = await variableService.listAvailableVariables({
        includeSystem,
        includeProject,
        projectPath,
        workflowVariables: workflowVariablesResult.value as
          | WorkflowVariableDefinition[]
          | undefined,
        stepOutputs: stepOutputsResult.value as
          | Array<{ stepId: string; stepName?: string }>
          | undefined,
      });

      res.json({ success: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  /**
   * GET /api/automation/variables/project
   * Get all project variables
   */
  router.get('/variables/project', async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = getProjectPath(req);
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const variables = await variableService.loadProjectVariables(projectPath);
      res.json({ success: true, variables });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  /**
   * GET /api/automation/variables/system
   * Get all system variables (with current values)
   */
  router.get('/variables/system', async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = getProjectPath(req);
      const variables = await variableService.getSystemVariables(projectPath);
      const descriptors = variableService.getSystemVariableDescriptors();

      res.json({ success: true, variables, descriptors });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  /**
   * POST /api/automation/variables/project
   * Set a project variable
   *
   * Body: { name: string, value: any, description?: string }
   */
  router.post('/variables/project', async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = getProjectPath(req);
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const { name, value, description } = req.body;

      if (!name || typeof name !== 'string') {
        res
          .status(400)
          .json({ success: false, error: 'Variable name is required and must be a string' });
        return;
      }

      if (value === undefined) {
        res.status(400).json({ success: false, error: 'Variable value is required' });
        return;
      }

      // Validate that value is JSON-compatible
      try {
        JSON.stringify(value);
      } catch {
        res.status(400).json({ success: false, error: 'Variable value must be JSON-serializable' });
        return;
      }

      const variable = await variableService.setProjectVariable(projectPath, {
        name,
        value,
        description,
      });

      res.json({ success: true, variable });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  /**
   * DELETE /api/automation/variables/project/:name
   * Delete a project variable
   */
  router.delete('/variables/project/:name', async (req: Request, res: Response): Promise<void> => {
    try {
      const projectPath = getProjectPath(req);
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const { name } = req.params;

      if (!name) {
        res.status(400).json({ success: false, error: 'Variable name is required' });
        return;
      }

      const deleted = await variableService.deleteProjectVariable(projectPath, name);

      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: 'Variable not found' });
      }
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  return router;
}
