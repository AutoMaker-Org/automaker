/**
 * POST /worktree/generate-pr-description endpoint - Generate an AI PR description from git diff
 *
 * Uses the configured model (via phaseModels.commitMessageModel) to generate a pull request
 * title and description from the branch's changes compared to the base branch.
 * Defaults to Claude Haiku for speed.
 */

import type { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@automaker/utils';
import { isCursorModel, stripProviderPrefix } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage, logError } from '../common.js';
import { getPhaseModelWithOverrides } from '../../../lib/settings-helpers.js';

const logger = createLogger('GeneratePRDescription');
const execFileAsync = promisify(execFile);

/** Timeout for AI provider calls in milliseconds (30 seconds) */
const AI_TIMEOUT_MS = 30_000;

/** Max diff size to send to AI (characters) */
const MAX_DIFF_SIZE = 15_000;

const PR_DESCRIPTION_SYSTEM_PROMPT = `You are a pull request description generator. Your task is to create a clear, well-structured PR title and description based on the git diff and branch information provided.

IMPORTANT: Do NOT include any conversational text, explanations, or preamble. Do NOT say things like "I'll analyze..." or "Here is...". Output ONLY the structured format below and nothing else.

Output your response in EXACTLY this format (including the markers):
---TITLE---
<a concise PR title, 50-72 chars, imperative mood>
---BODY---
## Summary
<1-3 bullet points describing the key changes>

## Changes
<Detailed list of what was changed and why>

Rules:
- Your ENTIRE response must start with ---TITLE--- and contain nothing before it
- The title should be concise and descriptive (50-72 characters)
- Use imperative mood for the title (e.g., "Add dark mode toggle" not "Added dark mode toggle")
- The description should explain WHAT changed and WHY
- Group related changes together
- Use markdown formatting for the body
- Do NOT include the branch name in the title
- Focus on the user-facing impact when possible
- If there are breaking changes, mention them prominently
- The diff may include both committed changes and uncommitted working directory changes. Treat all changes as part of the PR since uncommitted changes will be committed when the PR is created
- Do NOT distinguish between committed and uncommitted changes in the output - describe all changes as a unified set of PR changes
- EXCLUDE any files that are gitignored (e.g., node_modules, dist, build, .env files, lock files, generated files, binary artifacts, coverage reports, cache directories). These should not be mentioned in the description even if they appear in the diff
- Focus only on meaningful source code changes that are tracked by git and relevant to reviewers`;

/**
 * Wraps an async generator with a timeout.
 */
