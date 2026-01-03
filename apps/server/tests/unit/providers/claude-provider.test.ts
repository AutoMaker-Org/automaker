import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProvider } from '@/providers/claude-provider.js';
import * as sdk from '@anthropic-ai/claude-agent-sdk';
import { collectAsyncGenerator } from '../../utils/helpers.js';

vi.mock('@anthropic-ai/claude-agent-sdk');

describe('claude-provider.ts', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ClaudeProvider();
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('getName', () => {
    it("should return 'claude' as provider name", () => {
      expect(provider.getName()).toBe('claude');
    });
  });

  describe('executeQuery', () => {
    it('should execute simple text query', async () => {
      const mockMessages = [
        { type: 'text', text: 'Response 1' },
        { type: 'text', text: 'Response 2' },
      ];

      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          for (const msg of mockMessages) {
            yield msg;
          }
        })()
      );

      const generator = provider.executeQuery({
        prompt: 'Hello',
        cwd: '/test',
      });

      const results = await collectAsyncGenerator(generator);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ type: 'text', text: 'Response 1' });
      expect(results[1]).toEqual({ type: 'text', text: 'Response 2' });
    });

    it('should pass correct options to SDK', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield { type: 'text', text: 'test' };
        })()
      );

      const generator = provider.executeQuery({
        prompt: 'Test prompt',
        model: 'claude-opus-4-5-20251101',
        cwd: '/test/dir',
        systemPrompt: 'You are helpful',
        maxTurns: 10,
        allowedTools: ['Read', 'Write'],
      });

      await collectAsyncGenerator(generator);

      expect(sdk.query).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          model: 'claude-opus-4-5-20251101',
          systemPrompt: 'You are helpful',
          maxTurns: 10,
          cwd: '/test/dir',
          allowedTools: ['Read', 'Write'],
          permissionMode: 'default',
        }),
      });
    });

    it('should use default allowed tools when not specified', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield { type: 'text', text: 'test' };
        })()
      );

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
      });

      await collectAsyncGenerator(generator);

      expect(sdk.query).toHaveBeenCalledWith({
        prompt: 'Test',
        options: expect.objectContaining({
          allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'],
        }),
      });
    });

    it('should pass sandbox configuration when provided', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield { type: 'text', text: 'test' };
        })()
      );

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
      });

      await collectAsyncGenerator(generator);

      expect(sdk.query).toHaveBeenCalledWith({
        prompt: 'Test',
        options: expect.objectContaining({
          sandbox: {
            enabled: true,
            autoAllowBashIfSandboxed: true,
          },
        }),
      });
    });

    it('should pass abortController if provided', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield { type: 'text', text: 'test' };
        })()
      );

      const abortController = new AbortController();

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
        abortController,
      });

      await collectAsyncGenerator(generator);

      expect(sdk.query).toHaveBeenCalledWith({
        prompt: 'Test',
        options: expect.objectContaining({
          abortController,
        }),
      });
    });

    it('should handle conversation history with sdkSessionId using resume option', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield { type: 'text', text: 'test' };
        })()
      );

      const conversationHistory = [
        { role: 'user' as const, content: 'Previous message' },
        { role: 'assistant' as const, content: 'Previous response' },
      ];

      const generator = provider.executeQuery({
        prompt: 'Current message',
        cwd: '/test',
        conversationHistory,
        sdkSessionId: 'test-session-id',
      });

      await collectAsyncGenerator(generator);

      // Should use resume option when sdkSessionId is provided with history
      expect(sdk.query).toHaveBeenCalledWith({
        prompt: 'Current message',
        options: expect.objectContaining({
          resume: 'test-session-id',
        }),
      });
    });

    it('should handle array prompt (with images)', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield { type: 'text', text: 'test' };
        })()
      );

      const arrayPrompt = [
        { type: 'text', text: 'Describe this' },
        { type: 'image', source: { type: 'base64', data: '...' } },
      ];

      const generator = provider.executeQuery({
        prompt: arrayPrompt as any,
        cwd: '/test',
      });

      await collectAsyncGenerator(generator);

      // Should pass an async generator as prompt for array inputs
      const callArgs = vi.mocked(sdk.query).mock.calls[0][0];
      expect(typeof callArgs.prompt).not.toBe('string');
    });

    it('should use maxTurns default of 20', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield { type: 'text', text: 'test' };
        })()
      );

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
      });

      await collectAsyncGenerator(generator);

      expect(sdk.query).toHaveBeenCalledWith({
        prompt: 'Test',
        options: expect.objectContaining({
          maxTurns: 20,
        }),
      });
    });

    it('should handle errors during execution and rethrow', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const testError = new Error('SDK execution failed');

      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          throw testError;
        })()
      );

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
      });

      await expect(collectAsyncGenerator(generator)).rejects.toThrow('SDK execution failed');

      // Should log error with classification info (after refactoring)
      const errorCall = consoleErrorSpy.mock.calls[0];
      expect(errorCall[0]).toBe('[ClaudeProvider] executeQuery() error during execution:');
      expect(errorCall[1]).toMatchObject({
        type: expect.any(String),
        message: 'SDK execution failed',
        isRateLimit: false,
        stack: expect.stringContaining('Error: SDK execution failed'),
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('detectInstallation', () => {
    it('should return installed with SDK method', async () => {
      const result = await provider.detectInstallation();

      expect(result.installed).toBe(true);
      expect(result.method).toBe('sdk');
    });

    it('should detect ANTHROPIC_API_KEY', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await provider.detectInstallation();

      expect(result.hasApiKey).toBe(true);
      expect(result.authenticated).toBe(true);
    });

    it('should return hasApiKey false when no keys present', async () => {
      const result = await provider.detectInstallation();

      expect(result.hasApiKey).toBe(false);
      expect(result.authenticated).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return 4 Claude models', () => {
      const models = provider.getAvailableModels();

      expect(models).toHaveLength(4);
    });

    it('should include Claude Opus 4.5', () => {
      const models = provider.getAvailableModels();

      const opus = models.find((m) => m.id === 'claude-opus-4-5-20251101');
      expect(opus).toBeDefined();
      expect(opus?.name).toBe('Claude Opus 4.5');
      expect(opus?.provider).toBe('anthropic');
    });

    it('should include Claude Sonnet 4', () => {
      const models = provider.getAvailableModels();

      const sonnet = models.find((m) => m.id === 'claude-sonnet-4-20250514');
      expect(sonnet).toBeDefined();
      expect(sonnet?.name).toBe('Claude Sonnet 4');
    });

    it('should include Claude 3.5 Sonnet', () => {
      const models = provider.getAvailableModels();

      const sonnet35 = models.find((m) => m.id === 'claude-3-5-sonnet-20241022');
      expect(sonnet35).toBeDefined();
    });

    it('should include Claude Haiku 4.5', () => {
      const models = provider.getAvailableModels();

      const haiku = models.find((m) => m.id === 'claude-haiku-4-5-20251001');
      expect(haiku).toBeDefined();
    });

    it('should mark Opus as default', () => {
      const models = provider.getAvailableModels();

      const opus = models.find((m) => m.id === 'claude-opus-4-5-20251101');
      expect(opus?.default).toBe(true);
    });

    it('should all support vision and tools', () => {
      const models = provider.getAvailableModels();

      models.forEach((model) => {
        expect(model.supportsVision).toBe(true);
        expect(model.supportsTools).toBe(true);
      });
    });

    it('should have correct context windows', () => {
      const models = provider.getAvailableModels();

      models.forEach((model) => {
        expect(model.contextWindow).toBe(200000);
      });
    });

    it('should have modelString field matching id', () => {
      const models = provider.getAvailableModels();

      models.forEach((model) => {
        expect(model.modelString).toBe(model.id);
      });
    });
  });

  describe('supportsFeature', () => {
    it("should support 'tools' feature", () => {
      expect(provider.supportsFeature('tools')).toBe(true);
    });

    it("should support 'text' feature", () => {
      expect(provider.supportsFeature('text')).toBe(true);
    });

    it("should support 'vision' feature", () => {
      expect(provider.supportsFeature('vision')).toBe(true);
    });

    it("should support 'thinking' feature", () => {
      expect(provider.supportsFeature('thinking')).toBe(true);
    });

    it("should not support 'mcp' feature", () => {
      expect(provider.supportsFeature('mcp')).toBe(false);
    });

    it("should not support 'cli' feature", () => {
      expect(provider.supportsFeature('cli')).toBe(false);
    });

    it('should not support unknown features', () => {
      expect(provider.supportsFeature('unknown')).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate config from base class', () => {
      const result = provider.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('config management', () => {
    it('should get and set config', () => {
      provider.setConfig({ apiKey: 'test-key' });

      const config = provider.getConfig();
      expect(config.apiKey).toBe('test-key');
    });

    it('should merge config updates', () => {
      provider.setConfig({ apiKey: 'key1' });
      provider.setConfig({ model: 'model1' });

      const config = provider.getConfig();
      expect(config.apiKey).toBe('key1');
      expect(config.model).toBe('model1');
    });
  });
});
