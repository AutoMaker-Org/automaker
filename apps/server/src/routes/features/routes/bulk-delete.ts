/**
 * POST /bulk-delete endpoint - Delete multiple features at once
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';

interface BulkDeleteRequest {
  projectPath: string;
  featureIds: string[];
}

interface BulkDeleteResult {
  featureId: string;
  success: boolean;
  error?: string;
}

export function createBulkDeleteHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureIds } = req.body as BulkDeleteRequest;

      if (!projectPath || !featureIds || !Array.isArray(featureIds) || featureIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureIds (non-empty array) are required',
        });
        return;
      }

      // Process in parallel batches of 20 for efficiency
      const BATCH_SIZE = 20;
      const results: BulkDeleteResult[] = [];

      for (let i = 0; i < featureIds.length; i += BATCH_SIZE) {
        const batch = featureIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (featureId) => {
            const success = await featureLoader.delete(projectPath, featureId);
            if (success) {
              return { featureId, success: true };
            }
            return {
              featureId,
              success: false,
              error: 'Deletion failed. Check server logs for details.',
            };
          })
        );
        results.push(...batchResults);
      }

      const successCount = results.reduce((count, r) => count + (r.success ? 1 : 0), 0);
      const failureCount = results.length - successCount;

      res.json({
        success: failureCount === 0,
        deletedCount: successCount,
        failedCount: failureCount,
        results,
      });
    } catch (error) {
      logError(error, 'Bulk delete features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
