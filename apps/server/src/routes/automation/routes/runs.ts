/**
 * Route: Automation runs management
 *
 * GET /api/automation/runs - List automation runs
 * GET /api/automation/runs/:runId - Get specific run
 * DELETE /api/automation/runs - Clear all runs (optionally preserving running ones)
 */

import { Router } from 'express';
import { createLogger } from '@automaker/utils';
import type { AutomationRuntimeEngine } from '../../../services/automation-runtime-engine.js';
import { sendRouteError } from '../common.js';

const logger = createLogger('AutomationRuns');

export function createRunsRoute(engine: AutomationRuntimeEngine): Router {
  const router = Router();

  // List runs
  router.get('/runs', (req, res) => {
    try {
      const automationId = req.query.automationId as string | undefined;
      const runs = engine.listRuns(automationId);
      res.json({ success: true, runs });
    } catch (error) {
      logger.error('Failed to list runs:', error);
      sendRouteError(res, error);
    }
  });

  // Get specific run
  router.get('/runs/:runId', (req, res) => {
    try {
      const { runId } = req.params;
      const run = engine.getRun(runId);

      if (!run) {
        res.status(404).json({ success: false, error: 'Run not found' });
        return;
      }

      res.json({ success: true, run });
    } catch (error) {
      logger.error(`Failed to get run ${req.params.runId}:`, error);
      sendRouteError(res, error);
    }
  });

  // Clear all runs (optionally preserve running ones)
  router.delete('/runs', (req, res) => {
    try {
      const preserveRunning = req.query.preserveRunning !== 'false';
      const cleared = engine.clearRuns(preserveRunning);
      logger.info(`Cleared ${cleared} automation runs (preserveRunning: ${preserveRunning})`);
      res.json({ success: true, cleared });
    } catch (error) {
      logger.error('Failed to clear runs:', error);
      sendRouteError(res, error);
    }
  });

  return router;
}
