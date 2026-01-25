import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveModelString,
  getEffectiveModel,
  CLAUDE_MODEL_MAP,
  CURSOR_MODEL_MAP,
  DEFAULT_MODELS,
} from '@automaker/model-resolver';

describe('model-resolver.ts', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
  });

  describe('resolveModelString', () => {
    it("should resolve 'haiku' alias to full model string", () => {
      const result = resolveModelString('haiku');
      expect(result).toBe(CLAUDE_MODEL_MAP.haiku);
    });

    it("should resolve 'sonnet' alias to full model string", () => {
      const result = resolveModelString('sonnet');
      expect(result).toBe(CLAUDE_MODEL_MAP.sonnet);
    });

    it("should resolve 'opus' alias to full model string", () => {
      const result = resolveModelString('opus');
      expect(result).toBe('claude-opus-4-5-20251101');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Migrated legacy ID: "opus" -> "claude-opus"')
      );
    });

    it('should pass through unknown models unchanged (may be provider models)', () => {
      // Unknown models now pass through unchanged to support ClaudeCompatibleProvider models
      // like GLM-4.7, MiniMax-M2.1, o1, etc.
      const models = ['o1', 'o1-mini', 'o3', 'unknown-model', 'fake-model-123', 'GLM-4.7'];
      models.forEach((model) => {
        const result = resolveModelString(model);
        // Should pass through unchanged (could be provider models)
        expect(result).toBe(model);
      });
    });

    it('should pass through full Claude model strings', () => {
      const models = [CLAUDE_MODEL_MAP.opus, CLAUDE_MODEL_MAP.sonnet, CLAUDE_MODEL_MAP.haiku];
      models.forEach((model) => {
        const result = resolveModelString(model);
        expect(result).toBe(model);
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Using full Claude model string')
      );
    });

    it('should return default model when modelKey is undefined', () => {
      const result = resolveModelString(undefined);
      expect(result).toBe(DEFAULT_MODELS.claude);
    });

    it('should return custom default model when provided', () => {
      const customDefault = 'custom-model';
      const result = resolveModelString(undefined, customDefault);
      expect(result).toBe(customDefault);
    });

    it('should pass through unknown model key unchanged (no warning)', () => {
      const result = resolveModelString('unknown-model');
      // Unknown models pass through unchanged (could be provider models)
      expect(result).toBe('unknown-model');
      // No warning - unknown models are valid for providers
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should handle empty string', () => {
      const result = resolveModelString('');
      expect(result).toBe(DEFAULT_MODELS.claude);
    });

    describe('Cursor models', () => {
      it('should pass through cursor-prefixed models unchanged', () => {
        const result = resolveModelString('cursor-composer-1');
        expect(result).toBe('cursor-composer-1');
        expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('Using Cursor model'));
      });

      it('should add cursor- prefix to bare Cursor model IDs', () => {
        const result = resolveModelString('composer-1');
        expect(result).toBe('cursor-composer-1');
      });

      it('should handle cursor-auto model', () => {
        const result = resolveModelString('cursor-auto');
        expect(result).toBe('cursor-auto');
      });

      it('should handle all known Cursor model IDs with prefix', () => {
        const cursorModelIds = Object.keys(CURSOR_MODEL_MAP);
        cursorModelIds.forEach((modelId) => {
          const result = resolveModelString(`cursor-${modelId}`);
          expect(result).toBe(`cursor-${modelId}`);
        });
      });
    });
  });

  describe('getEffectiveModel', () => {
    it('should prioritize explicit model over session and default', () => {
      const result = getEffectiveModel('opus', 'haiku', 'gpt-5.2');
      expect(result).toBe('claude-opus-4-5-20251101');
    });

    it('should use session model when explicit is not provided', () => {
      const result = getEffectiveModel(undefined, 'sonnet', 'gpt-5.2');
      expect(result).toBe(CLAUDE_MODEL_MAP.sonnet);
    });

    it('should use default when neither explicit nor session is provided', () => {
      const customDefault = CLAUDE_MODEL_MAP.haiku;
      const result = getEffectiveModel(undefined, undefined, customDefault);
      expect(result).toBe(customDefault);
    });

    it('should use Claude default when no arguments provided', () => {
      const result = getEffectiveModel();
      expect(result).toBe(DEFAULT_MODELS.claude);
    });

    it('should handle explicit empty strings as undefined', () => {
      const result = getEffectiveModel('', 'haiku');
      expect(result).toBe(CLAUDE_MODEL_MAP.haiku);
    });
  });

  describe('CLAUDE_MODEL_MAP', () => {
    it('should have haiku, sonnet, opus mappings', () => {
      expect(CLAUDE_MODEL_MAP).toHaveProperty('haiku');
      expect(CLAUDE_MODEL_MAP).toHaveProperty('sonnet');
      expect(CLAUDE_MODEL_MAP).toHaveProperty('opus');
    });

    it('should have valid Claude model strings', () => {
      expect(CLAUDE_MODEL_MAP.haiku).toContain('haiku');
      expect(CLAUDE_MODEL_MAP.sonnet).toContain('sonnet');
      expect(CLAUDE_MODEL_MAP.opus).toContain('opus');
    });
  });

  describe('DEFAULT_MODELS', () => {
    it('should have claude default', () => {
      expect(DEFAULT_MODELS).toHaveProperty('claude');
    });

    it('should have valid default model', () => {
      expect(DEFAULT_MODELS.claude).toContain('claude');
    });
  });
});
