/**
 * Provider utilities for mapping SDK options to provider execution options
 */

import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { ExecuteOptions, ConversationMessage } from '@automaker/types';

const ERROR_MODEL_REQUIRED = 'Model is required to execute provider request';
const ERROR_CWD_REQUIRED = 'Working directory is required to execute provider request';

export function buildExecuteOptionsFromSdk({
  prompt,
  sdkOptions,
  conversationHistory,
}: {
  prompt: ExecuteOptions['prompt'];
  sdkOptions: Options;
  conversationHistory?: ConversationMessage[];
}): ExecuteOptions {
  if (!sdkOptions.model) {
    throw new Error(ERROR_MODEL_REQUIRED);
  }
  if (!sdkOptions.cwd) {
    throw new Error(ERROR_CWD_REQUIRED);
  }
  return {
    prompt,
    model: sdkOptions.model,
    cwd: sdkOptions.cwd,
    systemPrompt: sdkOptions.systemPrompt,
    maxTurns: sdkOptions.maxTurns,
    allowedTools: sdkOptions.allowedTools as string[] | undefined,
    abortController: sdkOptions.abortController,
    conversationHistory,
    settingSources: sdkOptions.settingSources,
    sandbox: sdkOptions.sandbox,
    mcpServers: sdkOptions.mcpServers as ExecuteOptions['mcpServers'],
    outputFormat: sdkOptions.outputFormat,
  };
}
