import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderFactory } from '@/providers/provider-factory.js';
import { ClaudeProvider } from '@/providers/claude-provider.js';
import { CursorProvider } from '@/providers/cursor-provider.js';
import { OpenCodeProvider } from '@/providers/opencode-provider.js';
import { CodexProvider } from '@/providers/codex-provider.js';

describe('provider-factory.ts', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    ProviderFactory.setDefaultProvider('cursor');
  });

  afterEach(() => {
    ProviderFactory.setDefaultProvider('cursor');
    consoleLogSpy.mockRestore();
  });

  describe('getProviderForModel', () => {
    describe('Cursor models', () => {
      it("should return CursorProvider for 'auto'", () => {
        const provider = ProviderFactory.getProviderForModel('auto');
        expect(provider).toBeInstanceOf(CursorProvider);
      });

      it("should return CursorProvider for 'claude-sonnet'", () => {
        const provider = ProviderFactory.getProviderForModel('claude-sonnet');
        expect(provider).toBeInstanceOf(CursorProvider);
      });
    });

    describe('Codex models', () => {
      it("should return CodexProvider for 'gpt-5.2-codex'", () => {
        const provider = ProviderFactory.getProviderForModel('gpt-5.2-codex');
        expect(provider).toBeInstanceOf(CodexProvider);
      });

      it("should return CodexProvider for 'gpt-5.2'", () => {
        const provider = ProviderFactory.getProviderForModel('gpt-5.2');
        expect(provider).toBeInstanceOf(CodexProvider);
      });

      it("should return CodexProvider for 'gpt-5.1-codex'", () => {
        const provider = ProviderFactory.getProviderForModel('gpt-5.1-codex');
        expect(provider).toBeInstanceOf(CodexProvider);
      });

      it("should return CodexProvider for 'gpt-5'", () => {
        const provider = ProviderFactory.getProviderForModel('gpt-5');
        expect(provider).toBeInstanceOf(CodexProvider);
      });

      it("should return CodexProvider for 'o1'", () => {
        const provider = ProviderFactory.getProviderForModel('o1');
        expect(provider).toBeInstanceOf(CodexProvider);
      });
    });

    describe('OpenCode models', () => {
      it("should return OpenCodeProvider for 'glm4.7'", () => {
        const provider = ProviderFactory.getProviderForModel('glm4.7');
        expect(provider).toBeInstanceOf(OpenCodeProvider);
      });

      it("should return OpenCodeProvider for 'opencode'", () => {
        const provider = ProviderFactory.getProviderForModel('opencode');
        expect(provider).toBeInstanceOf(OpenCodeProvider);
      });
    });

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

    describe('Unknown models', () => {
      it('should default to CursorProvider for unknown model', () => {
        const provider = ProviderFactory.getProviderForModel('unknown-model-123');
        expect(provider).toBeInstanceOf(CursorProvider);
      });

      it('should honor default provider for unknown model', () => {
        ProviderFactory.setDefaultProvider('claude');
        const provider = ProviderFactory.getProviderForModel('random-model');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it('should handle empty string', () => {
        const provider = ProviderFactory.getProviderForModel('');
        expect(provider).toBeInstanceOf(CursorProvider);
      });
    });
  });

  describe('getAllProviders', () => {
    it('should return array of all providers', () => {
      const providers = ProviderFactory.getAllProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it('should include ClaudeProvider, CursorProvider, OpenCodeProvider, and CodexProvider', () => {
      const providers = ProviderFactory.getAllProviders();
      const hasClaudeProvider = providers.some((p) => p instanceof ClaudeProvider);
      const hasCursorProvider = providers.some((p) => p instanceof CursorProvider);
      const hasOpenCodeProvider = providers.some((p) => p instanceof OpenCodeProvider);
      const hasCodexProvider = providers.some((p) => p instanceof CodexProvider);

      expect(hasClaudeProvider).toBe(true);
      expect(hasCursorProvider).toBe(true);
      expect(hasOpenCodeProvider).toBe(true);
      expect(hasCodexProvider).toBe(true);
    });

    it('should return exactly 4 providers', () => {
      const providers = ProviderFactory.getAllProviders();
      expect(providers).toHaveLength(4);
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
      expect(statuses).toHaveProperty('cursor');
      expect(statuses).toHaveProperty('opencode');
      expect(statuses).toHaveProperty('codex');
    });

    it('should return correct provider names as keys', async () => {
      const statuses = await ProviderFactory.checkAllProviders();
      const keys = Object.keys(statuses);

      expect(keys).toContain('claude');
      expect(keys).toContain('cursor');
      expect(keys).toContain('opencode');
      expect(keys).toContain('codex');
      expect(keys).toHaveLength(4);
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

    it("should return CursorProvider for 'cursor'", () => {
      const provider = ProviderFactory.getProviderByName('cursor');
      expect(provider).toBeInstanceOf(CursorProvider);
    });

    it("should return CodexProvider for 'codex'", () => {
      const provider = ProviderFactory.getProviderByName('codex');
      expect(provider).toBeInstanceOf(CodexProvider);
    });

    it("should return CodexProvider for 'openai'", () => {
      const provider = ProviderFactory.getProviderByName('openai');
      expect(provider).toBeInstanceOf(CodexProvider);
    });

    it('should be case-insensitive', () => {
      const provider1 = ProviderFactory.getProviderByName('CLAUDE');
      const provider2 = ProviderFactory.getProviderByName('ANTHROPIC');
      const provider3 = ProviderFactory.getProviderByName('CURSOR');
      const provider4 = ProviderFactory.getProviderByName('CODEX');

      expect(provider1).toBeInstanceOf(ClaudeProvider);
      expect(provider2).toBeInstanceOf(ClaudeProvider);
      expect(provider3).toBeInstanceOf(CursorProvider);
      expect(provider4).toBeInstanceOf(CodexProvider);
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
      const hasClaudeModels = models.some((m) => m.provider === 'anthropic');

      expect(hasClaudeModels).toBe(true);
    });

    it('should include Cursor models', () => {
      const models = ProviderFactory.getAllAvailableModels();
      const hasCursorModels = models.some((m) => m.provider === 'cursor');

      expect(hasCursorModels).toBe(true);
    });

    it('should include OpenCode models', () => {
      const models = ProviderFactory.getAllAvailableModels();
      const hasOpenCodeModels = models.some((m) => m.provider === 'opencode');

      expect(hasOpenCodeModels).toBe(true);
    });

    it('should include Codex models', () => {
      const models = ProviderFactory.getAllAvailableModels();
      const hasCodexModels = models.some((m) => m.provider === 'codex');

      expect(hasCodexModels).toBe(true);
    });
  });
});
