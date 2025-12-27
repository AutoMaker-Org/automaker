/**
 * GET /available endpoint - Get available models
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';

interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
}

export function createAvailableHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const models: ModelDefinition[] = [
        {
          id: 'gpt-5.2-codex',
          name: 'GPT-5.2 Codex',
          provider: 'codex',
          contextWindow: 256000,
          maxOutputTokens: 32000,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'gpt-5.2',
          name: 'GPT-5.2',
          provider: 'codex',
          contextWindow: 256000,
          maxOutputTokens: 32000,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'gpt-5.1-codex-max',
          name: 'GPT-5.1 Codex Max',
          provider: 'codex',
          contextWindow: 256000,
          maxOutputTokens: 32000,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'gpt-5.1-codex',
          name: 'GPT-5.1 Codex',
          provider: 'codex',
          contextWindow: 256000,
          maxOutputTokens: 32000,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'gpt-5.1-codex-mini',
          name: 'GPT-5.1 Codex Mini',
          provider: 'codex',
          contextWindow: 256000,
          maxOutputTokens: 16000,
          supportsVision: false,
          supportsTools: true,
        },
        {
          id: 'gpt-5.1',
          name: 'GPT-5.1',
          provider: 'codex',
          contextWindow: 256000,
          maxOutputTokens: 32000,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'gpt-5-codex',
          name: 'GPT-5 Codex',
          provider: 'codex',
          contextWindow: 256000,
          maxOutputTokens: 32000,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'gpt-5-codex-mini',
          name: 'GPT-5 Codex Mini',
          provider: 'codex',
          contextWindow: 256000,
          maxOutputTokens: 16000,
          supportsVision: false,
          supportsTools: true,
        },
        {
          id: 'gpt-5',
          name: 'GPT-5',
          provider: 'codex',
          contextWindow: 256000,
          maxOutputTokens: 32000,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'auto',
          name: 'Cursor Auto',
          provider: 'cursor',
          contextWindow: 0,
          maxOutputTokens: 0,
          supportsVision: false,
          supportsTools: true,
        },
        {
          id: 'glm4.7',
          name: 'GLM 4.7 (OpenCode)',
          provider: 'opencode',
          contextWindow: 128000,
          maxOutputTokens: 4096,
          supportsVision: false,
          supportsTools: true,
        },
        {
          id: 'claude-opus-4-5-20251101',
          name: 'Claude Opus 4.5',
          provider: 'anthropic',
          contextWindow: 200000,
          maxOutputTokens: 16384,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          provider: 'anthropic',
          contextWindow: 200000,
          maxOutputTokens: 16384,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          provider: 'anthropic',
          contextWindow: 200000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: 'claude-3-5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
          provider: 'anthropic',
          contextWindow: 200000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
        },
      ];

      res.json({ success: true, models });
    } catch (error) {
      logError(error, 'Get available models failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
