/**
 * Route: Trigger automation manually
 *
 * POST /api/automation/:automationId/trigger
 * Manually triggers an automation to run immediately
 *
 * Request body:
 * - variables: Optional record of variable values to pass to the automation
 * - triggerMetadata: Optional metadata about the trigger (merged with defaults)
 */

import { Router } from 'express';
import type { AutomationSchedulerService } from '../../../services/automation-scheduler-service.js';
import { getProjectPath, getScope, sendRouteError } from '../common.js';
import type { AutomationVariableValue } from '@automaker/types';

export function createTriggerRoute(scheduler: AutomationSchedulerService): Router {
  const router = Router();

  router.post('/:automationId/trigger', async (req, res): Promise<void> => {
    try {
      const { automationId } = req.params;
      const scope = getScope(req);
      const projectPath = getProjectPath(req);

      // Validate automationId is present and non-empty
      if (!automationId?.trim()) {
        res.status(400).json({ success: false, error: 'automationId is required' });
        return;
      }

      // Safely extract variables with type checking
      const variables: Record<string, AutomationVariableValue> | undefined =
        req.body?.variables &&
        typeof req.body.variables === 'object' &&
        !Array.isArray(req.body.variables)
          ? req.body.variables
          : undefined;

      // Safely extract triggerMetadata with type checking
      const triggerMetadata: Record<string, unknown> | undefined =
        req.body?.triggerMetadata &&
        typeof req.body.triggerMetadata === 'object' &&
        !Array.isArray(req.body.triggerMetadata)
          ? req.body.triggerMetadata
          : undefined;

      const result = await scheduler.triggerAutomation(automationId, {
        scope,
        projectPath,
        variables,
        triggerMetadata: {
          ...triggerMetadata,
          triggeredBy: 'manual',
          triggeredAt: new Date().toISOString(),
        },
      });

      if (result.success) {
        res.json({ success: true, runId: result.scheduledRunId });
      } else {
        // Use 404 when the automation was not found, 400 for other client errors
        const status = result.errorCode === 'NOT_FOUND' ? 404 : 400;
        res.status(status).json({ success: false, error: result.error });
      }
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  return router;
}
