/**
 * Cursor Provider - Executes queries using cursor-agent CLI
 *
 * Spawns `cursor-agent` CLI process and parses output for seamless integration
 * with the provider architecture. Uses --print and --force flags for automation.
 *
 * @see https://cursor.com/docs/cli/headless
 */

import { spawn, ChildProcess } from 'child_process';
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
const logger = createLogger('CursorProvider');

export class CursorProvider extends BaseProvider {
  getName(): string {
    return 'cursor';
  }

  /**
   * Execute a query using cursor-agent CLI
   * @see https://cursor.com/docs/cli/headless
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, cwd, systemPrompt, abortController } = options;

    const requestedModel = model || 'auto';
    const effectiveModel = 'auto';

    // Build the cursor-agent command arguments
    // Usage: cursor-agent [options] [prompt...]
    const args: string[] = [
      '--print', // Non-interactive mode for scripts (print responses to console)
      '--force', // Allow file modifications without prompts
      '--output-format',
      'stream-json',
      '--stream-partial-output',
      '--workspace',
      cwd,
    ];

    args.push('--model', effectiveModel);

    // Build the full prompt with system prompt if provided
    let fullPrompt = '';
    if (systemPrompt) {
      fullPrompt = `${systemPrompt}\n\n---\n\n`;
    }

    // Handle multi-part prompts (with images)
    if (Array.isArray(prompt)) {
      // Extract text from content blocks
      const textParts = prompt.filter((p) => p.type === 'text' && p.text).map((p) => p.text);
      fullPrompt += textParts.join('\n');
      // Note: Images can be referenced as file paths in the prompt
    } else {
      fullPrompt += prompt;
    }

    // Add the prompt as the last argument
    args.push(fullPrompt);

    if (requestedModel !== effectiveModel) {
      logger.info(`Overriding requested model "${requestedModel}" to "${effectiveModel}"`);
    }
    logger.info(`Executing cursor-agent with model: ${effectiveModel} in ${cwd}`);
    logger.debug(`[spawn] cursor-agent ${args.slice(0, 6).join(' ')}... [prompt truncated]`);

    // Spawn the cursor-agent process (NOT 'cursor agent')
    console.log('[CursorProvider] Spawning cursor-agent process...');
    // Use closed stdin to avoid the agent waiting for interactive input.
    const childProcess = spawn('cursor-agent', args, {
      cwd,
      env: {
        ...process.env,
        // CURSOR_API_KEY can be set in environment
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log('[CursorProvider] Process spawned, PID:', childProcess.pid);
    // Explicitly end stdin in case the process expects EOF to begin execution
    childProcess.stdin?.end();

    let abortRequested = abortController?.signal.aborted ?? false;
    const stdoutDebug: string[] = [];
    const MAX_DEBUG_LINES = 12;

    // Handle abort signal
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
          console.error('[CursorProvider] Process error:', err);
          resolve({ code: 1, signal: null });
        });
      }
    );

    const stderrPromise = this.collectStream(childProcess.stderr as NodeJS.ReadableStream);

    let responseText = '';
    let sawResult = false;
    let sawError = false;
    let bufferedAssistantText = '';

    const bufferAssistantText = (content?: ContentBlock[]) => {
      if (!content) {
        return;
      }

      for (const block of content) {
        if (block.type === 'text' && block.text) {
          bufferedAssistantText += block.text;
          responseText += block.text;
        }
      }
    };

    const addToResponseText = (content?: ContentBlock[]) => {
      if (!content) {
        return;
      }

      for (const block of content) {
        if (block.type === 'text' && block.text) {
          responseText += block.text;
        }
      }
    };

    // Aggregate noisy partial assistant outputs from the cursor stream before emitting
    const flushBufferedAssistant = (): ProviderMessage | null => {
      if (!bufferedAssistantText) {
        return null;
      }

      const text = bufferedAssistantText;
      bufferedAssistantText = '';

      return {
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
      };
    };

    console.log('[CursorProvider] Starting to read stdout stream...');
    let messageCount = 0;
    for await (const msg of this.readCursorStream(childProcess.stdout as NodeJS.ReadableStream)) {
      messageCount++;
      console.log(`[CursorProvider] Received message #${messageCount}, type: ${msg.type}`);
      const contentBlocks = msg.message?.content ?? [];

      if (stdoutDebug.length < MAX_DEBUG_LINES) {
        const sample =
          msg.type === 'assistant'
            ? (contentBlocks[0]?.text?.slice(0, 200) ?? '[assistant message]')
            : msg.type === 'result'
              ? '[result]'
              : msg.type === 'error'
                ? `[error] ${msg.error ?? ''}`.trim()
                : `[${msg.type}]`;
        stdoutDebug.push(sample);
      }

      if (msg.type === 'assistant') {
        if (contentBlocks.length === 0) {
          continue;
        }

        const hasNonText = contentBlocks.some((block) => block.type !== 'text');
        if (!hasNonText) {
          bufferAssistantText(contentBlocks);
          continue;
        }

        const bufferedMsg = flushBufferedAssistant();
        if (bufferedMsg) {
          yield bufferedMsg;
        }

        addToResponseText(contentBlocks);
        yield msg;
        continue;
      }

      if (msg.type === 'result') {
        const bufferedMsg = flushBufferedAssistant();
        if (bufferedMsg) {
          yield bufferedMsg;
        }

        sawResult = true;
        if (!msg.result) {
          msg.result = responseText;
        }
        yield msg;
        continue;
      }

      if (msg.type === 'error') {
        const bufferedMsg = flushBufferedAssistant();
        if (bufferedMsg) {
          yield bufferedMsg;
        }

        sawError = true;
        yield msg;
        continue;
      }

      const bufferedMsg = flushBufferedAssistant();
      if (bufferedMsg) {
        yield bufferedMsg;
      }

      yield msg;
    }

    const bufferedMsg = flushBufferedAssistant();
    if (bufferedMsg) {
      yield bufferedMsg;
    }

    const [{ code: exitCode, signal }, stderrOutput] = await Promise.all([
      exitCodePromise,
      stderrPromise,
    ]);

    // Handle errors
    if (exitCode !== 0) {
      const isSigterm = signal === 'SIGTERM' || exitCode === 143;
      if (abortRequested && isSigterm) {
        const abortMsg = 'cursor-agent aborted';
        logger.warn(`${abortMsg}${signal ? ` (signal: ${signal})` : ''}`);
        logger.debug(`stdout (first lines): ${stdoutDebug.join(' | ')}`);
        if (!sawError) {
          yield {
            type: 'error',
            error: abortMsg,
          };
        }
        return;
      }

      const errorMsg =
        stderrOutput ||
        `cursor-agent exited with code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`;
      logger.error(errorMsg);
      logger.debug(`stdout (first lines): ${stdoutDebug.join(' | ')}`);
      if (!sawError) {
        yield {
          type: 'error',
          error: errorMsg,
        };
      }
      return;
    }

    if (!sawResult) {
      yield {
        type: 'result',
        subtype: 'success',
        result: responseText,
      };
    }
  }

  /**
   * Helper to read from a stream
   */
  private async *readStream(stream: NodeJS.ReadableStream): AsyncGenerator<string> {
    for await (const chunk of stream) {
      yield chunk.toString();
    }
  }

