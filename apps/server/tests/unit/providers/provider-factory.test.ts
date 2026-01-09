import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderFactory } from '@/providers/provider-factory.js';
import { ClaudeProvider } from '@/providers/claude-provider.js';
import { CursorProvider } from '@/providers/cursor-provider.js';
import { CodexProvider } from '@/providers/codex-provider.js';
import { OpencodeProvider } from '@/providers/opencode-provider.js';

describe('provider-factory.ts', () => {
  let consoleSpy: any;
  let detectClaudeSpy: any;
  let detectCursorSpy: any;
  let detectCodexSpy: any;
  let detectOpencodeSpy: any;

  beforeEach(() => {
    consoleSpy = {
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };

    // Avoid hitting real CLI / filesystem checks during unit tests
    detectClaudeSpy = vi
      .spyOn(ClaudeProvider.prototype, 'detectInstallation')
      .mockResolvedValue({ installed: true });
    detectCursorSpy = vi
      .spyOn(CursorProvider.prototype, 'detectInstallation')
      .mockResolvedValue({ installed: true });
    detectCodexSpy = vi
      .spyOn(CodexProvider.prototype, 'detectInstallation')
      .mockResolvedValue({ installed: true });
    detectOpencodeSpy = vi
      .spyOn(OpencodeProvider.prototype, 'detectInstallation')
      .mockResolvedValue({ installed: true });
  });

  afterEach(() => {
    consoleSpy.warn.mockRestore();
    detectClaudeSpy.mockRestore();
    detectCursorSpy.mockRestore();
    detectCodexSpy.mockRestore();
    detectOpencodeSpy.mockRestore();
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

    describe('Cursor models (cursor-* prefix)', () => {
      it('should return CursorProvider for cursor-auto', () => {
        const provider = ProviderFactory.getProviderForModel('cursor-auto');
        expect(provider).toBeInstanceOf(CursorProvider);
      });

      it('should return CursorProvider for cursor-sonnet-4.5', () => {
        const provider = ProviderFactory.getProviderForModel('cursor-sonnet-4.5');
        expect(provider).toBeInstanceOf(CursorProvider);
      });

      it('should return CursorProvider for cursor-gpt-5.2', () => {
        const provider = ProviderFactory.getProviderForModel('cursor-gpt-5.2');
        expect(provider).toBeInstanceOf(CursorProvider);
      });

      it('should be case-insensitive for cursor models', () => {
        const provider = ProviderFactory.getProviderForModel('CURSOR-AUTO');
        expect(provider).toBeInstanceOf(CursorProvider);
      });

      it('should return CursorProvider for known cursor model ID without prefix', () => {
        const provider = ProviderFactory.getProviderForModel('auto');
        expect(provider).toBeInstanceOf(CursorProvider);
      });
    });

    describe('Unknown models', () => {
      it('should default to ClaudeProvider for unknown model', () => {
        const provider = ProviderFactory.getProviderForModel('unknown-model-123');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it('should handle empty string by defaulting to ClaudeProvider', () => {
        const provider = ProviderFactory.getProviderForModel('');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });

      it('should default to ClaudeProvider for completely unknown prefixes', () => {
        const provider = ProviderFactory.getProviderForModel('random-xyz-model');
        expect(provider).toBeInstanceOf(ClaudeProvider);
      });
    });

    describe('Cursor models via model ID lookup', () => {
      it('should return CodexProvider for gpt-5.2 (Codex model, not Cursor)', () => {
        // gpt-5.2 is in both CURSOR_MODEL_MAP and CODEX_MODEL_CONFIG_MAP
        // It should route to Codex since Codex models take priority
        const provider = ProviderFactory.getProviderForModel('gpt-5.2');
        expect(provider).toBeInstanceOf(CodexProvider);
      });

      it('should return CursorProvider for grok (valid Cursor model)', () => {
        const provider = ProviderFactory.getProviderForModel('grok');
        expect(provider).toBeInstanceOf(CursorProvider);
      });

      it('should return CursorProvider for gemini-3-pro (valid Cursor model)', () => {
        const provider = ProviderFactory.getProviderForModel('gemini-3-pro');
        expect(provider).toBeInstanceOf(CursorProvider);
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

    it('should return exactly 4 providers', () => {
      const providers = ProviderFactory.getAllProviders();
      expect(providers).toHaveLength(4);
    });

    it('should include CursorProvider', () => {
      const providers = ProviderFactory.getAllProviders();
      const hasCursorProvider = providers.some((p) => p instanceof CursorProvider);
      expect(hasCursorProvider).toBe(true);
    });

    it('should create new instances each time', () => {
      const providers1 = ProviderFactory.getAllProviders();
      const providers2 = ProviderFactory.getAllProviders();

      expect(providers1[0]).not.toBe(providers2[0]);
    });
  });

  describe('checkAllProviders', () => {
    it('should return installation status for all providers', async () => {
      const statuses = await ProviderFactory.checkAllProviders();

      expect(statuses).toHaveProperty('claude');
    });

    it('should call detectInstallation on each provider', async () => {
      const statuses = await ProviderFactory.checkAllProviders();

      expect(statuses.claude).toHaveProperty('installed');
    });

    it('should return correct provider names as keys', async () => {
      const statuses = await ProviderFactory.checkAllProviders();
      const keys = Object.keys(statuses);

      expect(keys).toContain('claude');
      expect(keys).toContain('cursor');
      expect(keys).toContain('codex');
      expect(keys).toContain('opencode');
      expect(keys).toHaveLength(4);
    });

    it('should include cursor status', async () => {
      const statuses = await ProviderFactory.checkAllProviders();

      expect(statuses.cursor).toHaveProperty('installed');
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

    it('should be case-insensitive', () => {
      const provider1 = ProviderFactory.getProviderByName('CLAUDE');
      const provider2 = ProviderFactory.getProviderByName('ANTHROPIC');
      const provider3 = ProviderFactory.getProviderByName('CURSOR');

      expect(provider1).toBeInstanceOf(ClaudeProvider);
      expect(provider2).toBeInstanceOf(ClaudeProvider);
      expect(provider3).toBeInstanceOf(CursorProvider);
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

    it('should include Cursor models', () => {
      const models = ProviderFactory.getAllAvailableModels();

      // Cursor models should include cursor provider
      const hasCursorModels = models.some((m) => m.provider === 'cursor');

      expect(hasCursorModels).toBe(true);
    });
  });
});
