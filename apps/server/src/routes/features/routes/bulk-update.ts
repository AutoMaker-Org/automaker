/**
 * POST /bulk-update endpoint - Update multiple features at once
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { Feature } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

interface BulkUpdateRequest {
  projectPath: string;
  featureIds: string[];
  updates: Partial<Feature>;
}

interface BulkUpdateResult {
  featureId: string;
  success: boolean;
  error?: string;
}

export function createBulkUpdateHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureIds, updates } = req.body as BulkUpdateRequest;

      if (!projectPath || !featureIds || !Array.isArray(featureIds) || featureIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureIds (non-empty array) are required',
        });
        return;
      }

      if (!updates || Object.keys(updates).length === 0) {
        res.status(400).json({
          success: false,
          error: 'updates object with at least one field is required',
        });
        return;
      }

      const results: BulkUpdateResult[] = [];
      const updatedFeatures: Feature[] = [];

      // Process in parallel batches of 20 for efficiency
      const BATCH_SIZE = 20;
      for (let i = 0; i < featureIds.length; i += BATCH_SIZE) {
        const batch = featureIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (featureId) => {
            try {
              const updated = await featureLoader.update(projectPath, featureId, updates);
              return { featureId, success: true as const, feature: updated };
            } catch (error) {
              return {
                featureId,
                success: false as const,
                error: getErrorMessage(error),
              };
            }
          })
        );

        for (const result of batchResults) {
          if (result.success) {
            results.push({ featureId: result.featureId, success: true });
            updatedFeatures.push(result.feature);
          } else {
            results.push({
              featureId: result.featureId,
              success: false,
              error: result.error,
            });
          }
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      res.json({
        success: failureCount === 0,
        updatedCount: successCount,
        failedCount: failureCount,
        results,
        features: updatedFeatures,
      });
    } catch (error) {
      logError(error, 'Bulk update features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
