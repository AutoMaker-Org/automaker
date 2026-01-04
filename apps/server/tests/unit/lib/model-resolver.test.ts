import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveModelString,
  getEffectiveModel,
  CLAUDE_MODEL_MAP,
  CURSOR_MODEL_MAP,
  CODEX_MODEL_MAP,
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
        expect.stringContaining('Resolved model alias: "opus"')
      );
    });

    it('should treat unknown models as falling back to default', () => {
      const models = ['unknown-model', 'mystery-model'];
      models.forEach((model) => {
        const result = resolveModelString(model);
        // Should fall back to default since these aren't supported
        expect(result).toBe(DEFAULT_MODELS.claude);
      });
    });

    it('should pass through Codex model strings', () => {
      const models = ['gpt-5.2', 'gpt-5.1-codex', 'o1'];
      models.forEach((model) => {
        const result = resolveModelString(model);
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

    it('should pass through Cursor model aliases', () => {
      const models = Object.values(CURSOR_MODEL_MAP);
      models.forEach((model) => {
        const result = resolveModelString(model);
        expect(result).toBe(model);
      });
    });

    it('should resolve Codex model aliases', () => {
      const models = Object.values(CODEX_MODEL_MAP);
      models.forEach((model) => {
        const result = resolveModelString(model);
        expect(result).toBe(model);
      });
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

    it('should return default for unknown model key', () => {
      const result = resolveModelString('unknown-model');
      expect(result).toBe(DEFAULT_MODELS.claude);
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown model key "unknown-model"')
      );
    });

    it('should handle empty string', () => {
      const result = resolveModelString('');
      expect(result).toBe(DEFAULT_MODELS.claude);
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
