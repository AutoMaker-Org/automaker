/**
 * POST /update endpoint - Update a feature
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { Feature } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createUpdateHandler(featureLoader: FeatureLoader) {
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

      const updated = await featureLoader.update(
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription
      );
      res.json({ success: true, feature: updated });
    } catch (error) {
      logError(error, 'Update feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
