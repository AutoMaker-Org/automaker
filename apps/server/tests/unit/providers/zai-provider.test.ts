import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZaiProvider } from '@/providers/zai-provider.js';
import { collectAsyncGenerator } from '../../utils/helpers.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock secureFs
vi.mock('@automaker/platform', () => ({
  secureFs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

describe('zai-provider.ts', () => {
  let provider: ZaiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ZaiProvider({ apiKey: 'test-zai-key' });
    delete process.env.ZAI_API_KEY;
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  describe('getName', () => {
    it("should return 'zai' as provider name", () => {
      expect(provider.getName()).toBe('zai');
    });
  });

  describe('executeQuery', () => {
    it('should execute simple text query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Hello! How can I help you today?',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });

      const generator = provider.executeQuery({
        prompt: 'Hello',
        cwd: '/test',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results.length).toBeGreaterThan(0);

      const textResult = results.find((r: any) => r.type === 'assistant');
      expect(textResult).toBeDefined();
    });

    it('should pass correct model to API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Response',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });

      const generator = provider.executeQuery({
        prompt: 'Test prompt',
        cwd: '/test/dir',
        model: 'glm-4.6',
      });

      await collectAsyncGenerator(generator);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('glm-4.6');
    });

    it('should include system prompt if provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Response',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
        systemPrompt: 'You are a helpful assistant',
      });

      await collectAsyncGenerator(generator);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('You are a helpful assistant');
    });

    it('should handle reasoning_content from thinking mode', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                reasoning_content: 'Let me think about this...',
                content: 'Here is my response',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });

      const generator = provider.executeQuery({
        prompt: 'Solve this problem',
        cwd: '/test',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should have reasoning block
      const reasoningResult = results.find(
        (r: any) => r.type === 'assistant' && r.message?.content?.[0]?.type === 'reasoning'
      );
      expect(reasoningResult).toBeDefined();

      // Should have text block
      const textResult = results.find(
        (r: any) => r.type === 'assistant' && r.message?.content?.[0]?.type === 'text'
      );
      expect(textResult).toBeDefined();
    });

    it('should handle tool calls', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_123',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({ filePath: 'test.txt' }),
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'I have read the file',
                },
                finish_reason: 'stop',
              },
            ],
          }),
        });

      const { secureFs } = await import('@automaker/platform');
      vi.mocked(secureFs.readFile).mockResolvedValue('file content');

      const generator = provider.executeQuery({
        prompt: 'Read test.txt',
        cwd: '/test',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should have tool_use message
      const toolUseResult = results.find(
        (r: any) => r.type === 'assistant' && r.message?.content?.[0]?.type === 'tool_use'
      );
      expect(toolUseResult).toBeDefined();
      expect((toolUseResult as any).message?.content?.[0]?.name).toBe('read_file');

      // Should have result message
      const resultMsg = results.find((r: any) => r.type === 'result');
      expect(resultMsg).toBeDefined();
    });

    it('should filter tools based on allowedTools', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Response',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
        allowedTools: ['Read', 'Write'],
      });

      await collectAsyncGenerator(generator);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.tools).toBeDefined();
      expect(body.tools.length).toBe(2);
      expect(body.tools[0].function.name).toBe('read_file');
      expect(body.tools[1].function.name).toBe('write_file');
    });

    it('should use sdkSessionId when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Response',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
        sdkSessionId: 'custom-session-123',
      });

      const results = await collectAsyncGenerator(generator);

      // Should use the provided session ID
      const sessionResult = results.find((r: any) => r.session_id === 'custom-session-123');
      expect(sessionResult).toBeDefined();
    });

    it('should handle structured output requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '{"result": "value"}',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });

      const generator = provider.executeQuery({
        prompt: 'Generate JSON',
        cwd: '/test',
        outputFormat: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { result: { type: 'string' } },
          },
        },
      });

      await collectAsyncGenerator(generator);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
      });

      await expect(collectAsyncGenerator(generator)).rejects.toThrow();
    });

    it('should respect abortController', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
        abortController,
      });

      const results = await collectAsyncGenerator(generator);

      // Should yield error and stop
      const errorResult = results.find((r: any) => r.type === 'error');
      expect(errorResult).toBeDefined();
      expect((errorResult as any).error).toContain('aborted');
    });
  });

  describe('detectInstallation', () => {
    it('should return installed with SDK method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      const result = await provider.detectInstallation();

      expect(result.installed).toBe(true);
      expect(result.method).toBe('sdk');
    });

    it('should detect ZAI_API_KEY', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      provider.setConfig({ apiKey: 'test-key' });
      const result = await provider.detectInstallation();

      expect(result.hasApiKey).toBe(true);
      expect(result.authenticated).toBe(true);
    });

    it('should return hasApiKey false when no key present', async () => {
      const result = await provider.detectInstallation();

      expect(result.hasApiKey).toBe(false);
      expect(result.authenticated).toBe(false);
    });

    it('should return authenticated false on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      provider.setConfig({ apiKey: 'invalid-key' });
      const result = await provider.detectInstallation();

      expect(result.hasApiKey).toBe(true);
      expect(result.authenticated).toBe(false);
    });

    it('should return authenticated true on network error (forgiving)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      provider.setConfig({ apiKey: 'test-key' });
      const result = await provider.detectInstallation();

      expect(result.hasApiKey).toBe(true);
      expect(result.authenticated).toBe(true); // Forgiving on network errors
    });
  });

  describe('getAvailableModels', () => {
    it('should return 4 GLM models', () => {
      const models = provider.getAvailableModels();

      expect(models).toHaveLength(4);
    });

    it('should include GLM-4.7', () => {
      const models = provider.getAvailableModels();

      const model = models.find((m) => m.id === 'glm-4.7');
      expect(model).toBeDefined();
      expect(model?.name).toBe('GLM-4.7');
      expect(model?.provider).toBe('zai');
    });

    it('should include GLM-4.6v with vision support', () => {
      const models = provider.getAvailableModels();

      const model = models.find((m) => m.id === 'glm-4.6v');
      expect(model).toBeDefined();
      expect(model?.name).toBe('GLM-4.6v');
      expect(model?.supportsVision).toBe(true);
    });

    it('should include GLM-4.6', () => {
      const models = provider.getAvailableModels();

      const model = models.find((m) => m.id === 'glm-4.6');
      expect(model).toBeDefined();
      expect(model?.name).toBe('GLM-4.6');
    });

    it('should include GLM-4.5-Air', () => {
      const models = provider.getAvailableModels();

      const model = models.find((m) => m.id === 'glm-4.5-air');
      expect(model).toBeDefined();
      expect(model?.name).toBe('GLM-4.5-Air');
    });

    it('should mark GLM-4.7 as default', () => {
      const models = provider.getAvailableModels();

      const model = models.find((m) => m.id === 'glm-4.7');
      expect(model?.default).toBe(true);
    });

    it('should all support tools and extended thinking', () => {
      const models = provider.getAvailableModels();

      models.forEach((model) => {
        expect(model.supportsTools).toBe(true);
        expect(model.supportsExtendedThinking).toBe(true);
      });
    });

    it('should have correct context windows', () => {
      const models = provider.getAvailableModels();

      models.forEach((model) => {
        expect(model.contextWindow).toBe(128000);
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

    it("should support 'extendedThinking' feature", () => {
      expect(provider.supportsFeature('extendedThinking')).toBe(true);
    });

    it("should not support 'mcp' feature", () => {
      expect(provider.supportsFeature('mcp')).toBe(false);
    });

    it("should not support 'browser' feature", () => {
      expect(provider.supportsFeature('browser')).toBe(false);
    });

    it('should not support unknown features', () => {
      expect(provider.supportsFeature('unknown')).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should pass validation with API key', () => {
      provider.setConfig({ apiKey: 'test-key' });
      const result = provider.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation without API key', () => {
      const testProvider = new ZaiProvider();
      const result = testProvider.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ZAI_API_KEY not configured');
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
