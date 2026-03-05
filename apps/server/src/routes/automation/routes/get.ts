/**
 * Route: Get automation by ID
 *
 * GET /api/automation/:automationId
 * Returns a single automation definition
 */

import { Router } from 'express';
import type { AutomationDefinitionStore } from '../../../services/automation-runtime-engine.js';
import { getProjectPath, getScope, sendRouteError } from '../common.js';

export function createGetRoute(store: AutomationDefinitionStore): Router {
  const router = Router();

  router.get('/:automationId', async (req, res) => {
    try {
      const { automationId } = req.params;
      const scope = getScope(req);
      const projectPath = getProjectPath(req);

      if (!automationId) {
        res.status(400).json({ success: false, error: 'automationId is required' });
        return;
      }

      const automation = await store.loadAutomationById(automationId, {
        scope,
        projectPath,
      });

      if (!automation) {
        res.status(404).json({ success: false, error: 'Automation not found' });
        return;
      }

      res.json({ success: true, automation });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  return router;
}
