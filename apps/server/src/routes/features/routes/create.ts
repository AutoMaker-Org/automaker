/**
 * POST /create endpoint - Create a new feature
 */

import type { Request, Response } from 'express';
import { CronExpressionParser } from 'cron-parser';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';
import type { Feature } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('features/create');

export function createCreateHandler(featureLoader: FeatureLoader, events?: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, feature } = req.body as {
        projectPath: string;
        feature: Partial<Feature>;
      };

      if (!projectPath || !feature) {
        res.status(400).json({
          success: false,
          error: 'projectPath and feature are required',
        });
        return;
      }

      // Calculate nextRun and set status to 'scheduled' if schedule is provided and enabled
      if (feature.schedule?.enabled && feature.schedule?.crontab) {
        try {
          const interval = CronExpressionParser.parse(feature.schedule.crontab, {
            currentDate: new Date(),
          });
          const nextRun = interval.next().toDate();
          feature.schedule = {
            ...feature.schedule,
            nextRun: nextRun.toISOString(),
          };
          // Set status to 'scheduled' so the scheduler will pick it up
          feature.status = 'scheduled';
          logger.debug(
            `Calculated nextRun for new feature: ${nextRun.toISOString()}, status set to 'scheduled'`
          );
        } catch (err) {
          logger.warn(
            `Invalid crontab expression in new feature: ${feature.schedule.crontab}`,
            err
          );
        }
      }

      const created = await featureLoader.create(projectPath, feature);

      // Emit feature_created event for hooks
      if (events) {
        events.emit('feature:created', {
          featureId: created.id,
          featureName: created.title || 'Untitled Feature',
          projectPath,
        });
      }

      res.json({ success: true, feature: created });
    } catch (error) {
      logError(error, 'Create feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
