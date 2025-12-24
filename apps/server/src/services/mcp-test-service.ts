/**
 * MCP Test Service
 *
 * Provides functionality to test MCP server connections and discover available tools.
 * Used to validate MCP server configurations before they are used in tasks.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpServerConfig, StdioMcpConfig, HttpMcpConfig } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('mcp-test-service');

/**
 * Information about a tool discovered from an MCP server
 */
export interface McpToolInfo {
  /** Tool name (used for invocation) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for tool input parameters */
  inputSchema?: object;
}

/**
 * Result of testing an MCP server connection
 */
export interface McpTestResult {
  /** Whether the connection was successful */
  success: boolean;
  /** Connection status */
  status: 'connected' | 'failed' | 'timeout';
  /** Server information (name, version) if connected */
  serverInfo?: {
    name: string;
    version: string;
  };
  /** List of available tools if connected */
  tools?: McpToolInfo[];
  /** Error message if connection failed */
  error?: string;
  /** Time taken to complete the test in milliseconds */
  latencyMs: number;
  /** Timestamp of when the test was performed */
  testedAt: string;
}

/** Default timeout for MCP connection tests (10 seconds) */
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Test an MCP server connection and discover its tools
 *
 * @param config - The MCP server configuration to test
 * @param timeoutMs - Maximum time to wait for connection (default: 10s)
 * @returns Promise resolving to test result with connection status and tools
 */
export async function testMcpServer(
  config: McpServerConfig,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<McpTestResult> {
  const startTime = Date.now();
  const testedAt = new Date().toISOString();

  logger.info(`Testing MCP server: ${config.name} (${config.id})`);

  let client: Client | null = null;
  let transport: StdioClientTransport | SSEClientTransport | null = null;

  try {
    // Create transport based on config type
    if (config.transport.type === 'stdio') {
      const stdioConfig = config.transport as StdioMcpConfig;
      logger.debug(
        `Creating stdio transport: ${stdioConfig.command} ${stdioConfig.args.join(' ')}`
      );

      transport = new StdioClientTransport({
        command: stdioConfig.command,
        args: stdioConfig.args,
        env: stdioConfig.env,
      });
    } else {
      const httpConfig = config.transport as HttpMcpConfig;
      logger.debug(`Creating SSE transport: ${httpConfig.url}`);

      transport = new SSEClientTransport(new URL(httpConfig.url), {
        requestInit: {
          headers: httpConfig.headers,
        },
      });
    }

    // Create client with timeout
    client = new Client(
      {
        name: 'automaker-mcp-tester',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
    });

    await Promise.race([connectPromise, timeoutPromise]);

    logger.info(`Connected to MCP server: ${config.name}`);

    // Get server info
    const serverInfo = client.getServerVersion();

    // List available tools
    let tools: McpToolInfo[] = [];
    try {
      const toolsResponse = await client.listTools();
      tools = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as object | undefined,
      }));
      logger.info(`Discovered ${tools.length} tools from ${config.name}`);
    } catch (toolsError) {
      // Some servers may not support tools, which is fine
      logger.debug(`Could not list tools: ${toolsError}`);
    }

    // Close the connection
    await client.close();

    const latencyMs = Date.now() - startTime;
    logger.info(`MCP server test completed in ${latencyMs}ms: ${config.name} - SUCCESS`);

    return {
      success: true,
      status: 'connected',
      serverInfo: serverInfo
        ? {
            name: serverInfo.name,
            version: serverInfo.version,
          }
        : undefined,
      tools,
      latencyMs,
      testedAt,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timeout');

    logger.error(`MCP server test failed: ${config.name} - ${errorMessage}`);

    // Try to clean up
    try {
      if (client) {
        await client.close();
      }
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      status: isTimeout ? 'timeout' : 'failed',
      error: errorMessage,
      latencyMs,
      testedAt,
    };
  }
}

/**
 * Test multiple MCP servers in parallel
 *
 * @param configs - Array of MCP server configurations to test
 * @param timeoutMs - Maximum time to wait for each connection
 * @returns Promise resolving to map of server ID to test result
 */
export async function testMcpServers(
  configs: McpServerConfig[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Map<string, McpTestResult>> {
  logger.info(`Testing ${configs.length} MCP servers...`);

  const results = new Map<string, McpTestResult>();

  // Test servers in parallel for efficiency
  const testPromises = configs.map(async (config) => {
    const result = await testMcpServer(config, timeoutMs);
    return { id: config.id, result };
  });

  const testResults = await Promise.all(testPromises);

  for (const { id, result } of testResults) {
    results.set(id, result);
  }

  const successCount = Array.from(results.values()).filter((r) => r.success).length;
  logger.info(`MCP server tests complete: ${successCount}/${configs.length} connected`);

  return results;
}

/**
 * MCP Test Service class for dependency injection
 */
export class McpTestService {
  /**
   * Test a single MCP server connection
   */
  async testServer(config: McpServerConfig, timeoutMs?: number): Promise<McpTestResult> {
    return testMcpServer(config, timeoutMs);
  }

  /**
   * Test multiple MCP servers in parallel
   */
  async testServers(
    configs: McpServerConfig[],
    timeoutMs?: number
  ): Promise<Map<string, McpTestResult>> {
    return testMcpServers(configs, timeoutMs);
  }
}
