/**
 * Unit tests for agent-context-parser.ts
 * Tests the formatModelName function with provider-aware model name lookup
 */

import { describe, it, expect } from 'vitest';
import {
  formatModelName,
  DEFAULT_MODEL,
  type FormatModelNameOptions,
} from '../../../src/lib/agent-context-parser';
import type { ClaudeCompatibleProvider, ProviderModel } from '@automaker/types';

describe('agent-context-parser.ts', () => {
  describe('DEFAULT_MODEL', () => {
    it('should be claude-opus-4-6', () => {
      expect(DEFAULT_MODEL).toBe('claude-opus-4-6');
    });
  });

  describe('formatModelName', () => {
    describe('Provider-aware lookup', () => {
      it('should return provider displayName when providerId matches and model is found', () => {
        const providers: ClaudeCompatibleProvider[] = [
          {
            id: 'moonshot-ai',
            name: 'Moonshot AI',
            models: [
              { id: 'claude-sonnet-4-5', displayName: 'Moonshot v1.8' },
              { id: 'claude-opus-4-6', displayName: 'Moonshot v1.8 Pro' },
            ],
          },
        ];

        const options: FormatModelNameOptions = {
          providerId: 'moonshot-ai',
          claudeCompatibleProviders: providers,
        };

        expect(formatModelName('claude-sonnet-4-5', options)).toBe('Moonshot v1.8');
        expect(formatModelName('claude-opus-4-6', options)).toBe('Moonshot v1.8 Pro');
      });

      it('should return provider displayName for GLM models', () => {
        const providers: ClaudeCompatibleProvider[] = [
          {
            id: 'zhipu',
            name: 'Zhipu AI',
            models: [
              { id: 'claude-sonnet-4-5', displayName: 'GLM 4.7' },
              { id: 'claude-opus-4-6', displayName: 'GLM 4.7 Pro' },
            ],
          },
        ];

        const options: FormatModelNameOptions = {
          providerId: 'zhipu',
          claudeCompatibleProviders: providers,
        };

        expect(formatModelName('claude-sonnet-4-5', options)).toBe('GLM 4.7');
      });

      it('should return provider displayName for MiniMax models', () => {
        const providers: ClaudeCompatibleProvider[] = [
          {
            id: 'minimax',
            name: 'MiniMax',
            models: [
              { id: 'claude-sonnet-4-5', displayName: 'MiniMax M2.1' },
              { id: 'claude-opus-4-6', displayName: 'MiniMax M2.1 Pro' },
            ],
          },
        ];

        const options: FormatModelNameOptions = {
          providerId: 'minimax',
          claudeCompatibleProviders: providers,
        };

        expect(formatModelName('claude-sonnet-4-5', options)).toBe('MiniMax M2.1');
      });

      it('should fallback to default formatting when providerId is not found', () => {
        const providers: ClaudeCompatibleProvider[] = [
          {
            id: 'moonshot-ai',
            name: 'Moonshot AI',
            models: [{ id: 'claude-sonnet-4-5', displayName: 'Moonshot v1.8' }],
          },
        ];

        const options: FormatModelNameOptions = {
          providerId: 'unknown-provider',
          claudeCompatibleProviders: providers,
        };

        // Should fall through to default Claude formatting
        expect(formatModelName('claude-sonnet-4-5', options)).toBe('Sonnet 4.5');
      });

      it('should fallback to default formatting when model is not in provider models', () => {
        const providers: ClaudeCompatibleProvider[] = [
          {
            id: 'moonshot-ai',
            name: 'Moonshot AI',
            models: [{ id: 'claude-sonnet-4-5', displayName: 'Moonshot v1.8' }],
          },
        ];

        const options: FormatModelNameOptions = {
          providerId: 'moonshot-ai',
          claudeCompatibleProviders: providers,
        };

        // Model not in provider's list, should use default
        expect(formatModelName('claude-haiku-4-5', options)).toBe('Haiku 4.5');
      });

      it('should handle empty providers array', () => {
        const options: FormatModelNameOptions = {
          providerId: 'moonshot-ai',
          claudeCompatibleProviders: [],
        };

        expect(formatModelName('claude-sonnet-4-5', options)).toBe('Sonnet 4.5');
      });

      it('should handle provider with no models array', () => {
        const providers: ClaudeCompatibleProvider[] = [
          {
            id: 'moonshot-ai',
            name: 'Moonshot AI',
          },
        ];

        const options: FormatModelNameOptions = {
          providerId: 'moonshot-ai',
          claudeCompatibleProviders: providers,
        };

        expect(formatModelName('claude-sonnet-4-5', options)).toBe('Sonnet 4.5');
      });

      it('should handle model with no displayName', () => {
        const providers: ClaudeCompatibleProvider[] = [
          {
            id: 'moonshot-ai',
            name: 'Moonshot AI',
            models: [{ id: 'claude-sonnet-4-5' } as unknown as ProviderModel], // No displayName
          },
        ];

        const options: FormatModelNameOptions = {
          providerId: 'moonshot-ai',
          claudeCompatibleProviders: providers,
        };

        expect(formatModelName('claude-sonnet-4-5', options)).toBe('Sonnet 4.5');
      });

      it('should ignore provider lookup when providerId is undefined', () => {
        const providers: ClaudeCompatibleProvider[] = [
          {
            id: 'moonshot-ai',
            name: 'Moonshot AI',
            models: [{ id: 'claude-sonnet-4-5', displayName: 'Moonshot v1.8' }],
          },
        ];

        const options: FormatModelNameOptions = {
          providerId: undefined,
          claudeCompatibleProviders: providers,
        };

        expect(formatModelName('claude-sonnet-4-5', options)).toBe('Sonnet 4.5');
      });

      it('should ignore provider lookup when claudeCompatibleProviders is undefined', () => {
        const options: FormatModelNameOptions = {
          providerId: 'moonshot-ai',
          claudeCompatibleProviders: undefined,
        };

        expect(formatModelName('claude-sonnet-4-5', options)).toBe('Sonnet 4.5');
      });

      it('should use default formatting when no options provided', () => {
        expect(formatModelName('claude-sonnet-4-5')).toBe('Sonnet 4.5');
        expect(formatModelName('claude-opus-4-6')).toBe('Opus 4.6');
      });

      it('should handle OpenRouter provider with multiple models', () => {
        const providers: ClaudeCompatibleProvider[] = [
          {
            id: 'openrouter',
            name: 'OpenRouter',
            models: [
              { id: 'claude-sonnet-4-5', displayName: 'Claude Sonnet (OpenRouter)' },
              { id: 'claude-opus-4-6', displayName: 'Claude Opus (OpenRouter)' },
              { id: 'gpt-4o', displayName: 'GPT-4o (OpenRouter)' },
            ],
          },
        ];

        const options: FormatModelNameOptions = {
          providerId: 'openrouter',
          claudeCompatibleProviders: providers,
        };

        expect(formatModelName('claude-sonnet-4-5', options)).toBe('Claude Sonnet (OpenRouter)');
        expect(formatModelName('claude-opus-4-6', options)).toBe('Claude Opus (OpenRouter)');
        expect(formatModelName('gpt-4o', options)).toBe('GPT-4o (OpenRouter)');
      });
    });

    describe('Claude model formatting (default)', () => {
      it('should format claude-opus-4-6 as Opus 4.6', () => {
        expect(formatModelName('claude-opus-4-6')).toBe('Opus 4.6');
      });

      it('should format claude-opus as Opus 4.6', () => {
        expect(formatModelName('claude-opus')).toBe('Opus 4.6');
      });

      it('should format other opus models as Opus 4.5', () => {
        expect(formatModelName('claude-opus-4-5')).toBe('Opus 4.5');
        expect(formatModelName('claude-3-opus')).toBe('Opus 4.5');
      });

      it('should format claude-sonnet-4-6 as Sonnet 4.6', () => {
        expect(formatModelName('claude-sonnet-4-6')).toBe('Sonnet 4.6');
      });

      it('should format claude-sonnet as Sonnet 4.6', () => {
        expect(formatModelName('claude-sonnet')).toBe('Sonnet 4.6');
      });

      it('should format other sonnet models as Sonnet 4.5', () => {
        expect(formatModelName('claude-sonnet-4-5')).toBe('Sonnet 4.5');
        expect(formatModelName('claude-3-sonnet')).toBe('Sonnet 4.5');
      });

      it('should format haiku models as Haiku 4.5', () => {
        expect(formatModelName('claude-haiku-4-5')).toBe('Haiku 4.5');
        expect(formatModelName('claude-3-haiku')).toBe('Haiku 4.5');
        expect(formatModelName('claude-haiku')).toBe('Haiku 4.5');
      });
    });

    describe('Codex/GPT model formatting', () => {
      it('should format codex-gpt-5.3-codex as GPT-5.3 Codex', () => {
        expect(formatModelName('codex-gpt-5.3-codex')).toBe('GPT-5.3 Codex');
      });

      it('should format codex-gpt-5.2-codex as GPT-5.2 Codex', () => {
        expect(formatModelName('codex-gpt-5.2-codex')).toBe('GPT-5.2 Codex');
      });

      it('should format codex-gpt-5.2 as GPT-5.2', () => {
        expect(formatModelName('codex-gpt-5.2')).toBe('GPT-5.2');
      });

      it('should format codex-gpt-5.1-codex-max as GPT-5.1 Max', () => {
        expect(formatModelName('codex-gpt-5.1-codex-max')).toBe('GPT-5.1 Max');
      });

      it('should format codex-gpt-5.1-codex-mini as GPT-5.1 Mini', () => {
        expect(formatModelName('codex-gpt-5.1-codex-mini')).toBe('GPT-5.1 Mini');
      });

      it('should format codex-gpt-5.1 as GPT-5.1', () => {
        expect(formatModelName('codex-gpt-5.1')).toBe('GPT-5.1');
      });

      it('should format gpt- prefixed models in uppercase', () => {
        expect(formatModelName('gpt-4o')).toBe('GPT-4O');
        expect(formatModelName('gpt-4-turbo')).toBe('GPT-4-TURBO');
      });

      it('should format o-prefixed models (o1, o3, etc.) in uppercase', () => {
        expect(formatModelName('o1')).toBe('O1');
        expect(formatModelName('o1-mini')).toBe('O1-MINI');
        expect(formatModelName('o3')).toBe('O3');
      });
    });

    describe('Cursor model formatting', () => {
      it('should format cursor-auto as Cursor Auto', () => {
        expect(formatModelName('cursor-auto')).toBe('Cursor Auto');
      });

      it('should format auto as Cursor Auto', () => {
        expect(formatModelName('auto')).toBe('Cursor Auto');
      });

      it('should format cursor-composer-1 as Composer 1', () => {
        expect(formatModelName('cursor-composer-1')).toBe('Composer 1');
      });

      it('should format composer-1 as Composer 1', () => {
        expect(formatModelName('composer-1')).toBe('Composer 1');
      });

      it('should format cursor-sonnet (but falls through to Sonnet due to earlier check)', () => {
        // Note: The earlier 'sonnet' check in the function matches first
        expect(formatModelName('cursor-sonnet')).toBe('Sonnet 4.5');
        expect(formatModelName('cursor-sonnet-4-5')).toBe('Sonnet 4.5');
      });

      it('should format cursor-opus (but falls through to Opus due to earlier check)', () => {
        // Note: The earlier 'opus' check in the function matches first
        expect(formatModelName('cursor-opus')).toBe('Opus 4.5');
        expect(formatModelName('cursor-opus-4-6')).toBe('Opus 4.6');
      });

      it('should format cursor-gpt models', () => {
        // cursor-gpt-4 becomes gpt-4 then GPT-4 (case preserved)
        expect(formatModelName('cursor-gpt-4')).toBe('GPT-4');
        // cursor-gpt-4o becomes gpt-4o then GPT-4o (not uppercase o)
        expect(formatModelName('cursor-gpt-4o')).toBe('GPT-4o');
      });

      it('should format cursor-gemini models', () => {
        // cursor-gemini-pro -> Cursor gemini-pro -> Cursor Gemini-pro
        expect(formatModelName('cursor-gemini-pro')).toBe('Cursor Gemini-pro');
        // cursor-gemini-2 -> Cursor gemini-2 -> Cursor Gemini-2
        expect(formatModelName('cursor-gemini-2')).toBe('Cursor Gemini-2');
      });

      it('should format cursor-grok as Cursor Grok', () => {
        expect(formatModelName('cursor-grok')).toBe('Cursor Grok');
      });
    });

    describe('Unknown model formatting (fallback)', () => {
      it('should format unknown models by splitting and joining parts', () => {
        // The fallback splits by dash and joins parts 1 and 2 (indices 1 and 2)
        expect(formatModelName('unknown-model-name')).toBe('model name');
        expect(formatModelName('some-random-model')).toBe('random model');
      });

      it('should handle models with fewer parts', () => {
        expect(formatModelName('single')).toBe(''); // slice(1,3) on ['single'] = []
        expect(formatModelName('two-parts')).toBe('parts'); // slice(1,3) on ['two', 'parts'] = ['parts']
      });
    });
  });
});
