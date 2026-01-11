import { spawn, type ChildProcess } from 'child_process';
import readline from 'readline';
import { findCodexCliPath } from '@automaker/platform';
import { createLogger } from '@automaker/utils';
import type {
  AppServerModelResponse,
  AppServerAccountResponse,
  AppServerRateLimitsResponse,
  JsonRpcRequest,
} from '@automaker/types';

const logger = createLogger('CodexAppServer');

/**
 * CodexAppServerService
 *
 * Centralized service for communicating with Codex CLI's app-server via JSON-RPC protocol.
 * Handles process spawning, JSON-RPC messaging, and cleanup.
 *
 * Connection strategy: Spawn on-demand (new process for each method call)
 */
export class CodexAppServerService {
  private cachedCliPath: string | null = null;

  /**
   * Check if Codex CLI is available on the system
   */
  async isAvailable(): Promise<boolean> {
    this.cachedCliPath = await findCodexCliPath();
    return Boolean(this.cachedCliPath);
  }

  /**
   * Fetch available models from app-server
   */
  async getModels(): Promise<AppServerModelResponse | null> {
    const result = await this.executeJsonRpc<AppServerModelResponse>((sendRequest) => {
      return sendRequest('model/list', {});
    });

    if (result) {
      logger.info(`[getModels] ✓ Fetched ${result.data.length} models`);
    }

    return result;
  }

  /**
   * Fetch account information from app-server
   */
  async getAccount(): Promise<AppServerAccountResponse | null> {
    return this.executeJsonRpc<AppServerAccountResponse>((sendRequest) => {
      return sendRequest('account/read', { refreshToken: false });
    });
  }

  /**
   * Fetch rate limits from app-server
   */
  async getRateLimits(): Promise<AppServerRateLimitsResponse | null> {
    return this.executeJsonRpc<AppServerRateLimitsResponse>((sendRequest) => {
      return sendRequest('account/rateLimits/read', {});
    });
  }

  /**
   * Execute JSON-RPC requests via Codex app-server
   *
   * This method:
   * 1. Spawns a new `codex app-server` process
   * 2. Handles JSON-RPC initialization handshake
   * 3. Executes user-provided requests
   * 4. Cleans up the process
   *
   * @param requestFn - Function that receives sendRequest helper and returns a promise
   * @returns Result of the JSON-RPC request or null on failure
   */
  private async executeJsonRpc<T>(
    requestFn: (sendRequest: <R>(method: string, params?: unknown) => Promise<R>) => Promise<T>
  ): Promise<T | null> {
    let childProcess: ChildProcess | null = null;

    try {
      const cliPath = this.cachedCliPath || (await findCodexCliPath());

      if (!cliPath) {
        return null;
      }

      // On Windows, .cmd files must be run through shell
      const needsShell = process.platform === 'win32' && cliPath.toLowerCase().endsWith('.cmd');

      childProcess = spawn(cliPath, ['app-server'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: 'dumb',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: needsShell,
      });

      if (!childProcess.stdin || !childProcess.stdout) {
        throw new Error('Failed to create stdio pipes');
      }

      // Setup readline for reading JSONL responses
      const rl = readline.createInterface({
        input: childProcess.stdout,
        crlfDelay: Infinity,
      });

      // Message ID counter for JSON-RPC
      let messageId = 0;
      const pendingRequests = new Map<
        number,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
          timeout: NodeJS.Timeout;
        }
      >();

      // Process incoming messages
      rl.on('line', (line) => {
        if (!line.trim()) return;

        try {
          const message = JSON.parse(line);

          // Handle response to our request
          if ('id' in message && message.id !== undefined) {
            const pending = pendingRequests.get(message.id);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingRequests.delete(message.id);
              if (message.error) {
                pending.reject(new Error(message.error.message || 'Unknown error'));
              } else {
                pending.resolve(message.result);
              }
            }
          }
          // Ignore notifications (no id field)
        } catch {
          // Ignore parse errors for non-JSON lines
        }
      });

      // Helper to send JSON-RPC request and wait for response
      const sendRequest = <R>(method: string, params?: unknown): Promise<R> => {
        return new Promise((resolve, reject) => {
          const id = ++messageId;
          const request: JsonRpcRequest = {
            method,
            id,
            params: params ?? {},
          };

          // Set timeout for request (10 seconds)
          const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error(`Request timeout: ${method}`));
          }, 10000);

          pendingRequests.set(id, {
            resolve: resolve as (value: unknown) => void,
            reject,
            timeout,
          });

          childProcess!.stdin!.write(JSON.stringify(request) + '\n');
        });
      };

      // Helper to send notification (no response expected)
      const sendNotification = (method: string, params?: unknown): void => {
        const notification = params ? { method, params } : { method };
        childProcess!.stdin!.write(JSON.stringify(notification) + '\n');
      };

      // 1. Initialize the app-server
      await sendRequest('initialize', {
        clientInfo: {
          name: 'automaker',
          title: 'AutoMaker',
          version: '1.0.0',
        },
      });

      // 2. Send initialized notification
      sendNotification('initialized');

      // 3. Execute user-provided requests
      const result = await requestFn(sendRequest);

      // Clean up
      rl.close();
      childProcess.kill('SIGTERM');

      return result;
    } catch (error) {
      logger.error('[executeJsonRpc] Failed:', error);
      return null;
    } finally {
      // Ensure process is killed
      if (childProcess && !childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
    }
  }
}
