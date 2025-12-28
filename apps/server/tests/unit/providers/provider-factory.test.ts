import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderFactory } from '@/providers/provider-factory.js';
import { ClaudeProvider } from '@/providers/claude-provider.js';
import { ZaiProvider } from '@/providers/zai-provider.js';

describe('provider-factory.ts', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = {
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.warn.mockRestore();
  });

  describe('getProviderForModel', () => {
    describe('Claude models (claude-* prefix)', () => {
      it('should return ClaudeProvider for claude-opus-4-5-20251101', () => {
        const provider = ProviderFactory.getProviderForModel('claude-opus-4-5-20251101');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it('should return ClaudeProvider for claude-sonnet-4-20250514', () => {
        const provider = ProviderFactory.getProviderForModel('claude-sonnet-4-20250514');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it('should return ClaudeProvider for claude-haiku-4-5', () => {
        const provider = ProviderFactory.getProviderForModel('claude-haiku-4-5');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it('should be case-insensitive for claude models', () => {
        const provider = ProviderFactory.getProviderForModel('CLAUDE-OPUS-4-5-20251101');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });
    });

    describe('Claude aliases', () => {
      it("should return ClaudeProvider for 'haiku'", () => {
        const provider = ProviderFactory.getProviderForModel('haiku');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it("should return ClaudeProvider for 'sonnet'", () => {
        const provider = ProviderFactory.getProviderForModel('sonnet');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it("should return ClaudeProvider for 'opus'", () => {
        const provider = ProviderFactory.getProviderForModel('opus');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it('should be case-insensitive for aliases', () => {
        const provider1 = ProviderFactory.getProviderForModel('HAIKU');
        const provider2 = ProviderFactory.getProviderForModel('Sonnet');
        const provider3 = ProviderFactory.getProviderForModel('Opus');

        expect(provider1).toBeInstanceOf(ClaudeProvider);
        expect(provider2).toBeInstanceOf(ClaudeProvider);
        expect(provider3).toBeInstanceOf(ClaudeProvider);
      });
    });

    describe('Zai GLM models (glm-* prefix)', () => {
      it('should return ZaiProvider for glm-4.7', () => {
        const provider = ProviderFactory.getProviderForModel('glm-4.7');
        expect(provider).toBeInstanceOf(ZaiProvider);
      });

      it('should return ZaiProvider for glm-4.6v', () => {
        const provider = ProviderFactory.getProviderForModel('glm-4.6v');
        expect(provider).toBeInstanceOf(ZaiProvider);
      });

      it('should return ZaiProvider for glm-4.6', () => {
        const provider = ProviderFactory.getProviderForModel('glm-4.6');
        expect(provider).toBeInstanceOf(ZaiProvider);
      });

      it('should return ZaiProvider for glm-4.5-air', () => {
        const provider = ProviderFactory.getProviderForModel('glm-4.5-air');
        expect(provider).toBeInstanceOf(ZaiProvider);
      });

      it('should be case-insensitive for glm models', () => {
        const provider = ProviderFactory.getProviderForModel('GLM-4.7');
        expect(provider).toBeInstanceOf(ZaiProvider);
      });
    });

    describe('Zai GLM aliases', () => {
      it("should return ZaiProvider for 'glm' alias", () => {
        const provider = ProviderFactory.getProviderForModel('glm');
        expect(provider).toBeInstanceOf(ZaiProvider);
      });

      it('should be case-insensitive for glm alias', () => {
        const provider = ProviderFactory.getProviderForModel('GLM');
        expect(provider).toBeInstanceOf(ZaiProvider);
      });
    });

    describe('Unknown models', () => {
      it('should default to ClaudeProvider for unknown model', () => {
        const provider = ProviderFactory.getProviderForModel('unknown-model-123');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it('should warn when defaulting to Claude', () => {
        ProviderFactory.getProviderForModel('random-model');
        expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('Unknown model'));
        expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('random-model'));
        expect(consoleSpy.warn).toHaveBeenCalledWith(
          expect.stringContaining('defaulting to Claude')
        );
      });

      it('should handle empty string', () => {
        const provider = ProviderFactory.getProviderForModel('');
        expect(provider).toBeInstanceOf(ClaudeProvider);
        expect(consoleSpy.warn).toHaveBeenCalled();
      });

      it('should default to ClaudeProvider for gpt models (not supported)', () => {
        const provider = ProviderFactory.getProviderForModel('gpt-5.2');
        expect(provider).toBeInstanceOf(ClaudeProvider);
        expect(consoleSpy.warn).toHaveBeenCalled();
      });

      it('should default to ClaudeProvider for o-series models (not supported)', () => {
        const provider = ProviderFactory.getProviderForModel('o1');
        expect(provider).toBeInstanceOf(ClaudeProvider);
        expect(consoleSpy.warn).toHaveBeenCalled();
      });
    });
  });

  describe('getAllProviders', () => {
    it('should return array of all providers', () => {
      const providers = ProviderFactory.getAllProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it('should include ClaudeProvider', () => {
      const providers = ProviderFactory.getAllProviders();
      const hasClaudeProvider = providers.some((p) => p instanceof ClaudeProvider);
      expect(hasClaudeProvider).toBe(true);
    });

    it('should include ZaiProvider', () => {
      const providers = ProviderFactory.getAllProviders();
      const hasZaiProvider = providers.some((p) => p instanceof ZaiProvider);
      expect(hasZaiProvider).toBe(true);
    });

    it('should return exactly 2 providers', () => {
      const providers = ProviderFactory.getAllProviders();
      expect(providers).toHaveLength(2);
    });

    it('should create new instances each time', () => {
      const providers1 = ProviderFactory.getAllProviders();
      const providers2 = ProviderFactory.getAllProviders();

      expect(providers1[0]).not.toBe(providers2[0]);
      expect(providers1[1]).not.toBe(providers2[1]);
    });
  });

  describe('checkAllProviders', () => {
    it('should return installation status for all providers', async () => {
      const statuses = await ProviderFactory.checkAllProviders();

      expect(statuses).toHaveProperty('claude');
      expect(statuses).toHaveProperty('zai');
    });

    it('should call detectInstallation on each provider', async () => {
      const statuses = await ProviderFactory.checkAllProviders();

      expect(statuses.claude).toHaveProperty('installed');
      expect(statuses.zai).toHaveProperty('installed');
    });

    it('should return correct provider names as keys', async () => {
      const statuses = await ProviderFactory.checkAllProviders();
      const keys = Object.keys(statuses);

      expect(keys).toContain('claude');
      expect(keys).toContain('zai');
      expect(keys).toHaveLength(2);
    });
  });

  describe('getProviderByName', () => {
    it("should return ClaudeProvider for 'claude'", () => {
      const provider = ProviderFactory.getProviderByName('claude');
      expect(provider).toBeInstanceOf(ClaudeProvider);
    });

    it("should return ClaudeProvider for 'anthropic'", () => {
      const provider = ProviderFactory.getProviderByName('anthropic');
      expect(provider).toBeInstanceOf(ClaudeProvider);
    });

    it("should return ZaiProvider for 'zai'", () => {
      const provider = ProviderFactory.getProviderByName('zai');
      expect(provider).toBeInstanceOf(ZaiProvider);
    });

    it('should be case-insensitive', () => {
      const provider1 = ProviderFactory.getProviderByName('CLAUDE');
      const provider2 = ProviderFactory.getProviderByName('ANTHROPIC');
      const provider3 = ProviderFactory.getProviderByName('ZAI');

      expect(provider1).toBeInstanceOf(ClaudeProvider);
      expect(provider2).toBeInstanceOf(ClaudeProvider);
      expect(provider3).toBeInstanceOf(ZaiProvider);
    });

    it('should return null for unknown provider', () => {
      const provider = ProviderFactory.getProviderByName('unknown');
      expect(provider).toBeNull();
    });

    it('should return null for empty string', () => {
      const provider = ProviderFactory.getProviderByName('');
      expect(provider).toBeNull();
    });

    it('should create new instance each time', () => {
      const provider1 = ProviderFactory.getProviderByName('claude');
      const provider2 = ProviderFactory.getProviderByName('claude');

      expect(provider1).not.toBe(provider2);
      expect(provider1).toBeInstanceOf(ClaudeProvider);
      expect(provider2).toBeInstanceOf(ClaudeProvider);
    });
  });

  describe('getAllAvailableModels', () => {
    it('should return array of models', () => {
      const models = ProviderFactory.getAllAvailableModels();
      expect(Array.isArray(models)).toBe(true);
    });

    it('should include models from all providers', () => {
      const models = ProviderFactory.getAllAvailableModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('should return models with required fields', () => {
      const models = ProviderFactory.getAllAvailableModels();

      models.forEach((model) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(typeof model.id).toBe('string');
        expect(typeof model.name).toBe('string');
      });
    });

    it('should include Claude models', () => {
      const models = ProviderFactory.getAllAvailableModels();

      // Claude models should include claude-* in their IDs
      const hasClaudeModels = models.some((m) => m.id.toLowerCase().includes('claude'));

      expect(hasClaudeModels).toBe(true);
    });

    it('should include GLM models', () => {
      const models = ProviderFactory.getAllAvailableModels();

      // GLM models should include glm- in their IDs
      const hasGlmModels = models.some((m) => m.id.toLowerCase().includes('glm'));

      expect(hasGlmModels).toBe(true);
    });

    it('should include models from both Claude and Zai providers', () => {
      const models = ProviderFactory.getAllAvailableModels();

      const claudeModels = models.filter((m) => m.provider === 'claude');
      const zaiModels = models.filter((m) => m.provider === 'zai');

      expect(claudeModels.length).toBeGreaterThan(0);
      expect(zaiModels.length).toBeGreaterThan(0);
    });
  });
});
