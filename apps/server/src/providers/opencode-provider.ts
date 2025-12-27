/**
 * OpenCode Provider - Executes queries using opencode CLI (JSON streaming)
 *
 * Spawns `opencode run --format json` and streams JSONL events into ProviderMessage.
 */

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { BaseProvider } from './base-provider.js';
import { createLogger } from '@automaker/utils';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ContentBlock,
} from './types.js';

const execAsync = promisify(exec);
const logger = createLogger('OpenCodeProvider');

export class OpenCodeProvider extends BaseProvider {
  getName(): string {
    return 'opencode';
  }

  /**
   * Execute a query using OpenCode CLI streaming output
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      abortController,
      sdkSessionId,
      allowedTools,
      maxTurns,
    } = options;

    const requestedModel = model || 'glm4.7';
    const effectiveModel = this.mapModelToOpenCodeFormat(requestedModel);
    const promptText = this.buildPrompt(prompt, systemPrompt);

    logger.info(`Executing opencode run with model: ${effectiveModel} in ${cwd}`);

    const cliPath = await this.resolveCliPath();
    if (!cliPath) {
      yield {
        type: 'error',
        error: 'OpenCode CLI not found. Please install opencode and ensure it is in PATH.',
      };
      return;
    }

    const args = ['run', '--format', 'json', '--model', effectiveModel];
    if (sdkSessionId) {
      args.push('--session', sdkSessionId);
    }
    if (promptText.trim().length > 0) {
      args.push(promptText);
    }

    let tempConfig: {
      path: string;
      cleanup: () => Promise<void>;
    } | null = null;
    try {
      tempConfig = await this.createTempConfig(cwd, allowedTools, maxTurns);
    } catch (error) {
      logger.warn('Failed to prepare OpenCode config override', {
        error: this.formatExecutionError(error),
      });
    }

    const childProcess = spawn(cliPath, args, {
      cwd,
      env: {
        ...process.env,
        ...this.config.env,
        ...(tempConfig ? { OPENCODE_CONFIG: tempConfig.path } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let spawnError: Error | null = null;
    childProcess.on('error', (err) => {
      spawnError = err;
    });

    let abortRequested = abortController?.signal.aborted ?? false;

    if (abortController) {
      abortController.signal.addEventListener('abort', () => {
        abortRequested = true;
        childProcess.kill('SIGTERM');
      });
      if (abortController.signal.aborted) {
        abortRequested = true;
        childProcess.kill('SIGTERM');
      }
    }

    const exitCodePromise = new Promise<{ code: number; signal: NodeJS.Signals | null }>(
      (resolve) => {
        childProcess.on('close', (code, signal) =>
          resolve({ code: code ?? 0, signal: signal ?? null })
        );
        childProcess.on('error', (err) => {
          console.error('[OpenCodeProvider] Process error:', err);
          resolve({ code: 1, signal: null });
        });
      }
    );

    const stderrPromise = this.collectStream(childProcess.stderr as NodeJS.ReadableStream);

    let responseText = '';
    let sawResult = false;
    let sawError = false;
    let sessionId: string | undefined;
    let bufferedText = '';
    const FLUSH_THRESHOLD = 400;

    const flushBufferedText = (): ProviderMessage | null => {
      if (!bufferedText) {
        return null;
      }

      const text = bufferedText;
      bufferedText = '';
      return {
        type: 'assistant',
        session_id: sessionId,
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text,
            },
          ],
        },
      };
    };

    try {
      await new Promise((resolve) => setImmediate(resolve));
      if (spawnError) {
        throw spawnError;
      }

      const eventStream = this.readJsonStream(childProcess.stdout as NodeJS.ReadableStream);

      for await (const msg of eventStream) {
        if (!msg || typeof msg !== 'object') {
          continue;
        }

        if (!sessionId && typeof msg.sessionID === 'string') {
          sessionId = msg.sessionID;
        }

        if (msg.type === 'text') {
          const content =
            typeof msg.part?.text === 'string'
              ? msg.part.text
              : typeof msg.text === 'string'
                ? msg.text
                : '';

          if (!content) {
            continue;
          }

          responseText += content;
          bufferedText += content;
          if (bufferedText.length >= FLUSH_THRESHOLD || content.includes('\n')) {
            const bufferedMsg = flushBufferedText();
            if (bufferedMsg) {
              yield bufferedMsg;
            }
          }
          continue;
        }

        if (msg.type === 'tool_use') {
          const bufferedMsg = flushBufferedText();
          if (bufferedMsg) {
            yield bufferedMsg;
          }

          const rawToolName = typeof msg.part?.tool === 'string' ? msg.part.tool : 'unknown';
          const toolName = this.normalizeToolName(rawToolName);
          const toolInput =
            msg.part?.state?.input !== undefined ? msg.part.state.input : msg.part?.input;
          const toolOutput =
            msg.part?.state?.output !== undefined
              ? msg.part.state.output
              : msg.part?.output !== undefined
                ? msg.part.output
                : msg.part?.state?.error;
          const toolUseId = typeof msg.part?.callID === 'string' ? msg.part.callID : undefined;

          yield {
            type: 'assistant',
            session_id: sessionId,
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  name: toolName,
                  input: toolInput,
                  tool_use_id: toolUseId,
                },
              ],
            },
          };

          if (toolOutput !== undefined) {
            yield {
              type: 'assistant',
              session_id: sessionId,
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'tool_result',
                    content: this.formatToolOutput(toolOutput),
                    tool_use_id: toolUseId,
                  },
                ],
              },
            };
          }
          continue;
        }

        if (msg.type === 'tool_result') {
          const bufferedMsg = flushBufferedText();
          if (bufferedMsg) {
            yield bufferedMsg;
          }

          const toolUseId = typeof msg.part?.callID === 'string' ? msg.part.callID : undefined;
          const toolOutput =
            msg.part?.state?.output !== undefined
              ? msg.part.state.output
              : msg.part?.output !== undefined
                ? msg.part.output
                : msg.part?.state?.error;

          if (toolOutput !== undefined) {
            yield {
              type: 'assistant',
              session_id: sessionId,
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'tool_result',
                    content: this.formatToolOutput(toolOutput),
                    tool_use_id: toolUseId,
                  },
                ],
              },
            };
          }
          continue;
        }

        if (msg.type === 'error') {
          sawError = true;
          const bufferedMsg = flushBufferedText();
          if (bufferedMsg) {
            yield bufferedMsg;
          }
          const errorMessage =
            typeof msg.error === 'string'
              ? msg.error
              : typeof msg.message === 'string'
                ? msg.message
                : 'OpenCode error';
          yield {
            type: 'error',
            error: errorMessage,
          };
          break;
        }

        if (msg.type === 'result') {
          const bufferedMsg = flushBufferedText();
          if (bufferedMsg) {
            yield bufferedMsg;
          }

          sawResult = true;
          yield {
            type: 'result',
            subtype: msg.subtype === 'error' ? 'error' : 'success',
            session_id: sessionId,
            result: typeof msg.result === 'string' ? msg.result : responseText,
            error: typeof msg.error === 'string' ? msg.error : undefined,
          };
          continue;
        }

        if (msg.type === 'step_finish') {
          continue;
        }
      }

      const bufferedMsg = flushBufferedText();
      if (bufferedMsg) {
        yield bufferedMsg;
      }

      const [{ code: exitCode, signal }, stderrOutput] = await Promise.all([
        exitCodePromise,
        stderrPromise,
      ]);

      if (exitCode !== 0) {
        const isSigterm = signal === 'SIGTERM' || exitCode === 143;
        if (abortRequested && isSigterm) {
          const abortMsg = 'opencode aborted';
          logger.warn(`${abortMsg}${signal ? ` (signal: ${signal})` : ''}`);
          if (!sawError) {
            yield {
              type: 'error',
              error: abortMsg,
            };
          }
          return;
        }

        const errorMsg =
          stderrOutput || `opencode exited with code ${exitCode}${signal ? ` (${signal})` : ''}`;
        logger.error(errorMsg);
        if (!sawError) {
          yield {
            type: 'error',
            error: errorMsg,
          };
        }
        return;
      }

      if (!sawResult && !sawError) {
        yield {
          type: 'result',
          subtype: 'success',
          session_id: sessionId,
          result: responseText,
        };
      }
    } catch (error) {
      const bufferedMsg = flushBufferedText();
      if (bufferedMsg) {
        yield bufferedMsg;
      }
      yield {
        type: 'error',
        error: this.formatExecutionError(error),
      };
    } finally {
      childProcess.stdin?.end();
      if (!childProcess.killed) {
        childProcess.kill();
      }
      if (tempConfig) {
        try {
          await tempConfig.cleanup();
        } catch (error) {
          logger.warn('Failed to clean up OpenCode temp config', {
            error: this.formatExecutionError(error),
          });
        }
      }
    }
  }

  /**
   * Detect OpenCode CLI installation
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const cliPath = await this.resolveCliPath();
    if (cliPath) {
      let version = '';
      try {
        const versionCommand = `"${cliPath}" --version`;
        const { stdout: versionOut } = await execAsync(versionCommand);
        version = versionOut.trim().split('\n')[0];
      } catch {
        // Version command might not be available
      }

      const authenticated = await this.checkAuthentication(cliPath);

      return {
        installed: true,
        path: cliPath,
        version,
        method: 'cli',
        hasApiKey: authenticated,
        authenticated,
      };
    }

    return {
      installed: false,
      method: 'cli',
      hasApiKey: false,
      authenticated: false,
    };
  }

  /**
   * Get available OpenCode models (free defaults)
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'glm4.7',
        name: 'GLM 4.7 (Free)',
        modelString: 'opencode/glm-4.7-free',
        provider: 'opencode',
        description: 'GLM 4.7 - Free model with solid general capabilities.',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        tier: 'basic' as const,
        default: true,
      },
    ];
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'streaming'];
    return supportedFeatures.includes(feature);
  }

  private mapModelToOpenCodeFormat(model: string): string {
    const modelMap: Record<string, string> = {
      'glm4.7': 'opencode/glm-4.7-free',
      'glm-4.7': 'opencode/glm-4.7-free',
      glm: 'opencode/glm-4.7-free',
      'glm/glm4.7': 'opencode/glm-4.7-free',
      opencode: 'opencode/glm-4.7-free',
    };

    return modelMap[model.toLowerCase()] || model;
  }

  private buildPrompt(prompt: string | ContentBlock[], systemPrompt?: string): string {
    let fullPrompt = '';

    if (systemPrompt) {
      fullPrompt = `${systemPrompt}\n\n---\n\n`;
    }

    if (Array.isArray(prompt)) {
      const textParts = prompt.filter((p) => p.type === 'text' && p.text).map((p) => p.text);
      fullPrompt += textParts.join('\n');
    } else {
      fullPrompt += prompt;
    }

    return fullPrompt;
  }

  private async *readJsonStream(stream: NodeJS.ReadableStream): AsyncGenerator<any> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const message = JSON.parse(trimmed);
        yield message;
      } catch (error) {
        logger.warn('Failed to parse OpenCode JSON line', { line: trimmed.slice(0, 120) });
        yield {
          type: 'text',
          text: line + '\n',
        };
      }
    }
  }

  private async collectStream(stream: NodeJS.ReadableStream): Promise<string> {
    let output = '';
    for await (const chunk of stream) {
      output += chunk.toString();
    }
    return output;
  }

  private formatExecutionError(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') {
        return 'OpenCode CLI not found. Please install opencode.';
      }
      if (code === 'EPIPE') {
        return 'OpenCode CLI closed unexpectedly (EPIPE). Check installation, auth, and config.';
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('auth')) {
      return 'OpenCode authentication required. Run: opencode auth login';
    }

    return `OpenCode error: ${message}`;
  }

  private async checkAuthentication(cliPath?: string): Promise<boolean> {
    try {
      const command = cliPath ? `"${cliPath}" models --refresh` : 'opencode models --refresh';
      await execAsync(command);
      return true;
    } catch {
      const configDir = path.join(os.homedir(), '.config', 'opencode');
      const authFile = path.join(configDir, 'auth.json');
      try {
        await fs.access(authFile);
        return true;
      } catch {
        return false;
      }
    }
  }

  private async resolveCliPath(): Promise<string | null> {
    const isWindows = os.platform() === 'win32';
    try {
      const findCommand = isWindows ? 'where opencode' : 'which opencode';
      const { stdout } = await execAsync(findCommand);
      const cliPath = stdout.trim().split(/\r?\n/)[0];
      if (cliPath) {
        return cliPath;
      }
    } catch {
      // Fall back to common locations
    }

    const commonPaths = this.getCommonOpenCodePaths();
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

  private async createTempConfig(
    cwd: string,
    allowedTools?: string[],
    maxTurns?: number
  ): Promise<{ path: string; cleanup: () => Promise<void> } | null> {
    const overrides = this.buildToolOverrides(allowedTools, maxTurns);
    if (!overrides) {
      return null;
    }

    let baseConfig: Record<string, unknown> = {};
    const projectConfig = await this.readProjectConfig(cwd);
    if (projectConfig) {
      baseConfig = projectConfig;
    }

    const merged = this.mergeConfigs(baseConfig, overrides);
    if (!merged.$schema) {
      merged.$schema = 'https://opencode.ai/config.json';
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'automaker-opencode-'));
    const configPath = path.join(tempDir, 'opencode.json');
    await fs.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf8');

    return {
      path: configPath,
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      },
    };
  }

  private buildToolOverrides(
    allowedTools?: string[],
    maxTurns?: number
  ): Record<string, unknown> | null {
    const toolsToUse =
      allowedTools && allowedTools.length > 0
        ? allowedTools
        : ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'];

    const normalized = new Set(toolsToUse.map((tool) => tool.toLowerCase()));
    const allowRead = normalized.has('read');
    const allowGlob = normalized.has('glob');
    const allowGrep = normalized.has('grep');
    const allowWrite = normalized.has('write') || normalized.has('edit');
    const allowEdit = normalized.has('edit') || normalized.has('write');
    const allowBash = normalized.has('bash');
    const allowWebSearch = normalized.has('websearch');
    const allowWebFetch = normalized.has('webfetch') || allowWebSearch;

    const tools: Record<string, boolean> = {
      read: allowRead,
      glob: allowGlob,
      grep: allowGrep,
      list: allowRead || allowGlob || allowGrep,
      write: allowWrite,
      edit: allowEdit,
      patch: allowEdit || allowWrite,
      bash: allowBash,
      webfetch: allowWebFetch,
      websearch: allowWebSearch,
      todoread: allowRead,
      todowrite: allowWrite || allowEdit,
    };

    const permission: Record<string, string | Record<string, string>> = {
      edit: allowEdit ? 'allow' : 'deny',
      bash: allowBash ? 'allow' : 'deny',
      webfetch: allowWebFetch ? 'allow' : 'deny',
      skill: 'deny',
      external_directory: allowEdit || allowBash ? 'allow' : 'deny',
      doom_loop: 'allow',
    };

    const overrides: Record<string, unknown> = { tools, permission };

    if (typeof maxTurns === 'number' && Number.isFinite(maxTurns) && maxTurns > 0) {
      const maxSteps = Math.floor(maxTurns);
      overrides.agent = {
        build: { maxSteps },
        plan: { maxSteps },
      };
    }

    return overrides;
  }

  private async readProjectConfig(cwd: string): Promise<Record<string, unknown> | null> {
    const configPath = await this.findProjectConfigPath(cwd);
    if (!configPath) {
      return null;
    }

    return this.readConfigFile(configPath);
  }

  private async findProjectConfigPath(cwd: string): Promise<string | null> {
    let currentDir = path.resolve(cwd);

    while (true) {
      const jsonPath = path.join(currentDir, 'opencode.json');
      const jsoncPath = path.join(currentDir, 'opencode.jsonc');
      if (await this.pathExists(jsonPath)) {
        return jsonPath;
      }
      if (await this.pathExists(jsoncPath)) {
        return jsoncPath;
      }

      const gitPath = path.join(currentDir, '.git');
      if (await this.pathExists(gitPath)) {
        return null;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        return null;
      }
      currentDir = parentDir;
    }
  }

  private async readConfigFile(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const stripped = this.stripJsonComments(raw);
      const normalized = this.stripTrailingCommas(stripped);
      return JSON.parse(normalized) as Record<string, unknown>;
    } catch (error) {
      logger.warn('Failed to read OpenCode project config', {
        filePath,
        error: this.formatExecutionError(error),
      });
      return null;
    }
  }

  private stripJsonComments(input: string): string {
    let result = '';
    let inString = false;
    let stringChar = '';
    let escaped = false;

    for (let i = 0; i < input.length; i += 1) {
      const current = input[i];
      const next = input[i + 1];

      if (inString) {
        result += current;
        if (escaped) {
          escaped = false;
        } else if (current === '\\\\') {
          escaped = true;
        } else if (current === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      if (current === '"' || current === "'") {
        inString = true;
        stringChar = current;
        result += current;
        continue;
      }

      if (current === '/' && next === '/') {
        while (i < input.length && input[i] !== '\n') {
          i += 1;
        }
        result += '\n';
        continue;
      }

      if (current === '/' && next === '*') {
        i += 2;
        while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
          i += 1;
        }
        i += 1;
        continue;
      }

      result += current;
    }

    return result;
  }

  private stripTrailingCommas(input: string): string {
    return input.replace(/,\s*([}\]])/g, '$1');
  }

  private mergeConfigs(
    base: Record<string, unknown>,
    override: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...base };

    for (const [key, value] of Object.entries(override)) {
      const baseValue = result[key];
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        baseValue &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue)
      ) {
        result[key] = this.mergeConfigs(
          baseValue as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private normalizeToolName(toolName: string): string {
    const normalized = toolName.trim().toLowerCase();
    const toolMap: Record<string, string> = {
      read: 'Read',
      write: 'Write',
      edit: 'Edit',
      glob: 'Glob',
      grep: 'Grep',
      bash: 'Bash',
      websearch: 'WebSearch',
      webfetch: 'WebFetch',
      todoread: 'TodoRead',
      todowrite: 'TodoWrite',
      list: 'List',
      patch: 'Patch',
    };

    return toolMap[normalized] || toolName;
  }

  private formatToolOutput(output: unknown): string {
    if (output === undefined || output === null) {
      return '';
    }
    if (typeof output === 'string') {
      return output;
    }
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getCommonOpenCodePaths(): string[] {
    const isWindows = os.platform() === 'win32';
    const homeDir = os.homedir();

    if (isWindows) {
      return [
        path.join(homeDir, 'AppData', 'Local', 'opencode', 'opencode.exe'),
        path.join(homeDir, '.local', 'bin', 'opencode.exe'),
        'C:\\\\Program Files\\\\opencode\\\\opencode.exe',
      ];
    }

    return [
      '/usr/local/bin/opencode',
      path.join(homeDir, '.local', 'bin', 'opencode'),
      '/opt/opencode/opencode',
    ];
  }
}
