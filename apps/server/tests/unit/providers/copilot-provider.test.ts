import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopilotProvider, CopilotErrorCode } from '@/providers/copilot-provider.js';

// Mock the Copilot SDK
vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue({
      sessionId: 'test-session',
      send: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    }),
  })),
}));

// Mock child_process with all needed exports
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

// Mock fs (synchronous) for CLI detection (existsSync)
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn().mockRejectedValue(new Error('Not found')),
  readFile: vi.fn().mockRejectedValue(new Error('Not found')),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Import execSync after mocking
import { execSync } from 'child_process';
import * as fs from 'fs';

describe('copilot-provider.ts', () => {
  let provider: CopilotProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs.existsSync for CLI path validation
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // Mock CLI detection to find the CLI
    // The CliProvider base class uses 'which copilot' (Unix) or 'where copilot' (Windows)
    // to find the CLI path, then validates with fs.existsSync
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      // CLI path detection (which/where command)
      if (cmd.startsWith('which ') || cmd.startsWith('where ')) {
        return '/usr/local/bin/copilot';
      }
      if (cmd.includes('--version')) {
        return '1.0.0';
      }
      if (cmd.includes('gh auth status')) {
        return 'Logged in to github.com account testuser';
      }
      if (cmd.includes('models list')) {
        return JSON.stringify([{ id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5' }]);
      }
      return '';
    });

    provider = new CopilotProvider();
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getName', () => {
    it("should return 'copilot' as provider name", () => {
      expect(provider.getName()).toBe('copilot');
    });
  });

  describe('getCliName', () => {
    it("should return 'copilot' as CLI name", () => {
      expect(provider.getCliName()).toBe('copilot');
    });
  });

  describe('supportsFeature', () => {
    it('should support tools feature', () => {
      expect(provider.supportsFeature('tools')).toBe(true);
    });

    it('should support text feature', () => {
      expect(provider.supportsFeature('text')).toBe(true);
    });

    it('should support streaming feature', () => {
      expect(provider.supportsFeature('streaming')).toBe(true);
    });

    it('should NOT support vision feature (not implemented yet)', () => {
      expect(provider.supportsFeature('vision')).toBe(false);
    });

    it('should not support unknown feature', () => {
      expect(provider.supportsFeature('unknown')).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return static model definitions', () => {
      const models = provider.getAvailableModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      // All models should have required fields
      models.forEach((model) => {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.provider).toBe('copilot');
      });
    });

    it('should include copilot- prefix in model IDs', () => {
      const models = provider.getAvailableModels();
      models.forEach((model) => {
        expect(model.id).toMatch(/^copilot-/);
      });
    });
  });

  describe('checkAuth', () => {
    it('should return authenticated status when gh CLI is logged in', async () => {
      // Set up mocks BEFORE creating provider to ensure CLI detection succeeds
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        // CLI path detection (which/where command)
        if (cmd.startsWith('which ') || cmd.startsWith('where ')) {
          return '/usr/local/bin/copilot';
        }
        if (cmd.includes('--version')) {
          return '1.0.0';
        }
        if (cmd.includes('gh auth status')) {
          return 'Logged in to github.com account testuser';
        }
        return '';
      });

      // Create fresh provider with the mock in place
      const freshProvider = new CopilotProvider();
      const status = await freshProvider.checkAuth();
      expect(status.authenticated).toBe(true);
      expect(status.method).toBe('oauth');
      expect(status.login).toBe('testuser');
    });

    it('should return unauthenticated when gh auth fails', async () => {
      // Set up mocks BEFORE creating provider
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        // CLI path detection (which/where command)
        if (cmd.startsWith('which ') || cmd.startsWith('where ')) {
          return '/usr/local/bin/copilot';
        }
        if (cmd.includes('--version')) {
          return '1.0.0';
        }
        if (cmd.includes('gh auth status')) {
          throw new Error('Not logged in');
        }
        if (cmd.includes('copilot auth status')) {
          throw new Error('Not logged in');
        }
        return '';
      });

      // Create fresh provider with the mock in place
      const freshProvider = new CopilotProvider();
      const status = await freshProvider.checkAuth();
      expect(status.authenticated).toBe(false);
      expect(status.method).toBe('none');
    });

    it('should detect GITHUB_TOKEN environment variable', async () => {
      process.env.GITHUB_TOKEN = 'test-token';

      // Set up mocks BEFORE creating provider
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        // CLI path detection (which/where command)
        if (cmd.startsWith('which ') || cmd.startsWith('where ')) {
          return '/usr/local/bin/copilot';
        }
        if (cmd.includes('--version')) {
          return '1.0.0';
        }
        if (cmd.includes('gh auth status')) {
          throw new Error('Not logged in');
        }
        if (cmd.includes('copilot auth status')) {
          throw new Error('Not logged in');
        }
        return '';
      });

      // Create fresh provider with the mock in place
      const freshProvider = new CopilotProvider();
      const status = await freshProvider.checkAuth();
      expect(status.authenticated).toBe(true);
      expect(status.method).toBe('oauth');

      delete process.env.GITHUB_TOKEN;
    });
  });

  describe('detectInstallation', () => {
    it('should detect installed CLI', async () => {
      // Set up mocks BEFORE creating provider
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        // CLI path detection (which/where command)
        if (cmd.startsWith('which ') || cmd.startsWith('where ')) {
          return '/usr/local/bin/copilot';
        }
        if (cmd.includes('--version')) {
          return '1.2.3';
        }
        if (cmd.includes('gh auth status')) {
          return 'Logged in to github.com account testuser';
        }
        return '';
      });

      // Create fresh provider with the mock in place
      const freshProvider = new CopilotProvider();
      const status = await freshProvider.detectInstallation();
      expect(status.installed).toBe(true);
      expect(status.version).toBe('1.2.3');
      expect(status.authenticated).toBe(true);
    });
  });

  describe('normalizeEvent', () => {
    it('should normalize assistant.message event', () => {
      const event = {
        type: 'assistant.message',
        data: { content: 'Hello, world!' },
      };

      const result = provider.normalizeEvent(event);
      expect(result).toEqual({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello, world!' }],
        },
      });
    });

    it('should skip assistant.message_delta event', () => {
      const event = {
        type: 'assistant.message_delta',
        data: { delta: 'partial' },
      };

      const result = provider.normalizeEvent(event);
      expect(result).toBeNull();
    });

    it('should normalize tool.execution_start event', () => {
      const event = {
        type: 'tool.execution_start',
        data: {
          toolName: 'read_file',
          toolCallId: 'call-123',
          input: { path: '/test/file.txt' },
        },
      };

      const result = provider.normalizeEvent(event);
      expect(result).toEqual({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read', // Normalized from read_file
              tool_use_id: 'call-123',
              input: { path: '/test/file.txt', file_path: '/test/file.txt' }, // Path normalized
            },
          ],
        },
      });
    });

    it('should normalize tool.execution_end event', () => {
      const event = {
        type: 'tool.execution_end',
        data: {
          toolName: 'read_file',
          toolCallId: 'call-123',
          result: 'file content',
        },
      };

      const result = provider.normalizeEvent(event);
      expect(result).toEqual({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call-123',
              content: 'file content',
            },
          ],
        },
      });
    });

    it('should handle tool.execution_end with error', () => {
      const event = {
        type: 'tool.execution_end',
        data: {
          toolName: 'bash',
          toolCallId: 'call-456',
          error: 'Command failed',
        },
      };

      const result = provider.normalizeEvent(event);
      expect(result?.message?.content?.[0]).toMatchObject({
        type: 'tool_result',
        content: '[ERROR] Command failed',
      });
    });

    it('should normalize session.idle to success result', () => {
      const event = { type: 'session.idle' };

      const result = provider.normalizeEvent(event);
      expect(result).toEqual({
        type: 'result',
        subtype: 'success',
      });
    });

    it('should normalize session.error to error event', () => {
      const event = {
        type: 'session.error',
        data: { message: 'Something went wrong' },
      };

      const result = provider.normalizeEvent(event);
      expect(result).toEqual({
        type: 'error',
        error: 'Something went wrong',
      });
    });

    it('should return null for unknown event types', () => {
      const event = { type: 'unknown.event' };

      const result = provider.normalizeEvent(event);
      expect(result).toBeNull();
    });
  });

  describe('mapError', () => {
    it('should map authentication errors', () => {
      const errorInfo = (provider as any).mapError('not authenticated', null);
      expect(errorInfo.code).toBe(CopilotErrorCode.NOT_AUTHENTICATED);
      expect(errorInfo.recoverable).toBe(true);
    });

    it('should map rate limit errors', () => {
      const errorInfo = (provider as any).mapError('rate limit exceeded', null);
      expect(errorInfo.code).toBe(CopilotErrorCode.RATE_LIMITED);
      expect(errorInfo.recoverable).toBe(true);
    });

    it('should map model unavailable errors', () => {
      const errorInfo = (provider as any).mapError('model not available', null);
      expect(errorInfo.code).toBe(CopilotErrorCode.MODEL_UNAVAILABLE);
      expect(errorInfo.recoverable).toBe(true);
    });

    it('should map network errors', () => {
      const errorInfo = (provider as any).mapError('connection refused', null);
      expect(errorInfo.code).toBe(CopilotErrorCode.NETWORK_ERROR);
      expect(errorInfo.recoverable).toBe(true);
    });

    it('should map process crash (exit code 137)', () => {
      const errorInfo = (provider as any).mapError('', 137);
      expect(errorInfo.code).toBe(CopilotErrorCode.PROCESS_CRASHED);
      expect(errorInfo.recoverable).toBe(true);
    });

    it('should return unknown error for unrecognized errors', () => {
      const errorInfo = (provider as any).mapError('some random error', 1);
      expect(errorInfo.code).toBe(CopilotErrorCode.UNKNOWN);
      expect(errorInfo.recoverable).toBe(false);
    });
  });

  describe('model cache', () => {
    it('should indicate when cache is empty', () => {
      expect(provider.hasCachedModels()).toBe(false);
    });

    it('should clear model cache', () => {
      provider.clearModelCache();
      expect(provider.hasCachedModels()).toBe(false);
    });
  });

  describe('tool name normalization', () => {
    it('should normalize read_file to Read', () => {
      const event = {
        type: 'tool.execution_start',
        data: { toolName: 'read_file', toolCallId: 'id', input: {} },
      };
      const result = provider.normalizeEvent(event);
      expect(result?.message?.content?.[0]).toMatchObject({ name: 'Read' });
    });

    it('should normalize write_file to Write', () => {
      const event = {
        type: 'tool.execution_start',
        data: { toolName: 'write_file', toolCallId: 'id', input: {} },
      };
      const result = provider.normalizeEvent(event);
      expect(result?.message?.content?.[0]).toMatchObject({ name: 'Write' });
    });

    it('should normalize run_shell to Bash', () => {
      const event = {
        type: 'tool.execution_start',
        data: { toolName: 'run_shell', toolCallId: 'id', input: {} },
      };
      const result = provider.normalizeEvent(event);
      expect(result?.message?.content?.[0]).toMatchObject({ name: 'Bash' });
    });

    it('should normalize search to Grep', () => {
      const event = {
        type: 'tool.execution_start',
        data: { toolName: 'search', toolCallId: 'id', input: {} },
      };
      const result = provider.normalizeEvent(event);
      expect(result?.message?.content?.[0]).toMatchObject({ name: 'Grep' });
    });

    it('should normalize todo_write to TodoWrite', () => {
      const event = {
        type: 'tool.execution_start',
        data: {
          toolName: 'todo_write',
          toolCallId: 'id',
          input: {
            todos: [{ description: 'Test task', status: 'pending' }],
          },
        },
      };
      const result = provider.normalizeEvent(event);
      expect(result?.message?.content?.[0]).toMatchObject({ name: 'TodoWrite' });
    });

    it('should normalize todo content from description', () => {
      const event = {
        type: 'tool.execution_start',
        data: {
          toolName: 'todo_write',
          toolCallId: 'id',
          input: {
            todos: [{ description: 'Test task', status: 'pending' }],
          },
        },
      };
      const result = provider.normalizeEvent(event);
      const todoInput = (result?.message?.content?.[0] as any)?.input;
      expect(todoInput.todos[0]).toMatchObject({
        content: 'Test task',
        status: 'pending',
        activeForm: 'Test task',
      });
    });

    it('should map cancelled status to completed', () => {
      const event = {
        type: 'tool.execution_start',
        data: {
          toolName: 'todo_write',
          toolCallId: 'id',
          input: {
            todos: [{ description: 'Cancelled task', status: 'cancelled' }],
          },
        },
      };
      const result = provider.normalizeEvent(event);
      const todoInput = (result?.message?.content?.[0] as any)?.input;
      expect(todoInput.todos[0].status).toBe('completed');
    });
  });
});