  /**
   * Parse stream-json output from cursor-agent into provider messages.
   * Uses readline for reliable line-by-line reading.
   */
  private async *readCursorStream(stream: NodeJS.ReadableStream): AsyncGenerator<ProviderMessage> {
    // Import readline dynamically to avoid top-level import issues
    const readline = await import('readline');

    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity, // Handle both \n and \r\n
    });

    console.log('[CursorProvider] readline interface created, starting to read lines...');

    for await (const line of rl) {
      console.log(`[CursorProvider] Raw line received: ${line.substring(0, 100)}...`);
      const msg = this.parseCursorLine(line);
      if (msg) {
        yield msg;
      }
    }

    console.log('[CursorProvider] readline finished reading all lines');
  }

  private parseCursorLine(line: string): ProviderMessage | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('{')) {
      try {
        const payload = JSON.parse(trimmed) as Record<string, unknown>;
        const msg = this.toProviderMessage(payload);
        if (msg) {
          console.log(
            `[CursorProvider] Parsed JSON message type: ${payload.type} -> ProviderMessage type: ${msg.type}`
          );
        } else {
          console.log(`[CursorProvider] Parsed JSON type: ${payload.type} -> null (filtered)`);
        }
        return msg;
      } catch (error) {
        console.warn(
          '[CursorProvider] Failed to parse stream-json line, treating as text:',
          trimmed.substring(0, 100)
        );
      }
    }

    return {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: line + '\n',
          },
        ],
      },
    };
  }

  private toProviderMessage(payload: Record<string, unknown>): ProviderMessage | null {
    const type = payload.type;
    if (type === 'assistant') {
      const message = payload.message as { content?: unknown } | undefined;
      const content = this.normalizeContentBlocks(message?.content);
      if (content.length === 0) {
        return null;
      }

      return {
        type: 'assistant',
        message: {
          role: 'assistant',
          content,
        },
        session_id:
          typeof payload.session_id === 'string' ? (payload.session_id as string) : undefined,
      };
    }

    if (type === 'tool_call') {
      const toolBlock = this.toolCallToContentBlock(payload);
      if (!toolBlock) {
        return null;
      }

      return {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [toolBlock],
        },
      };
    }

    if (type === 'result') {
      return {
        type: 'result',
        subtype: payload.subtype === 'error' ? 'error' : 'success',
        result: typeof payload.result === 'string' ? payload.result : undefined,
      };
    }

    if (type === 'error') {
      return {
        type: 'error',
        error:
          typeof payload.error === 'string'
            ? payload.error
            : typeof payload.message === 'string'
              ? payload.message
              : 'Cursor agent error',
      };
    }

    return null;
  }

  private normalizeContentBlocks(content: unknown): ContentBlock[] {
    if (!content) {
      return [];
    }

    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }

    if (!Array.isArray(content)) {
      return [];
    }

    const blocks: ContentBlock[] = [];

    for (const block of content) {
      if (!block || typeof block !== 'object') {
        continue;
      }

      const blockType = (block as { type?: string }).type;
      if (blockType === 'text') {
        const text = (block as { text?: string }).text;
        if (text) {
          blocks.push({ type: 'text', text });
        }
      } else if (blockType === 'tool_use') {
        const toolBlock = block as { name?: string; input?: unknown };
        blocks.push({
          type: 'tool_use',
          name: toolBlock.name,
          input: toolBlock.input,
        });
      } else if (blockType === 'tool_result') {
        const toolResultBlock = block as { content?: string; tool_use_id?: string };
        blocks.push({
          type: 'tool_result',
          content: toolResultBlock.content,
          tool_use_id: toolResultBlock.tool_use_id,
        });
      } else if (blockType === 'thinking') {
        const thinkingBlock = block as { thinking?: string };
        blocks.push({
          type: 'thinking',
          thinking: thinkingBlock.thinking,
        });
      }
    }

    return blocks;
  }

  private toolCallToContentBlock(payload: Record<string, unknown>): ContentBlock | null {
    if (payload.subtype && payload.subtype !== 'started') {
      return null;
    }

    const toolCall = payload.tool_call;
    if (!toolCall || typeof toolCall !== 'object') {
      return null;
    }

    const entries = Object.entries(toolCall as Record<string, unknown>);
    if (entries.length === 0) {
      return null;
    }

    const [toolKey, toolData] = entries[0];
    const data =
      toolData && typeof toolData === 'object'
        ? (toolData as { args?: unknown; input?: unknown; name?: string })
        : undefined;

    return {
      type: 'tool_use',
      name: this.normalizeToolName(toolKey, data),
      input: data?.args ?? data?.input ?? toolData,
    };
  }

  private normalizeToolName(toolKey: string, data?: { name?: string }): string {
    if (data?.name) {
      return data.name;
    }

    const cleaned = toolKey.replace(/ToolCall$/, '');
    return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : toolKey;
  }

  private async collectStream(stream: NodeJS.ReadableStream): Promise<string> {
    let output = '';
    for await (const chunk of this.readStream(stream)) {
      output += chunk;
    }
    return output;
  }

  /**
   * Detect cursor-agent CLI installation
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const isWindows = os.platform() === 'win32';

    // Try to find cursor-agent using which/where
    try {
      const findCommand = isWindows ? 'where cursor-agent' : 'which cursor-agent';
      const { stdout } = await execAsync(findCommand);
      const cliPath = stdout.trim().split(/\r?\n/)[0];

      // Get version
      let version = '';
      try {
        const { stdout: versionOut } = await execAsync('cursor-agent --version');
        version = versionOut.trim().split('\n')[0];
      } catch {
        // Version command might not be available
      }

      // Check for API key in environment
      const hasApiKey = !!process.env.CURSOR_API_KEY;

      // Check if logged in by running cursor-agent status
      let authenticated = hasApiKey;
      try {
        const { stdout: statusOut } = await execAsync('cursor-agent status');
        authenticated =
          statusOut.toLowerCase().includes('logged in') ||
          statusOut.toLowerCase().includes('authenticated') ||
          hasApiKey;
      } catch {
        // Status check failed, fall back to API key check
      }

      return {
        installed: true,
        path: cliPath,
        version,
        method: 'cli',
        hasApiKey,
        authenticated,
      };
    } catch {
      // Not in PATH, try common locations
      const commonPaths = isWindows
        ? [
            path.join(
              os.homedir(),
              'AppData',
              'Local',
              'Programs',
              'cursor-agent',
              'cursor-agent.exe'
            ),
            path.join(os.homedir(), '.local', 'bin', 'cursor-agent.exe'),
          ]
        : ['/usr/local/bin/cursor-agent', path.join(os.homedir(), '.local', 'bin', 'cursor-agent')];

      for (const p of commonPaths) {
        try {
          await fs.access(p);
          const hasApiKey = !!process.env.CURSOR_API_KEY;

          return {
            installed: true,
            path: p,
            method: 'cli',
            hasApiKey,
            authenticated: hasApiKey,
          };
        } catch {
          // Not found at this path
        }
      }
    }

    return {
      installed: false,
      method: 'cli',
      hasApiKey: false,
      authenticated: false,
    };
  }

  /**
   * Get available Cursor models
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'auto',
        name: 'Auto',
        modelString: 'auto',
        provider: 'cursor',
        description: 'Automatic model selection (free, unlimited)',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
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
    const supportedFeatures = ['tools', 'text', 'vision'];
    return supportedFeatures.includes(feature);
  }
}
