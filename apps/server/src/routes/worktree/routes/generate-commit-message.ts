/**
 * POST /worktree/generate-commit-message endpoint - Generate an AI commit message from git diff
 *
 * Uses the configured model (via phaseModels.commitMessageModel) to generate a concise,
 * conventional commit message from git changes. Defaults to Claude Haiku for speed.
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@automaker/utils';
import { DEFAULT_PHASE_MODELS, isCursorModel, stripProviderPrefix } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { mergeCommitMessagePrompts, prependLanguageInstruction } from '@automaker/prompts';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('GenerateCommitMessage');
const execAsync = promisify(exec);

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
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`AI provider timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  const iterator = generator[Symbol.asyncIterator]();
  let done = false;

  while (!done) {
    const result = await Promise.race([iterator.next(), timeoutPromise]);
    if (result.done) {
      done = true;
    } else {
      yield result.value;
    }
  }
}

/**
 * Get the effective system prompt for commit message generation.
 * Uses custom prompt from settings if enabled, otherwise falls back to default.
 * Applies language instruction if enabled in settings.
 */
async function getSystemPrompt(settingsService?: SettingsService): Promise<string> {
  const settings = await settingsService?.getGlobalSettings();
  const prompts = mergeCommitMessagePrompts(settings?.promptCustomization?.commitMessage);
  const languageInstruction = settings?.languageInstruction;
  return prependLanguageInstruction(prompts.systemPrompt, languageInstruction);
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

async function extractTextFromStream(
  stream: AsyncIterable<{
    type: string;
    subtype?: string;
    result?: string;
    message?: {
      content?: Array<{ type: string; text?: string }>;
    };
  }>
): Promise<string> {
  let responseText = '';

  for await (const msg of stream) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          responseText += block.text;
        }
      }
    } else if (msg.type === 'result' && msg.subtype === 'success') {
      responseText = msg.result || responseText;
    }
  }

  return responseText;
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
        const { stdout: stagedDiff } = await execAsync('git diff --cached', {
          cwd: worktreePath,
          maxBuffer: 1024 * 1024 * 5, // 5MB buffer
        });

        // If no staged changes, get unstaged changes
        if (!stagedDiff.trim()) {
          const { stdout: unstagedDiff } = await execAsync('git diff', {
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

      // Get model from phase settings
      const settings = await settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.commitMessageModel || DEFAULT_PHASE_MODELS.commitMessageModel;
      const { model } = resolvePhaseModel(phaseModelEntry);

      logger.info(`Using model for commit message: ${model}`);

      // Get the effective system prompt (custom or default)
      const systemPrompt = await getSystemPrompt(settingsService);

      let message: string;

      // Route to appropriate provider based on model type
      if (isCursorModel(model)) {
        // Use Cursor provider for Cursor models
        logger.info(`Using Cursor provider for model: ${model}`);

        const provider = ProviderFactory.getProviderForModel(model);
        const bareModel = stripProviderPrefix(model);

        const cursorPrompt = `${systemPrompt}\n\n${userPrompt}`;

        let responseText = '';
        const cursorStream = provider.executeQuery({
          prompt: cursorPrompt,
          model: bareModel,
          cwd: worktreePath,
          maxTurns: 1,
          allowedTools: [],
          readOnly: true,
        });

        // Wrap with timeout to prevent indefinite hangs
        for await (const msg of withTimeout(cursorStream, AI_TIMEOUT_MS)) {
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                responseText += block.text;
              }
            }
          }
        }

        message = responseText.trim();
      } else {
        // Use Claude SDK for Claude models
        const stream = query({
          prompt: userPrompt,
          options: {
            model,
            systemPrompt,
            maxTurns: 1,
            allowedTools: [],
            permissionMode: 'default',
          },
        });

        // Wrap with timeout to prevent indefinite hangs
        message = await extractTextFromStream(withTimeout(stream, AI_TIMEOUT_MS));
      }

      if (!message || message.trim().length === 0) {
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
