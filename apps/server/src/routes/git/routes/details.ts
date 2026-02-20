/**
 * POST /details endpoint - Get detailed git info for a file or project
 * Returns branch, last commit info, diff stats, and conflict status
 */

import type { Request, Response } from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as secureFs from '../../../lib/secure-fs.js';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

interface GitFileDetails {
  branch: string;
  lastCommitHash: string;
  lastCommitMessage: string;
  lastCommitAuthor: string;
  lastCommitTimestamp: string;
  linesAdded: number;
  linesRemoved: number;
  isConflicted: boolean;
  isStaged: boolean;
  isUnstaged: boolean;
  statusLabel: string;
}

export function createDetailsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filePath } = req.body as {
        projectPath: string;
        filePath?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      try {
        // Get current branch
        const { stdout: branchRaw } = await execAsync('git rev-parse --abbrev-ref HEAD', {
          cwd: projectPath,
        });
        const branch = branchRaw.trim();

        if (!filePath) {
          // Project-level details - just return branch info
          res.json({
            success: true,
            details: { branch },
          });
          return;
        }

        // Get last commit info for this file
        let lastCommitHash = '';
        let lastCommitMessage = '';
        let lastCommitAuthor = '';
        let lastCommitTimestamp = '';

        try {
          const { stdout: logOutput } = await execFileAsync(
            'git',
            ['log', '-1', '--format=%H|%s|%an|%aI', '--', filePath],
            { cwd: projectPath }
          );

          if (logOutput.trim()) {
            const parts = logOutput.trim().split('|');
            lastCommitHash = parts[0] || '';
            lastCommitMessage = parts[1] || '';
            lastCommitAuthor = parts[2] || '';
            lastCommitTimestamp = parts[3] || '';
          }
        } catch {
          // File may not have any commits yet
        }

        // Get diff stats (lines added/removed)
        let linesAdded = 0;
        let linesRemoved = 0;

        try {
          // Check if file is untracked first
          const { stdout: statusLine } = await execFileAsync(
            'git',
            ['status', '--porcelain', '--', filePath],
            { cwd: projectPath }
          );

          if (statusLine.trim().startsWith('??')) {
            // Untracked file - count all lines as added using Node.js instead of shell
            try {
              const fileContent = (await secureFs.readFile(filePath, 'utf-8')).toString();
              const lines = fileContent.split('\n');
              // Don't count trailing empty line from final newline
              linesAdded =
                lines.length > 0 && lines[lines.length - 1] === ''
                  ? lines.length - 1
                  : lines.length;
            } catch {
              // Ignore
            }
          } else {
            const { stdout: diffStatRaw } = await execFileAsync(
              'git',
              ['diff', '--numstat', 'HEAD', '--', filePath],
              { cwd: projectPath }
            );

            if (diffStatRaw.trim()) {
              const parts = diffStatRaw.trim().split('\t');
              linesAdded = parseInt(parts[0], 10) || 0;
              linesRemoved = parseInt(parts[1], 10) || 0;
            }

            // Also check staged diff stats
            const { stdout: stagedDiffStatRaw } = await execFileAsync(
              'git',
              ['diff', '--numstat', '--cached', '--', filePath],
              { cwd: projectPath }
            );

            if (stagedDiffStatRaw.trim()) {
              const parts = stagedDiffStatRaw.trim().split('\t');
              linesAdded += parseInt(parts[0], 10) || 0;
              linesRemoved += parseInt(parts[1], 10) || 0;
            }
          }
        } catch {
          // Diff might not be available
        }

        // Get conflict and staging status
        let isConflicted = false;
        let isStaged = false;
        let isUnstaged = false;
        let statusLabel = '';

        try {
          const { stdout: statusOutput } = await execFileAsync(
            'git',
            ['status', '--porcelain', '--', filePath],
            { cwd: projectPath }
          );

          if (statusOutput.trim()) {
            const indexStatus = statusOutput[0];
            const workTreeStatus = statusOutput[1];

            // Check for conflicts (both modified, unmerged states)
            if (
              indexStatus === 'U' ||
              workTreeStatus === 'U' ||
              (indexStatus === 'A' && workTreeStatus === 'A') ||
              (indexStatus === 'D' && workTreeStatus === 'D')
            ) {
              isConflicted = true;
              statusLabel = 'Conflicted';
            } else {
              // Staged changes (index has a status)
              if (indexStatus !== ' ' && indexStatus !== '?') {
                isStaged = true;
              }
              // Unstaged changes (work tree has a status)
              if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
                isUnstaged = true;
              }

              // Build status label
              if (isStaged && isUnstaged) {
                statusLabel = 'Staged + Modified';
              } else if (isStaged) {
                statusLabel = 'Staged';
              } else {
                const statusChar = workTreeStatus !== ' ' ? workTreeStatus : indexStatus;
                switch (statusChar) {
                  case 'M':
                    statusLabel = 'Modified';
                    break;
                  case 'A':
                    statusLabel = 'Added';
                    break;
                  case 'D':
                    statusLabel = 'Deleted';
                    break;
                  case 'R':
                    statusLabel = 'Renamed';
                    break;
                  case 'C':
                    statusLabel = 'Copied';
                    break;
                  case '?':
                    statusLabel = 'Untracked';
                    break;
                  default:
                    statusLabel = statusChar || '';
                }
              }
            }
          }
        } catch {
          // Status might not be available
        }

        const details: GitFileDetails = {
          branch,
          lastCommitHash,
          lastCommitMessage,
          lastCommitAuthor,
          lastCommitTimestamp,
          linesAdded,
          linesRemoved,
          isConflicted,
          isStaged,
          isUnstaged,
          statusLabel,
        };

        res.json({ success: true, details });
      } catch (innerError) {
        logError(innerError, 'Git details failed');
        res.json({
          success: true,
          details: {
            branch: '',
            lastCommitHash: '',
            lastCommitMessage: '',
            lastCommitAuthor: '',
            lastCommitTimestamp: '',
            linesAdded: 0,
            linesRemoved: 0,
            isConflicted: false,
            isStaged: false,
            isUnstaged: false,
            statusLabel: '',
          },
        });
      }
    } catch (error) {
      logError(error, 'Get git details failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
