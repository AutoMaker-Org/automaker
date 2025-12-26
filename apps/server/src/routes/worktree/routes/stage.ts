/**
 * POST /stage endpoint - Stage worktree changes to base branch (no commit)
 *
 * This endpoint stages changes from a feature branch to the main branch without committing,
 * allowing the user to review changes before committing manually.
 *
 * Flow:
 * 1. Save current branch state
 * 2. Fetch latest from remote
 * 3. Attempt git merge --no-commit
 * 4. Detect and resolve conflicts (auto + AI)
 * 5. Generate suggested commit message
 * 6. Return staged status with diff summary
 *
 * Note: Git repository validation is handled by requireValidProject middleware
 */

import type { Request, Response } from 'express';
import path from 'path';
import { execAsync, execEnv, getErrorMessage, logError, isValidBranchName } from '../common.js';
import {
  ConflictResolutionService,
  type ConflictInfo,
} from '../../../services/conflict-resolution-service.js';
import { FeatureLoader } from '../../../services/feature-loader.js';

const conflictResolver = new ConflictResolutionService();
const featureLoader = new FeatureLoader();

interface StageRequest {
  projectPath: string;
  featureId: string;
  targetBranch?: string; // defaults to 'main'
}

interface StageResponse {
  success: boolean;
  staged?: boolean;
  conflicts?: ConflictInfo[];
  allConflictsResolved?: boolean;
  suggestedMessage?: string;
  diffSummary?: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  error?: string;
}

export function createStageHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    let originalBranch: string | null = null;
    let mergeStarted = false;

    try {
      const { projectPath, featureId, targetBranch = 'main' } = req.body as StageRequest;

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        } as StageResponse);
        return;
      }

      // Construct branch name from featureId
      const branchName = `feature/${featureId}`;

      // Validate branch names
      if (!isValidBranchName(branchName) || !isValidBranchName(targetBranch)) {
        res.status(400).json({
          success: false,
          error: 'Invalid branch name',
        } as StageResponse);
        return;
      }

      console.log(`[Stage] Staging ${branchName} to ${targetBranch} in ${projectPath}`);

      // Load feature for commit message generation
      const features = await featureLoader.getAll(projectPath);
      const feature = features.find((f: { id: string }) => f.id === featureId);
      const featureDescription = feature?.description || feature?.title || `Feature ${featureId}`;

      // Step 1: Get current branch
      const { stdout: currentBranchRaw } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
        env: execEnv,
      });
      originalBranch = currentBranchRaw.trim();
      console.log(`[Stage] Current branch: ${originalBranch}`);

      // Step 2: Ensure we're on the target branch
      if (originalBranch !== targetBranch) {
        // Check for uncommitted changes
        try {
          const { stdout: statusOutput } = await execAsync('git status --porcelain', {
            cwd: projectPath,
            env: execEnv,
          });
          if (statusOutput.trim()) {
            res.status(400).json({
              success: false,
              error: `Cannot switch branches: uncommitted changes in ${originalBranch}. Please commit or stash them first.`,
            } as StageResponse);
            return;
          }
        } catch (error) {
          // Continue if status check fails
          console.warn('[Stage] Could not check git status:', getErrorMessage(error));
        }

        // Checkout target branch
        try {
          await execAsync(`git checkout ${targetBranch}`, {
            cwd: projectPath,
            env: execEnv,
          });
          console.log(`[Stage] Checked out ${targetBranch}`);
        } catch (error) {
          res.status(400).json({
            success: false,
            error: `Failed to checkout ${targetBranch}: ${getErrorMessage(error)}`,
          } as StageResponse);
          return;
        }
      }

      // Step 3: Fetch latest from remote (non-blocking, continue even if fails)
      try {
        await execAsync('git fetch origin', {
          cwd: projectPath,
          env: execEnv,
          timeout: 30000, // 30 second timeout
        });
        console.log('[Stage] Fetched from origin');
      } catch (error) {
        console.warn('[Stage] Could not fetch from origin:', getErrorMessage(error));
        // Continue - we can still stage local changes
      }

      // Step 4: Verify the feature branch exists
      try {
        await execAsync(`git rev-parse --verify ${branchName}`, {
          cwd: projectPath,
          env: execEnv,
        });
      } catch {
        // Try with remote prefix
        try {
          await execAsync(`git rev-parse --verify origin/${branchName}`, {
            cwd: projectPath,
            env: execEnv,
          });
          // Fetch it locally
          await execAsync(`git fetch origin ${branchName}:${branchName}`, {
            cwd: projectPath,
            env: execEnv,
          });
        } catch {
          res.status(400).json({
            success: false,
            error: `Branch ${branchName} does not exist`,
          } as StageResponse);
          return;
        }
      }

      // Step 5: Attempt merge with --no-commit
      mergeStarted = true;
      try {
        await execAsync(`git merge --no-commit --no-ff ${branchName}`, {
          cwd: projectPath,
          env: execEnv,
        });
        console.log('[Stage] Merge successful (no conflicts)');
      } catch (error) {
        const errorMsg = getErrorMessage(error);

        // Check if it's a conflict error
        if (errorMsg.includes('CONFLICT') || errorMsg.includes('Automatic merge failed')) {
          console.log('[Stage] Merge conflicts detected, attempting resolution...');

          // Step 6: Resolve conflicts
          const resolutionResult = await conflictResolver.resolveConflicts(
            projectPath,
            featureDescription
          );

          if (!resolutionResult.success) {
            // Abort the merge
            await abortMerge(projectPath, originalBranch);
            res.status(500).json({
              success: false,
              error: `Conflict resolution failed: ${resolutionResult.error}`,
              conflicts: resolutionResult.conflicts,
            } as StageResponse);
            return;
          }

          if (!resolutionResult.allResolved) {
            // Some conflicts couldn't be resolved
            // Don't abort - let the user see what was resolved and what wasn't
            const response: StageResponse = {
              success: true,
              staged: false,
              conflicts: resolutionResult.conflicts,
              allConflictsResolved: false,
              error: 'Some conflicts could not be automatically resolved. Please resolve manually.',
            };
            res.json(response);
            return;
          }

          console.log('[Stage] All conflicts resolved');
        } else {
          // Non-conflict error
          await abortMerge(projectPath, originalBranch);
          res.status(500).json({
            success: false,
            error: `Merge failed: ${errorMsg}`,
          } as StageResponse);
          return;
        }
      }

      // Step 7: Get diff summary
      const diffSummary = await getDiffSummary(projectPath);

      // Step 8: Generate suggested commit message
      const suggestedMessage = generateCommitMessage(feature);

      const response: StageResponse = {
        success: true,
        staged: true,
        conflicts: [],
        allConflictsResolved: true,
        suggestedMessage,
        diffSummary: diffSummary.summary,
        filesChanged: diffSummary.filesChanged,
        insertions: diffSummary.insertions,
        deletions: diffSummary.deletions,
      };

      console.log(`[Stage] Successfully staged changes: ${diffSummary.summary}`);
      res.json(response);
    } catch (error) {
      logError(error, 'Stage worktree changes failed');

      // Attempt to abort merge and restore original branch if we started merging
      if (mergeStarted && originalBranch) {
        try {
          const projectPath = (req.body as StageRequest).projectPath;
          await abortMerge(projectPath, originalBranch);
        } catch {
          // Best effort cleanup
        }
      }

      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as StageResponse);
    }
  };
}

