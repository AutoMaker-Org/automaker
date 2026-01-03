/**
 * MCP Test Service
 *
 * Provides functionality to test MCP server connections and list available tools.
 * Supports stdio, SSE, and HTTP transport types.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { MCPServerConfig, MCPToolInfo } from '@automaker/types';
import type { SettingsService } from './settings-service.js';

const execAsync = promisify(exec);
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const IS_WINDOWS = process.platform === 'win32';

export interface MCPTestResult {
  success: boolean;
  tools?: MCPToolInfo[];
  error?: string;
  connectionTime?: number;
  serverInfo?: {
    name?: string;
    version?: string;
  };
}

/**
 * MCP Test Service for testing server connections and listing tools
 */
export class MCPTestService {
  private settingsService: SettingsService;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  /**
   * Test connection to an MCP server and list its tools
   */
  async testServer(serverConfig: MCPServerConfig): Promise<MCPTestResult> {
    const startTime = Date.now();
    let client: Client | null = null;
    let transport:
      | StdioClientTransport
      | SSEClientTransport
      | StreamableHTTPClientTransport
      | null = null;

    try {
      client = new Client({
        name: 'automaker-mcp-test',
        version: '1.0.0',
      });

      // Create transport based on server type
      transport = await this.createTransport(serverConfig);

      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        this.timeout(DEFAULT_TIMEOUT, 'Connection timeout'),
      ]);

      // List tools with timeout
      const toolsResult = await Promise.race([
        client.listTools(),
        this.timeout<{
          tools: Array<{
            name: string;
            description?: string;
            inputSchema?: Record<string, unknown>;
          }>;
        }>(DEFAULT_TIMEOUT, 'List tools timeout'),
      ]);

      const connectionTime = Date.now() - startTime;

      // Convert tools to MCPToolInfo format
      const tools: MCPToolInfo[] = (toolsResult.tools || []).map(
        (tool: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          enabled: true,
        })
      );

      return {
        success: true,
        tools,
        connectionTime,
        serverInfo: {
          name: serverConfig.name,
          version: undefined, // Could be extracted from server info if available
        },
      };
    } catch (error) {
      const connectionTime = Date.now() - startTime;
      return {
        success: false,
        error: this.getErrorMessage(error),
        connectionTime,
      };
    } finally {
      // Clean up client connection and ensure process termination
      await this.cleanupConnection(client, transport);
    }
  }

  /**
   * Clean up MCP client connection and terminate spawned processes
   *
   * On Windows, child processes spawned via 'cmd /c' don't get terminated when the
   * parent process is killed. We use taskkill with /t flag to kill the entire process tree.
   * This prevents orphaned MCP server processes that would spam logs with ping warnings.
   *
   * IMPORTANT: We must run taskkill BEFORE client.close() because:
   * - client.close() kills only the parent cmd.exe process
   * - This orphans the child node.exe processes before we can kill them
   * - taskkill /t needs the parent PID to exist to traverse the process tree
   */
  private async cleanupConnection(
    client: Client | null,
    transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport | null
  ): Promise<void> {
    // Get the PID before any cleanup (only available for stdio transports)
    const pid = transport instanceof StdioClientTransport ? transport.pid : null;

    // On Windows with stdio transport, kill the entire process tree FIRST
    // This must happen before client.close() which would orphan child processes
    if (IS_WINDOWS && pid) {
      try {
        // taskkill /f = force, /t = kill process tree, /pid = process ID
        await execAsync(`taskkill /f /t /pid ${pid}`);
      } catch {
        // Process may have already exited, which is fine
      }
    }

    // Now do the standard close (may be a no-op if taskkill already killed everything)
    if (client) {
      try {
        await client.close();
      } catch {
        // Expected if taskkill already terminated the process
      }
    }
  }

  /**
   * Test server by ID (looks up config from settings)
   */
  async testServerById(serverId: string): Promise<MCPTestResult> {
    try {
      const globalSettings = await this.settingsService.getGlobalSettings();
      const serverConfig = globalSettings.mcpServers?.find((s) => s.id === serverId);

      if (!serverConfig) {
        return {
          success: false,
          error: `Server with ID "${serverId}" not found`,
        };
      }

      return this.testServer(serverConfig);
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Create appropriate transport based on server type
   */
  private async createTransport(
    config: MCPServerConfig
  ): Promise<StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport> {
    if (config.type === 'sse') {
      if (!config.url) {
        throw new Error('URL is required for SSE transport');
      }
      // Use eventSourceInit workaround for SSE headers (SDK bug workaround)
      // See: https://github.com/modelcontextprotocol/typescript-sdk/issues/436
      const headers = config.headers;
      return new SSEClientTransport(new URL(config.url), {
        requestInit: headers ? { headers } : undefined,
        eventSourceInit: headers
          ? {
              fetch: (url: string | URL | Request, init?: RequestInit) => {
                const fetchHeaders = new Headers(init?.headers || {});
                for (const [key, value] of Object.entries(headers)) {
                  fetchHeaders.set(key, value);
                }
                return fetch(url, { ...init, headers: fetchHeaders });
              },
            }
          : undefined,
      });
    }

    if (config.type === 'http') {
      if (!config.url) {
        throw new Error('URL is required for HTTP transport');
      }
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: config.headers
          ? {
              headers: config.headers,
            }
          : undefined,
      });
    }

    // Default to stdio
    if (!config.command) {
      throw new Error('Command is required for stdio transport');
    }

    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }

  /**
   * Create a timeout promise
   */
  private timeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Extract error message from unknown error
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
