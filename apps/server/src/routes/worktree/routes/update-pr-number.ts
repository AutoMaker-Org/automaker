/**
 * POST /update-pr-number endpoint - Update the tracked PR number for a worktree
 *
 * Allows users to manually change which PR number is tracked for a worktree branch.
 * Fetches updated PR info from GitHub when available, or updates metadata with the
 * provided number only if GitHub CLI is unavailable.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError, execAsync, execEnv, isGhCliAvailable } from '../common.js';
import { updateWorktreePRInfo } from '../../../lib/worktree-metadata.js';
import { createLogger } from '@automaker/utils';
import { validatePRState } from '@automaker/types';

const logger = createLogger('UpdatePRNumber');

export function createUpdatePRNumberHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, projectPath, prNumber } = req.body as {
        worktreePath: string;
        projectPath?: string;
        prNumber: number;
      };

      if (!worktreePath) {
        res.status(400).json({ success: false, error: 'worktreePath required' });
        return;
      }

      if (
        !prNumber ||
        typeof prNumber !== 'number' ||
        prNumber <= 0 ||
        !Number.isInteger(prNumber)
      ) {
        res.status(400).json({ success: false, error: 'prNumber must be a positive integer' });
        return;
      }

      const effectiveProjectPath = projectPath || worktreePath;

      // Get current branch name
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
        env: execEnv,
      });
      const branchName = branchOutput.trim();

      if (!branchName || branchName === 'HEAD') {
        res.status(400).json({
          success: false,
          error: 'Cannot update PR number in detached HEAD state',
        });
        return;
      }

      // Try to fetch PR info from GitHub for the given PR number
      const ghCliAvailable = await isGhCliAvailable();

      if (ghCliAvailable) {
        try {
          // Detect repository for gh CLI
          let repoFlag = '';
          try {
            const { stdout: remotes } = await execAsync('git remote -v', {
              cwd: worktreePath,
              env: execEnv,
            });
            const lines = remotes.split(/\r?\n/);
            let upstreamRepo: string | null = null;
            let originOwner: string | null = null;
            let originRepo: string | null = null;

            for (const line of lines) {
              const match =
                line.match(/^(\w+)\s+.*[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\s+\(fetch\)/) ||
                line.match(/^(\w+)\s+git@[^:]+:([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/) ||
                line.match(/^(\w+)\s+https?:\/\/[^/]+\/([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);

              if (match) {
                const [, remoteName, owner, repo] = match;
                if (remoteName === 'upstream') {
                  upstreamRepo = `${owner}/${repo}`;
                } else if (remoteName === 'origin') {
                  originOwner = owner;
                  originRepo = repo;
                }
              }
            }

            const targetRepo =
              upstreamRepo || (originOwner && originRepo ? `${originOwner}/${originRepo}` : null);
            if (targetRepo) {
              repoFlag = ` --repo "${targetRepo}"`;
            }
          } catch {
            // Ignore remote parsing errors
          }

          // Fetch PR info from GitHub using the PR number
          const viewCmd = `gh pr view ${prNumber}${repoFlag} --json number,title,url,state,createdAt`;
          const { stdout: prOutput } = await execAsync(viewCmd, {
            cwd: worktreePath,
            env: execEnv,
          });

          const prData = JSON.parse(prOutput);

          const prInfo = {
            number: prData.number,
            url: prData.url,
            title: prData.title,
            state: validatePRState(prData.state),
            createdAt: prData.createdAt || new Date().toISOString(),
          };

          await updateWorktreePRInfo(effectiveProjectPath, branchName, prInfo);

          logger.info(`Updated PR tracking to #${prNumber} for branch ${branchName}`);

          res.json({
            success: true,
            result: {
              branch: branchName,
              prInfo,
            },
          });
          return;
        } catch (error) {
          logger.warn(`Failed to fetch PR #${prNumber} from GitHub:`, error);
          // Fall through to simple update below
        }
      }

      // Fallback: update with just the number, preserving existing PR info structure
      // or creating minimal info if no GitHub data available
      const prInfo = {
        number: prNumber,
        url: `https://github.com/pulls/${prNumber}`,
        title: `PR #${prNumber}`,
        state: validatePRState('OPEN'),
        createdAt: new Date().toISOString(),
      };

      await updateWorktreePRInfo(effectiveProjectPath, branchName, prInfo);

      logger.info(`Updated PR tracking to #${prNumber} for branch ${branchName} (no GitHub data)`);

      res.json({
        success: true,
        result: {
          branch: branchName,
          prInfo,
          ghCliUnavailable: !ghCliAvailable,
        },
      });
    } catch (error) {
      logError(error, 'Update PR number failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
