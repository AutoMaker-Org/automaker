/**
 * POST /list endpoint - List all features for a project
 *
 * Also performs orphan detection when a project is loaded to identify
 * features whose branches no longer exist. This runs on every project load/switch.
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { AutoModeServiceCompat } from '../../../services/auto-mode/index.js';
import { getErrorMessage, logError } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('FeaturesListRoute');

export function createListHandler(
  featureLoader: FeatureLoader,
  autoModeService?: AutoModeServiceCompat
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const features = await featureLoader.getAll(projectPath);

      // Run orphan detection in background when project is loaded
      // This detects features whose branches no longer exist (e.g., after merge/delete)
      // We don't await this to keep the list response fast
      // Note: detectOrphanedFeatures handles errors internally and always resolves
      if (autoModeService) {
        autoModeService
          .detectOrphanedFeatures(projectPath)
          .then((orphanedFeatures) => {
            if (orphanedFeatures.length > 0) {
              logger.info(
                `[ProjectLoad] Detected ${orphanedFeatures.length} orphaned feature(s) in ${projectPath}`
              );
              for (const { feature, missingBranch } of orphanedFeatures) {
                logger.info(
                  `[ProjectLoad] Orphaned: ${feature.title || feature.id} - branch "${missingBranch}" no longer exists`
                );
              }
            }
          })
          .catch((error) => {
            logger.warn(`[ProjectLoad] Orphan detection failed for ${projectPath}:`, error);
          });
      }

      res.json({ success: true, features });
    } catch (error) {
      logError(error, 'List features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
