/**
 * Reconcile Feature States Handler
 *
 * On-demand endpoint to reconcile all feature states for a project.
 * Resets features stuck in transient states (in_progress, interrupted, pipeline_*)
 * back to resting states (ready/backlog) and emits events to update the UI.
 *
 * This is useful when:
 * - The UI reconnects after a server restart
 * - A client detects stale feature states
 * - An admin wants to force-reset stuck features
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { AutoModeServiceCompat } from '../../../services/auto-mode/index.js';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('ReconcileFeatures');

export function createReconcileHandler(autoModeService: AutoModeServiceCompat) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      logger.info(`Reconciling feature states for ${projectPath}`);

      const reconciledCount = await autoModeService.reconcileFeatureStates(projectPath);

      res.json({
        success: true,
        reconciledCount,
        message:
          reconciledCount > 0
            ? `Reconciled ${reconciledCount} feature(s)`
            : 'No features needed reconciliation',
      });
    } catch (error) {
      logError(error, 'Reconcile feature states failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
