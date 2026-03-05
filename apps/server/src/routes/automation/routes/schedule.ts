/**
 * Route: Scheduled runs management
 *
 * GET /api/automation/scheduled - List scheduled runs
 * GET /api/automation/scheduled/upcoming - Get upcoming scheduled runs (status=scheduled, sorted by scheduledFor)
 * GET /api/automation/scheduled/:scheduledRunId - Get specific scheduled run
 * DELETE /api/automation/scheduled/:scheduledRunId - Cancel a scheduled run
 */

import { Router, type Request, type Response } from 'express';
import type { AutomationSchedulerService } from '../../../services/automation-scheduler-service.js';
import { sendRouteError } from '../common.js';

/** Maximum length for automationId filter */
const MAX_AUTOMATION_ID_LENGTH = 128;

/**
 * Extract and validate the optional `automationId` query filter.
 * Returns the filter value on success, `null` when absent, or sends a 400 and returns `undefined` on error.
 */
function getAutomationIdFilter(req: Request, res: Response): string | null | undefined {
  const raw = req.query.automationId;
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || raw.length > MAX_AUTOMATION_ID_LENGTH) {
    res.status(400).json({ success: false, error: 'Invalid automationId filter' });
    return undefined;
  }
  return raw;
}

export function createScheduleRoute(scheduler: AutomationSchedulerService): Router {
  const router = Router();

  // Get upcoming scheduled runs (status=scheduled, sorted by scheduledFor ascending)
  // NOTE: Must be registered before /:scheduledRunId to prevent 'upcoming' being treated as an ID
  router.get('/scheduled/upcoming', (req, res) => {
    try {
      const automationId = getAutomationIdFilter(req, res);
      if (automationId === undefined) return; // validation failed, response already sent

      const allRuns = scheduler.getScheduledRuns(automationId ?? undefined);
      const upcomingRuns = allRuns
        .filter((run) => run.status === 'scheduled')
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

      res.json({ success: true, scheduledRuns: upcomingRuns });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  // List scheduled runs
  router.get('/scheduled', (req, res) => {
    try {
      const automationId = getAutomationIdFilter(req, res);
      if (automationId === undefined) return; // validation failed, response already sent

      const runs = scheduler.getScheduledRuns(automationId ?? undefined);
      res.json({ success: true, scheduledRuns: runs });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  // Get specific scheduled run
  router.get('/scheduled/:scheduledRunId', (req, res) => {
    try {
      const { scheduledRunId } = req.params;

      if (!scheduledRunId || typeof scheduledRunId !== 'string') {
        res.status(400).json({ success: false, error: 'scheduledRunId is required' });
        return;
      }

      const run = scheduler.getScheduledRun(scheduledRunId);

      if (!run) {
        res.status(404).json({ success: false, error: 'Scheduled run not found' });
        return;
      }

      res.json({ success: true, scheduledRun: run });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  // Cancel a scheduled run
  router.delete('/scheduled/:scheduledRunId', async (req, res) => {
    try {
      const { scheduledRunId } = req.params;

      if (!scheduledRunId || typeof scheduledRunId !== 'string') {
        res.status(400).json({ success: false, error: 'scheduledRunId is required' });
        return;
      }

      const result = await scheduler.cancelScheduledRun(scheduledRunId);

      if (result.success) {
        res.json({ success: true, message: 'Scheduled run cancelled' });
      } else {
        const status = result.errorCode === 'NOT_FOUND' ? 404 : 400;
        res.status(status).json({ success: false, error: result.error });
      }
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  return router;
}
