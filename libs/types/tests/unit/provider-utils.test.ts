import { describe, it, expect } from 'vitest';
import {
  validateBareModelId,
  stripProviderPrefix,
  isCursorModel,
  isGeminiModel,
  isCodexModel,
  isCopilotModel,
  isOpencodeModel,
  PROVIDER_PREFIXES,
  type ModelProvider,
} from '@automaker/types';

describe('provider-utils.ts', () => {
  describe('validateBareModelId', () => {
    describe('without expectedProvider parameter', () => {
      it('should accept valid bare model IDs', () => {
        expect(() => validateBareModelId('gpt-4', 'TestProvider')).not.toThrow();
        expect(() => validateBareModelId('claude-3-opus', 'TestProvider')).not.toThrow();
        expect(() => validateBareModelId('2.5-flash', 'TestProvider')).not.toThrow();
        expect(() => validateBareModelId('composer-1', 'TestProvider')).not.toThrow();
      });

      it('should reject model IDs with cursor- prefix', () => {
        expect(() =>
          validateBareModelId('cursor-gpt-4', 'TestProvider')
        ).toThrowErrorMatchingSnapshot();
        expect(() =>
          validateBareModelId('cursor-composer-1', 'TestProvider')
        ).toThrowErrorMatchingSnapshot();
      });

      it('should reject model IDs with gemini- prefix', () => {
        expect(() =>
          validateBareModelId('gemini-2.5-flash', 'TestProvider')
        ).toThrowErrorMatchingSnapshot();
        expect(() =>
          validateBareModelId('gemini-2.5-pro', 'TestProvider')
        ).toThrowErrorMatchingSnapshot();
      });

      it('should reject model IDs with codex- prefix', () => {
        expect(() =>
          validateBareModelId('codex-gpt-4', 'TestProvider')
        ).toThrowErrorMatchingSnapshot();
      });

      it('should reject model IDs with copilot- prefix', () => {
        expect(() =>
          validateBareModelId('copilot-gpt-4', 'TestProvider')
        ).toThrowErrorMatchingSnapshot();
      });

      it('should reject model IDs with opencode- prefix', () => {
        expect(() =>
          validateBareModelId('opencode-gpt-4', 'TestProvider')
        ).toThrowErrorMatchingSnapshot();
      });

      it('should throw error for non-string model ID', () => {
        // @ts-expect-error - testing invalid input
        expect(() => validateBareModelId(null, 'TestProvider')).toThrow(
          '[TestProvider] Invalid model ID: expected string, got object'
        );
        // @ts-expect-error - testing invalid input
        expect(() => validateBareModelId(undefined, 'TestProvider')).toThrow(
          '[TestProvider] Invalid model ID: expected string, got undefined'
        );
        // @ts-expect-error - testing invalid input
        expect(() => validateBareModelId(123, 'TestProvider')).toThrow(
          '[TestProvider] Invalid model ID: expected string, got number'
        );
      });

      it('should throw error for empty string model ID', () => {
        expect(() => validateBareModelId('', 'TestProvider')).toThrow(
          '[TestProvider] Invalid model ID: expected string, got string'
        );
      });
    });

    describe('with expectedProvider parameter', () => {
      it('should allow cursor- prefixed models when expectedProvider is "cursor"', () => {
        expect(() => validateBareModelId('cursor-gpt-4', 'CursorProvider', 'cursor')).not.toThrow();
        expect(() =>
          validateBareModelId('cursor-composer-1', 'CursorProvider', 'cursor')
        ).not.toThrow();
      });

      it('should allow gemini- prefixed models when expectedProvider is "gemini"', () => {
        expect(() =>
          validateBareModelId('gemini-2.5-flash', 'GeminiProvider', 'gemini')
        ).not.toThrow();
        expect(() =>
          validateBareModelId('gemini-2.5-pro', 'GeminiProvider', 'gemini')
        ).not.toThrow();
      });

      it('should allow codex- prefixed models when expectedProvider is "codex"', () => {
        expect(() => validateBareModelId('codex-gpt-4', 'CodexProvider', 'codex')).not.toThrow();
      });

      it('should allow copilot- prefixed models when expectedProvider is "copilot"', () => {
        expect(() =>
          validateBareModelId('copilot-gpt-4', 'CopilotProvider', 'copilot')
        ).not.toThrow();
      });

      it('should allow opencode- prefixed models when expectedProvider is "opencode"', () => {
        expect(() =>
          validateBareModelId('opencode-gpt-4', 'OpencodeProvider', 'opencode')
        ).not.toThrow();
      });

      describe('Cursor Gemini models edge case', () => {
        it('should allow gemini- prefixed models for Cursor provider when expectedProvider is "cursor"', () => {
          // This is the key fix for Cursor Gemini models
          // Cursor's Gemini models have bare IDs like "gemini-3-pro" that start with "gemini-"
          // but they're Cursor models, not Gemini models
          expect(() =>
            validateBareModelId('gemini-3-pro', 'CursorProvider', 'cursor')
          ).not.toThrow();
          expect(() =>
            validateBareModelId('gemini-3-flash', 'CursorProvider', 'cursor')
          ).not.toThrow();
        });

        it('should still reject other provider prefixes for Cursor provider', () => {
          // Cursor should NOT receive models with codex- prefix
          expect(() => validateBareModelId('codex-gpt-4', 'CursorProvider', 'cursor')).toThrow();
          // Cursor should NOT receive models with copilot- prefix
          expect(() => validateBareModelId('copilot-gpt-4', 'CursorProvider', 'cursor')).toThrow();
        });

        it('should allow gemini- prefixed models for Gemini provider when expectedProvider is "gemini"', () => {
          // Gemini provider should also be able to receive its own prefixed models
          expect(() =>
            validateBareModelId('gemini-2.5-flash', 'GeminiProvider', 'gemini')
          ).not.toThrow();
          expect(() =>
            validateBareModelId('gemini-2.5-pro', 'GeminiProvider', 'gemini')
          ).not.toThrow();
        });
      });

      it('should reject non-matching provider prefixes even with expectedProvider set', () => {
        // Even with expectedProvider set to "cursor", should still reject "codex-" prefix
        expect(() =>
          validateBareModelId('codex-gpt-4', 'CursorProvider', 'cursor')
        ).toThrowErrorMatchingSnapshot();

        // Even with expectedProvider set to "gemini", should still reject "cursor-" prefix
        expect(() =>
          validateBareModelId('cursor-gpt-4', 'GeminiProvider', 'gemini')
        ).toThrowErrorMatchingSnapshot();
      });
    });
  });

  describe('stripProviderPrefix', () => {
    it('should strip cursor- prefix from Cursor models', () => {
      expect(stripProviderPrefix('cursor-gpt-4')).toBe('gpt-4');
      expect(stripProviderPrefix('cursor-composer-1')).toBe('composer-1');
      expect(stripProviderPrefix('cursor-gemini-3-pro')).toBe('gemini-3-pro');
    });

    it('should strip gemini- prefix from Gemini models', () => {
      expect(stripProviderPrefix('gemini-2.5-flash')).toBe('2.5-flash');
      expect(stripProviderPrefix('gemini-2.5-pro')).toBe('2.5-pro');
    });

    it('should strip codex- prefix from Codex models', () => {
      expect(stripProviderPrefix('codex-gpt-4')).toBe('gpt-4');
    });

    it('should strip copilot- prefix from Copilot models', () => {
      expect(stripProviderPrefix('copilot-gpt-4')).toBe('gpt-4');
    });

    it('should strip opencode- prefix from Opencode models', () => {
      expect(stripProviderPrefix('opencode-gpt-4')).toBe('gpt-4');
    });

    it('should return unchanged model ID if no provider prefix', () => {
      expect(stripProviderPrefix('gpt-4')).toBe('gpt-4');
      expect(stripProviderPrefix('claude-3-opus')).toBe('claude-3-opus');
      expect(stripProviderPrefix('2.5-flash')).toBe('2.5-flash');
    });

    it('should only strip the first matching prefix', () => {
      // cursor-gemini-3-pro has both cursor- and gemini- prefixes
      // Should strip cursor- first (it's checked first in PROVIDER_PREFIXES)
      expect(stripProviderPrefix('cursor-gemini-3-pro')).toBe('gemini-3-pro');
    });

    it('should handle empty string', () => {
      expect(stripProviderPrefix('')).toBe('');
    });
  });

  describe('Model identification functions', () => {
    describe('isCursorModel', () => {
      it('should return true for Cursor models', () => {
        expect(isCursorModel('cursor-gpt-4')).toBe(true);
        expect(isCursorModel('cursor-composer-1')).toBe(true);
        expect(isCursorModel('cursor-gemini-3-pro')).toBe(true);
        expect(isCursorModel('cursor-gemini-3-flash')).toBe(true);
      });

      it('should return false for non-Cursor models', () => {
        expect(isCursorModel('gpt-4')).toBe(false);
        expect(isCursorModel('gemini-2.5-flash')).toBe(false);
        expect(isCursorModel('codex-gpt-4')).toBe(false);
      });
    });

    describe('isGeminiModel', () => {
      it('should return true for Gemini models', () => {
        expect(isGeminiModel('gemini-2.5-flash')).toBe(true);
        expect(isGeminiModel('gemini-2.5-pro')).toBe(true);
        expect(isGeminiModel('gemini-1.5-flash')).toBe(true);
      });

      it('should return false for Cursor Gemini models (they are Cursor models, not Gemini models)', () => {
        expect(isGeminiModel('cursor-gemini-3-pro')).toBe(false);
        expect(isGeminiModel('cursor-gemini-3-flash')).toBe(false);
      });

      it('should return false for non-Gemini models', () => {
        expect(isGeminiModel('gpt-4')).toBe(false);
        expect(isGeminiModel('cursor-gpt-4')).toBe(false);
        expect(isGeminiModel('codex-gpt-4')).toBe(false);
      });
    });

    describe('isCodexModel', () => {
      it('should return true for Codex models', () => {
        expect(isCodexModel('codex-gpt-4')).toBe(true);
        expect(isCodexModel('codex-gpt-5.1-codex-max')).toBe(true);
      });

      it('should return false for non-Codex models', () => {
        // Note: gpt- models ARE Codex models according to the implementation
        // because bare gpt models go to Codex, not Cursor
        expect(isCodexModel('cursor-gpt-4')).toBe(false);
        expect(isCodexModel('gemini-2.5-flash')).toBe(false);
        expect(isCodexModel('claude-3-opus')).toBe(false);
      });
    });

    describe('isCopilotModel', () => {
      it('should return true for Copilot models', () => {
        expect(isCopilotModel('copilot-gpt-4')).toBe(true);
      });

      it('should return false for non-Copilot models', () => {
        expect(isCopilotModel('gpt-4')).toBe(false);
        expect(isCopilotModel('cursor-gpt-4')).toBe(false);
      });
    });

    describe('isOpencodeModel', () => {
      it('should return true for Opencode models', () => {
        expect(isOpencodeModel('opencode-gpt-4')).toBe(true);
      });

      it('should return false for non-Opencode models', () => {
        expect(isOpencodeModel('gpt-4')).toBe(false);
        expect(isOpencodeModel('cursor-gpt-4')).toBe(false);
      });
    });
  });

  describe('PROVIDER_PREFIXES', () => {
    it('should contain all expected provider prefixes', () => {
      expect(PROVIDER_PREFIXES).toEqual({
        cursor: 'cursor-',
        gemini: 'gemini-',
        codex: 'codex-',
        copilot: 'copilot-',
        opencode: 'opencode-',
      });
    });
  });
});