/**
 * Abort merge and restore original branch
 */
async function abortMerge(projectPath: string, originalBranch: string | null): Promise<void> {
  try {
    await execAsync('git merge --abort', { cwd: projectPath, env: execEnv });
    console.log('[Stage] Merge aborted');
  } catch {
    // Merge might not have been started, ignore
  }

  if (originalBranch) {
    try {
      await execAsync(`git checkout ${originalBranch}`, { cwd: projectPath, env: execEnv });
      console.log(`[Stage] Restored to ${originalBranch}`);
    } catch {
      // Best effort
    }
  }
}

/**
 * Get diff summary for staged changes
 */
async function getDiffSummary(
  projectPath: string
): Promise<{ summary: string; filesChanged: number; insertions: number; deletions: number }> {
  try {
    // Get stat for staged changes (from the merge)
    const { stdout } = await execAsync('git diff --cached --stat', {
      cwd: projectPath,
      env: execEnv,
    });

    // Parse the summary line (e.g., "5 files changed, 100 insertions(+), 20 deletions(-)")
    const lines = stdout.trim().split('\n');
    const summaryLine = lines[lines.length - 1] || '';

    // Parse numbers from summary
    const filesMatch = summaryLine.match(/(\d+)\s+files?\s+changed/);
    const insertMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
    const deleteMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);

    return {
      summary: summaryLine.trim() || 'No changes staged',
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
      deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
    };
  } catch {
    return {
      summary: 'Unable to get diff summary',
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    };
  }
}

/**
 * Generate suggested commit message from feature
 */
function generateCommitMessage(
  feature: { title?: string; description?: string; category?: string; id: string } | undefined
): string {
  if (!feature) {
    return 'feat: merge feature changes';
  }

  const category = feature.category?.toLowerCase() || 'feat';
  const prefix = getCategoryPrefix(category);

  // Use title if available, otherwise first line of description
  let summary = feature.title || '';
  if (!summary && feature.description) {
    summary = feature.description.split('\n')[0].substring(0, 72);
  }
  if (!summary) {
    summary = `merge feature/${feature.id}`;
  }

  // Clean up summary
  summary = summary
    .replace(/^#+\s*/, '') // Remove markdown headers
    .replace(/^\*\*.*?\*\*:?\s*/, '') // Remove bold markers
    .trim();

  // Ensure proper casing
  if (summary.length > 0) {
    summary = summary.charAt(0).toLowerCase() + summary.slice(1);
  }

  return `${prefix}: ${summary}`;
}

/**
 * Map feature category to commit prefix
 */
function getCategoryPrefix(category: string): string {
  const prefixMap: Record<string, string> = {
    feature: 'feat',
    enhancement: 'feat',
    bugfix: 'fix',
    bug: 'fix',
    fix: 'fix',
    refactor: 'refactor',
    test: 'test',
    tests: 'test',
    docs: 'docs',
    documentation: 'docs',
    style: 'style',
    chore: 'chore',
    maintenance: 'chore',
    perf: 'perf',
    performance: 'perf',
  };

  return prefixMap[category] || 'feat';
}
