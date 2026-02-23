/**
 * POST /update endpoint - Update a feature
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { Feature, FeatureStatus } from '@automaker/types';
import type { EventEmitter } from '../../../lib/events.js';
import { getErrorMessage, logError } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('features/update');

// Statuses that should trigger syncing to app_spec.txt
const SYNC_TRIGGER_STATUSES: FeatureStatus[] = ['verified', 'completed'];

export function createUpdateHandler(featureLoader: FeatureLoader, events?: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription,
      } = req.body as {
        projectPath: string;
        featureId: string;
        updates: Partial<Feature>;
        descriptionHistorySource?: 'enhance' | 'edit';
        enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer';
        preEnhancementDescription?: string;
      };

      if (!projectPath || !featureId || !updates) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and updates are required',
        });
        return;
      }

      // Get the current feature to detect status changes
      const currentFeature = await featureLoader.get(projectPath, featureId);
      const previousStatus = currentFeature?.status as FeatureStatus | undefined;
      const newStatus = updates.status as FeatureStatus | undefined;

      const updated = await featureLoader.update(
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription
      );

      // Emit completion event and sync to app_spec.txt when status transitions to verified/completed
      if (newStatus && SYNC_TRIGGER_STATUSES.includes(newStatus) && previousStatus !== newStatus) {
        events?.emit('feature:completed', {
          featureId,
          featureName: updated.title,
          projectPath,
          passes: true,
          message:
            newStatus === 'verified' ? 'Feature verified manually' : 'Feature completed manually',
          executionMode: 'manual',
        });

        try {
          const synced = await featureLoader.syncFeatureToAppSpec(projectPath, updated);
          if (synced) {
            logger.info(
              `Synced feature "${updated.title || updated.id}" to app_spec.txt on status change to ${newStatus}`
            );
          }
        } catch (syncError) {
          // Log the sync error but don't fail the update operation
          logger.error(`Failed to sync feature to app_spec.txt:`, syncError);
        }
      }

      res.json({ success: true, feature: updated });
    } catch (error) {
      logError(error, 'Update feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
