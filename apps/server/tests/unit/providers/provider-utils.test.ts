import { describe, it, expect } from 'vitest';
import { buildExecuteOptionsFromSdk } from '@/providers/provider-utils.js';

const BASE_PROMPT = 'Test prompt';
const ERROR_MODEL_REQUIRED = 'Model is required to execute provider request';
const ERROR_CWD_REQUIRED = 'Working directory is required to execute provider request';
const MODEL_ID = 'claude-opus-4-5-20251101';
const WORKING_DIR = '/tmp/project';
const SYSTEM_PROMPT = 'System prompt';
const MAX_TURNS = 5;
const USER_MESSAGE = 'Hello';
const ALLOWED_TOOLS = ['Read', 'Write'] as const;
const MCP_SERVER_ID = 'local';
const MCP_SERVER_CONFIG = { type: 'stdio', command: 'node' } as const;
const OUTPUT_SCHEMA_TYPE = 'object';
const OUTPUT_FORMAT = { type: 'json_schema', schema: { type: OUTPUT_SCHEMA_TYPE } } as const;
const SETTING_SOURCE = 'user' as const;

describe('provider-utils.ts', () => {
  it('should throw when model is missing', () => {
    expect(() =>
      buildExecuteOptionsFromSdk({
        prompt: BASE_PROMPT,
        sdkOptions: {
          cwd: WORKING_DIR,
        } as any,
      })
    ).toThrow(ERROR_MODEL_REQUIRED);
  });

  it('should throw when cwd is missing', () => {
    expect(() =>
      buildExecuteOptionsFromSdk({
        prompt: BASE_PROMPT,
        sdkOptions: {
          model: MODEL_ID,
        } as any,
      })
    ).toThrow(ERROR_CWD_REQUIRED);
  });

  it('should map SDK options to execute options', () => {
    const abortController = new AbortController();
    const conversationHistory = [{ role: 'user' as const, content: USER_MESSAGE }];

    const result = buildExecuteOptionsFromSdk({
      prompt: BASE_PROMPT,
      sdkOptions: {
        model: MODEL_ID,
        cwd: WORKING_DIR,
        systemPrompt: SYSTEM_PROMPT,
        maxTurns: MAX_TURNS,
        allowedTools: [...ALLOWED_TOOLS],
        abortController,
        settingSources: [SETTING_SOURCE],
        sandbox: { enabled: true, autoAllowBashIfSandboxed: true },
        mcpServers: { [MCP_SERVER_ID]: MCP_SERVER_CONFIG },
        outputFormat: OUTPUT_FORMAT,
      } as any,
      conversationHistory,
    });

    expect(result).toEqual({
      prompt: BASE_PROMPT,
      model: MODEL_ID,
      cwd: WORKING_DIR,
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: MAX_TURNS,
      allowedTools: [...ALLOWED_TOOLS],
      abortController,
      conversationHistory,
      settingSources: [SETTING_SOURCE],
      sandbox: { enabled: true, autoAllowBashIfSandboxed: true },
      mcpServers: { [MCP_SERVER_ID]: MCP_SERVER_CONFIG },
      outputFormat: OUTPUT_FORMAT,
    });
  });
});
