import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from '@/services/agent-service.js';
import { ProviderFactory } from '@/providers/provider-factory.js';
import * as fs from 'fs/promises';
import * as imageHandler from '@automaker/utils';
import * as promptBuilder from '@automaker/utils';
import * as contextLoader from '@automaker/utils';
import { collectAsyncGenerator } from '../../utils/helpers.js';

// Create a shared mock logger instance for assertions using vi.hoisted
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('fs/promises');
vi.mock('@/providers/provider-factory.js');
vi.mock('@automaker/utils', async () => {
  const actual = await vi.importActual<typeof import('@automaker/utils')>('@automaker/utils');
  return {
    ...actual,
    loadContextFiles: vi.fn(),
    buildPromptWithImages: vi.fn(),
    readImageAsBase64: vi.fn(),
    createLogger: vi.fn(() => mockLogger),
  };
});

describe('agent-service.ts', () => {
  let service: AgentService;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentService('/test/data', mockEvents as any);

    // Mock loadContextFiles to return empty context by default
    vi.mocked(contextLoader.loadContextFiles).mockResolvedValue({
      files: [],
      formattedPrompt: '',
    });
  });

  describe('initialize', () => {
    it('should create state directory', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await service.initialize();

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('agent-sessions'), {
        recursive: true,
      });
    });
  });

  describe('startConversation', () => {
    it('should create new session with empty messages', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await service.startConversation({
        sessionId: 'session-1',
        workingDirectory: '/test/dir',
      });

      expect(result.success).toBe(true);
      expect(result.messages).toEqual([]);
      expect(result.sessionId).toBe('session-1');
    });

    it('should load existing session', async () => {
      const existingMessages = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMessages));

      const result = await service.startConversation({
        sessionId: 'session-1',
        workingDirectory: '/test/dir',
      });

      expect(result.success).toBe(true);
      expect(result.messages).toEqual(existingMessages);
    });

    it('should use process.cwd() if no working directory provided', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await service.startConversation({
        sessionId: 'session-1',
      });

      expect(result.success).toBe(true);
    });

    it('should reuse existing session if already started', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      // Start session first time
      await service.startConversation({
        sessionId: 'session-1',
      });

      // Start again with same ID
      const result = await service.startConversation({
        sessionId: 'session-1',
      });

      expect(result.success).toBe(true);
      // First call reads metadata file and session file via ensureSession (2 calls)
      // Since no metadata or messages exist, a fresh session is created without loading queue state.
      // Second call should reuse in-memory session (no additional calls)
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await service.startConversation({
        sessionId: 'session-1',
        workingDirectory: '/test/dir',
      });
    });

    it('should throw if session not found', async () => {
      await expect(
        service.sendMessage({
          sessionId: 'nonexistent',
          message: 'Hello',
        })
      ).rejects.toThrow('Session nonexistent not found');
    });

    it('should process message and stream responses', async () => {
      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Response' }],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      vi.mocked(promptBuilder.buildPromptWithImages).mockResolvedValue({
        content: 'Hello',
        hasImages: false,
      });

      const result = await service.sendMessage({
        sessionId: 'session-1',
        message: 'Hello',
        workingDirectory: '/custom/dir',
      });

      expect(result.success).toBe(true);
      expect(mockEvents.emit).toHaveBeenCalled();
    });

    it('should emit tool_result events from provider stream', async () => {
      const mockProvider = {
        getName: () => 'gemini',
        executeQuery: async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  name: 'Read',
                  tool_use_id: 'tool-1',
                  input: { file_path: 'README.md' },
                },
              ],
            },
          };
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool-1',
                  content: 'File contents here',
                },
              ],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      vi.mocked(promptBuilder.buildPromptWithImages).mockResolvedValue({
        content: 'Hello',
        hasImages: false,
      });

      await service.sendMessage({
        sessionId: 'session-1',
        message: 'Hello',
      });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'agent:stream',
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'tool_result',
          tool: {
            name: 'Read',
            input: {
              toolUseId: 'tool-1',
              content: 'File contents here',
            },
          },
        })
      );
    });

    it('should emit tool_result with unknown tool name for unregistered tool_use_id', async () => {
      const mockProvider = {
        getName: () => 'gemini',
        executeQuery: async function* () {
          // Yield tool_result WITHOUT a preceding tool_use (unregistered tool_use_id)
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'unregistered-id',
                  content: 'Some result content',
                },
              ],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      vi.mocked(promptBuilder.buildPromptWithImages).mockResolvedValue({
        content: 'Hello',
        hasImages: false,
      });

      await service.sendMessage({
        sessionId: 'session-1',
        message: 'Hello',
      });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'agent:stream',
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'tool_result',
          tool: {
            name: 'unknown',
            input: {
              toolUseId: 'unregistered-id',
              content: 'Some result content',
            },
          },
        })
      );
    });

    it('should handle images in message', async () => {
      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      vi.mocked(imageHandler.readImageAsBase64).mockResolvedValue({
        base64: 'base64data',
        mimeType: 'image/png',
        filename: 'test.png',
        originalPath: '/path/test.png',
      });

      vi.mocked(promptBuilder.buildPromptWithImages).mockResolvedValue({
        content: 'Check image',
        hasImages: true,
      });

      await service.sendMessage({
        sessionId: 'session-1',
        message: 'Check this',
        imagePaths: ['/path/test.png'],
      });

      expect(imageHandler.readImageAsBase64).toHaveBeenCalledWith('/path/test.png');
    });

    it('should handle failed image loading gracefully', async () => {
      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      vi.mocked(imageHandler.readImageAsBase64).mockRejectedValue(new Error('Image not found'));

      vi.mocked(promptBuilder.buildPromptWithImages).mockResolvedValue({
        content: 'Check image',
        hasImages: false,
      });

      await service.sendMessage({
        sessionId: 'session-1',
        message: 'Check this',
        imagePaths: ['/path/test.png'],
      });

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use custom model if provided', async () => {
      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      vi.mocked(promptBuilder.buildPromptWithImages).mockResolvedValue({
        content: 'Hello',
        hasImages: false,
      });

      await service.sendMessage({
        sessionId: 'session-1',
        message: 'Hello',
        model: 'claude-sonnet-4-6',
      });

      expect(ProviderFactory.getProviderForModel).toHaveBeenCalledWith('claude-sonnet-4-6');
    });

    it('should save session messages', async () => {
      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      vi.mocked(promptBuilder.buildPromptWithImages).mockResolvedValue({
        content: 'Hello',
        hasImages: false,
      });

      await service.sendMessage({
        sessionId: 'session-1',
        message: 'Hello',
      });

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should include context/history preparation for Gemini requests', async () => {
      let capturedOptions: any;
      const mockProvider = {
        getName: () => 'gemini',
        executeQuery: async function* (options: any) {
          capturedOptions = options;
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModelName).mockReturnValue('gemini');
      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);
      vi.mocked(promptBuilder.buildPromptWithImages).mockResolvedValue({
        content: 'Hello',
        hasImages: false,
      });

      await service.sendMessage({
        sessionId: 'session-1',
        message: 'Hello',
        model: 'gemini-2.5-flash',
      });

      expect(contextLoader.loadContextFiles).toHaveBeenCalled();
      expect(capturedOptions).toBeDefined();
    });
  });

  describe('stopExecution', () => {
    it('should stop execution for a session', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await service.startConversation({
        sessionId: 'session-1',
      });

      // Should return success
      const result = await service.stopExecution('session-1');
      expect(result.success).toBeDefined();
    });
  });

  describe('getHistory', () => {
    it('should return message history', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await service.startConversation({
        sessionId: 'session-1',
      });

      const history = await service.getHistory('session-1');

      expect(history).toBeDefined();
      expect(history?.messages).toEqual([]);
    });

    it('should handle non-existent session', async () => {
      const history = await service.getHistory('nonexistent');
      expect(history).toBeDefined();
      expect(history.success).toBe(false);
      expect(history.error).toBeDefined();
      expect(typeof history.error).toBe('string');
    });
  });

  describe('clearSession', () => {
    it('should clear session messages', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await service.startConversation({
        sessionId: 'session-1',
      });

      await service.clearSession('session-1');

      const history = await service.getHistory('session-1');
      expect(history?.messages).toEqual([]);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should clear sdkSessionId from persisted metadata to prevent stale session errors', async () => {
      // Setup: Session exists in metadata with an sdkSessionId (simulating
      // a session that previously communicated with a CLI provider like OpenCode)
      const metadata = {
        'session-1': {
          id: 'session-1',
          name: 'Test Session',
          workingDirectory: '/test/dir',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          sdkSessionId: 'stale-opencode-session-id',
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(metadata));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      // Start the session (loads from disk metadata)
      await service.startConversation({
        sessionId: 'session-1',
        workingDirectory: '/test/dir',
      });

      // Clear the session
      await service.clearSession('session-1');

      // Verify that the LAST writeFile call to sessions-metadata.json
      // (from clearSdkSessionId) has sdkSessionId removed.
      // Earlier writes may still include it (e.g., from updateSessionTimestamp).
      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      const metadataWriteCalls = writeFileCalls.filter(
        (call) =>
          typeof call[0] === 'string' && (call[0] as string).includes('sessions-metadata.json')
      );

      expect(metadataWriteCalls.length).toBeGreaterThan(0);
      const lastMetadataWriteCall = metadataWriteCalls[metadataWriteCalls.length - 1];
      const savedMetadata = JSON.parse(lastMetadataWriteCall[1] as string);
      expect(savedMetadata['session-1'].sdkSessionId).toBeUndefined();
    });
  });

  describe('clearSdkSessionId', () => {
    it('should remove sdkSessionId from persisted metadata', async () => {
      const metadata = {
        'session-1': {
          id: 'session-1',
          name: 'Test Session',
          workingDirectory: '/test/dir',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          sdkSessionId: 'old-provider-session-id',
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(metadata));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await service.clearSdkSessionId('session-1');

      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      expect(writeFileCalls.length).toBeGreaterThan(0);

      const savedMetadata = JSON.parse(writeFileCalls[0][1] as string);
      expect(savedMetadata['session-1'].sdkSessionId).toBeUndefined();
      expect(savedMetadata['session-1'].updatedAt).not.toBe('2024-01-01T00:00:00Z');
    });

    it('should do nothing if session has no sdkSessionId', async () => {
      const metadata = {
        'session-1': {
          id: 'session-1',
          name: 'Test Session',
          workingDirectory: '/test/dir',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(metadata));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await service.clearSdkSessionId('session-1');

      // writeFile should not have been called since there's no sdkSessionId to clear
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should do nothing if session does not exist in metadata', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{}');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await service.clearSdkSessionId('nonexistent');

      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('createSession', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue('{}');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('should create a new session with metadata', async () => {
      const session = await service.createSession('Test Session', '/test/project', '/test/dir');

      expect(session.id).toBeDefined();
      expect(session.name).toBe('Test Session');
      expect(session.projectPath).toBe('/test/project');
      expect(session.workingDirectory).toBeDefined();
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });

    it('should use process.cwd() if no working directory provided', async () => {
      const session = await service.createSession('Test Session');

      expect(session.workingDirectory).toBeDefined();
    });

    it('should validate working directory', async () => {
      // Set ALLOWED_ROOT_DIRECTORY to restrict paths
      const originalAllowedRoot = process.env.ALLOWED_ROOT_DIRECTORY;
      process.env.ALLOWED_ROOT_DIRECTORY = '/allowed/projects';

      // Re-import platform to initialize with new env var
      vi.resetModules();
      const { initAllowedPaths } = await import('@automaker/platform');
      initAllowedPaths();

      const { AgentService } = await import('@/services/agent-service.js');
      const testService = new AgentService('/test/data', mockEvents as any);
      vi.mocked(fs.readFile).mockResolvedValue('{}');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await expect(
        testService.createSession('Test Session', undefined, '/invalid/path')
      ).rejects.toThrow();

      // Restore original value
      if (originalAllowedRoot) {
        process.env.ALLOWED_ROOT_DIRECTORY = originalAllowedRoot;
      } else {
        delete process.env.ALLOWED_ROOT_DIRECTORY;
      }
      vi.resetModules();
      const { initAllowedPaths: reinit } = await import('@automaker/platform');
      reinit();
    });
  });

  describe('setSessionModel', () => {
    beforeEach(async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await service.startConversation({
        sessionId: 'session-1',
      });
    });

    it('should set model for existing session', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{"session-1": {}}');
      const result = await service.setSessionModel('session-1', 'claude-sonnet-4-6');

      expect(result).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const result = await service.setSessionModel('nonexistent', 'claude-sonnet-4-6');

      expect(result).toBe(false);
    });
  });

  describe('updateSession', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          'session-1': {
            id: 'session-1',
            name: 'Test Session',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('should update session metadata', async () => {
      const result = await service.updateSession('session-1', { name: 'Updated Name' });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Updated Name');
      expect(result?.updatedAt).not.toBe('2024-01-01T00:00:00Z');
    });

    it('should return null for non-existent session', async () => {
      const result = await service.updateSession('nonexistent', { name: 'Updated Name' });

      expect(result).toBeNull();
    });
  });

  describe('archiveSession', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          'session-1': {
            id: 'session-1',
            name: 'Test Session',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('should archive a session', async () => {
      const result = await service.archiveSession('session-1');

      expect(result).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const result = await service.archiveSession('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('unarchiveSession', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          'session-1': {
            id: 'session-1',
            name: 'Test Session',
            archived: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    });

    it('should unarchive a session', async () => {
      const result = await service.unarchiveSession('session-1');

      expect(result).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const result = await service.unarchiveSession('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteSession', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          'session-1': {
            id: 'session-1',
            name: 'Test Session',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
    });

    it('should delete a session', async () => {
      const result = await service.deleteSession('session-1');

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should return false for non-existent session', async () => {
      const result = await service.deleteSession('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('listSessions', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          'session-1': {
            id: 'session-1',
            name: 'Test Session 1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            archived: false,
          },
          'session-2': {
            id: 'session-2',
            name: 'Test Session 2',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-03T00:00:00Z',
            archived: true,
          },
        })
      );
    });

    it('should list non-archived sessions by default', async () => {
      const sessions = await service.listSessions();

      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe('session-1');
    });

    it('should include archived sessions when requested', async () => {
      const sessions = await service.listSessions(true);

      expect(sessions.length).toBe(2);
    });

    it('should sort sessions by updatedAt descending', async () => {
      const sessions = await service.listSessions(true);

      expect(sessions[0].id).toBe('session-2');
      expect(sessions[1].id).toBe('session-1');
    });
  });

  describe('addToQueue', () => {
    beforeEach(async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await service.startConversation({
        sessionId: 'session-1',
      });
    });

    it('should add prompt to queue', async () => {
      const result = await service.addToQueue('session-1', {
        message: 'Test prompt',
        imagePaths: ['/test/image.png'],
        model: 'claude-sonnet-4-6',
      });

      expect(result.success).toBe(true);
      expect(result.queuedPrompt).toBeDefined();
      expect(result.queuedPrompt?.message).toBe('Test prompt');
      expect(mockEvents.emit).toHaveBeenCalled();
    });

    it('should return error for non-existent session', async () => {
      const result = await service.addToQueue('nonexistent', {
        message: 'Test prompt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });
  });

  describe('getQueue', () => {
    beforeEach(async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await service.startConversation({
        sessionId: 'session-1',
      });
    });

    it('should return queue for session', async () => {
      await service.addToQueue('session-1', { message: 'Test prompt' });
      const result = await service.getQueue('session-1');

      expect(result.success).toBe(true);
      expect(result.queue).toBeDefined();
      expect(result.queue?.length).toBe(1);
    });

    it('should return error for non-existent session', async () => {
      const result = await service.getQueue('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });
  });

  describe('removeFromQueue', () => {
    beforeEach(async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await service.startConversation({
        sessionId: 'session-1',
      });

      const addResult = await service.addToQueue('session-1', { message: 'Test prompt' });
      vi.clearAllMocks();
    });

    it('should remove prompt from queue', async () => {
      const queueResult = await service.getQueue('session-1');
      const promptId = queueResult.queue![0].id;

      const result = await service.removeFromQueue('session-1', promptId);

      expect(result.success).toBe(true);
      expect(mockEvents.emit).toHaveBeenCalled();
    });

    it('should return error for non-existent session', async () => {
      const result = await service.removeFromQueue('nonexistent', 'prompt-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });

    it('should return error for non-existent prompt', async () => {
      const result = await service.removeFromQueue('session-1', 'nonexistent-prompt-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Prompt not found in queue');
    });
  });

  describe('clearQueue', () => {
    beforeEach(async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await service.startConversation({
        sessionId: 'session-1',
      });

      await service.addToQueue('session-1', { message: 'Test prompt 1' });
      await service.addToQueue('session-1', { message: 'Test prompt 2' });
      vi.clearAllMocks();
    });

    it('should clear all prompts from queue', async () => {
      const result = await service.clearQueue('session-1');

      expect(result.success).toBe(true);
      const queueResult = await service.getQueue('session-1');
      expect(queueResult.queue?.length).toBe(0);
      expect(mockEvents.emit).toHaveBeenCalled();
    });

    it('should return error for non-existent session', async () => {
      const result = await service.clearQueue('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });
  });
});
