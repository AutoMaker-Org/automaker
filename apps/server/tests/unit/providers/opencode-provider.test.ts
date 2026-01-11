import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpencodeProvider,
  resetToolUseIdCounter,
} from '../../../src/providers/opencode-provider.js';
import type { ProviderMessage } from '@automaker/types';
import { collectAsyncGenerator } from '../../utils/helpers.js';
import { spawnJSONLProcess, getOpenCodeAuthIndicators } from '@automaker/platform';

vi.mock('@automaker/platform', () => ({
  spawnJSONLProcess: vi.fn(),
  isWslAvailable: vi.fn().mockReturnValue(false),
  findCliInWsl: vi.fn().mockReturnValue(null),
  createWslCommand: vi.fn(),
  windowsToWslPath: vi.fn(),
  getOpenCodeAuthIndicators: vi.fn().mockResolvedValue({
    hasAuthFile: false,
    hasOAuthToken: false,
    hasApiKey: false,
  }),
}));

describe('opencode-provider.ts', () => {
  let provider: OpencodeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    resetToolUseIdCounter();
    provider = new OpencodeProvider();
  });

  afterEach(() => {
    // Note: Don't use vi.restoreAllMocks() here as it would undo the module-level
    // mock implementations (like getOpenCodeAuthIndicators) set up with vi.mock()
  });

  // ==========================================================================
  // Basic Provider Tests
  // ==========================================================================

  describe('getName', () => {
    it("should return 'opencode' as provider name", () => {
      expect(provider.getName()).toBe('opencode');
    });
  });

  describe('getCliName', () => {
    it("should return 'opencode' as CLI name", () => {
      expect(provider.getCliName()).toBe('opencode');
    });
  });

  describe('getAvailableModels', () => {
    it('should return 10 models', () => {
      const models = provider.getAvailableModels();
      expect(models).toHaveLength(10);
    });

    it('should include Claude Sonnet 4.5 (Bedrock) as default', () => {
      const models = provider.getAvailableModels();
      const sonnet = models.find(
        (m) => m.id === 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0'
      );

      expect(sonnet).toBeDefined();
      expect(sonnet?.name).toBe('Claude Sonnet 4.5 (Bedrock)');
      expect(sonnet?.provider).toBe('opencode');
      expect(sonnet?.default).toBe(true);
      expect(sonnet?.modelString).toBe('amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0');
    });

    it('should include Claude Opus 4.5 (Bedrock)', () => {
      const models = provider.getAvailableModels();
      const opus = models.find(
        (m) => m.id === 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0'
      );

      expect(opus).toBeDefined();
      expect(opus?.name).toBe('Claude Opus 4.5 (Bedrock)');
      expect(opus?.modelString).toBe('amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0');
    });

    it('should include Claude Haiku 4.5 (Bedrock)', () => {
      const models = provider.getAvailableModels();
      const haiku = models.find(
        (m) => m.id === 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0'
      );

      expect(haiku).toBeDefined();
      expect(haiku?.name).toBe('Claude Haiku 4.5 (Bedrock)');
      expect(haiku?.tier).toBe('standard');
    });

    it('should include free tier Big Pickle model', () => {
      const models = provider.getAvailableModels();
      const bigPickle = models.find((m) => m.id === 'opencode/big-pickle');

      expect(bigPickle).toBeDefined();
      expect(bigPickle?.name).toBe('Big Pickle (Free)');
      expect(bigPickle?.modelString).toBe('opencode/big-pickle');
      expect(bigPickle?.tier).toBe('basic');
    });

    it('should include DeepSeek R1 (Bedrock)', () => {
      const models = provider.getAvailableModels();
      const deepseek = models.find((m) => m.id === 'amazon-bedrock/deepseek.r1-v1:0');

      expect(deepseek).toBeDefined();
      expect(deepseek?.name).toBe('DeepSeek R1 (Bedrock)');
      expect(deepseek?.tier).toBe('premium');
    });

    it('should have all models support tools', () => {
      const models = provider.getAvailableModels();

      models.forEach((model) => {
        expect(model.supportsTools).toBe(true);
      });
    });

    it('should have models with modelString property', () => {
      const models = provider.getAvailableModels();

      for (const model of models) {
        expect(model).toHaveProperty('modelString');
        expect(typeof model.modelString).toBe('string');
      }
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

    it("should not support 'thinking' feature", () => {
      expect(provider.supportsFeature('thinking')).toBe(false);
    });

    it("should not support 'mcp' feature", () => {
      expect(provider.supportsFeature('mcp')).toBe(false);
    });

    it("should not support 'cli' feature", () => {
      expect(provider.supportsFeature('cli')).toBe(false);
    });

    it('should return false for unknown features', () => {
      expect(provider.supportsFeature('unknown-feature')).toBe(false);
      expect(provider.supportsFeature('nonexistent')).toBe(false);
      expect(provider.supportsFeature('')).toBe(false);
    });
  });

  // ==========================================================================
  // buildCliArgs Tests
  // ==========================================================================

  describe('buildCliArgs', () => {
    it('should build correct args with run subcommand', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: 'opencode/big-pickle',
        cwd: '/tmp/project',
      });

      expect(args[0]).toBe('run');
    });

    it('should include --format json for streaming output', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: 'opencode/big-pickle',
        cwd: '/tmp/project',
      });

      const formatIndex = args.indexOf('--format');
      expect(formatIndex).toBeGreaterThan(-1);
      expect(args[formatIndex + 1]).toBe('json');
    });

    it('should include model with --model flag', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: 'anthropic/claude-sonnet-4-5',
        cwd: '/tmp/project',
      });

      const modelIndex = args.indexOf('--model');
      expect(modelIndex).toBeGreaterThan(-1);
      expect(args[modelIndex + 1]).toBe('anthropic/claude-sonnet-4-5');
    });

    it('should strip opencode- prefix from model', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: 'opencode-anthropic/claude-sonnet-4-5',
        cwd: '/tmp/project',
      });

      const modelIndex = args.indexOf('--model');
      expect(args[modelIndex + 1]).toBe('anthropic/claude-sonnet-4-5');
    });

    it('should handle missing cwd', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: 'opencode/big-pickle',
      });

      expect(args).not.toContain('-c');
    });

    it('should handle model from opencode provider', () => {
      const args = provider.buildCliArgs({
        prompt: 'Hello',
        model: 'opencode/big-pickle',
        cwd: '/tmp/project',
      });

      expect(args).toContain('--model');
      expect(args).toContain('opencode/big-pickle');
    });
  });

  // ==========================================================================
  // normalizeEvent Tests
  // ==========================================================================

  describe('normalizeEvent', () => {
    describe('text events (new OpenCode format)', () => {
      it('should convert text to assistant message with text content', () => {
        const event = {
          type: 'text',
          part: {
            type: 'text',
            text: 'Hello, world!',
          },
          sessionID: 'test-session',
        };

        const result = provider.normalizeEvent(event);

        expect(result).toEqual({
          type: 'assistant',
          session_id: 'test-session',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Hello, world!',
              },
            ],
          },
        });
      });

      it('should return null for empty text', () => {
        const event = {
          type: 'text',
          part: {
            type: 'text',
            text: '',
          },
        };

        const result = provider.normalizeEvent(event);

        expect(result).toBeNull();
      });

      it('should return null for text with undefined text', () => {
        const event = {
          type: 'text',
          part: {},
        };

        const result = provider.normalizeEvent(event);

        expect(result).toBeNull();
      });
    });

    describe('tool_call events', () => {
      it('should convert tool_call to assistant message with tool_use content', () => {
        const event = {
          type: 'tool_call',
          part: {
            type: 'tool-call',
            call_id: 'call-123',
            name: 'Read',
            args: { file_path: '/tmp/test.txt' },
          },
          sessionID: 'test-session',
        };

        const result = provider.normalizeEvent(event);

        expect(result).toEqual({
          type: 'assistant',
          session_id: 'test-session',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                name: 'Read',
                tool_use_id: 'call-123',
                input: { file_path: '/tmp/test.txt' },
              },
            ],
          },
        });
      });

      it('should generate tool_use_id when call_id is missing', () => {
        const event = {
          type: 'tool_call',
          part: {
            type: 'tool-call',
            name: 'Write',
            args: { content: 'test' },
          },
        };

        const result = provider.normalizeEvent(event);

        expect(result?.message?.content[0].type).toBe('tool_use');
        expect(result?.message?.content[0].tool_use_id).toBe('opencode-tool-1');

        // Second call should increment
        const result2 = provider.normalizeEvent({
          type: 'tool_call',
          part: {
            type: 'tool-call',
            name: 'Edit',
            args: {},
          },
        });
        expect(result2?.message?.content[0].tool_use_id).toBe('opencode-tool-2');
      });
    });

    describe('tool_result events', () => {
      it('should convert tool_result to assistant message with tool_result content', () => {
        const event = {
          type: 'tool_result',
          part: {
            type: 'tool-result',
            call_id: 'call-123',
            output: 'File contents here',
          },
          sessionID: 'test-session',
        };

        const result = provider.normalizeEvent(event);

        expect(result).toEqual({
          type: 'assistant',
          session_id: 'test-session',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'call-123',
                content: 'File contents here',
              },
            ],
          },
        });
      });

      it('should handle tool_result without call_id', () => {
        const event = {
          type: 'tool_result',
          part: {
            type: 'tool-result',
            output: 'Result without ID',
          },
        };

        const result = provider.normalizeEvent(event);

        expect(result?.message?.content[0].type).toBe('tool_result');
        expect(result?.message?.content[0].tool_use_id).toBeUndefined();
      });
    });

    describe('tool_error events', () => {
      it('should convert tool_error to error message', () => {
        const event = {
          type: 'tool_error',
          part: {
            type: 'tool-error',
            call_id: 'call-123',
            error: 'File not found',
          },
          sessionID: 'test-session',
        };

        const result = provider.normalizeEvent(event);

        expect(result).toEqual({
          type: 'error',
          session_id: 'test-session',
          error: 'File not found',
        });
      });

      it('should provide default error message when error is missing', () => {
        const event = {
          type: 'tool_error',
          part: {
            type: 'tool-error',
            call_id: 'call-123',
          },
        };

        const result = provider.normalizeEvent(event);

        expect(result?.type).toBe('error');
        expect(result?.error).toBe('Tool execution failed');
      });
    });

    describe('step_start events', () => {
      it('should return null for step_start events (informational)', () => {
        const event = {
          type: 'step_start',
          part: {
            type: 'step-start',
          },
          sessionID: 'test-session',
        };

        const result = provider.normalizeEvent(event);

        expect(result).toBeNull();
      });
    });

    describe('step_finish events', () => {
      it('should convert successful step_finish to result message', () => {
        const event = {
          type: 'step_finish',
          part: {
            type: 'step-finish',
            reason: 'stop',
            result: 'Task completed successfully',
          },
          sessionID: 'test-session',
        };

        const result = provider.normalizeEvent(event);

        expect(result).toEqual({
          type: 'result',
          subtype: 'success',
          session_id: 'test-session',
          result: 'Task completed successfully',
        });
      });

      it('should convert step_finish with error to error message', () => {
        const event = {
          type: 'step_finish',
          part: {
            type: 'step-finish',
            reason: 'error',
            error: 'Something went wrong',
          },
          sessionID: 'test-session',
        };

        const result = provider.normalizeEvent(event);

        expect(result).toEqual({
          type: 'error',
          session_id: 'test-session',
          error: 'Something went wrong',
        });
      });

      it('should convert step_finish with error property to error message', () => {
        const event = {
          type: 'step_finish',
          part: {
            type: 'step-finish',
            error: 'Process failed',
          },
        };

        const result = provider.normalizeEvent(event);

        expect(result?.type).toBe('error');
        expect(result?.error).toBe('Process failed');
      });

      it('should provide default error message for failed step without error text', () => {
        const event = {
          type: 'step_finish',
          part: {
            type: 'step-finish',
            reason: 'error',
          },
        };

        const result = provider.normalizeEvent(event);

        expect(result?.type).toBe('error');
        expect(result?.error).toBe('Step execution failed');
      });

      it('should treat step_finish with reason=stop as success', () => {
        const event = {
          type: 'step_finish',
          part: {
            type: 'step-finish',
            reason: 'stop',
            result: 'Done',
          },
        };

        const result = provider.normalizeEvent(event);

        expect(result?.type).toBe('result');
        expect(result?.subtype).toBe('success');
      });
    });

    describe('unknown events', () => {
      it('should return null for unknown event types', () => {
        const event = {
          type: 'unknown-event',
          data: 'some data',
        };

        const result = provider.normalizeEvent(event);

        expect(result).toBeNull();
      });

      it('should return null for null input', () => {
        const result = provider.normalizeEvent(null);
        expect(result).toBeNull();
      });

      it('should return null for undefined input', () => {
        const result = provider.normalizeEvent(undefined);
        expect(result).toBeNull();
      });

      it('should return null for non-object input', () => {
        expect(provider.normalizeEvent('string')).toBeNull();
        expect(provider.normalizeEvent(123)).toBeNull();
        expect(provider.normalizeEvent(true)).toBeNull();
      });

      it('should return null for events without type', () => {
        expect(provider.normalizeEvent({})).toBeNull();
        expect(provider.normalizeEvent({ data: 'no type' })).toBeNull();
      });
    });
  });

  // ==========================================================================
  // executeQuery Tests
  // ==========================================================================

  describe('executeQuery', () => {
    /**
     * Helper to set up the provider with a mocked CLI path
     * This bypasses CLI detection for testing
     */
    function setupMockedProvider(): OpencodeProvider {
      const mockedProvider = new OpencodeProvider();
      // Access protected property to simulate CLI detection
      (mockedProvider as unknown as { cliPath: string }).cliPath = '/usr/bin/opencode';
      (mockedProvider as unknown as { detectedStrategy: string }).detectedStrategy = 'native';
      return mockedProvider;
    }

    it('should stream text events as assistant messages', async () => {
      const mockedProvider = setupMockedProvider();

      const mockEvents = [
        { type: 'text', part: { type: 'text', text: 'Hello ' } },
        { type: 'text', part: { type: 'text', text: 'World!' } },
      ];

      vi.mocked(spawnJSONLProcess).mockReturnValue(
        (async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        })()
      );

      const results = await collectAsyncGenerator<ProviderMessage>(
        mockedProvider.executeQuery({
          prompt: 'Say hello',
          model: 'anthropic/claude-sonnet-4-5',
          cwd: '/tmp',
        })
      );

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('assistant');
      expect(results[0].message?.content[0].text).toBe('Hello ');
      expect(results[1].message?.content[0].text).toBe('World!');
    });

    it('should emit tool_use and tool_result with matching IDs', async () => {
      const mockedProvider = setupMockedProvider();

      const mockEvents = [
        {
          type: 'tool_call',
          part: {
            type: 'tool-call',
            call_id: 'tool-1',
            name: 'Read',
            args: { file_path: '/tmp/test.txt' },
          },
        },
        {
          type: 'tool_result',
          part: {
            type: 'tool-result',
            call_id: 'tool-1',
            output: 'File contents',
          },
        },
      ];

      vi.mocked(spawnJSONLProcess).mockReturnValue(
        (async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        })()
      );

      const results = await collectAsyncGenerator<ProviderMessage>(
        mockedProvider.executeQuery({
          prompt: 'Read a file',
          cwd: '/tmp',
        })
      );

      expect(results).toHaveLength(2);

      const toolUse = results[0];
      const toolResult = results[1];

      expect(toolUse.type).toBe('assistant');
      expect(toolUse.message?.content[0].type).toBe('tool_use');
      expect(toolUse.message?.content[0].tool_use_id).toBe('tool-1');

      expect(toolResult.type).toBe('assistant');
      expect(toolResult.message?.content[0].type).toBe('tool_result');
      expect(toolResult.message?.content[0].tool_use_id).toBe('tool-1');
    });

    it('should pass stdinData containing the prompt', async () => {
      const mockedProvider = setupMockedProvider();

      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      await collectAsyncGenerator(
        mockedProvider.executeQuery({
          prompt: 'My test prompt',
          cwd: '/tmp',
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      expect(call.stdinData).toBe('My test prompt');
    });

    it('should extract text from array prompt', async () => {
      const mockedProvider = setupMockedProvider();

      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      const arrayPrompt = [
        { type: 'text', text: 'First part' },
        { type: 'image', source: { type: 'base64', data: '...' } },
        { type: 'text', text: 'Second part' },
      ];

      await collectAsyncGenerator(
        mockedProvider.executeQuery({
          prompt: arrayPrompt as unknown as string,
          cwd: '/tmp',
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      expect(call.stdinData).toBe('First part\nSecond part');
    });

    it('should include correct CLI args in subprocess options', async () => {
      const mockedProvider = setupMockedProvider();

      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      await collectAsyncGenerator(
        mockedProvider.executeQuery({
          prompt: 'Test',
          model: 'opencode-anthropic/claude-opus-4-5',
          cwd: '/tmp/workspace',
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      expect(call.args).toContain('run');
      expect(call.args).toContain('--format');
      expect(call.args).toContain('json');
      expect(call.args).toContain('--model');
      expect(call.args).toContain('anthropic/claude-opus-4-5');
    });

    it('should skip null-normalized events', async () => {
      const mockedProvider = setupMockedProvider();

      const mockEvents = [
        { type: 'unknown-internal-event', data: 'ignored' },
        { type: 'text', part: { type: 'text', text: 'Valid text' } },
        { type: 'another-unknown', foo: 'bar' },
        { type: 'step_finish', part: { type: 'step-finish', reason: 'stop', result: 'Done' } },
      ];

      vi.mocked(spawnJSONLProcess).mockReturnValue(
        (async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        })()
      );

      const results = await collectAsyncGenerator<ProviderMessage>(
        mockedProvider.executeQuery({
          prompt: 'Test',
          model: 'opencode/big-pickle',
          cwd: '/test',
        })
      );

      // Should only have valid events (text and result), not the unknown ones
      expect(results.length).toBe(2);
    });

    it('should throw error when CLI is not installed', async () => {
      // Create provider and explicitly set cliPath to null to simulate not installed
      // Set detectedStrategy to 'npx' to prevent ensureCliDetected from re-running detection
      const unmockedProvider = new OpencodeProvider();
      (unmockedProvider as unknown as { cliPath: string | null }).cliPath = null;
      (unmockedProvider as unknown as { detectedStrategy: string }).detectedStrategy = 'npx';

      await expect(
        collectAsyncGenerator(
          unmockedProvider.executeQuery({
            prompt: 'Test',
            cwd: '/test',
          })
        )
      ).rejects.toThrow(/CLI not found/);
    });
  });

  // ==========================================================================
  // getSpawnConfig Tests
  // ==========================================================================

  describe('getSpawnConfig', () => {
    it('should return npx as Windows strategy', () => {
      const config = provider.getSpawnConfig();
      expect(config.windowsStrategy).toBe('npx');
    });

    it('should specify opencode-ai@latest as npx package', () => {
      const config = provider.getSpawnConfig();
      expect(config.npxPackage).toBe('opencode-ai@latest');
    });

    it('should include common paths for Linux', () => {
      const config = provider.getSpawnConfig();
      const linuxPaths = config.commonPaths['linux'];

      expect(linuxPaths).toBeDefined();
      expect(linuxPaths.length).toBeGreaterThan(0);
      expect(linuxPaths.some((p) => p.includes('opencode'))).toBe(true);
    });

    it('should include common paths for macOS', () => {
      const config = provider.getSpawnConfig();
      const darwinPaths = config.commonPaths['darwin'];

      expect(darwinPaths).toBeDefined();
      expect(darwinPaths.length).toBeGreaterThan(0);
      expect(darwinPaths.some((p) => p.includes('homebrew'))).toBe(true);
    });

    it('should include common paths for Windows', () => {
      const config = provider.getSpawnConfig();
      const win32Paths = config.commonPaths['win32'];

      expect(win32Paths).toBeDefined();
      expect(win32Paths.length).toBeGreaterThan(0);
      expect(win32Paths.some((p) => p.includes('npm'))).toBe(true);
    });
  });

  // ==========================================================================
  // detectInstallation Tests
  // ==========================================================================

  describe('detectInstallation', () => {
    beforeEach(() => {
      // Ensure the mock implementation is set up for each test
      vi.mocked(getOpenCodeAuthIndicators).mockResolvedValue({
        hasAuthFile: false,
        hasOAuthToken: false,
        hasApiKey: false,
      });
    });

    it('should return installed true when CLI is found', async () => {
      (provider as unknown as { cliPath: string }).cliPath = '/usr/local/bin/opencode';
      (provider as unknown as { detectedStrategy: string }).detectedStrategy = 'native';

      const result = await provider.detectInstallation();

      expect(result.installed).toBe(true);
      expect(result.path).toBe('/usr/local/bin/opencode');
    });

    it('should return installed false when CLI is not found', async () => {
      // Set both cliPath to null and detectedStrategy to something other than 'native'
      // to prevent ensureCliDetected from re-detecting
      (provider as unknown as { cliPath: string | null }).cliPath = null;
      (provider as unknown as { detectedStrategy: string }).detectedStrategy = 'npx';

      const result = await provider.detectInstallation();

      expect(result.installed).toBe(false);
    });

    it('should return method as npm when using npx strategy', async () => {
      (provider as unknown as { cliPath: string }).cliPath = 'npx';
      (provider as unknown as { detectedStrategy: string }).detectedStrategy = 'npx';

      const result = await provider.detectInstallation();

      expect(result.method).toBe('npm');
    });

    it('should return method as cli when using native strategy', async () => {
      (provider as unknown as { cliPath: string }).cliPath = '/usr/local/bin/opencode';
      (provider as unknown as { detectedStrategy: string }).detectedStrategy = 'native';

      const result = await provider.detectInstallation();

      expect(result.method).toBe('cli');
    });
  });

  // ==========================================================================
  // Config Management Tests (inherited from BaseProvider)
  // ==========================================================================

  describe('config management', () => {
    it('should get and set config', () => {
      provider.setConfig({ apiKey: 'test-api-key' });

      const config = provider.getConfig();
      expect(config.apiKey).toBe('test-api-key');
    });

    it('should merge config updates', () => {
      provider.setConfig({ apiKey: 'key1' });
      provider.setConfig({ model: 'model1' });

      const config = provider.getConfig();
      expect(config.apiKey).toBe('key1');
      expect(config.model).toBe('model1');
    });
  });

  describe('validateConfig', () => {
    it('should validate config from base class', () => {
      const result = provider.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Additional Edge Case Tests
  // ==========================================================================

  describe('extractPromptText edge cases', () => {
    function setupMockedProvider(): OpencodeProvider {
      const mockedProvider = new OpencodeProvider();
      (mockedProvider as unknown as { cliPath: string }).cliPath = '/usr/bin/opencode';
      (mockedProvider as unknown as { detectedStrategy: string }).detectedStrategy = 'native';
      return mockedProvider;
    }

    it('should handle empty array prompt', async () => {
      const mockedProvider = setupMockedProvider();

      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      await collectAsyncGenerator(
        mockedProvider.executeQuery({
          prompt: [] as unknown as string,
          cwd: '/tmp',
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      expect(call.stdinData).toBe('');
    });

    it('should handle array prompt with only image blocks (no text)', async () => {
      const mockedProvider = setupMockedProvider();

      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      const imageOnlyPrompt = [
        { type: 'image', source: { type: 'base64', data: 'abc123' } },
        { type: 'image', source: { type: 'base64', data: 'def456' } },
      ];

      await collectAsyncGenerator(
        mockedProvider.executeQuery({
          prompt: imageOnlyPrompt as unknown as string,
          cwd: '/tmp',
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      expect(call.stdinData).toBe('');
    });

    it('should handle array prompt with mixed content types', async () => {
      const mockedProvider = setupMockedProvider();

      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      const mixedPrompt = [
        { type: 'text', text: 'Analyze this image' },
        { type: 'image', source: { type: 'base64', data: 'abc123' } },
        { type: 'text', text: 'And this one' },
        { type: 'image', source: { type: 'base64', data: 'def456' } },
        { type: 'text', text: 'What differences do you see?' },
      ];

      await collectAsyncGenerator(
        mockedProvider.executeQuery({
          prompt: mixedPrompt as unknown as string,
          cwd: '/tmp',
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      expect(call.stdinData).toBe('Analyze this image\nAnd this one\nWhat differences do you see?');
    });

    it('should handle text blocks with empty text property', async () => {
      const mockedProvider = setupMockedProvider();

      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      const promptWithEmptyText = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: '' },
        { type: 'text', text: 'World' },
      ];

      await collectAsyncGenerator(
        mockedProvider.executeQuery({
          prompt: promptWithEmptyText as unknown as string,
          cwd: '/tmp',
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      // Empty text blocks should be filtered out
      expect(call.stdinData).toBe('Hello\nWorld');
    });
  });

  describe('abort handling', () => {
    function setupMockedProvider(): OpencodeProvider {
      const mockedProvider = new OpencodeProvider();
      (mockedProvider as unknown as { cliPath: string }).cliPath = '/usr/bin/opencode';
      (mockedProvider as unknown as { detectedStrategy: string }).detectedStrategy = 'native';
      return mockedProvider;
    }

    it('should pass abortController to subprocess options', async () => {
      const mockedProvider = setupMockedProvider();

      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      const abortController = new AbortController();

      await collectAsyncGenerator(
        mockedProvider.executeQuery({
          prompt: 'Test',
          cwd: '/tmp',
          abortController,
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      expect(call.abortController).toBe(abortController);
    });
  });

  describe('session_id preservation', () => {
    function setupMockedProvider(): OpencodeProvider {
      const mockedProvider = new OpencodeProvider();
      (mockedProvider as unknown as { cliPath: string }).cliPath = '/usr/bin/opencode';
      (mockedProvider as unknown as { detectedStrategy: string }).detectedStrategy = 'native';
      return mockedProvider;
    }

    it('should preserve session_id through the full executeQuery flow', async () => {
      const mockedProvider = setupMockedProvider();
      const sessionId = 'test-session-123';

      const mockEvents = [
        { type: 'text', part: { type: 'text', text: 'Hello ' }, sessionID: sessionId },
        {
          type: 'tool_call',
          part: { type: 'tool-call', name: 'Read', args: {}, call_id: 'c1' },
          sessionID: sessionId,
        },
        {
          type: 'tool_result',
          part: { type: 'tool-result', call_id: 'c1', output: 'file content' },
          sessionID: sessionId,
        },
        {
          type: 'step_finish',
          part: { type: 'step-finish', reason: 'stop', result: 'Done' },
          sessionID: sessionId,
        },
      ];

      vi.mocked(spawnJSONLProcess).mockReturnValue(
        (async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        })()
      );

      const results = await collectAsyncGenerator<ProviderMessage>(
        mockedProvider.executeQuery({
          prompt: 'Test',
          model: 'opencode/big-pickle',
          cwd: '/tmp',
        })
      );

      // All emitted messages should have the session_id
      expect(results).toHaveLength(4);
      results.forEach((result) => {
        expect(result.session_id).toBe(sessionId);
      });
    });
  });

  describe('normalizeEvent additional edge cases', () => {
    it('should handle tool_call with empty args object', () => {
      const event = {
        type: 'tool_call',
        part: {
          type: 'tool-call',
          call_id: 'call-123',
          name: 'Glob',
          args: {},
        },
      };

      const result = provider.normalizeEvent(event);

      expect(result?.message?.content[0].type).toBe('tool_use');
      expect(result?.message?.content[0].input).toEqual({});
    });

    it('should handle tool_call with null args', () => {
      const event = {
        type: 'tool_call',
        part: {
          type: 'tool-call',
          call_id: 'call-123',
          name: 'Glob',
          args: null,
        },
      };

      const result = provider.normalizeEvent(event);

      expect(result?.message?.content[0].type).toBe('tool_use');
      expect(result?.message?.content[0].input).toBeNull();
    });

    it('should handle tool_call with complex nested args', () => {
      const event = {
        type: 'tool_call',
        part: {
          type: 'tool-call',
          call_id: 'call-123',
          name: 'Edit',
          args: {
            file_path: '/tmp/test.ts',
            changes: [
              { line: 10, old: 'foo', new: 'bar' },
              { line: 20, old: 'baz', new: 'qux' },
            ],
            options: { replace_all: true },
          },
        },
      };

      const result = provider.normalizeEvent(event);

      expect(result?.message?.content[0].type).toBe('tool_use');
      expect(result?.message?.content[0].input).toEqual({
        file_path: '/tmp/test.ts',
        changes: [
          { line: 10, old: 'foo', new: 'bar' },
          { line: 20, old: 'baz', new: 'qux' },
        ],
        options: { replace_all: true },
      });
    });

    it('should handle tool_result with empty output', () => {
      const event = {
        type: 'tool_result',
        part: {
          type: 'tool-result',
          call_id: 'call-123',
          output: '',
        },
      };

      const result = provider.normalizeEvent(event);

      expect(result?.message?.content[0].type).toBe('tool_result');
      expect(result?.message?.content[0].content).toBe('');
    });

    it('should handle text with whitespace-only text', () => {
      const event = {
        type: 'text',
        part: {
          type: 'text',
          text: '   ',
        },
      };

      const result = provider.normalizeEvent(event);

      // Whitespace should be preserved (not filtered like empty string)
      expect(result).not.toBeNull();
      expect(result?.message?.content[0].text).toBe('   ');
    });

    it('should handle text with newlines', () => {
      const event = {
        type: 'text',
        part: {
          type: 'text',
          text: 'Line 1\nLine 2\nLine 3',
        },
      };

      const result = provider.normalizeEvent(event);

      expect(result?.message?.content[0].text).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle step_finish with both result and error (error takes precedence)', () => {
      const event = {
        type: 'step_finish',
        part: {
          type: 'step-finish',
          reason: 'stop',
          result: 'Some result',
          error: 'But also an error',
        },
      };

      const result = provider.normalizeEvent(event);

      expect(result?.type).toBe('error');
      expect(result?.error).toBe('But also an error');
    });
  });

  describe('isInstalled', () => {
    it('should return true when CLI path is set', async () => {
      (provider as unknown as { cliPath: string }).cliPath = '/usr/bin/opencode';
      (provider as unknown as { detectedStrategy: string }).detectedStrategy = 'native';

      const result = await provider.isInstalled();

      expect(result).toBe(true);
    });

    it('should return false when CLI path is null', async () => {
      (provider as unknown as { cliPath: string | null }).cliPath = null;
      (provider as unknown as { detectedStrategy: string }).detectedStrategy = 'npx';

      const result = await provider.isInstalled();

      expect(result).toBe(false);
    });
  });

  describe('model tier validation', () => {
    it('should have exactly one default model', () => {
      const models = provider.getAvailableModels();
      const defaultModels = models.filter((m) => m.default === true);

      expect(defaultModels).toHaveLength(1);
      expect(defaultModels[0].id).toBe('amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0');
    });

    it('should have valid tier values for all models', () => {
      const models = provider.getAvailableModels();
      const validTiers = ['basic', 'standard', 'premium'];

      models.forEach((model) => {
        expect(validTiers).toContain(model.tier);
      });
    });

    it('should have descriptions for all models', () => {
      const models = provider.getAvailableModels();

      models.forEach((model) => {
        expect(model.description).toBeDefined();
        expect(typeof model.description).toBe('string');
        expect(model.description!.length).toBeGreaterThan(0);
      });
    });
  });

  describe('buildCliArgs edge cases', () => {
    it('should handle very long prompts', () => {
      const longPrompt = 'a'.repeat(10000);
      const args = provider.buildCliArgs({
        prompt: longPrompt,
        model: 'opencode/big-pickle',
        cwd: '/tmp',
      });

      // The prompt is NOT in args (it's passed via stdin)
      // Just verify the args structure is correct
      expect(args).toContain('run');
      expect(args).not.toContain('-');
      expect(args.join(' ')).not.toContain(longPrompt);
    });

    it('should handle prompts with special characters', () => {
      const specialPrompt = 'Test $HOME $(rm -rf /) `command` "quotes" \'single\'';
      const args = provider.buildCliArgs({
        prompt: specialPrompt,
        model: 'opencode/big-pickle',
        cwd: '/tmp',
      });

      // Special chars in prompt should not affect args (prompt is via stdin)
      expect(args).toContain('run');
      expect(args).not.toContain('-');
    });

    it('should handle cwd with spaces', () => {
      const args = provider.buildCliArgs({
        prompt: 'Test',
        model: 'opencode/big-pickle',
        cwd: '/tmp/path with spaces/project',
      });

      // cwd is set at subprocess level, not via CLI args
      expect(args).not.toContain('-c');
      expect(args).not.toContain('/tmp/path with spaces/project');
    });

    it('should handle model with unusual characters', () => {
      const args = provider.buildCliArgs({
        prompt: 'Test',
        model: 'opencode-provider/model-v1.2.3-beta',
        cwd: '/tmp',
      });

      const modelIndex = args.indexOf('--model');
      expect(args[modelIndex + 1]).toBe('provider/model-v1.2.3-beta');
    });
  });
});
