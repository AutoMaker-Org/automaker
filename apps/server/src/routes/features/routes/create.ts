/**
 * POST /create endpoint - Create a new feature
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';
import type { Feature } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

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
