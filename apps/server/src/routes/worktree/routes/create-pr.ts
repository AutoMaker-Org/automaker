/**
 * POST /create-pr endpoint - Commit changes and create a pull request from a worktree
 */

import type { Request, Response } from 'express';
import {
  getErrorMessage,
  logError,
  execAsync,
  execEnv,
  isValidBranchName,
  isValidRemoteName,
  isGhCliAvailable,
} from '../common.js';
import { execGitCommand } from '../../../lib/git.js';
import { spawnProcess } from '@automaker/platform';
import { updateWorktreePRInfo } from '../../../lib/worktree-metadata.js';
import { createLogger } from '@automaker/utils';
import { validatePRState } from '@automaker/types';
import { resolvePrTarget } from '../../../services/pr-service.js';

const logger = createLogger('CreatePR');

export function createCreatePRHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        worktreePath,
        projectPath,
        commitMessage,
        prTitle,
        prBody,
        baseBranch,
        draft,
        remote,
        targetRemote,
      } = req.body as {
        worktreePath: string;
        projectPath?: string;
        commitMessage?: string;
        prTitle?: string;
        prBody?: string;
        baseBranch?: string;
        draft?: boolean;
        remote?: string;
        /** Remote to create the PR against (e.g. upstream). If not specified, inferred from repo setup. */
        targetRemote?: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Use projectPath if provided, otherwise derive from worktreePath
      // For worktrees, projectPath is needed to store metadata in the main project's .automaker folder
      const effectiveProjectPath = projectPath || worktreePath;

      // Get current branch name
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
        env: execEnv,
      });
      const branchName = branchOutput.trim();

      // Validate branch name for security
      if (!isValidBranchName(branchName)) {
        res.status(400).json({
          success: false,
          error: 'Invalid branch name contains unsafe characters',
        });
        return;
      }

      // --- Input validation: run all validation before any git write operations ---

      // Validate remote names before use to prevent command injection
      if (remote !== undefined && !isValidRemoteName(remote)) {
        res.status(400).json({
          success: false,
          error: 'Invalid remote name contains unsafe characters',
        });
        return;
      }
      if (targetRemote !== undefined && !isValidRemoteName(targetRemote)) {
        res.status(400).json({
          success: false,
          error: 'Invalid target remote name contains unsafe characters',
        });
        return;
      }

      const pushRemote = remote || 'origin';

      // Resolve repository URL, fork workflow, and target remote information.
      // This is needed for both the existing PR check and PR creation.
      // Resolve early so validation errors are caught before any writes.
      let repoUrl: string | null = null;
      let upstreamRepo: string | null = null;
      let originOwner: string | null = null;
      try {
        const prTarget = await resolvePrTarget({
          worktreePath,
          pushRemote,
          targetRemote,
        });
        repoUrl = prTarget.repoUrl;
        upstreamRepo = prTarget.upstreamRepo;
        originOwner = prTarget.originOwner;
      } catch (resolveErr) {
        // resolvePrTarget throws for validation errors (unknown targetRemote, missing pushRemote)
        res.status(400).json({
          success: false,
          error: getErrorMessage(resolveErr),
        });
        return;
      }

      // --- Validation complete — proceed with git operations ---

      // Check for uncommitted changes
      logger.debug(`Checking for uncommitted changes in: ${worktreePath}`);
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
        env: execEnv,
      });
      const hasChanges = status.trim().length > 0;
      logger.debug(`Has uncommitted changes: ${hasChanges}`);
      if (hasChanges) {
        logger.debug(`Changed files:\n${status}`);
      }

      // If there are changes, commit them before creating the PR
      let commitHash: string | null = null;
      if (hasChanges) {
        const message = commitMessage || `Changes from ${branchName}`;
        logger.debug(`Committing changes with message: ${message}`);

        try {
          // Stage all changes
          logger.debug(`Running: git add -A`);
          await execAsync('git add -A', { cwd: worktreePath, env: execEnv });

          // Create commit — pass message as a separate arg to avoid shell injection
          logger.debug(`Running: git commit`);
          await execGitCommand(['commit', '-m', message], worktreePath);

          // Get commit hash
          const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
            cwd: worktreePath,
            env: execEnv,
          });
          commitHash = hashOutput.trim().substring(0, 8);
          logger.info(`Commit successful: ${commitHash}`);
        } catch (commitErr: unknown) {
          const err = commitErr as { stderr?: string; message?: string };
          const commitError = err.stderr || err.message || 'Commit failed';
          logger.error(`Commit failed: ${commitError}`);

          // Return error immediately - don't proceed with push/PR if commit fails
          res.status(500).json({
            success: false,
            error: `Failed to commit changes: ${commitError}`,
          });
          return;
        }
      }

      // Push the branch to remote (use selected remote or default to 'origin')
      // Uses array-based execGitCommand to avoid shell injection from pushRemote/branchName.
      let pushError: string | null = null;
      try {
        await execGitCommand(['push', pushRemote, branchName], worktreePath, execEnv);
      } catch {
        // If push fails, try with --set-upstream
        try {
          await execGitCommand(
            ['push', '--set-upstream', pushRemote, branchName],
            worktreePath,
            execEnv
          );
        } catch (error2: unknown) {
          // Capture push error for reporting
          const err = error2 as { stderr?: string; message?: string };
          pushError = err.stderr || err.message || 'Push failed';
          logger.error('Push failed:', pushError);
        }
      }

      // If push failed, return error
      if (pushError) {
        res.status(500).json({
          success: false,
          error: `Failed to push branch: ${pushError}`,
        });
        return;
      }

      // Create PR using gh CLI or provide browser fallback
      const base = baseBranch || 'main';
      const title = prTitle || branchName;
      const body = prBody || `Changes from branch ${branchName}`;
      let prUrl: string | null = null;
      let prError: string | null = null;
      let browserUrl: string | null = null;
      let ghCliAvailable = false;

      // Check if gh CLI is available (cross-platform)
      ghCliAvailable = await isGhCliAvailable();

      // Construct browser URL for PR creation
      if (repoUrl) {
        const encodedTitle = encodeURIComponent(title);
        const encodedBody = encodeURIComponent(body);
        // Encode base branch and head branch to handle special chars like # or %
        const encodedBase = encodeURIComponent(base);
        const encodedBranch = encodeURIComponent(branchName);

        if (upstreamRepo && originOwner) {
          // Fork workflow (or cross-remote PR): PR to target from push remote
          browserUrl = `https://github.com/${upstreamRepo}/compare/${encodedBase}...${originOwner}:${encodedBranch}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
        } else {
          // Regular repo
          browserUrl = `${repoUrl}/compare/${encodedBase}...${encodedBranch}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
        }
      }

      let prNumber: number | undefined;
      let prAlreadyExisted = false;

      if (ghCliAvailable) {
        // First, check if a PR already exists for this branch using gh pr list
        // This is more reliable than gh pr view as it explicitly searches by branch name
        // For forks/cross-remote, we need to use owner:branch format for the head parameter
        const headRef = upstreamRepo && originOwner ? `${originOwner}:${branchName}` : branchName;

        logger.debug(`Checking for existing PR for branch: ${branchName} (headRef: ${headRef})`);
        try {
          const listArgs = ['pr', 'list'];
          if (upstreamRepo) {
            listArgs.push('--repo', upstreamRepo);
          }
          listArgs.push(
            '--head',
            headRef,
            '--json',
            'number,title,url,state,createdAt',
            '--limit',
            '1'
          );
          logger.debug(`Running: gh ${listArgs.join(' ')}`);
          const listResult = await spawnProcess({
            command: 'gh',
            args: listArgs,
            cwd: worktreePath,
            env: execEnv,
          });
          if (listResult.exitCode !== 0) {
            logger.error(
              `gh pr list failed with exit code ${listResult.exitCode}: ` +
                `stderr=${listResult.stderr}, stdout=${listResult.stdout}`
            );
            throw new Error(
              `gh pr list failed (exit code ${listResult.exitCode}): ${listResult.stderr || listResult.stdout}`
            );
          }
          const existingPrOutput = listResult.stdout;
          logger.debug(`gh pr list output: ${existingPrOutput}`);

          const existingPrs = JSON.parse(existingPrOutput);

          if (Array.isArray(existingPrs) && existingPrs.length > 0) {
            const existingPr = existingPrs[0];
            // PR already exists - use it and store metadata
            logger.info(`PR already exists for branch ${branchName}: PR #${existingPr.number}`);
            prUrl = existingPr.url;
            prNumber = existingPr.number;
            prAlreadyExisted = true;

            // Store the existing PR info in metadata
            // GitHub CLI returns uppercase states: OPEN, MERGED, CLOSED
            await updateWorktreePRInfo(effectiveProjectPath, branchName, {
              number: existingPr.number,
              url: existingPr.url,
              title: existingPr.title || title,
              state: validatePRState(existingPr.state),
              createdAt: existingPr.createdAt || new Date().toISOString(),
            });
            logger.debug(
              `Stored existing PR info for branch ${branchName}: PR #${existingPr.number}`
            );
          } else {
            logger.debug(`No existing PR found for branch ${branchName}`);
          }
        } catch (listError) {
          // gh pr list failed - log but continue to try creating
          logger.debug(`gh pr list failed (this is ok, will try to create):`, listError);
        }

        // Only create a new PR if one doesn't already exist
        if (!prUrl) {
          try {
            // Build gh pr create args as an array to avoid shell injection on
            // title/body (backticks, $, \ were unsafe with string interpolation)
            const prArgs = ['pr', 'create', '--base', base];

            // If this is a fork (has upstream remote), specify the repo and head
            if (upstreamRepo && originOwner) {
              // For forks: --repo specifies where to create PR, --head specifies source
              prArgs.push('--repo', upstreamRepo, '--head', `${originOwner}:${branchName}`);
            } else {
              // Not a fork, just specify the head branch
              prArgs.push('--head', branchName);
            }

            prArgs.push('--title', title, '--body', body);
            if (draft) prArgs.push('--draft');

            logger.debug(`Creating PR with args: gh ${prArgs.join(' ')}`);
            const prResult = await spawnProcess({
              command: 'gh',
              args: prArgs,
              cwd: worktreePath,
              env: execEnv,
            });
            if (prResult.exitCode !== 0) {
              throw Object.assign(new Error(prResult.stderr || 'gh pr create failed'), {
                stderr: prResult.stderr,
              });
            }
            prUrl = prResult.stdout.trim();
            logger.info(`PR created: ${prUrl}`);

            // Extract PR number and store metadata for newly created PR
            if (prUrl) {
              const prMatch = prUrl.match(/\/pull\/(\d+)/);
              prNumber = prMatch ? parseInt(prMatch[1], 10) : undefined;

              if (prNumber) {
                try {
                  // Note: GitHub doesn't have a 'DRAFT' state - drafts still show as 'OPEN'
                  await updateWorktreePRInfo(effectiveProjectPath, branchName, {
                    number: prNumber,
                    url: prUrl,
                    title,
                    state: 'OPEN',
                    createdAt: new Date().toISOString(),
                  });
                  logger.debug(`Stored PR info for branch ${branchName}: PR #${prNumber}`);
                } catch (metadataError) {
                  logger.error('Failed to store PR metadata:', metadataError);
                }
              }
            }
          } catch (ghError: unknown) {
            // gh CLI failed - check if it's "already exists" error and try to fetch the PR
            const err = ghError as { stderr?: string; message?: string };
            const errorMessage = err.stderr || err.message || 'PR creation failed';
            logger.debug(`gh pr create failed: ${errorMessage}`);

            // If error indicates PR already exists, try to fetch it
            if (errorMessage.toLowerCase().includes('already exists')) {
              logger.debug(`PR already exists error - trying to fetch existing PR`);
              try {
                // Build args as an array to avoid shell injection.
                // When upstreamRepo is set (fork/cross-remote workflow) we must
                // query the upstream repository so we find the correct PR.
                const viewArgs = ['pr', 'view', '--json', 'number,title,url,state,createdAt'];
                if (upstreamRepo) {
                  viewArgs.push('--repo', upstreamRepo);
                }
                logger.debug(`Running: gh ${viewArgs.join(' ')}`);
                const viewResult = await spawnProcess({
                  command: 'gh',
                  args: viewArgs,
                  cwd: worktreePath,
                  env: execEnv,
                });
                if (viewResult.exitCode !== 0) {
                  throw new Error(
                    `gh pr view failed (exit code ${viewResult.exitCode}): ${viewResult.stderr || viewResult.stdout}`
                  );
                }
                const existingPr = JSON.parse(viewResult.stdout);
                if (existingPr.url) {
                  prUrl = existingPr.url;
                  prNumber = existingPr.number;
                  prAlreadyExisted = true;

                  // GitHub CLI returns uppercase states: OPEN, MERGED, CLOSED
                  await updateWorktreePRInfo(effectiveProjectPath, branchName, {
                    number: existingPr.number,
                    url: existingPr.url,
                    title: existingPr.title || title,
                    state: validatePRState(existingPr.state),
                    createdAt: existingPr.createdAt || new Date().toISOString(),
                  });
                  logger.debug(`Fetched and stored existing PR: #${existingPr.number}`);
                }
              } catch (viewError) {
                logger.error('Failed to fetch existing PR:', viewError);
                prError = errorMessage;
              }
            } else {
              prError = errorMessage;
            }
          }
        }
      } else {
        prError = 'gh_cli_not_available';
      }

      // Return result with browser fallback URL
      res.json({
        success: true,
        result: {
          branch: branchName,
          committed: hasChanges,
          commitHash,
          pushed: true,
          prUrl,
          prNumber,
          prCreated: !!prUrl,
          prAlreadyExisted,
          prError: prError || undefined,
          browserUrl: browserUrl || undefined,
          ghCliAvailable,
        },
      });
    } catch (error) {
      logError(error, 'Create PR failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
