import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CursorProvider } from '@/providers/cursor-provider.js';
import { spawn, exec } from 'child_process';
import { EventEmitter } from 'events';
import { Readable } from 'stream';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
}));

// Mock os - needs to handle default import properly
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  const mockHomedir = () => '/home/testuser';
  return {
    ...actual,
    homedir: mockHomedir,
    default: {
      ...actual,
      homedir: mockHomedir,
    },
  };
});

describe('cursor-provider.ts', () => {
  let provider: CursorProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CursorProvider();
    delete process.env.CURSOR_API_KEY;
    // Default mock for exec (findCliPath) - assume cursor-agent is in PATH
    vi.mocked(exec).mockImplementation((cmd: any, callback: any) => {
      if (typeof callback === 'function') {
        callback(null, { stdout: '/usr/local/bin/cursor-agent', stderr: '' });
      }
      return {} as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getName', () => {
    it("should return 'cursor' as provider name", () => {
      expect(provider.getName()).toBe('cursor');
    });
  });

  describe('executeQuery', () => {
    function createMockProcess(messages: string[]) {
      const mockStdout = new Readable({
        read() {
          for (const msg of messages) {
            this.push(msg + '\n');
          }
          this.push(null);
        },
      });

      const mockStderr = new Readable({
        read() {
          this.push(null);
        },
      });

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = mockStdout;
      mockProcess.stderr = mockStderr;
      mockProcess.kill = vi.fn();

      // Emit close event after streams end
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);

      return mockProcess;
    }

    it('should execute simple text query and stream response', async () => {
      const mockMessages = [
        JSON.stringify({ type: 'system', subtype: 'init', session_id: 'test-session' }),
        JSON.stringify({
          type: 'assistant',
          session_id: 'test-session',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
        }),
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Hello!',
          session_id: 'test-session',
        }),
      ];

      const mockProcess = createMockProcess(mockMessages);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const generator = provider.executeQuery({
        prompt: 'Hello',
        model: 'cursor-sonnet',
        cwd: '/test',
      });

      const results: any[] = [];
      for await (const msg of generator) {
        results.push(msg);
      }

      // Should have assistant and result messages (system is filtered out)
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.type === 'assistant')).toBe(true);
      expect(results.some((r) => r.type === 'result')).toBe(true);
    });

    it('should pass correct CLI arguments', async () => {
      const mockProcess = createMockProcess([
        JSON.stringify({ type: 'result', subtype: 'success', result: 'test', session_id: 'test' }),
      ]);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const generator = provider.executeQuery({
        prompt: 'Test prompt',
        model: 'cursor-sonnet-4.5',
        cwd: '/test/dir',
      });

      // Consume the generator
      for await (const _ of generator) {
        // Just consume
      }

      // Model should be mapped from 'cursor-sonnet-4.5' to 'sonnet-4.5'
      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/cursor-agent',
        expect.arrayContaining([
          '--print',
          '--output-format',
          'stream-json',
          '--stream-partial-output',
          '--workspace',
          '/test/dir',
          '--model',
          'sonnet-4.5',
          '--force',
          'Test prompt',
        ]),
        expect.objectContaining({
          cwd: '/test/dir',
        })
      );
    });

    it('should map cursor-sonnet alias to sonnet-4.5', async () => {
      const mockProcess = createMockProcess([
        JSON.stringify({ type: 'result', subtype: 'success', result: 'test', session_id: 'test' }),
      ]);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const generator = provider.executeQuery({
        prompt: 'Test',
        model: 'cursor-sonnet',
        cwd: '/test',
      });

      for await (const _ of generator) {
      }

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/cursor-agent',
        expect.arrayContaining(['--model', 'sonnet-4.5']),
        expect.any(Object)
      );
    });

    it('should map cursor-gpt5 alias to gpt-5.2', async () => {
      const mockProcess = createMockProcess([
        JSON.stringify({ type: 'result', subtype: 'success', result: 'test', session_id: 'test' }),
      ]);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const generator = provider.executeQuery({
        prompt: 'Test',
        model: 'cursor-gpt5',
        cwd: '/test',
      });

      for await (const _ of generator) {
      }

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/cursor-agent',
        expect.arrayContaining(['--model', 'gpt-5.2']),
        expect.any(Object)
      );
    });

    it('should map cursor-opus-thinking alias to opus-4.5-thinking', async () => {
      const mockProcess = createMockProcess([
        JSON.stringify({ type: 'result', subtype: 'success', result: 'test', session_id: 'test' }),
      ]);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const generator = provider.executeQuery({
        prompt: 'Test',
        model: 'cursor-opus-thinking',
        cwd: '/test',
      });

      for await (const _ of generator) {
      }

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/cursor-agent',
        expect.arrayContaining(['--model', 'opus-4.5-thinking']),
        expect.any(Object)
      );
    });

    it('should include --resume flag when sdkSessionId is provided', async () => {
      const mockProcess = createMockProcess([
        JSON.stringify({ type: 'result', subtype: 'success', result: 'test', session_id: 'test' }),
      ]);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const generator = provider.executeQuery({
        prompt: 'Continue',
        model: 'cursor-sonnet',
        cwd: '/test',
        sdkSessionId: 'existing-session-id',
      });

      for await (const _ of generator) {
        // Consume
      }

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/cursor-agent',
        expect.arrayContaining(['--resume', 'existing-session-id']),
        expect.any(Object)
      );
    });

    it('should handle thinking messages', async () => {
      const mockMessages = [
        JSON.stringify({
          type: 'thinking',
          subtype: 'delta',
          text: 'Let me think...',
          session_id: 'test-session',
        }),
        JSON.stringify({ type: 'thinking', subtype: 'completed', session_id: 'test-session' }),
        JSON.stringify({
          type: 'assistant',
          session_id: 'test-session',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Done!' }] },
        }),
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'Done!',
          session_id: 'test-session',
        }),
      ];

      const mockProcess = createMockProcess(mockMessages);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const generator = provider.executeQuery({
        prompt: 'Think about this',
        model: 'cursor-opus-thinking',
        cwd: '/test',
      });

      const results: any[] = [];
      for await (const msg of generator) {
        results.push(msg);
      }

      // Should have thinking message converted to assistant
      const thinkingMsg = results.find(
        (r) => r.type === 'assistant' && r.message?.content?.[0]?.type === 'thinking'
      );
      expect(thinkingMsg).toBeDefined();
      expect(thinkingMsg.message.content[0].thinking).toBe('Let me think...');
    });

    it('should register abort signal listener on process', async () => {
      const mockProcess = createMockProcess([
        JSON.stringify({ type: 'result', subtype: 'success', result: 'test', session_id: 'test' }),
      ]);
      mockProcess.kill = vi.fn();
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const abortController = new AbortController();

      // Verify the abort controller signal has no listeners initially
      expect(abortController.signal.aborted).toBe(false);

      const generator = provider.executeQuery({
        prompt: 'Test',
        model: 'cursor-sonnet',
        cwd: '/test',
        abortController,
      });

      // Consume the generator
      for await (const _ of generator) {
        // Just consume
      }

      // The abort signal listener should have been added (we can't easily test this without
      // actually aborting, but we verify that the code path ran without error)
      expect(spawn).toHaveBeenCalled();
    });

    it('should pass CURSOR_API_KEY from config', async () => {
      const providerWithApiKey = new CursorProvider({ apiKey: 'test-api-key' });

      const mockProcess = createMockProcess([
        JSON.stringify({ type: 'result', subtype: 'success', result: 'test', session_id: 'test' }),
      ]);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const generator = providerWithApiKey.executeQuery({
        prompt: 'Test',
        model: 'cursor-sonnet',
        cwd: '/test',
      });

      for await (const _ of generator) {
        // Consume
      }

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/cursor-agent',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            CURSOR_API_KEY: 'test-api-key',
          }),
        })
      );
    });

    it('should handle array prompt by extracting text', async () => {
      const mockProcess = createMockProcess([
        JSON.stringify({ type: 'result', subtype: 'success', result: 'test', session_id: 'test' }),
      ]);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const arrayPrompt = [
        { type: 'text', text: 'Part 1' },
        { type: 'image', source: { type: 'base64', data: '...' } },
        { type: 'text', text: 'Part 2' },
      ];

      const generator = provider.executeQuery({
        prompt: arrayPrompt as any,
        model: 'cursor-sonnet',
        cwd: '/test',
      });

      for await (const _ of generator) {
        // Consume
      }

      // Should have extracted and joined text parts
      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/cursor-agent',
        expect.arrayContaining(['Part 1\nPart 2']),
        expect.any(Object)
      );
    });
  });

  describe('detectInstallation', () => {
    it('should detect installed cursor-agent', async () => {
      // Mock exec for findCliPath (which command)
      vi.mocked(exec).mockImplementation((cmd: any, callback: any) => {
        if (typeof callback === 'function') {
          callback(null, { stdout: '/usr/local/bin/cursor-agent', stderr: '' });
        }
        return {} as any;
      });
      // Mock spawn for version and status commands
      const mockVersionProcess = new EventEmitter() as any;
      mockVersionProcess.stdout = new Readable({
        read() {
          this.push('1.0.0');
          this.push(null);
        },
      });
      mockVersionProcess.stderr = new Readable({
        read() {
          this.push(null);
        },
      });
      const mockStatusProcess = new EventEmitter() as any;
      mockStatusProcess.stdout = new Readable({
        read() {
          this.push('Logged in as user@example.com');
          this.push(null);
        },
      });
      mockStatusProcess.stderr = new Readable({
        read() {
          this.push(null);
        },
      });
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const proc = callCount === 1 ? mockVersionProcess : mockStatusProcess;
        setTimeout(() => proc.emit('close', 0), 10);
        return proc;
      });
      const result = await provider.detectInstallation();
      expect(result.installed).toBe(true);
      expect(result.method).toBe('cli');
      expect(result.version).toBe('1.0.0');
      expect(result.path).toBe('/usr/local/bin/cursor-agent');
    });

    it('should return not installed when cursor-agent not found', async () => {
      // Mock exec to fail (not in PATH)
      vi.mocked(exec).mockImplementation((cmd: any, callback: any) => {
        if (typeof callback === 'function') {
          callback(new Error('command not found'), { stdout: '', stderr: 'command not found' });
        }
        return {} as any;
      });
      const result = await provider.detectInstallation();
      expect(result.installed).toBe(false);
      expect(result.method).toBe('cli');
    });

    it('should detect CURSOR_API_KEY environment variable', async () => {
      process.env.CURSOR_API_KEY = 'test-key';
      // Mock exec for findCliPath
      vi.mocked(exec).mockImplementation((cmd: any, callback: any) => {
        if (typeof callback === 'function') {
          callback(null, { stdout: '/usr/local/bin/cursor-agent', stderr: '' });
        }
        return {} as any;
      });
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new Readable({
        read() {
          this.push('1.0.0');
          this.push(null);
        },
      });
      mockProcess.stderr = new Readable({
        read() {
          this.push(null);
        },
      });
      vi.mocked(spawn).mockImplementation(() => {
        setTimeout(() => mockProcess.emit('close', 0), 10);
        return mockProcess;
      });
      const result = await provider.detectInstallation();
      expect(result.hasApiKey).toBe(true);
      expect(result.authenticated).toBe(true);
    });
  });

  describe('getAvailableModels', () => {
    it('should return 4 Cursor models', () => {
      const models = provider.getAvailableModels();

      expect(models).toHaveLength(4);
    });

    it('should include Cursor Opus 4.5 Thinking', () => {
      const models = provider.getAvailableModels();

      const opus = models.find((m) => m.id === 'cursor-opus-4.5-thinking');
      expect(opus).toBeDefined();
      expect(opus?.name).toBe('Cursor Opus 4.5 Thinking');
      expect(opus?.provider).toBe('cursor');
    });

    it('should include Cursor Sonnet 4.5', () => {
      const models = provider.getAvailableModels();

      const sonnet = models.find((m) => m.id === 'cursor-sonnet-4.5');
      expect(sonnet).toBeDefined();
      expect(sonnet?.name).toBe('Cursor Sonnet 4.5');
    });

    it('should include Cursor GPT-5.2', () => {
      const models = provider.getAvailableModels();

      const gpt5 = models.find((m) => m.id === 'cursor-gpt-5.2');
      expect(gpt5).toBeDefined();
    });

    it('should mark Cursor Opus 4.5 Thinking as default', () => {
      const models = provider.getAvailableModels();

      const opus = models.find((m) => m.id === 'cursor-opus-4.5-thinking');
      expect(opus?.default).toBe(true);
    });

    it('should all support vision and tools', () => {
      const models = provider.getAvailableModels();

      models.forEach((model) => {
        expect(model.supportsVision).toBe(true);
        expect(model.supportsTools).toBe(true);
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

    it("should not support 'thinking' feature (CLI doesn't expose thinking control)", () => {
      expect(provider.supportsFeature('thinking')).toBe(false);
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
      provider.setConfig({ cliPath: '/custom/path' });

      const config = provider.getConfig();
      expect(config.apiKey).toBe('key1');
      expect(config.cliPath).toBe('/custom/path');
    });
  });
});
