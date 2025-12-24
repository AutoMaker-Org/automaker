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
  isGhCliAvailable,
} from '../common.js';
import { updateWorktreePRInfo } from '../../../lib/worktree-metadata.js';

export function createCreatePRHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, projectPath, commitMessage, prTitle, prBody, baseBranch, draft } =
        req.body as {
          worktreePath: string;
          projectPath?: string;
          commitMessage?: string;
          prTitle?: string;
          prBody?: string;
          baseBranch?: string;
          draft?: boolean;
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

      // Check for uncommitted changes
      console.log(`[CreatePR] Checking for uncommitted changes in: ${worktreePath}`);
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
        env: execEnv,
      });
      const hasChanges = status.trim().length > 0;
      console.log(`[CreatePR] Has uncommitted changes: ${hasChanges}`);
      if (hasChanges) {
        console.log(`[CreatePR] Changed files:\n${status}`);
      }

      // If there are changes, commit them
      let commitHash: string | null = null;
      let commitError: string | null = null;
      if (hasChanges) {
        const message = commitMessage || `Changes from ${branchName}`;
        console.log(`[CreatePR] Committing changes with message: ${message}`);

        try {
          // Stage all changes
          console.log(`[CreatePR] Running: git add -A`);
          await execAsync('git add -A', { cwd: worktreePath, env: execEnv });

          // Create commit
          console.log(`[CreatePR] Running: git commit`);
          await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
            cwd: worktreePath,
            env: execEnv,
          });

          // Get commit hash
          const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
            cwd: worktreePath,
            env: execEnv,
          });
          commitHash = hashOutput.trim().substring(0, 8);
          console.log(`[CreatePR] Commit successful: ${commitHash}`);
        } catch (commitErr: unknown) {
          const err = commitErr as { stderr?: string; message?: string };
          commitError = err.stderr || err.message || 'Commit failed';
          console.error(`[CreatePR] Commit failed: ${commitError}`);

          // Return error immediately - don't proceed with push/PR if commit fails
          res.status(500).json({
            success: false,
            error: `Failed to commit changes: ${commitError}`,
            commitError,
          });
          return;
        }
      }

      // Push the branch to remote
      let pushError: string | null = null;
      try {
        await execAsync(`git push -u origin ${branchName}`, {
          cwd: worktreePath,
          env: execEnv,
        });
      } catch (error: unknown) {
        // If push fails, try with --set-upstream
        try {
          await execAsync(`git push --set-upstream origin ${branchName}`, {
            cwd: worktreePath,
            env: execEnv,
          });
        } catch (error2: unknown) {
          // Capture push error for reporting
          const err = error2 as { stderr?: string; message?: string };
          pushError = err.stderr || err.message || 'Push failed';
          console.error('[CreatePR] Push failed:', pushError);
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
      const draftFlag = draft ? '--draft' : '';

      let prUrl: string | null = null;
      let prError: string | null = null;
      let browserUrl: string | null = null;
      let ghCliAvailable = false;

      // Get repository URL and detect fork workflow FIRST
      // This is needed for both the existing PR check and PR creation
      let repoUrl: string | null = null;
      let upstreamRepo: string | null = null;
      let originOwner: string | null = null;
      try {
        const { stdout: remotes } = await execAsync('git remote -v', {
          cwd: worktreePath,
          env: execEnv,
        });

        // Parse remotes to detect fork workflow and get repo URL
        const lines = remotes.split(/\r?\n/); // Handle both Unix and Windows line endings
        for (const line of lines) {
          // Try multiple patterns to match different remote URL formats
          // Pattern 1: git@github.com:owner/repo.git (fetch)
          // Pattern 2: https://github.com/owner/repo.git (fetch)
          // Pattern 3: https://github.com/owner/repo (fetch)
          let match = line.match(/^(\w+)\s+.*[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\s+\(fetch\)/);
          if (!match) {
            // Try SSH format: git@github.com:owner/repo.git
            match = line.match(/^(\w+)\s+git@[^:]+:([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);
          }
          if (!match) {
            // Try HTTPS format: https://github.com/owner/repo.git
            match = line.match(
              /^(\w+)\s+https?:\/\/[^/]+\/([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/
            );
          }

          if (match) {
            const [, remoteName, owner, repo] = match;
            if (remoteName === 'upstream') {
              upstreamRepo = `${owner}/${repo}`;
              repoUrl = `https://github.com/${owner}/${repo}`;
            } else if (remoteName === 'origin') {
              originOwner = owner;
              if (!repoUrl) {
                repoUrl = `https://github.com/${owner}/${repo}`;
              }
            }
          }
        }
      } catch (error) {
        // Couldn't parse remotes - will try fallback
      }

      // Fallback: Try to get repo URL from git config if remote parsing failed
      if (!repoUrl) {
        try {
          const { stdout: originUrl } = await execAsync('git config --get remote.origin.url', {
            cwd: worktreePath,
            env: execEnv,
          });
          const url = originUrl.trim();

          // Parse URL to extract owner/repo
          // Handle both SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo.git)
          let match = url.match(/[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
          if (match) {
            const [, owner, repo] = match;
            originOwner = owner;
            repoUrl = `https://github.com/${owner}/${repo}`;
          }
        } catch (error) {
          // Failed to get repo URL from config
        }
      }

      // Check if gh CLI is available (cross-platform)
      ghCliAvailable = await isGhCliAvailable();

      // Construct browser URL for PR creation
      if (repoUrl) {
        const encodedTitle = encodeURIComponent(title);
        const encodedBody = encodeURIComponent(body);

        if (upstreamRepo && originOwner) {
          // Fork workflow: PR to upstream from origin
          browserUrl = `https://github.com/${upstreamRepo}/compare/${base}...${originOwner}:${branchName}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
        } else {
          // Regular repo
          browserUrl = `${repoUrl}/compare/${base}...${branchName}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
        }
      }

      let prNumber: number | undefined;
      let prAlreadyExisted = false;

      if (ghCliAvailable) {
        // First, check if a PR already exists for this branch using gh pr list
        // This is more reliable than gh pr view as it explicitly searches by branch name
        // For forks, we need to use owner:branch format for the head parameter
        const headRef = upstreamRepo && originOwner ? `${originOwner}:${branchName}` : branchName;
        const repoArg = upstreamRepo ? ` --repo "${upstreamRepo}"` : '';

        console.log(
          `[CreatePR] Checking for existing PR for branch: ${branchName} (headRef: ${headRef})`
        );
        try {
          const listCmd = `gh pr list${repoArg} --head "${headRef}" --json number,title,url,state --limit 1`;
          console.log(`[CreatePR] Running: ${listCmd}`);
          const { stdout: existingPrOutput } = await execAsync(listCmd, {
            cwd: worktreePath,
            env: execEnv,
          });
          console.log(`[CreatePR] gh pr list output: ${existingPrOutput}`);

          const existingPrs = JSON.parse(existingPrOutput);

          if (Array.isArray(existingPrs) && existingPrs.length > 0) {
            const existingPr = existingPrs[0];
            // PR already exists - use it and store metadata
            console.log(
              `[CreatePR] PR already exists for branch ${branchName}: PR #${existingPr.number}`
            );
            prUrl = existingPr.url;
            prNumber = existingPr.number;
            prAlreadyExisted = true;

            // Store the existing PR info in metadata
            await updateWorktreePRInfo(effectiveProjectPath, branchName, {
              number: existingPr.number,
              url: existingPr.url,
              title: existingPr.title || title,
              state: existingPr.state || 'open',
              createdAt: new Date().toISOString(),
            });
            console.log(
              `[CreatePR] Stored existing PR info for branch ${branchName}: PR #${existingPr.number}`
            );
          } else {
            console.log(`[CreatePR] No existing PR found for branch ${branchName}`);
          }
        } catch (listError) {
          // gh pr list failed - log but continue to try creating
          console.log(`[CreatePR] gh pr list failed (this is ok, will try to create):`, listError);
        }

        // Only create a new PR if one doesn't already exist
        if (!prUrl) {
          try {
            // Build gh pr create command
            let prCmd = `gh pr create --base "${base}"`;

            // If this is a fork (has upstream remote), specify the repo and head
            if (upstreamRepo && originOwner) {
              // For forks: --repo specifies where to create PR, --head specifies source
              prCmd += ` --repo "${upstreamRepo}" --head "${originOwner}:${branchName}"`;
            } else {
              // Not a fork, just specify the head branch
              prCmd += ` --head "${branchName}"`;
            }

            prCmd += ` --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" ${draftFlag}`;
            prCmd = prCmd.trim();

            console.log(`[CreatePR] Creating PR with command: ${prCmd}`);
            const { stdout: prOutput } = await execAsync(prCmd, {
              cwd: worktreePath,
              env: execEnv,
            });
            prUrl = prOutput.trim();
            console.log(`[CreatePR] PR created: ${prUrl}`);

            // Extract PR number and store metadata for newly created PR
            if (prUrl) {
              const prMatch = prUrl.match(/\/pull\/(\d+)/);
              prNumber = prMatch ? parseInt(prMatch[1], 10) : undefined;

              if (prNumber) {
                try {
                  await updateWorktreePRInfo(effectiveProjectPath, branchName, {
                    number: prNumber,
                    url: prUrl,
                    title,
                    state: draft ? 'draft' : 'open',
                    createdAt: new Date().toISOString(),
                  });
                  console.log(
                    `[CreatePR] Stored PR info for branch ${branchName}: PR #${prNumber}`
                  );
                } catch (metadataError) {
                  console.error('[CreatePR] Failed to store PR metadata:', metadataError);
                }
              }
            }
          } catch (ghError: unknown) {
            // gh CLI failed - check if it's "already exists" error and try to fetch the PR
            const err = ghError as { stderr?: string; message?: string };
            const errorMessage = err.stderr || err.message || 'PR creation failed';
            console.log(`[CreatePR] gh pr create failed: ${errorMessage}`);

            // If error indicates PR already exists, try to fetch it
            if (errorMessage.toLowerCase().includes('already exists')) {
              console.log(`[CreatePR] PR already exists error - trying to fetch existing PR`);
              try {
                const { stdout: viewOutput } = await execAsync(
                  `gh pr view --json number,title,url,state`,
                  { cwd: worktreePath, env: execEnv }
                );
                const existingPr = JSON.parse(viewOutput);
                if (existingPr.url) {
                  prUrl = existingPr.url;
                  prNumber = existingPr.number;
                  prAlreadyExisted = true;

                  await updateWorktreePRInfo(effectiveProjectPath, branchName, {
                    number: existingPr.number,
                    url: existingPr.url,
                    title: existingPr.title || title,
                    state: existingPr.state || 'open',
                    createdAt: new Date().toISOString(),
                  });
                  console.log(`[CreatePR] Fetched and stored existing PR: #${existingPr.number}`);
                }
              } catch (viewError) {
                console.error('[CreatePR] Failed to fetch existing PR:', viewError);
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
          committed: hasChanges && !commitError,
          commitHash,
          commitError: commitError || undefined,
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
