import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from '@/services/agent-service.js';
import { ProviderFactory } from '@/providers/provider-factory.js';
import * as fs from 'fs/promises';
import * as imageHandler from '@automaker/utils';
import * as promptBuilder from '@automaker/utils';
import * as contextLoader from '@automaker/utils';
import { collectAsyncGenerator } from '../../utils/helpers.js';

vi.mock('fs/promises');
vi.mock('@/providers/provider-factory.js');
vi.mock('@automaker/utils');

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
      // First call reads session file, metadata file, and queue state file (3 calls)
      // Second call should reuse in-memory session (no additional calls)
      expect(fs.readFile).toHaveBeenCalledTimes(3);
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

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await service.sendMessage({
        sessionId: 'session-1',
        message: 'Check this',
        imagePaths: ['/path/test.png'],
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
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
        model: 'claude-sonnet-4-20250514',
      });

      expect(ProviderFactory.getProviderForModel).toHaveBeenCalledWith('claude-sonnet-4-20250514');
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

      const history = service.getHistory('session-1');

      expect(history).toBeDefined();
      expect(history?.messages).toEqual([]);
    });

    it('should handle non-existent session', () => {
      const history = service.getHistory('nonexistent');
      expect(history).toBeDefined(); // Returns error object
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

      const history = service.getHistory('session-1');
      expect(history?.messages).toEqual([]);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});
