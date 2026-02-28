/**
 * POST /orphaned endpoint - Detect orphaned features (features with missing branches)
 * POST /orphaned/resolve endpoint - Resolve an orphaned feature (delete, create-worktree, or move-to-branch)
 * POST /orphaned/bulk-resolve endpoint - Resolve multiple orphaned features at once
 */

import crypto from 'crypto';
import path from 'path';
import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { AutoModeServiceCompat } from '../../../services/auto-mode/index.js';
import { getErrorMessage, logError } from '../common.js';
import { execGitCommand } from '../../../lib/git.js';
import { deleteWorktreeMetadata } from '../../../lib/worktree-metadata.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('OrphanedFeatures');

type ResolveAction = 'delete' | 'create-worktree' | 'move-to-branch';
const VALID_ACTIONS: ResolveAction[] = ['delete', 'create-worktree', 'move-to-branch'];

export function createOrphanedListHandler(
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

      if (!autoModeService) {
        res.status(500).json({ success: false, error: 'Auto-mode service not available' });
        return;
      }

      const orphanedFeatures = await autoModeService.detectOrphanedFeatures(projectPath);

      res.json({ success: true, orphanedFeatures });
    } catch (error) {
      logError(error, 'Detect orphaned features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createOrphanedResolveHandler(
  featureLoader: FeatureLoader,
  _autoModeService?: AutoModeServiceCompat
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, action, targetBranch } = req.body as {
        projectPath: string;
        featureId: string;
        action: ResolveAction;
        targetBranch?: string | null;
      };

      if (!projectPath || !featureId || !action) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and action are required',
        });
        return;
      }

      if (!VALID_ACTIONS.includes(action)) {
        res.status(400).json({
          success: false,
          error: `action must be one of: ${VALID_ACTIONS.join(', ')}`,
        });
        return;
      }

      const result = await resolveOrphanedFeature(
        featureLoader,
        projectPath,
        featureId,
        action,
        targetBranch
      );

      if (!result.success) {
        res.status(result.error === 'Feature not found' ? 404 : 500).json(result);
        return;
      }

      res.json(result);
    } catch (error) {
      logError(error, 'Resolve orphaned feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

interface BulkResolveResult {
  featureId: string;
  success: boolean;
  action?: string;
  error?: string;
}

async function resolveOrphanedFeature(
  featureLoader: FeatureLoader,
  projectPath: string,
  featureId: string,
  action: ResolveAction,
  targetBranch?: string | null
): Promise<BulkResolveResult> {
  try {
    const feature = await featureLoader.get(projectPath, featureId);
    if (!feature) {
      return { featureId, success: false, error: 'Feature not found' };
    }

    const missingBranch = feature.branchName;

    switch (action) {
      case 'delete': {
        if (missingBranch) {
          try {
            await deleteWorktreeMetadata(projectPath, missingBranch);
          } catch {
            // Non-fatal
          }
        }
        const success = await featureLoader.delete(projectPath, featureId);
        if (!success) {
          return { featureId, success: false, error: 'Deletion failed' };
        }
        logger.info(`Deleted orphaned feature ${featureId} (branch: ${missingBranch})`);
        return { featureId, success: true, action: 'deleted' };
      }

      case 'create-worktree': {
        if (!missingBranch) {
          return { featureId, success: false, error: 'Feature has no branch name to recreate' };
        }

        const sanitizedName = missingBranch.replace(/[^a-zA-Z0-9_-]/g, '-');
        const hash = crypto.createHash('sha1').update(missingBranch).digest('hex').slice(0, 8);
        const worktreesDir = path.join(projectPath, '.worktrees');
        const worktreePath = path.join(worktreesDir, `${sanitizedName}-${hash}`);

        try {
          await execGitCommand(['worktree', 'add', '-b', missingBranch, worktreePath], projectPath);
        } catch (error) {
          const msg = getErrorMessage(error);
          if (msg.includes('already exists')) {
            try {
              await execGitCommand(['worktree', 'add', worktreePath, missingBranch], projectPath);
            } catch (innerError) {
              return {
                featureId,
                success: false,
                error: `Failed to create worktree: ${getErrorMessage(innerError)}`,
              };
            }
          } else {
            return { featureId, success: false, error: `Failed to create worktree: ${msg}` };
          }
        }

        logger.info(
          `Created worktree for orphaned feature ${featureId} at ${worktreePath} (branch: ${missingBranch})`
        );
        return { featureId, success: true, action: 'worktree-created' };
      }

      case 'move-to-branch': {
        // Move the feature to a different branch (or clear branch to use main worktree)
        const newBranch = targetBranch || null;

        // Validate that the target branch exists if one is specified
        if (newBranch) {
          try {
            await execGitCommand(['rev-parse', '--verify', newBranch], projectPath);
          } catch {
            return {
              featureId,
              success: false,
              error: `Target branch "${newBranch}" does not exist`,
            };
          }
        }

        await featureLoader.update(projectPath, featureId, {
          branchName: newBranch,
          status: 'pending',
        });

        // Clean up old worktree metadata
        if (missingBranch) {
          try {
            await deleteWorktreeMetadata(projectPath, missingBranch);
          } catch {
            // Non-fatal
          }
        }

        const destination = newBranch ?? 'main worktree';
        logger.info(
          `Moved orphaned feature ${featureId} to ${destination} (was: ${missingBranch})`
        );
        return { featureId, success: true, action: 'moved' };
      }
    }
  } catch (error) {
    return { featureId, success: false, error: getErrorMessage(error) };
  }
}

export function createOrphanedBulkResolveHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureIds, action, targetBranch } = req.body as {
        projectPath: string;
        featureIds: string[];
        action: ResolveAction;
        targetBranch?: string | null;
      };

      if (
        !projectPath ||
        !featureIds ||
        !Array.isArray(featureIds) ||
        featureIds.length === 0 ||
        !action
      ) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureIds (non-empty array), and action are required',
        });
        return;
      }

      if (!VALID_ACTIONS.includes(action)) {
        res.status(400).json({
          success: false,
          error: `action must be one of: ${VALID_ACTIONS.join(', ')}`,
        });
        return;
      }

      // Process sequentially for worktree creation (git operations shouldn't race),
      // in parallel for delete/move-to-branch
      const results: BulkResolveResult[] = [];

      if (action === 'create-worktree') {
        for (const featureId of featureIds) {
          const result = await resolveOrphanedFeature(
            featureLoader,
            projectPath,
            featureId,
            action,
            targetBranch
          );
          results.push(result);
        }
      } else {
        const batchResults = await Promise.all(
          featureIds.map((featureId) =>
            resolveOrphanedFeature(featureLoader, projectPath, featureId, action, targetBranch)
          )
        );
        results.push(...batchResults);
      }

      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.length - successCount;

      res.json({
        success: failedCount === 0,
        resolvedCount: successCount,
        failedCount,
        results,
      });
    } catch (error) {
      logError(error, 'Bulk resolve orphaned features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
