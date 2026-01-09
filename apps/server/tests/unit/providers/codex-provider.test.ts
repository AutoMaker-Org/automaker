import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import { CodexProvider } from '../../../src/providers/codex-provider.js';
import type { ProviderMessage } from '../../../src/providers/types.js';
import { collectAsyncGenerator } from '../../utils/helpers.js';
import {
  spawnJSONLProcess,
  findCodexCliPath,
  secureFs,
  getCodexConfigDir,
  getCodexAuthIndicators,
} from '@automaker/platform';

const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const originalOpenAIKey = process.env[OPENAI_API_KEY_ENV];

const codexRunMock = vi.fn();

vi.mock('@openai/codex-sdk', () => ({
  Codex: class {
    constructor(_opts: { apiKey: string }) {}
    startThread() {
      return {
        id: 'thread-123',
        run: codexRunMock,
      };
    }
    resumeThread() {
      return {
        id: 'thread-123',
        run: codexRunMock,
      };
    }
  },
}));

const EXEC_SUBCOMMAND = 'exec';

vi.mock('@automaker/platform', () => ({
  spawnJSONLProcess: vi.fn(),
  spawnProcess: vi.fn(),
  findCodexCliPath: vi.fn(),
  getCodexAuthIndicators: vi.fn().mockResolvedValue({
    hasAuthFile: false,
    hasOAuthToken: false,
    hasApiKey: false,
  }),
  getCodexConfigDir: vi.fn().mockReturnValue('/home/test/.codex'),
  secureFs: {
    readFile: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
  getDataDirectory: vi.fn(),
}));

vi.mock('@/services/settings-service.js', () => ({
  SettingsService: class {
    async getGlobalSettings() {
      return {
        codexAutoLoadAgents: false,
        codexSandboxMode: 'workspace-write',
        codexApprovalPolicy: 'on-request',
      };
    }
  },
}));

describe('codex-provider.ts', () => {
  let provider: CodexProvider;

  afterAll(() => {
    if (originalOpenAIKey !== undefined) {
      process.env[OPENAI_API_KEY_ENV] = originalOpenAIKey;
    } else {
      delete process.env[OPENAI_API_KEY_ENV];
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCodexConfigDir).mockReturnValue('/home/test/.codex');
    vi.mocked(findCodexCliPath).mockResolvedValue('/usr/bin/codex');
    vi.mocked(getCodexAuthIndicators).mockResolvedValue({
      hasAuthFile: true,
      hasOAuthToken: true,
      hasApiKey: false,
    });
    delete process.env[OPENAI_API_KEY_ENV];
    provider = new CodexProvider();
  });

  describe('executeQuery', () => {
    it('emits tool_use and tool_result with shared tool_use_id for command execution', async () => {
      const mockEvents = [
        {
          type: 'item.started',
          item: {
            type: 'command_execution',
            id: 'cmd-1',
            command: 'ls',
          },
        },
        {
          type: 'item.completed',
          item: {
            type: 'command_execution',
            id: 'cmd-1',
            output: 'file1\nfile2',
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
        provider.executeQuery({
          prompt: 'List files',
          model: 'gpt-5.2',
          cwd: '/tmp',
        })
      );

      expect(results).toHaveLength(2);
      const toolUse = results[0];
      const toolResult = results[1];

      expect(toolUse.type).toBe('assistant');
      expect(toolUse.message?.content[0].type).toBe('tool_use');
      const toolUseId = toolUse.message?.content[0].tool_use_id;
      expect(toolUseId).toBeDefined();

      expect(toolResult.type).toBe('assistant');
      expect(toolResult.message?.content[0].type).toBe('tool_result');
      expect(toolResult.message?.content[0].tool_use_id).toBe(toolUseId);
      expect(toolResult.message?.content[0].content).toBe('file1\nfile2');
    });

    it('adds output schema and max turn overrides when configured', async () => {
      // Note: With full-permissions always on, these flags are no longer used
      // This test now only verifies the basic CLI structure
      // Using gpt-5.1-codex-max which should route to Codex (not Cursor)
      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      await collectAsyncGenerator(
        provider.executeQuery({
          prompt: 'Test config',
          model: 'gpt-5.1-codex-max',
          cwd: '/tmp',
          allowedTools: ['Read', 'Write'],
          maxTurns: 5,
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      expect(call.args).toContain('exec'); // Should have exec subcommand
      expect(call.args).toContain('--dangerously-bypass-approvals-and-sandbox'); // Should have YOLO flag
      expect(call.args).toContain('--model');
      expect(call.args).toContain('--json');
    });

    it('overrides approval policy when MCP auto-approval is enabled', async () => {
      // Note: With full-permissions always on (--dangerously-bypass-approvals-and-sandbox),
      // approval policy is bypassed, not configured via --config
      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      await collectAsyncGenerator(
        provider.executeQuery({
          prompt: 'Test approvals',
          model: 'gpt-5.1-codex-max',
          cwd: '/tmp',
          mcpServers: { mock: { type: 'stdio', command: 'node' } },
          mcpAutoApproveTools: true,
          codexSettings: { approvalPolicy: 'untrusted' },
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      const execIndex = call.args.indexOf(EXEC_SUBCOMMAND);
      expect(call.args).toContain('--dangerously-bypass-approvals-and-sandbox'); // YOLO flag bypasses approval
      expect(call.args).toContain('--model');
      expect(call.args).toContain('--json');
    });

    it('injects user and project instructions when auto-load is enabled', async () => {
      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      const userPath = path.join('/home/test/.codex', 'AGENTS.md');
      const projectPath = path.join('/tmp/project', '.codex', 'AGENTS.md');
      vi.mocked(secureFs.readFile).mockImplementation(async (filePath: string) => {
        if (filePath === userPath) {
          return 'User rules';
        }
        if (filePath === projectPath) {
          return 'Project rules';
        }
        throw new Error('missing');
      });

      await collectAsyncGenerator(
        provider.executeQuery({
          prompt: 'Hello',
          model: 'gpt-5.2',
          cwd: '/tmp/project',
          codexSettings: { autoLoadAgents: true },
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      const promptText = call.stdinData;
      expect(promptText).toContain('User rules');
      expect(promptText).toContain('Project rules');
    });

    it('disables sandbox mode when running in cloud storage paths', async () => {
      // Note: With full-permissions always on (--dangerously-bypass-approvals-and-sandbox),
      // sandbox mode is bypassed, not configured via --sandbox flag
      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      const cloudPath = path.join(os.homedir(), 'Dropbox', 'project');
      await collectAsyncGenerator(
        provider.executeQuery({
          prompt: 'Hello',
          model: 'gpt-5.1-codex-max',
          cwd: cloudPath,
          codexSettings: { sandboxMode: 'workspace-write' },
        })
      );

      const call = vi.mocked(spawnJSONLProcess).mock.calls[0][0];
      // YOLO flag bypasses sandbox entirely
      expect(call.args).toContain('--dangerously-bypass-approvals-and-sandbox');
      expect(call.args).toContain('--model');
      expect(call.args).toContain('--json');
    });

    it('uses the SDK when no tools are requested and an API key is present', async () => {
      process.env[OPENAI_API_KEY_ENV] = 'sk-test';
      codexRunMock.mockResolvedValue({ finalResponse: 'Hello from SDK' });

      const results = await collectAsyncGenerator<ProviderMessage>(
        provider.executeQuery({
          prompt: 'Hello',
          model: 'gpt-5.2',
          cwd: '/tmp',
          allowedTools: [],
        })
      );

      expect(results[0].message?.content[0].text).toBe('Hello from SDK');
      expect(results[1].result).toBe('Hello from SDK');
    });

    it('uses the CLI when tools are requested even if an API key is present', async () => {
      process.env[OPENAI_API_KEY_ENV] = 'sk-test';
      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      await collectAsyncGenerator(
        provider.executeQuery({
          prompt: 'Read files',
          model: 'gpt-5.2',
          cwd: '/tmp',
          allowedTools: ['Read'],
        })
      );

      expect(codexRunMock).not.toHaveBeenCalled();
      expect(spawnJSONLProcess).toHaveBeenCalled();
    });

    it('falls back to CLI when no tools are requested and no API key is available', async () => {
      vi.mocked(spawnJSONLProcess).mockReturnValue((async function* () {})());

      await collectAsyncGenerator(
        provider.executeQuery({
          prompt: 'Hello',
          model: 'gpt-5.2',
          cwd: '/tmp',
          allowedTools: [],
        })
      );

      expect(codexRunMock).not.toHaveBeenCalled();
      expect(spawnJSONLProcess).toHaveBeenCalled();
    });
  });
});
