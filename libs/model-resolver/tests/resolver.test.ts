import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveModelString, getEffectiveModel, resolvePhaseModel } from '../src/resolver';
import {
  CLAUDE_MODEL_MAP,
  CURSOR_MODEL_MAP,
  DEFAULT_MODELS,
  type PhaseModelEntry,
} from '@automaker/types';

describe('model-resolver', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('resolveModelString', () => {
    describe('with undefined/null input', () => {
      it('should return default model when modelKey is undefined', () => {
        const result = resolveModelString(undefined);
        expect(result).toBe(DEFAULT_MODELS.claude);
      });

      it('should return custom default when modelKey is undefined', () => {
        const customDefault = 'claude-opus-4-20241113';
        const result = resolveModelString(undefined, customDefault);
        expect(result).toBe(customDefault);
      });

      it('should return default when modelKey is empty string', () => {
        const result = resolveModelString('');
        expect(result).toBe(DEFAULT_MODELS.claude);
      });
    });

    describe('with full Claude model strings', () => {
      it('should pass through full Claude model string unchanged', () => {
        const fullModel = 'claude-sonnet-4-20250514';
        const result = resolveModelString(fullModel);

        expect(result).toBe(fullModel);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Using full Claude model string')
        );
      });

      it('should handle claude-opus model strings', () => {
        const fullModel = 'claude-opus-4-20241113';
        const result = resolveModelString(fullModel);

        expect(result).toBe(fullModel);
      });

      it('should handle claude-haiku model strings', () => {
        const fullModel = 'claude-3-5-haiku-20241022';
        const result = resolveModelString(fullModel);

        expect(result).toBe(fullModel);
      });

      it("should handle any string containing 'claude-'", () => {
        const customModel = 'claude-custom-experimental-v1';
        const result = resolveModelString(customModel);

        expect(result).toBe(customModel);
      });
    });

    describe('with model aliases', () => {
      it("should resolve 'sonnet' alias", () => {
        const result = resolveModelString('sonnet');

        expect(result).toBe(CLAUDE_MODEL_MAP.sonnet);
        // Legacy aliases are migrated to canonical IDs then resolved
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Migrated legacy ID: "sonnet" -> "claude-sonnet"')
        );
      });

      it("should resolve 'opus' alias", () => {
        const result = resolveModelString('opus');

        expect(result).toBe(CLAUDE_MODEL_MAP.opus);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Migrated legacy ID: "opus" -> "claude-opus"')
        );
      });

      it("should resolve 'haiku' alias", () => {
        const result = resolveModelString('haiku');

        expect(result).toBe(CLAUDE_MODEL_MAP.haiku);
      });

      it('should log the resolution for aliases', () => {
        resolveModelString('sonnet');

        // Legacy aliases get migrated and resolved via canonical map
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Resolved Claude canonical ID')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(CLAUDE_MODEL_MAP.sonnet)
        );
      });
    });

    describe('with Cursor models', () => {
      it('should pass through cursor-prefixed model unchanged', () => {
        const result = resolveModelString('cursor-composer-1');

        expect(result).toBe('cursor-composer-1');
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Using Cursor model'));
      });

      it('should handle cursor-auto model', () => {
        const result = resolveModelString('cursor-auto');

        expect(result).toBe('cursor-auto');
      });

      it('should handle cursor-gpt-4o model', () => {
        const result = resolveModelString('cursor-gpt-4o');

        expect(result).toBe('cursor-gpt-4o');
      });

      it('should add cursor- prefix to bare Cursor model IDs', () => {
        const result = resolveModelString('composer-1');

        expect(result).toBe('cursor-composer-1');
        // Legacy bare IDs are migrated to canonical prefixed format
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Migrated legacy ID: "composer-1" -> "cursor-composer-1"')
        );
      });

      it('should add cursor- prefix to auto model', () => {
        const result = resolveModelString('auto');

        expect(result).toBe('cursor-auto');
      });

      it('should pass through unknown cursor-prefixed models', () => {
        const result = resolveModelString('cursor-unknown-future-model');

        expect(result).toBe('cursor-unknown-future-model');
        // Unknown cursor-prefixed models pass through as Cursor models
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Using Cursor model'));
      });

      it('should handle all known Cursor model IDs', () => {
        // CURSOR_MODEL_MAP now uses prefixed keys (e.g., 'cursor-auto')
        const cursorModelIds = Object.keys(CURSOR_MODEL_MAP);

        for (const modelId of cursorModelIds) {
          // modelId is already prefixed (e.g., 'cursor-auto')
          const result = resolveModelString(modelId);
          expect(result).toBe(modelId);
        }
      });
    });

    describe('with unknown model keys (provider models)', () => {
      // Unknown models are now passed through unchanged to support
      // ClaudeCompatibleProvider models like GLM-4.7, MiniMax-M2.1, etc.
      it('should pass through unknown model key unchanged (may be provider model)', () => {
        const result = resolveModelString('unknown-model');

        expect(result).toBe('unknown-model');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('passing through unchanged')
        );
      });

      it('should pass through provider-like model names', () => {
        const glmModel = resolveModelString('GLM-4.7');
        const minimaxModel = resolveModelString('MiniMax-M2.1');

        expect(glmModel).toBe('GLM-4.7');
        expect(minimaxModel).toBe('MiniMax-M2.1');
      });

      it('should not warn about unknown model keys (they are valid provider models)', () => {
        resolveModelString('unknown-model');

        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });

      it('should ignore custom default for unknown model key (passthrough takes precedence)', () => {
        const customDefault = 'claude-opus-4-20241113';
        const result = resolveModelString('truly-unknown-model', customDefault);

        // Unknown models pass through unchanged, default is not used
        expect(result).toBe('truly-unknown-model');
      });
    });

    describe('case sensitivity', () => {
      it('should be case-sensitive for aliases', () => {
        const resultUpper = resolveModelString('SONNET');
        const resultLower = resolveModelString('sonnet');

        // Uppercase is passed through (could be a provider model)
        expect(resultUpper).toBe('SONNET');
        // Lowercase should resolve to Claude model
        expect(resultLower).toBe(CLAUDE_MODEL_MAP.sonnet);
      });

      it('should handle mixed case in claude- strings', () => {
        const result = resolveModelString('Claude-Sonnet-4-20250514');

        // Capital 'C' means it won't match 'claude-', passed through as provider model
        expect(result).toBe('Claude-Sonnet-4-20250514');
      });
    });

    describe('edge cases', () => {
      it('should handle model key with whitespace', () => {
        const result = resolveModelString('  sonnet  ');

        // Will not match due to whitespace, passed through as-is (could be provider model)
        expect(result).toBe('  sonnet  ');
      });

      it('should handle special characters in model key', () => {
        const result = resolveModelString('model@123');

        // Passed through as-is (could be a provider model)
        expect(result).toBe('model@123');
      });
    });
  });

  describe('getEffectiveModel', () => {
    describe('priority handling', () => {
      it('should prioritize explicit model over all others', () => {
        const explicit = 'claude-opus-4-20241113';
        const session = 'claude-sonnet-4-20250514';
        const defaultModel = 'claude-3-5-haiku-20241022';

        const result = getEffectiveModel(explicit, session, defaultModel);

        expect(result).toBe(explicit);
      });

      it('should use session model when explicit is undefined', () => {
        const session = 'claude-sonnet-4-20250514';
        const defaultModel = 'claude-3-5-haiku-20241022';

        const result = getEffectiveModel(undefined, session, defaultModel);

        expect(result).toBe(session);
      });

      it('should use default model when both explicit and session are undefined', () => {
        const defaultModel = 'claude-opus-4-20241113';

        const result = getEffectiveModel(undefined, undefined, defaultModel);

        expect(result).toBe(defaultModel);
      });

      it('should use system default when all are undefined', () => {
        const result = getEffectiveModel(undefined, undefined, undefined);

        expect(result).toBe(DEFAULT_MODELS.claude);
      });
    });

    describe('with aliases', () => {
      it('should resolve explicit model alias', () => {
        const result = getEffectiveModel('opus', 'sonnet');

        expect(result).toBe(CLAUDE_MODEL_MAP.opus);
      });

      it('should resolve session model alias when explicit is undefined', () => {
        const result = getEffectiveModel(undefined, 'haiku');

        expect(result).toBe(CLAUDE_MODEL_MAP.haiku);
      });

      it('should prioritize explicit alias over session full string', () => {
        const result = getEffectiveModel('sonnet', 'claude-opus-4-20241113');

        expect(result).toBe(CLAUDE_MODEL_MAP.sonnet);
      });
    });

    describe('with empty strings', () => {
      it('should treat empty explicit string as undefined', () => {
        const session = 'claude-sonnet-4-20250514';

        const result = getEffectiveModel('', session);

        expect(result).toBe(session);
      });

      it('should treat empty session string as undefined', () => {
        const defaultModel = 'claude-opus-4-20241113';

        const result = getEffectiveModel(undefined, '', defaultModel);

        expect(result).toBe(defaultModel);
      });

      it('should handle all empty strings', () => {
        const result = getEffectiveModel('', '', '');

        // Empty strings are falsy, so explicit || session becomes "" || ""  = ""
        // Then resolveModelString("", "") returns "" (not in CLAUDE_MODEL_MAP, not containing "claude-")
        // This actually returns the custom default which is ""
        expect(result).toBe('');
      });
    });

    describe('integration scenarios', () => {
      it('should handle user overriding session model with alias', () => {
        const sessionModel = 'claude-sonnet-4-20250514';
        const userChoice = 'opus';

        const result = getEffectiveModel(userChoice, sessionModel);

        expect(result).toBe(CLAUDE_MODEL_MAP.opus);
      });

      it('should pass through unknown model (may be provider model)', () => {
        const result = getEffectiveModel('GLM-4.7', 'also-unknown', 'claude-opus-4-20241113');

        // Unknown models pass through unchanged (could be provider models)
        expect(result).toBe('GLM-4.7');
      });

      it('should handle session with alias, no explicit', () => {
        const result = getEffectiveModel(undefined, 'haiku');

        expect(result).toBe(CLAUDE_MODEL_MAP.haiku);
      });
    });
  });

  describe('CLAUDE_MODEL_MAP integration', () => {
    it('should have valid mappings for all known aliases', () => {
      const aliases = ['sonnet', 'opus', 'haiku'];

      for (const alias of aliases) {
        const resolved = resolveModelString(alias);
        expect(resolved).toBeDefined();
        expect(resolved).toContain('claude-');
        expect(resolved).toBe(CLAUDE_MODEL_MAP[alias]);
      }
    });
  });

  describe('DEFAULT_MODELS integration', () => {
    it('should use DEFAULT_MODELS.claude as fallback', () => {
      const result = resolveModelString(undefined);

      expect(result).toBe(DEFAULT_MODELS.claude);
      expect(DEFAULT_MODELS.claude).toBeDefined();
      expect(DEFAULT_MODELS.claude).toContain('claude-');
    });
  });

  describe('resolvePhaseModel', () => {
    describe('with null/undefined input (defensive handling)', () => {
      it('should return default model when phaseModel is null', () => {
        const result = resolvePhaseModel(null);

        expect(result.model).toBe(DEFAULT_MODELS.claude);
        expect(result.thinkingLevel).toBeUndefined();
      });

      it('should return default model when phaseModel is undefined', () => {
        const result = resolvePhaseModel(undefined);

        expect(result.model).toBe(DEFAULT_MODELS.claude);
        expect(result.thinkingLevel).toBeUndefined();
      });

      it('should use custom default when phaseModel is null', () => {
        const customDefault = 'claude-opus-4-20241113';
        const result = resolvePhaseModel(null, customDefault);

        expect(result.model).toBe(customDefault);
        expect(result.thinkingLevel).toBeUndefined();
      });
    });

    describe('with legacy string format (v2 settings)', () => {
      it('should resolve Claude alias string', () => {
        const result = resolvePhaseModel('sonnet');

        expect(result.model).toBe(CLAUDE_MODEL_MAP.sonnet);
        expect(result.thinkingLevel).toBeUndefined();
      });

      it('should resolve opus alias string', () => {
        const result = resolvePhaseModel('opus');

        expect(result.model).toBe(CLAUDE_MODEL_MAP.opus);
        expect(result.thinkingLevel).toBeUndefined();
      });

      it('should resolve haiku alias string', () => {
        const result = resolvePhaseModel('haiku');

        expect(result.model).toBe(CLAUDE_MODEL_MAP.haiku);
        expect(result.thinkingLevel).toBeUndefined();
      });

      it('should pass through full Claude model string', () => {
        const fullModel = 'claude-sonnet-4-20250514';
        const result = resolvePhaseModel(fullModel);

        expect(result.model).toBe(fullModel);
        expect(result.thinkingLevel).toBeUndefined();
      });

      it('should handle Cursor model string', () => {
        const result = resolvePhaseModel('cursor-auto');

        expect(result.model).toBe('cursor-auto');
        expect(result.thinkingLevel).toBeUndefined();
      });
    });

    describe('with PhaseModelEntry object format (v3 settings)', () => {
      it('should resolve model from entry without thinkingLevel', () => {
        const entry: PhaseModelEntry = { model: 'sonnet' };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe(CLAUDE_MODEL_MAP.sonnet);
        expect(result.thinkingLevel).toBeUndefined();
      });

      it('should resolve model and return thinkingLevel none', () => {
        const entry: PhaseModelEntry = { model: 'opus', thinkingLevel: 'none' };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe(CLAUDE_MODEL_MAP.opus);
        expect(result.thinkingLevel).toBe('none');
      });

      it('should resolve model and return thinkingLevel low', () => {
        const entry: PhaseModelEntry = { model: 'sonnet', thinkingLevel: 'low' };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe(CLAUDE_MODEL_MAP.sonnet);
        expect(result.thinkingLevel).toBe('low');
      });

      it('should resolve model and return thinkingLevel medium', () => {
        const entry: PhaseModelEntry = { model: 'haiku', thinkingLevel: 'medium' };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe(CLAUDE_MODEL_MAP.haiku);
        expect(result.thinkingLevel).toBe('medium');
      });

      it('should resolve model and return thinkingLevel high', () => {
        const entry: PhaseModelEntry = { model: 'opus', thinkingLevel: 'high' };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe(CLAUDE_MODEL_MAP.opus);
        expect(result.thinkingLevel).toBe('high');
      });

      it('should resolve model and return thinkingLevel ultrathink', () => {
        const entry: PhaseModelEntry = { model: 'opus', thinkingLevel: 'ultrathink' };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe(CLAUDE_MODEL_MAP.opus);
        expect(result.thinkingLevel).toBe('ultrathink');
      });

      it('should handle full Claude model string in entry', () => {
        const entry: PhaseModelEntry = {
          model: 'claude-opus-4-5-20251101',
          thinkingLevel: 'high',
        };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe('claude-opus-4-5-20251101');
        expect(result.thinkingLevel).toBe('high');
      });
    });

    describe('with Cursor models (thinkingLevel should be preserved but unused)', () => {
      it('should handle Cursor model entry without thinkingLevel', () => {
        const entry: PhaseModelEntry = { model: 'auto' };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe('cursor-auto');
        expect(result.thinkingLevel).toBeUndefined();
      });

      it('should preserve thinkingLevel even for Cursor models (caller handles)', () => {
        // Note: thinkingLevel is meaningless for Cursor but we don't filter it
        // The calling code should check isCursorModel() before using thinkingLevel
        const entry: PhaseModelEntry = { model: 'composer-1', thinkingLevel: 'high' };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe('cursor-composer-1');
        expect(result.thinkingLevel).toBe('high');
      });

      it('should handle cursor-prefixed model in entry', () => {
        const entry: PhaseModelEntry = { model: 'cursor-gpt-4o' as any };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe('cursor-gpt-4o');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string model in entry', () => {
        const entry: PhaseModelEntry = { model: '' as any };
        const result = resolvePhaseModel(entry);

        expect(result.model).toBe(DEFAULT_MODELS.claude);
        expect(result.thinkingLevel).toBeUndefined();
      });

      it('should pass through unknown model in entry (may be provider model)', () => {
        const entry: PhaseModelEntry = { model: 'GLM-4.7' as any };
        const result = resolvePhaseModel(entry);

        // Unknown models pass through unchanged (could be provider models)
        expect(result.model).toBe('GLM-4.7');
      });

      it('should pass through unknown model with thinkingLevel', () => {
        const entry: PhaseModelEntry = { model: 'MiniMax-M2.1' as any, thinkingLevel: 'high' };
        const customDefault = 'claude-haiku-4-5-20251001';
        const result = resolvePhaseModel(entry, customDefault);

        // Unknown models pass through, thinkingLevel is preserved
        expect(result.model).toBe('MiniMax-M2.1');
        expect(result.thinkingLevel).toBe('high');
      });
    });
  });
});
