/**
 * Cursor Provider - Executes queries using cursor-agent CLI
 *
 * Wraps the cursor-agent CLI tool for seamless integration
 * with the provider architecture.
 */

import { spawn, type ChildProcess } from 'child_process';
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';

/**
 * Parsed JSON message from cursor-agent --output-format stream-json
 * Format matches Claude SDK closely with types: system, user, thinking, assistant, result
 */
interface CursorStreamMessage {
  type: 'system' | 'user' | 'thinking' | 'assistant' | 'result' | 'error';
  subtype?: 'init' | 'delta' | 'completed' | 'success' | 'error';
  session_id?: string;
  message?: {
    role: 'user' | 'assistant';
    content: Array<{
      type: 'text' | 'tool_use' | 'tool_result';
      text?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
      content?: string;
    }>;
  };
  // For thinking messages
  text?: string;
  // For result messages
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  // For error messages
  error?: string;
}

export class CursorProvider extends BaseProvider {
  private cliCommand = 'cursor-agent';

  getName(): string {
    return 'cursor';
  }

  /**
   * Execute a query using cursor-agent CLI
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const {
      prompt,
      model,
      cwd,
      abortController,
      sdkSessionId, // Used as chatId for --resume
    } = options;

    // Build CLI arguments
    const args: string[] = [];

    // Use print mode for non-interactive output
    args.push('--print');

    // Use stream-json for structured streaming
    args.push('--output-format', 'stream-json');
    args.push('--stream-partial-output');

    // Set workspace
    args.push('--workspace', cwd);

    // Set model if provided - map to cursor-agent expected format
    if (model) {
      const cursorModel = this.mapModelToCursorFormat(model);
      args.push('--model', cursorModel);
    }

    // Force mode to auto-approve tool use (similar to Claude's permissionMode)
    args.push('--force');

    // Resume existing chat if we have a session ID
    if (sdkSessionId) {
      args.push('--resume', sdkSessionId);
    }

    // Add the prompt
    const promptText = Array.isArray(prompt)
      ? prompt
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('\n')
      : prompt;

    args.push(promptText);

    // Spawn cursor-agent process
    const proc = spawn(this.cliCommand, args, {
      cwd,
      env: {
        ...process.env,
        // Pass API key if configured
        ...(this.config.apiKey ? { CURSOR_API_KEY: this.config.apiKey } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Handle abort
    if (abortController) {
      abortController.signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
      });
    }

    // Process streaming output
    yield* this.processStream(proc);
  }

  /**
   * Process the streaming JSON output from cursor-agent
   */
  private async *processStream(proc: ChildProcess): AsyncGenerator<ProviderMessage> {
    let buffer = '';
    let sessionId: string | undefined;

    const stdout = proc.stdout;
    if (!stdout) {
      throw new Error('Failed to get stdout from cursor-agent process');
    }

    // Collect stderr for error reporting
    let stderrOutput = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    try {
      for await (const chunk of stdout) {
        buffer += chunk.toString();

        // Process complete JSON lines (newline-delimited JSON)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const msg: CursorStreamMessage = JSON.parse(trimmed);

            // Capture session_id for continuity
            if (msg.session_id) {
              sessionId = msg.session_id;
            }

            const providerMsg = this.convertToProviderMessage(msg);
            if (providerMsg) {
              yield providerMsg;
            }
          } catch {
            // If not valid JSON, log and skip
            console.warn('[CursorProvider] Failed to parse line:', trimmed);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const msg: CursorStreamMessage = JSON.parse(buffer.trim());
          const providerMsg = this.convertToProviderMessage(msg);
          if (providerMsg) {
            yield providerMsg;
          }
        } catch {
          console.warn('[CursorProvider] Failed to parse remaining buffer:', buffer.trim());
        }
      }

      // Wait for process to exit
      await new Promise<void>((resolve, reject) => {
        proc.on('close', (code) => {
          if (code !== 0 && code !== null) {
            reject(new Error(`cursor-agent exited with code ${code}: ${stderrOutput}`));
          } else {
            resolve();
          }
        });
        proc.on('error', reject);
      });
    } catch (error) {
      // Emit error message
      yield {
        type: 'error',
        session_id: sessionId,
        error: (error as Error).message,
      };
      throw error;
    }
  }

  /**
   * Convert cursor-agent JSON message to ProviderMessage format
   * The cursor-agent format is very similar to Claude SDK format
   */
  private convertToProviderMessage(msg: CursorStreamMessage): ProviderMessage | null {
    switch (msg.type) {
      case 'system':
        // System init message - we can skip or use for logging
        return null;

      case 'user':
        // User message echo - pass through
        return {
          type: 'user',
          session_id: msg.session_id,
          message: msg.message
            ? {
                role: 'user',
                content: msg.message.content.map((c) => ({
                  type: c.type as 'text' | 'tool_use' | 'thinking' | 'tool_result',
                  text: c.text,
                  name: c.name,
                  input: c.input,
                  tool_use_id: c.tool_use_id,
                  content: c.content,
                })),
              }
            : undefined,
        };

      case 'thinking':
        // Thinking messages - convert to assistant with thinking block
        if (msg.subtype === 'delta' && msg.text) {
          return {
            type: 'assistant',
            session_id: msg.session_id,
            message: {
              role: 'assistant',
              content: [{ type: 'thinking', thinking: msg.text }],
            },
          };
        }
        // thinking completed - skip
        return null;

      case 'assistant':
        // Assistant response - direct mapping
        return {
          type: 'assistant',
          session_id: msg.session_id,
          message: msg.message
            ? {
                role: 'assistant',
                content: msg.message.content.map((c) => ({
                  type: c.type as 'text' | 'tool_use' | 'thinking' | 'tool_result',
                  text: c.text,
                  name: c.name,
                  input: c.input,
                  tool_use_id: c.tool_use_id,
                  content: c.content,
                })),
              }
            : undefined,
        };

      case 'result':
        // Final result
        return {
          type: 'result',
          subtype: msg.is_error ? 'error' : 'success',
          session_id: msg.session_id,
          result: msg.result,
        };

      case 'error':
        return {
          type: 'error',
          session_id: msg.session_id,
          error: msg.error,
        };

      default:
        return null;
    }
  }

  /**
   * Detect cursor-agent CLI installation
   */
  async detectInstallation(): Promise<InstallationStatus> {
    try {
      // Try to run cursor-agent --version
      const result = await this.runCommand(['-v']);

      const hasApiKey = !!process.env.CURSOR_API_KEY || !!this.config.apiKey;

      // Check auth status
      let authenticated = false;
      try {
        const statusResult = await this.runCommand(['status']);
        authenticated = !statusResult.includes('not logged in') && !statusResult.includes('error');
      } catch {
        // Status check failed, assume not authenticated
      }

      return {
        installed: true,
        method: 'cli',
        version: result.trim(),
        hasApiKey,
        authenticated,
      };
    } catch (error) {
      return {
        installed: false,
        method: 'cli',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Run a cursor-agent command and return output
   */
  private runCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.cliCommand, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Get available Cursor models
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'cursor-opus-4.5-thinking',
        name: 'Cursor Opus 4.5 Thinking',
        modelString: 'opus-4.5-thinking',
        provider: 'cursor',
        description: 'Claude Opus 4.5 with extended thinking via Cursor',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium',
      },
      {
        id: 'cursor-sonnet-4.5',
        name: 'Cursor Sonnet 4.5',
        modelString: 'sonnet-4.5',
        provider: 'cursor',
        description: 'Claude Sonnet 4.5 via Cursor',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard',
        default: true,
      },
      {
        id: 'cursor-gpt-5.2',
        name: 'Cursor GPT-5.2',
        modelString: 'gpt-5.2',
        provider: 'cursor',
        description: 'OpenAI GPT-5.2 via Cursor',
        contextWindow: 128000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium',
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

  /**
   * Map model ID to cursor-agent expected format
   * e.g., 'cursor-sonnet' -> 'sonnet-4.5', 'cursor-opus-thinking' -> 'opus-4.5-thinking'
   */
  private mapModelToCursorFormat(model: string): string {
    const modelMap: Record<string, string> = {
      // UI alias -> cursor-agent format
      'cursor-opus-thinking': 'opus-4.5-thinking',
      'cursor-sonnet': 'sonnet-4.5',
      'cursor-gpt5': 'gpt-5.2',
      // Full IDs -> cursor-agent format
      'cursor-opus-4.5-thinking': 'opus-4.5-thinking',
      'cursor-sonnet-4.5': 'sonnet-4.5',
      'cursor-gpt-5.2': 'gpt-5.2',
    };

    const lowerModel = model.toLowerCase();
    return modelMap[lowerModel] || model;
  }
}
