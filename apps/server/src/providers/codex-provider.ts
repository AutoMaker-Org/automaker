/**
 * Codex Provider - Executes queries using OpenAI Codex CLI (JSON streaming)
 *
 * Spawns `codex exec --json --full-auto` and streams JSONL events into ProviderMessage.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { BaseProvider } from './base-provider.js';
import { createLogger } from '@automaker/utils';
import { spawnJSONLProcess } from '../lib/subprocess-manager.js';
import { CodexConfigManager } from './codex-config-manager.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ContentBlock,
  ConversationMessage,
} from './types.js';

const execAsync = promisify(exec);
const logger = createLogger('CodexProvider');

export class CodexProvider extends BaseProvider {
  getName(): string {
    return 'codex';
  }

  /**
   * Execute a query using Codex CLI streaming output
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, cwd, systemPrompt, abortController, conversationHistory, mcpServers } =
      options;

    const effectiveModel = this.mapModelToCodexFormat(model || 'gpt-5.2-codex');

    const cliPath = await this.resolveCliPath();
    if (!cliPath) {
      yield {
        type: 'error',
        error: 'Codex CLI not found. Please install @openai/codex and ensure it is in PATH.',
      };
      return;
    }

    const promptText = this.buildPrompt(prompt, systemPrompt, conversationHistory);

    const configManager = new CodexConfigManager();
    if (mcpServers) {
      try {
        await configManager.configureMcpServers(cwd, mcpServers);
      } catch (error) {
        logger.warn('Failed to configure Codex MCP servers', {
          error: this.formatExecutionError(error),
        });
      }
    }

    const args = ['exec', '--model', effectiveModel, '--json', '--full-auto'];
    if (promptText.trim().length > 0) {
      args.push(promptText);
    }

    logger.info(`Executing codex exec with model: ${effectiveModel} in ${cwd}`);

    let responseText = '';
    let sawResult = false;
    let sawError = false;

    const envOverrides: Record<string, string> = { ...this.config.env };
    if (this.config.apiKey) {
      envOverrides.OPENAI_API_KEY = this.config.apiKey;
    }

    try {
      const stream = spawnJSONLProcess({
        command: cliPath,
        args,
        cwd,
        env: envOverrides,
        abortController,
        timeout: this.getCliTimeoutMs(),
      });

      for await (const event of stream) {
        const messages = this.toProviderMessages(event);
        for (const msg of messages) {
          if (msg.type === 'assistant') {
            responseText += this.extractTextFromBlocks(msg.message?.content);
          } else if (msg.type === 'result') {
            sawResult = true;
            if (!msg.result) {
              msg.result = responseText;
            }
          } else if (msg.type === 'error') {
            sawError = true;
          }

          yield msg;
        }
      }
    } catch (error) {
      const errorMsg = this.formatExecutionError(error);
      logger.error(errorMsg);
      yield {
        type: 'error',
        error: errorMsg,
      };
      return;
    }

    if (!sawResult && !sawError) {
      yield {
        type: 'result',
        subtype: 'success',
        result: responseText,
      };
    }
  }

  /**
   * Detect Codex CLI installation
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const cliPath = await this.resolveCliPath();
    if (!cliPath) {
      return {
        installed: false,
        method: 'cli',
        hasApiKey: false,
        authenticated: false,
      };
    }

    let version = '';
    try {
      const { stdout } = await execAsync(`"${cliPath}" --version`);
      version = stdout.trim().split('\n')[0];
    } catch {
      // Version command might not be available
    }

    const { authenticated, hasApiKey } = await this.checkAuthentication();

    return {
      installed: true,
      path: cliPath,
      version,
      method: 'cli',
      hasApiKey,
      authenticated,
    };
  }

  /**
   * Get available Codex models
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'gpt-5.2-codex',
        name: 'GPT-5.2 Codex',
        modelString: 'gpt-5.2-codex',
        provider: 'codex',
        description: 'Most advanced Codex model for agentic coding.',
        contextWindow: 256000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
        default: true,
      },
      {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        modelString: 'gpt-5.2',
        provider: 'codex',
        description: 'Latest general model supported in Codex.',
        contextWindow: 256000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
      },
      {
        id: 'gpt-5.1-codex-max',
        name: 'GPT-5.1 Codex Max',
        modelString: 'gpt-5.1-codex-max',
        provider: 'codex',
        description: 'Maximum capability Codex model.',
        contextWindow: 256000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
      },
      {
        id: 'gpt-5.1-codex',
        name: 'GPT-5.1 Codex',
        modelString: 'gpt-5.1-codex',
        provider: 'codex',
        description: 'Standard Codex model for long-running tasks.',
        contextWindow: 256000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'gpt-5.1-codex-mini',
        name: 'GPT-5.1 Codex Mini',
        modelString: 'gpt-5.1-codex-mini',
        provider: 'codex',
        description: 'Lightweight Codex model for quick tasks.',
        contextWindow: 256000,
        maxOutputTokens: 16000,
        supportsVision: false,
        supportsTools: true,
        tier: 'basic' as const,
      },
      {
        id: 'gpt-5.1',
        name: 'GPT-5.1',
        modelString: 'gpt-5.1',
        provider: 'codex',
        description: 'General-purpose GPT-5.1 for Codex CLI.',
        contextWindow: 256000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'gpt-5-codex',
        name: 'GPT-5 Codex',
        modelString: 'gpt-5-codex',
        provider: 'codex',
        description: 'Legacy Codex model superseded by GPT-5.1 Codex.',
        contextWindow: 256000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'gpt-5-codex-mini',
        name: 'GPT-5 Codex Mini',
        modelString: 'gpt-5-codex-mini',
        provider: 'codex',
        description: 'Legacy lightweight Codex model.',
        contextWindow: 256000,
        maxOutputTokens: 16000,
        supportsVision: false,
        supportsTools: true,
        tier: 'basic' as const,
      },
      {
        id: 'gpt-5',
        name: 'GPT-5',
        modelString: 'gpt-5',
        provider: 'codex',
        description: 'Legacy general model for Codex CLI.',
        contextWindow: 256000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
    ];
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supported = ['tools', 'text', 'vision', 'mcp', 'streaming'];
    return supported.includes(feature);
  }

  private buildPrompt(
    prompt: string | ContentBlock[],
    systemPrompt?: string,
    conversationHistory?: ConversationMessage[]
  ): string {
    let fullPrompt = '';
    const historyText = this.formatHistoryAsText(conversationHistory);

    if (systemPrompt) {
      fullPrompt += `${systemPrompt}\n\n---\n\n`;
    }

    fullPrompt += this.extractText(prompt);

    if (historyText) {
      return `${historyText}Current request:\n${fullPrompt}`;
    }

    return fullPrompt;
  }

  private extractText(prompt: string | ContentBlock[]): string {
    if (Array.isArray(prompt)) {
      return prompt
        .map((block) => (typeof block.text === 'string' ? block.text : ''))
        .filter(Boolean)
        .join('\n');
    }
    return prompt;
  }

  private mapModelToCodexFormat(model: string): string {
    const modelMap: Record<string, string> = {
      codex: 'gpt-5.2-codex',
    };

    return modelMap[model.toLowerCase()] || model;
  }

  private formatHistoryAsText(history?: ConversationMessage[]): string {
    if (!history || history.length === 0) {
      return '';
    }

    const formatted = history
      .map((msg) => {
        const role = msg.role === 'assistant' ? 'Assistant' : 'User';
        const content = Array.isArray(msg.content)
          ? msg.content
              .map((block) => (typeof block.text === 'string' ? block.text : ''))
              .filter(Boolean)
              .join('\n')
          : msg.content;
        return `${role}:\n${content}`;
      })
      .join('\n\n');

    return `Conversation so far:\n${formatted}\n\n`;
  }

  private toProviderMessages(event: unknown): ProviderMessage[] {
    if (!event || typeof event !== 'object') {
      return [];
    }

    const payload = event as Record<string, unknown>;
    const eventType = this.normalizeEventType(payload);

    if (eventType === 'thread.completed') {
      return [
        {
          type: 'result',
          subtype: 'success',
        },
      ];
    }

    if (eventType === 'error') {
      const errorMessage =
        this.getString(payload, 'message') ||
        this.getString(payload, 'error') ||
        this.getString(payload, 'detail') ||
        'Codex error';
      return [
        {
          type: 'error',
          error: errorMessage,
        },
      ];
    }

    if (eventType === 'item.completed') {
      const item = this.getItem(payload);
      const itemType = this.getString(item, 'type');

      if (itemType === 'reasoning') {
        const thinking = this.extractItemText(item);
        if (!thinking) {
          return [];
        }
        return [
          {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  thinking,
                },
              ],
            },
          },
        ];
      }

      if (itemType === 'agent_message') {
        const text = this.extractItemText(item);
        if (!text) {
          return [];
        }
        return [
          {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text,
                },
              ],
            },
          },
        ];
      }

      if (itemType === 'command_execution') {
        const text = this.formatCommandExecution(item);
        if (!text) {
          return [];
        }
        return [
          {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text,
                },
              ],
            },
          },
        ];
      }

      if (itemType === 'todo_list') {
        const text = this.formatTodoUpdate(item);
        if (!text) {
          return [];
        }
        return [
          {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text,
                },
              ],
            },
          },
        ];
      }
    }

    if (eventType === 'item.started') {
      const item = this.getItem(payload);
      const itemType = this.getString(item, 'type');
      if (itemType === 'command_execution') {
        const command = this.extractCommand(item);
        if (!command) {
          return [];
        }
        return [
          {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  name: 'bash',
                  input: { command },
                },
              ],
            },
          },
        ];
      }
    }

    if (eventType === 'item.updated') {
      const item = this.getItem(payload);
      const itemType = this.getString(item, 'type');
      if (itemType === 'todo_list') {
        const text = this.formatTodoUpdate(item);
        if (!text) {
          return [];
        }
        return [
          {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text,
                },
              ],
            },
          },
        ];
      }
    }

    const fallbackText = this.extractFallbackText(payload);
    if (fallbackText) {
      return [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: fallbackText,
              },
            ],
          },
        },
      ];
    }

    return [];
  }

  private normalizeEventType(payload: Record<string, unknown>): string {
    return (
      this.getString(payload, 'type') ||
      this.getString(payload, 'event') ||
      this.getString(payload, 'kind') ||
      ''
    );
  }

  private getItem(payload: Record<string, unknown>): Record<string, unknown> {
    const item = payload.item;
    if (item && typeof item === 'object') {
      return item as Record<string, unknown>;
    }
    const data = payload.data;
    if (data && typeof data === 'object') {
      return data as Record<string, unknown>;
    }
    return payload;
  }

  private getString(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === 'string' ? value : undefined;
  }

  private extractItemText(item: Record<string, unknown>): string {
    return (
      this.getString(item, 'text') ||
      this.getString(item, 'content') ||
      this.getString(item, 'message') ||
      this.getString(item, 'output') ||
      ''
    );
  }

  private extractCommand(item: Record<string, unknown>): string {
    const command =
      this.getString(item, 'command') ||
      this.getString(item, 'cmd') ||
      this.getString(item, 'input') ||
      this.getString(item, 'tool_input');
    if (command) {
      return command;
    }

    const input = item.input;
    if (input && typeof input === 'object') {
      const inputCommand = this.getString(input as Record<string, unknown>, 'command');
      if (inputCommand) {
        return inputCommand;
      }
    }

    return '';
  }

  private formatCommandExecution(item: Record<string, unknown>): string {
    const command = this.extractCommand(item);
    const stdout = this.getString(item, 'stdout') || this.getString(item, 'output');
    const stderr = this.getString(item, 'stderr');
    const exitCode =
      typeof item.exit_code === 'number'
        ? item.exit_code
        : typeof item.exitCode === 'number'
          ? item.exitCode
          : undefined;

    const parts: string[] = [];
    if (command) {
      parts.push(`\`\`\`bash\n${command}\n\`\`\``);
    }
    if (stdout) {
      parts.push(stdout.trim());
    }
    if (stderr) {
      parts.push(stderr.trim());
    }
    if (exitCode !== undefined) {
      parts.push(`Exit code: ${exitCode}`);
    }

    return parts.join('\n\n');
  }

  private formatTodoUpdate(item: Record<string, unknown>): string {
    const list = item.items || item.todos || item.todo_list;
    if (Array.isArray(list)) {
      const lines = list
        .map((entry) => {
          if (typeof entry === 'string') {
            return `- ${entry}`;
          }
          if (entry && typeof entry === 'object') {
            const text = this.getString(entry as Record<string, unknown>, 'text');
            const status = this.getString(entry as Record<string, unknown>, 'status');
            if (text && status) {
              return `- [${status}] ${text}`;
            }
            if (text) {
              return `- ${text}`;
            }
          }
          return '';
        })
        .filter(Boolean);
      if (lines.length > 0) {
        return `Updated Todo List:\n${lines.join('\n')}`;
      }
    }

    const fallback = this.extractItemText(item);
    return fallback ? `Updated Todo List:\n${fallback}` : '';
  }

  private extractFallbackText(payload: Record<string, unknown>): string | null {
    const message = payload.message;
    if (typeof message === 'string') {
      return message;
    }
    const text = payload.text;
    if (typeof text === 'string') {
      return text;
    }
    return null;
  }

  private extractTextFromBlocks(blocks?: ContentBlock[]): string {
    if (!blocks) {
      return '';
    }
    let text = '';
    for (const block of blocks) {
      if (block.type === 'text' && block.text) {
        text += block.text;
      }
    }
    return text;
  }

  private formatExecutionError(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') {
        return 'Codex CLI not found. Please install @openai/codex.';
      }
      if (code === 'EPIPE') {
        return 'Codex CLI closed unexpectedly (EPIPE). Check installation and auth.';
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('auth')) {
      return 'Codex authentication required. Run: codex login';
    }
    if (message.toLowerCase().includes('aborted')) {
      return 'Codex request aborted.';
    }
    if (message.toLowerCase().includes('timeout')) {
      return 'Codex CLI timed out without output. Increase CODEX_CLI_TIMEOUT_MS if needed.';
    }

    return `Codex error: ${message}`;
  }

  private async checkAuthentication(): Promise<{ authenticated: boolean; hasApiKey: boolean }> {
    const envKey =
      process.env.OPENAI_API_KEY || this.config.apiKey || this.config.env?.OPENAI_API_KEY || '';
    const hasApiKey = !!envKey;

    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const authFile = path.join(codexHome, 'auth.json');
    let hasAuthFile = false;
    try {
      await fs.access(authFile);
      hasAuthFile = true;
    } catch {
      hasAuthFile = false;
    }

    return {
      authenticated: hasApiKey || hasAuthFile,
      hasApiKey,
    };
  }

  private getCliTimeoutMs(): number {
    const defaultTimeoutMs = 120000;
    const raw = process.env.CODEX_CLI_TIMEOUT_MS;
    if (raw === undefined || raw === '') {
      return defaultTimeoutMs;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return defaultTimeoutMs;
    }
    return parsed;
  }

  private async resolveCliPath(): Promise<string | null> {
    if (this.config.cliPath) {
      return this.config.cliPath;
    }
    if (process.env.CODEX_CLI_PATH) {
      return process.env.CODEX_CLI_PATH;
    }

    const isWindows = os.platform() === 'win32';
    try {
      const findCommand = isWindows ? 'where codex' : 'which codex';
      const { stdout } = await execAsync(findCommand);
      const cliPath = stdout.trim().split(/\r?\n/)[0];
      if (cliPath) {
        return cliPath;
      }
    } catch {
      // Fall back to common locations
    }

    const commonPaths = this.getCommonCodexPaths();
    for (const candidate of commonPaths) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Not found at this path
      }
    }

    return null;
  }

  private getCommonCodexPaths(): string[] {
    const homeDir = os.homedir();
    const isWindows = os.platform() === 'win32';

    if (isWindows) {
      return [
        path.join(homeDir, 'AppData', 'Local', 'Programs', 'Codex', 'codex.exe'),
        path.join(homeDir, '.local', 'bin', 'codex.exe'),
        'C:\\Program Files\\Codex\\codex.exe',
      ];
    }

    return [
      '/usr/local/bin/codex',
      '/opt/homebrew/bin/codex',
      path.join(homeDir, '.local', 'bin', 'codex'),
    ];
  }
}
