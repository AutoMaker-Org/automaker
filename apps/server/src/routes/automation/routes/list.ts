/**
 * Route: List automations
 *
 * GET /api/automation/list
 * Returns all automations for a scope (global or project)
 */

import { Router } from 'express';
import type { AutomationDefinitionStore } from '../../../services/automation-runtime-engine.js';
import { getProjectPath, getScope, sendRouteError } from '../common.js';

export function createListRoute(store: AutomationDefinitionStore): Router {
  const router = Router();

  router.get('/list', async (req, res) => {
    try {
      const scope = getScope(req);
      const projectPath = getProjectPath(req);

      let automations;

      if (scope === 'global') {
        automations = await store.listAutomations({ scope: 'global' });
      } else if (scope === 'project' && projectPath) {
        automations = await store.listAutomations({ scope: 'project', projectPath });
      } else if (projectPath) {
        // If only projectPath provided, get project automations first, then global
        const projectAutomations = await store.listAutomations({
          scope: 'project',
          projectPath,
        });
        const globalAutomations = await store.listAutomations({ scope: 'global' });
        automations = [...projectAutomations, ...globalAutomations];
      } else {
        // Default to global automations
        automations = await store.listAutomations({ scope: 'global' });
      }

      res.json({ success: true, automations });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  return router;
}
