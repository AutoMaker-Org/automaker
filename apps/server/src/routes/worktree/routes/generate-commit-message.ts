/**
 * POST /worktree/generate-commit-message endpoint - Generate an AI commit message from git diff
 *
 * Uses the configured model (via phaseModels.commitMessageModel) to generate a concise,
 * conventional commit message from git changes. Defaults to Claude Haiku for speed.
 */

import type { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@automaker/utils';
import { isCursorModel, stripProviderPrefix } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { mergeCommitMessagePrompts } from '@automaker/prompts';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage, logError } from '../common.js';
import { getPhaseModelWithOverrides } from '../../../lib/settings-helpers.js';

const logger = createLogger('GenerateCommitMessage');
const execFileAsync = promisify(execFile);

/** Timeout for AI provider calls in milliseconds (30 seconds) */
const AI_TIMEOUT_MS = 30_000;

/**
 * Wraps an async generator with a timeout.
 * If the generator takes longer than the timeout, it throws an error.
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
        // Capture the original error, then attempt to close the iterator.
        // If iterator.return() throws, log it but rethrow the original error
        // so the timeout error (not the teardown error) is preserved.
        try {
          await iterator.return?.();
        } catch (teardownErr) {
          logger.warn('Error during iterator cleanup after timeout:', teardownErr);
        }
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

/**
 * Get the effective system prompt for commit message generation.
 * Uses custom prompt from settings if enabled, otherwise falls back to default.
 */
async function getSystemPrompt(settingsService?: SettingsService): Promise<string> {
  const settings = await settingsService?.getGlobalSettings();
  const prompts = mergeCommitMessagePrompts(settings?.promptCustomization?.commitMessage);
  return prompts.systemPrompt;
}

interface GenerateCommitMessageRequestBody {
  worktreePath: string;
}

interface GenerateCommitMessageSuccessResponse {
  success: true;
  message: string;
}

interface GenerateCommitMessageErrorResponse {
  success: false;
  error: string;
}

export function createGenerateCommitMessageHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as GenerateCommitMessageRequestBody;

      if (!worktreePath || typeof worktreePath !== 'string') {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'worktreePath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate that the directory exists
      if (!existsSync(worktreePath)) {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'worktreePath does not exist',
        };
        res.status(400).json(response);
        return;
      }

      // Validate that it's a git repository (check for .git folder or file for worktrees)
      const gitPath = join(worktreePath, '.git');
      if (!existsSync(gitPath)) {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'worktreePath is not a git repository',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`Generating commit message for worktree: ${worktreePath}`);

      // Get git diff of staged and unstaged changes
      let diff = '';
      try {
        // First try to get staged changes
        const { stdout: stagedDiff } = await execFileAsync('git', ['diff', '--cached'], {
          cwd: worktreePath,
          maxBuffer: 1024 * 1024 * 5, // 5MB buffer
        });

        // If no staged changes, get unstaged changes
        if (!stagedDiff.trim()) {
          const { stdout: unstagedDiff } = await execFileAsync('git', ['diff'], {
            cwd: worktreePath,
            maxBuffer: 1024 * 1024 * 5, // 5MB buffer
          });
          diff = unstagedDiff;
        } else {
          diff = stagedDiff;
        }
      } catch (error) {
        logger.error('Failed to get git diff:', error);
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'Failed to get git changes',
        };
        res.status(500).json(response);
        return;
      }

      if (!diff.trim()) {
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'No changes to commit',
        };
        res.status(400).json(response);
        return;
      }

      // Truncate diff if too long (keep first 10000 characters to avoid token limits)
      const truncatedDiff =
        diff.length > 10000 ? diff.substring(0, 10000) + '\n\n[... diff truncated ...]' : diff;

      const userPrompt = `Generate a commit message for these changes:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;

      // Get model from phase settings with provider info
      const {
        phaseModel: phaseModelEntry,
        provider: claudeCompatibleProvider,
        credentials,
      } = await getPhaseModelWithOverrides(
        'commitMessageModel',
        settingsService,
        worktreePath,
        '[GenerateCommitMessage]'
      );
      const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

      logger.info(
        `Using model for commit message: ${model}`,
        claudeCompatibleProvider ? `via provider: ${claudeCompatibleProvider.name}` : 'direct API'
      );

      // Get the effective system prompt (custom or default)
      const systemPrompt = await getSystemPrompt(settingsService);

      // Get provider for the model type
      const aiProvider = ProviderFactory.getProviderForModel(model);
      const bareModel = stripProviderPrefix(model);

      // For Cursor models, combine prompts since Cursor doesn't support systemPrompt separation
      const effectivePrompt = isCursorModel(model)
        ? `${systemPrompt}\n\n${userPrompt}`
        : userPrompt;
      const effectiveSystemPrompt = isCursorModel(model) ? undefined : systemPrompt;

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
        thinkingLevel, // Pass thinking level for extended thinking support
        claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
        credentials, // Pass credentials for resolving 'credentials' apiKeySource
      });

      // Wrap with timeout to prevent indefinite hangs
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

      const message = responseText.trim();

      if (!message) {
        logger.warn('Received empty response from model');
        const response: GenerateCommitMessageErrorResponse = {
          success: false,
          error: 'Failed to generate commit message - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Generated commit message: ${message.trim().substring(0, 100)}...`);

      const response: GenerateCommitMessageSuccessResponse = {
        success: true,
        message: message.trim(),
      };
      res.json(response);
    } catch (error) {
      logError(error, 'Generate commit message failed');
      const response: GenerateCommitMessageErrorResponse = {
        success: false,
        error: getErrorMessage(error),
      };
      res.status(500).json(response);
    }
  };
}
