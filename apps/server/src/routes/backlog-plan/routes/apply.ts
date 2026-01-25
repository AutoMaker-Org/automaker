/**
 * POST /apply endpoint - Apply a backlog plan
 */

import type { Request, Response } from 'express';
import type { BacklogPlanResult, BacklogChange, Feature } from '@automaker/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { clearBacklogPlan, getErrorMessage, logError, logger } from '../common.js';

const featureLoader = new FeatureLoader();

export function createApplyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        plan,
        branchName: rawBranchName,
      } = req.body as {
        projectPath: string;
        plan: BacklogPlanResult;
        branchName?: string;
      };

      // Validate branchName: must be undefined or a non-empty trimmed string
      const branchName =
        typeof rawBranchName === 'string' && rawBranchName.trim().length > 0
          ? rawBranchName.trim()
          : undefined;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      if (!plan || !plan.changes) {
        res.status(400).json({ success: false, error: 'plan with changes required' });
        return;
      }

      const appliedChanges: string[] = [];

      // Load current features for dependency validation
      const allFeatures = await featureLoader.getAll(projectPath);
      const featureMap = new Map(allFeatures.map((f) => [f.id, f]));

      // Process changes in order: deletes first, then adds, then updates
      // This ensures we can remove dependencies before they cause issues

      // 1. First pass: Handle deletes
      const deletions = plan.changes.filter((c) => c.type === 'delete');
      for (const change of deletions) {
        if (!change.featureId) continue;

        try {
          // Before deleting, update any features that depend on this one
          for (const feature of allFeatures) {
            if (feature.dependencies?.includes(change.featureId)) {
              const newDeps = feature.dependencies.filter((d) => d !== change.featureId);
              await featureLoader.update(projectPath, feature.id, { dependencies: newDeps });
              logger.info(
                `[BacklogPlan] Removed dependency ${change.featureId} from ${feature.id}`
              );
            }
          }

          // Now delete the feature
          const deleted = await featureLoader.delete(projectPath, change.featureId);
          if (deleted) {
            appliedChanges.push(`deleted:${change.featureId}`);
            featureMap.delete(change.featureId);
            logger.info(`[BacklogPlan] Deleted feature ${change.featureId}`);
          }
        } catch (error) {
          logger.error(
            `[BacklogPlan] Failed to delete ${change.featureId}:`,
            getErrorMessage(error)
          );
        }
      }

      // 2. Second pass: Handle adds
      const additions = plan.changes.filter((c) => c.type === 'add');
      for (const change of additions) {
        if (!change.feature) continue;

        try {
          // Create the new feature - use the AI-generated ID if provided
          const newFeature = await featureLoader.create(projectPath, {
            id: change.feature.id, // Use descriptive ID from AI if provided
            title: change.feature.title,
            description: change.feature.description || '',
            category: change.feature.category || 'Uncategorized',
            dependencies: change.feature.dependencies,
            priority: change.feature.priority,
            status: 'backlog',
            branchName,
          });

          appliedChanges.push(`added:${newFeature.id}`);
          featureMap.set(newFeature.id, newFeature);
          logger.info(`[BacklogPlan] Created feature ${newFeature.id}: ${newFeature.title}`);
        } catch (error) {
          logger.error(`[BacklogPlan] Failed to add feature:`, getErrorMessage(error));
        }
      }

      // 3. Third pass: Handle updates
      const updates = plan.changes.filter((c) => c.type === 'update');
      for (const change of updates) {
        if (!change.featureId || !change.feature) continue;

        try {
          const updated = await featureLoader.update(projectPath, change.featureId, change.feature);
          appliedChanges.push(`updated:${change.featureId}`);
          featureMap.set(change.featureId, updated);
          logger.info(`[BacklogPlan] Updated feature ${change.featureId}`);
        } catch (error) {
          logger.error(
            `[BacklogPlan] Failed to update ${change.featureId}:`,
            getErrorMessage(error)
          );
        }
      }

      // 4. Apply dependency updates from the plan
      if (plan.dependencyUpdates) {
        for (const depUpdate of plan.dependencyUpdates) {
          try {
            const feature = featureMap.get(depUpdate.featureId);
            if (feature) {
              const currentDeps = feature.dependencies || [];
              const newDeps = currentDeps
                .filter((d) => !depUpdate.removedDependencies.includes(d))
                .concat(depUpdate.addedDependencies.filter((d) => !currentDeps.includes(d)));

              await featureLoader.update(projectPath, depUpdate.featureId, {
                dependencies: newDeps,
              });
              logger.info(`[BacklogPlan] Updated dependencies for ${depUpdate.featureId}`);
            }
          } catch (error) {
            logger.error(
              `[BacklogPlan] Failed to update dependencies for ${depUpdate.featureId}:`,
              getErrorMessage(error)
            );
          }
        }
      }

      // Clear the plan before responding
      try {
        await clearBacklogPlan(projectPath);
      } catch (error) {
        logger.warn(
          `[BacklogPlan] Failed to clear backlog plan after apply:`,
          getErrorMessage(error)
        );
        // Don't throw - operation succeeded, just cleanup failed
      }

      res.json({
        success: true,
        appliedChanges,
      });
    } catch (error) {
      logError(error, 'Apply backlog plan failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