async function* withTimeout<T>(
  generator: AsyncIterable<T>,
  timeoutMs: number
): AsyncGenerator<T, void, unknown> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`AI provider timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  const iterator = generator[Symbol.asyncIterator]();
  let done = false;

  try {
    while (!done) {
      const result = await Promise.race([iterator.next(), timeoutPromise]).catch(async (err) => {
        // Timeout (or other error) — attempt to gracefully close the source generator
        await iterator.return?.();
        throw err;
      });
      if (result.done) {
        done = true;
      } else {
        yield result.value;
      }
    }
  } finally {
    clearTimeout(timerId);
  }
}

interface GeneratePRDescriptionRequestBody {
  worktreePath: string;
  baseBranch?: string;
}

interface GeneratePRDescriptionSuccessResponse {
  success: true;
  title: string;
  body: string;
}

interface GeneratePRDescriptionErrorResponse {
  success: false;
  error: string;
}

export function createGeneratePRDescriptionHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, baseBranch } = req.body as GeneratePRDescriptionRequestBody;

      if (!worktreePath || typeof worktreePath !== 'string') {
        const response: GeneratePRDescriptionErrorResponse = {
          success: false,
          error: 'worktreePath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate that the directory exists
      if (!existsSync(worktreePath)) {
        const response: GeneratePRDescriptionErrorResponse = {
          success: false,
          error: 'worktreePath does not exist',
        };
        res.status(400).json(response);
        return;
      }

      // Validate that it's a git repository
      const gitPath = join(worktreePath, '.git');
      if (!existsSync(gitPath)) {
        const response: GeneratePRDescriptionErrorResponse = {
          success: false,
          error: 'worktreePath is not a git repository',
        };
        res.status(400).json(response);
        return;
      }

      // Validate baseBranch to allow only safe branch name characters
      if (baseBranch !== undefined && !/^[\w.\-/]+$/.test(baseBranch)) {
        const response: GeneratePRDescriptionErrorResponse = {
          success: false,
          error: 'baseBranch contains invalid characters',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`Generating PR description for worktree: ${worktreePath}`);

      // Get current branch name
      const { stdout: branchOutput } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: worktreePath }
      );
      const branchName = branchOutput.trim();

      // Determine the base branch for comparison
      const base = baseBranch || 'main';

      // Get the diff between current branch and base branch (committed changes)
      // Track whether the diff method used only includes committed changes.
      // `git diff base...HEAD` and `git diff origin/base...HEAD` only show committed changes,
      // while the fallback methods (`git diff HEAD`, `git diff --cached + git diff`) already
      // include uncommitted working directory changes.
      let diff = '';
      let diffIncludesUncommitted = false;
      try {
        // First, try to get diff against the base branch
        const { stdout: branchDiff } = await execFileAsync('git', ['diff', `${base}...HEAD`], {
          cwd: worktreePath,
          maxBuffer: 1024 * 1024 * 5, // 5MB buffer
        });
        diff = branchDiff;
        // git diff base...HEAD only shows committed changes
        diffIncludesUncommitted = false;
      } catch {
        // If branch comparison fails (e.g., base branch doesn't exist locally),
        // try fetching and comparing against remote base
        try {
          const { stdout: remoteDiff } = await execFileAsync(
            'git',
            ['diff', `origin/${base}...HEAD`],
            {
              cwd: worktreePath,
              maxBuffer: 1024 * 1024 * 5,
            }
          );
          diff = remoteDiff;
          // git diff origin/base...HEAD only shows committed changes
          diffIncludesUncommitted = false;
        } catch {
          // Fall back to getting all uncommitted + committed changes
          try {
            const { stdout: allDiff } = await execFileAsync('git', ['diff', 'HEAD'], {
              cwd: worktreePath,
              maxBuffer: 1024 * 1024 * 5,
            });
            diff = allDiff;
            // git diff HEAD includes uncommitted changes
            diffIncludesUncommitted = true;
          } catch {
            // Last resort: get staged + unstaged changes
            const { stdout: stagedDiff } = await execFileAsync('git', ['diff', '--cached'], {
              cwd: worktreePath,
              maxBuffer: 1024 * 1024 * 5,
            });
            const { stdout: unstagedDiff } = await execFileAsync('git', ['diff'], {
              cwd: worktreePath,
              maxBuffer: 1024 * 1024 * 5,
            });
            diff = stagedDiff + unstagedDiff;
            // These already include uncommitted changes
            diffIncludesUncommitted = true;
          }
        }
      }

      // Check for uncommitted changes (staged + unstaged) to include in the description.
      // When creating a PR, uncommitted changes will be auto-committed, so they should be
      // reflected in the generated description. We only need to fetch uncommitted diffs
      // when the primary diff method (base...HEAD) was used, since it only shows committed changes.
      let hasUncommittedChanges = false;
      try {
        const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain'], {
          cwd: worktreePath,
        });
        hasUncommittedChanges = statusOutput.trim().length > 0;

        if (hasUncommittedChanges && !diffIncludesUncommitted) {
          logger.info('Uncommitted changes detected, including in PR description context');

          let uncommittedDiff = '';

          // Get staged changes
          try {
            const { stdout: stagedDiff } = await execFileAsync('git', ['diff', '--cached'], {
              cwd: worktreePath,
              maxBuffer: 1024 * 1024 * 5,
            });
            if (stagedDiff.trim()) {
              uncommittedDiff += stagedDiff;
            }
          } catch {
            // Ignore staged diff errors
          }

          // Get unstaged changes (tracked files only)
          try {
            const { stdout: unstagedDiff } = await execFileAsync('git', ['diff'], {
              cwd: worktreePath,
              maxBuffer: 1024 * 1024 * 5,
            });
            if (unstagedDiff.trim()) {
              uncommittedDiff += unstagedDiff;
            }
          } catch {
            // Ignore unstaged diff errors
          }

          // Get list of untracked files for context
          const untrackedFiles = statusOutput
            .split('\n')
            .filter((line) => line.startsWith('??'))
            .map((line) => line.substring(3).trim());

          if (untrackedFiles.length > 0) {
            // Add a summary of untracked (new) files as context
            uncommittedDiff += `\n# New untracked files:\n${untrackedFiles.map((f) => `# + ${f}`).join('\n')}\n`;
          }

          // Append uncommitted changes to the committed diff
          if (uncommittedDiff.trim()) {
            diff = diff + uncommittedDiff;
          }
        }
      } catch {
        // Ignore errors checking for uncommitted changes
      }

      // Also get the commit log for context
      let commitLog = '';
      try {
        const { stdout: logOutput } = await execFileAsync(
          'git',
          ['log', `${base}..HEAD`, '--oneline', '--no-decorate'],
          {
            cwd: worktreePath,
            maxBuffer: 1024 * 1024,
          }
        );
        commitLog = logOutput.trim();
      } catch {
        // If comparing against base fails, fall back to recent commits
        try {
          const { stdout: logOutput } = await execFileAsync(
            'git',
            ['log', '--oneline', '-10', '--no-decorate'],
            {
              cwd: worktreePath,
              maxBuffer: 1024 * 1024,
            }
          );
          commitLog = logOutput.trim();
        } catch {
          // Ignore commit log errors
        }
      }

      if (!diff.trim() && !commitLog.trim()) {
        const response: GeneratePRDescriptionErrorResponse = {
          success: false,
          error: 'No changes found to generate a PR description from',
        };
        res.status(400).json(response);
        return;
      }

      // Truncate diff if too long
      const truncatedDiff =
        diff.length > MAX_DIFF_SIZE
          ? diff.substring(0, MAX_DIFF_SIZE) + '\n\n[... diff truncated ...]'
          : diff;

      // Build the user prompt
      let userPrompt = `Generate a pull request title and description for the following changes.\n\nBranch: ${branchName}\nBase Branch: ${base}\n`;

      if (commitLog) {
        userPrompt += `\nCommit History:\n${commitLog}\n`;
      }

      if (hasUncommittedChanges) {
        userPrompt += `\nNote: This branch has uncommitted changes that will be included in the PR.\n`;
      }

      if (truncatedDiff) {
        userPrompt += `\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;
      }

      // Get model from phase settings with provider info
      const {
        phaseModel: phaseModelEntry,
        provider: claudeCompatibleProvider,
        credentials,
      } = await getPhaseModelWithOverrides(
        'commitMessageModel',
        settingsService,
        worktreePath,
        '[GeneratePRDescription]'
      );
      const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

      logger.info(
        `Using model for PR description: ${model}`,
        claudeCompatibleProvider ? `via provider: ${claudeCompatibleProvider.name}` : 'direct API'
      );

      // Get provider for the model type
      const aiProvider = ProviderFactory.getProviderForModel(model);
      const bareModel = stripProviderPrefix(model);

      // For Cursor models, combine prompts
      const effectivePrompt = isCursorModel(model)
        ? `${PR_DESCRIPTION_SYSTEM_PROMPT}\n\n${userPrompt}`
        : userPrompt;
      const effectiveSystemPrompt = isCursorModel(model) ? undefined : PR_DESCRIPTION_SYSTEM_PROMPT;

      logger.info(`Using ${aiProvider.getName()} provider for model: ${model}`);

      let responseText = '';
      const stream = aiProvider.executeQuery({
        prompt: effectivePrompt,
        model: bareModel,
        cwd: worktreePath,
        systemPrompt: effectiveSystemPrompt,
        maxTurns: 1,
        allowedTools: [],
        readOnly: true,
        thinkingLevel,
        claudeCompatibleProvider,
        credentials,
      });

      // Wrap with timeout
      for await (const msg of withTimeout(stream, AI_TIMEOUT_MS)) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              responseText += block.text;
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
          // Use result text if longer than accumulated text (consistent with simpleQuery pattern)
          if (msg.result.length > responseText.length) {
            responseText = msg.result;
          }
        }
      }

      const fullResponse = responseText.trim();

      if (!fullResponse || fullResponse.length === 0) {
        logger.warn('Received empty response from model');
        const response: GeneratePRDescriptionErrorResponse = {
          success: false,
          error: 'Failed to generate PR description - empty response',
        };
        res.status(500).json(response);
        return;
      }

      // Parse the response to extract title and body.
      // The model may include conversational preamble before the structured markers,
      // so we search for the markers anywhere in the response, not just at the start.
      let title = '';
      let body = '';

      const titleMatch = fullResponse.match(/---TITLE---\s*\n([\s\S]*?)(?=---BODY---|$)/);
      const bodyMatch = fullResponse.match(/---BODY---\s*\n([\s\S]*?)$/);

      if (titleMatch && bodyMatch) {
        title = titleMatch[1].trim();
        body = bodyMatch[1].trim();
      } else {
        // Fallback: try to extract meaningful content, skipping any conversational preamble.
        // Common preamble patterns start with "I'll", "I will", "Here", "Let me", "Based on", etc.
        const lines = fullResponse.split('\n').filter((line) => line.trim().length > 0);

        // Skip lines that look like conversational preamble
        let startIndex = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          // Check if this line looks like conversational AI preamble
          if (
            /^(I'll|I will|Here('s| is| are)|Let me|Based on|Looking at|Analyzing|Sure|OK|Okay|Of course)/i.test(
              line
            ) ||
            /^(The following|Below is|This (is|will)|After (analyzing|reviewing|looking))/i.test(
              line
            )
          ) {
            startIndex = i + 1;
            continue;
          }
          break;
        }

        // Use remaining lines after skipping preamble
        const contentLines = lines.slice(startIndex);
        if (contentLines.length > 0) {
          title = contentLines[0].trim();
          body = contentLines.slice(1).join('\n').trim();
        } else {
          // If all lines were filtered as preamble, use the original first non-empty line
          title = lines[0]?.trim() || '';
          body = lines.slice(1).join('\n').trim();
        }
      }

      // Clean up title - remove any markdown headings, quotes, or marker artifacts
      title = title
        .replace(/^#+\s*/, '')
        .replace(/^["']|["']$/g, '')
        .replace(/^---\w+---\s*/, '');

      logger.info(`Generated PR title: ${title.substring(0, 100)}...`);

      const response: GeneratePRDescriptionSuccessResponse = {
        success: true,
        title,
        body,
      };
      res.json(response);
    } catch (error) {
      logError(error, 'Generate PR description failed');
      const response: GeneratePRDescriptionErrorResponse = {
        success: false,
        error: getErrorMessage(error),
      };
      res.status(500).json(response);
    }
  };
}
