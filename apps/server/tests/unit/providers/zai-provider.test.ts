import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZaiProvider } from '@/providers/zai-provider.js';
import { collectAsyncGenerator } from '../../utils/helpers.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Proper type definitions for test results
interface StreamingTestResult {
  type: 'assistant' | 'user' | 'error' | 'result';
  subtype?: 'success' | 'error';
  session_id?: string;
  message?: {
    role: 'user' | 'assistant';
    content: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  };
  result?: string;
  error?: string;
  parent_tool_use_id?: string | null;
}

// Mock secureFs
vi.mock('@automaker/platform', () => ({
  secureFs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
  validatePath: vi.fn((path: string) => path),
  isPathAllowed: vi.fn(() => true),
}));

/**
 * Helper to create a mock streaming response
 * Simulates Server-Sent Events (SSE) format from streaming APIs
 * Creates a fresh stream on each call
 */
function createMockStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        // Small delay to simulate real streaming
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      controller.close();
    },
  });

  return {
    ok: true,
    status: 200,
    body: readableStream,
  } as Response;
}

describe('zai-provider.ts', () => {
  let provider: ZaiProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockClear();
    provider = new ZaiProvider({ apiKey: 'test-zai-key' });
    delete process.env.ZAI_API_KEY;
  });

  describe('getName', () => {
    it("should return 'zai' as provider name", () => {
      expect(provider.getName()).toBe('zai');
    });
  });

  describe('executeQuery', () => {
    it('should execute simple text query with streaming', async () => {
      // Mock streaming SSE response
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"! How can I help you today?"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Hello',
        cwd: '/test',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      expect(mockFetch).toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);

      const textResult = results.find((r: StreamingTestResult) => r.type === 'assistant');
      expect(textResult).toBeDefined();
    });

    it('should pass correct model to API', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"content":"Response"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Test prompt',
        cwd: '/test/dir',
        model: 'glm-4.6',
      });

      await collectAsyncGenerator(generator);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('glm-4.6');
      expect(body.stream).toBe(true);
    });

    it('should include system prompt if provided', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"content":"Response"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
        model: 'glm-4.7',
        systemPrompt: 'You are a helpful assistant',
      });

      await collectAsyncGenerator(generator);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('You are a helpful assistant');
    });

    it('should handle thinking content from thinking mode', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"reasoning_content":"Let me think about this..."}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"Here is my response"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Solve this problem',
        cwd: '/test',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should have thinking block
      const thinkingResult = results.find(
        (r: StreamingTestResult) =>
          r.type === 'assistant' && r.message?.content?.[0]?.type === 'thinking'
      );
      expect(thinkingResult).toBeDefined();

      // Should have text block
      const textResult = results.find(
        (r: StreamingTestResult) =>
          r.type === 'assistant' && r.message?.content?.[0]?.type === 'text'
      );
      expect(textResult).toBeDefined();
    });

    it('should handle tool calls', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"read_file","arguments":"{\\"filePath\\": \\"test.txt\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

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
        (r: StreamingTestResult) =>
          r.type === 'assistant' && r.message?.content?.[0]?.type === 'tool_use'
      );
      expect(toolUseResult).toBeDefined();
      expect((toolUseResult as any).message?.content?.[0]?.name).toBe('read_file');

      // Should have result message
      const resultMsg = results.find((r: StreamingTestResult) => r.type === 'result');
      expect(resultMsg).toBeDefined();
    });

    it('should filter tools based on allowedTools', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"content":"Response"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

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
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"content":"Response"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Test',
        cwd: '/test',
        sdkSessionId: 'custom-session-123',
      });

      const results = await collectAsyncGenerator(generator);

      // Should use the provided session ID
      const sessionResult = results.find(
        (r: StreamingTestResult) => r.session_id === 'custom-session-123'
      );
      expect(sessionResult).toBeDefined();
    });

    it('should handle structured output requests', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"content":"{\\"result\\": \\"value\\"}"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

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
      const errorResult = results.find((r: StreamingTestResult) => r.type === 'error');
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
      const noKeyProvider = new ZaiProvider();
      const result = await noKeyProvider.detectInstallation();

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

      // GLM-4.7 and GLM-4.6 have 200k context, GLM-4.6v and GLM-4.5-Air have 128k
      const glm4_7 = models.find((m) => m.id === 'glm-4.7');
      const glm4_6 = models.find((m) => m.id === 'glm-4.6');
      const glm4_6v = models.find((m) => m.id === 'glm-4.6v');
      const glm4_5_air = models.find((m) => m.id === 'glm-4.5-air');

      expect(glm4_7?.contextWindow).toBe(200000);
      expect(glm4_6?.contextWindow).toBe(200000);
      expect(glm4_6v?.contextWindow).toBe(128000);
      expect(glm4_5_air?.contextWindow).toBe(128000);
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

    it("should support 'extendedThinking' feature (Zai's thinking mode)", () => {
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

  describe('command sanitization security', () => {
    beforeEach(async () => {
      // Set ALLOWED_ROOT_DIRECTORY to allow test paths
      process.env.ALLOWED_ROOT_DIRECTORY = '/test/project';

      // Update the validatePath mock to throw for absolute paths outside root
      const { validatePath } = await import('@automaker/platform');
      vi.mocked(validatePath).mockImplementation((path: string) => {
        // Allow paths within /test/project (including Windows variants)
        if (
          path.startsWith('/test/project') ||
          path.startsWith('\\test\\project') ||
          path.includes('test\\project') ||
          path.includes('test/project')
        ) {
          return path;
        }
        // Reject other absolute paths
        if (path.startsWith('/') && !path.startsWith('/test')) {
          throw new Error(`Path not allowed: ${path}`);
        }
        if (path.match(/^[A-Za-z]:/) && !path.includes('test')) {
          throw new Error(`Path not allowed: ${path}`);
        }
        // Allow relative paths
        return path;
      });
    });

    afterEach(() => {
      delete process.env.ALLOWED_ROOT_DIRECTORY;
    });

    it('should reject commands with .. for path traversal', async () => {
      // Note: This tests the internal sanitizeCommand function through tool execution
      // In actual usage, commands with .. will be blocked
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"execute_command","arguments":"{\\"command\\": \\"cat ../../../etc/passwd\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Read a file',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should get an error about path traversal
      const errorResult = results.find((r: StreamingTestResult) => r.type === 'error');
      expect(errorResult).toBeDefined();
      expect((errorResult as any).error).toContain('Path traversal');
    });

    it('should reject absolute paths in command arguments', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"execute_command","arguments":"{\\"command\\": \\"cat /etc/passwd\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Read a file',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should get an error
      const errorResult = results.find((r: StreamingTestResult) => r.type === 'error');
      expect(errorResult).toBeDefined();
      // The error could be from path validation or path traversal
      expect((errorResult as any).error).toMatch(/Path|not allowed/);
    });

    it('should allow recursive flags like -r, -R, -a (no longer blocked)', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"execute_command","arguments":"{\\"command\\": \\"rm -r test_dir\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Remove directory',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should NOT have an error about recursive flag (no longer blocked)
      const errorResult = results.find((r: StreamingTestResult) => r.type === 'error');
      expect(errorResult).toBeUndefined();
    });

    it('should reject commands in blocklist (format)', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"execute_command","arguments":"{\\"command\\": \\"format c:\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Format disk',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should get an error about command being blocked
      const errorResult = results.find((r: StreamingTestResult) => r.type === 'error');
      expect(errorResult).toBeDefined();
      expect((errorResult as any).error).toContain('blocked');
    });

    it('should reject commands in blocklist (userdel)', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"execute_command","arguments":"{\\"command\\": \\"userdel testuser\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Delete user',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should get an error about command being blocked
      const errorResult = results.find((r: StreamingTestResult) => r.type === 'error');
      expect(errorResult).toBeDefined();
      expect((errorResult as any).error).toContain('blocked for security');
    });

    it('should reject dangerous pattern (rm -rf /)', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"execute_command","arguments":"{\\"command\\": \\"rm -rf /\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Delete everything',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should get an error about dangerous pattern
      const errorResult = results.find((r: StreamingTestResult) => r.type === 'error');
      expect(errorResult).toBeDefined();
      expect((errorResult as any).error).toContain('Dangerous command pattern blocked');
    });

    it('should allow previously blocked commands like wget', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"execute_command","arguments":"{\\"command\\": \\"wget http://example.com\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Fetch URL',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should NOT have an error (wget is no longer in a whitelist)
      const errorResult = results.find((r: StreamingTestResult) => r.type === 'error');
      expect(errorResult).toBeUndefined();
    });

    it('should allow safe mutating commands within project root', async () => {
      // Mock successful file operations for mkdir/rm
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"execute_command","arguments":"{\\"command\\": \\"mkdir test_dir\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Create directory',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should have tool_use, no error from sanitization
      const toolUseResult = results.find(
        (r: StreamingTestResult) =>
          r.type === 'assistant' && r.message?.content?.[0]?.type === 'tool_use'
      );
      expect(toolUseResult).toBeDefined();

      // The tool result may have an error from actual execution (expected in test env)
      // but sanitization should not block the command
      const toolResult = results.find((r: StreamingTestResult) => r.type === 'result');
      expect(toolResult).toBeDefined();
    });

    it('should allow rm command for files within project root', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"execute_command","arguments":"{\\"command\\": \\"rm test_file.txt\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Remove file',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should succeed without error
      const errorResult = results.find((r: StreamingTestResult) => r.type === 'error');
      expect(errorResult).toBeUndefined();

      const toolUseResult = results.find(
        (r: StreamingTestResult) =>
          r.type === 'assistant' && r.message?.content?.[0]?.type === 'tool_use'
      );
      expect(toolUseResult).toBeDefined();
    });
  });

  describe('executeToolCall - write_file', () => {
    it('should handle write_file tool call', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"write_file","arguments":"{\\"path\\": \\"test.txt\\", \\"content\\": \\"hello world\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Write a file',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should have tool_use message for write_file
      const toolUseResult = results.find(
        (r: StreamingTestResult) =>
          r.type === 'assistant' &&
          r.message?.content?.[0]?.type === 'tool_use' &&
          r.message?.content?.[0]?.name === 'write_file'
      );
      expect(toolUseResult).toBeDefined();
    });
  });

  describe('executeToolCall - edit_file', () => {
    it('should handle edit_file tool call', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_456","function":{"name":"edit_file","arguments":"{\\"path\\": \\"test.txt\\", \\"edits\\": [{\\"oldText\\": \\"foo\\", \\"newText\\": \\"bar\\"}]}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Edit a file',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should have tool_use message for edit_file
      const toolUseResult = results.find(
        (r: StreamingTestResult) =>
          r.type === 'assistant' &&
          r.message?.content?.[0]?.type === 'tool_use' &&
          r.message?.content?.[0]?.name === 'edit_file'
      );
      expect(toolUseResult).toBeDefined();
    });
  });

  describe('executeToolCall - glob_search', () => {
    it('should handle glob_search tool call', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_789","function":{"name":"glob_search","arguments":"{\\"pattern\\": \\"**/*.ts\\", \\"path\\": \\".\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Find TypeScript files',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should have tool_use message for glob_search
      const toolUseResult = results.find(
        (r: StreamingTestResult) =>
          r.type === 'assistant' &&
          r.message?.content?.[0]?.type === 'tool_use' &&
          r.message?.content?.[0]?.name === 'glob_search'
      );
      expect(toolUseResult).toBeDefined();
    });
  });

  describe('executeToolCall - grep_search', () => {
    it('should handle grep_search tool call', async () => {
      mockFetch.mockImplementation(() =>
        createMockStreamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_101","function":{"name":"grep_search","arguments":"{\\"pattern\\": \\"TODO\\", \\"path\\": \\".\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ])
      );

      const generator = provider.executeQuery({
        prompt: 'Search for TODO comments',
        cwd: '/test/project',
        model: 'glm-4.7',
      });

      const results = await collectAsyncGenerator(generator);

      // Should have tool_use message for grep_search
      const toolUseResult = results.find(
        (r: StreamingTestResult) =>
          r.type === 'assistant' &&
          r.message?.content?.[0]?.type === 'tool_use' &&
          r.message?.content?.[0]?.name === 'grep_search'
      );
      expect(toolUseResult).toBeDefined();
    });
  });

  describe('image handling', () => {
    beforeEach(() => {
      provider = new ZaiProvider({ apiKey: 'test-key' });
    });

    it('should detect vision support correctly for glm-4.6v', () => {
      // @ts-expect-error - testing private method
      expect(provider.modelSupportsVision('glm-4.6v')).toBe(true);
      // @ts-expect-error - testing private method
      expect(provider.modelSupportsVision('glm-4.7')).toBe(false);
      // @ts-expect-error - testing private method
      expect(provider.modelSupportsVision('glm-4.6')).toBe(false);
      // @ts-expect-error - testing private method
      expect(provider.modelSupportsVision('glm-4.5-air')).toBe(false);
    });

    it('should reject file:// URLs in image sources', async () => {
      const images = [
        { type: 'image', source: { type: 'base64', data: 'fake-base64-data' } },
        { type: 'image', source: { type: 'base64', data: 'file://malicious-path' } },
      ];

      await expect(
        // @ts-expect-error - testing private method
        provider.describeImages(images, 'test prompt')
      ).rejects.toThrow('file:// URLs are not supported');
    });

    it('should reject non-base64 image source types', async () => {
      const images = [
        { type: 'image', source: { type: 'url', data: 'http://example.com/image.png' } },
      ];

      await expect(
        // @ts-expect-error - testing private method
        provider.describeImages(images, 'test prompt')
      ).rejects.toThrow('Unsupported image source type: url');
    });

    it('should handle empty images array gracefully', async () => {
      // @ts-expect-error - testing private method
      const result = await provider.describeImages([], 'test prompt');
      expect(result).toBe('');
    });

    it('should include image context in prompt when images are provided', async () => {
      const images = [
        {
          type: 'image',
          source: {
            type: 'base64',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        },
      ];

      // Mock successful vision API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'A 1x1 red pixel image.',
              },
            },
          ],
        }),
      });

      // @ts-expect-error - testing private method
      const result = await provider.describeImages(images, 'What do you see?');

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchArgs = mockFetch.mock.calls[0];

      // Verify URL is Zai API endpoint
      expect(fetchArgs[0]).toContain('api.z.ai');

      // Verify options object has correct method and contains model in body
      expect(fetchArgs[1]).toMatchObject({
        method: 'POST',
      });
      const bodyStr = fetchArgs[1]?.body;
      expect(bodyStr).toContain('"model":"glm-4.6v"');

      // Result should contain the image description (with prefix added by the method)
      expect(result).toContain('A 1x1 red pixel image.');
    });
  });
});
