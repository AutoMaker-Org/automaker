/**
 * POST /api/settings/mcp-servers/test - Test an MCP server connection
 *
 * Validates that an MCP server can be connected to and discovers available tools.
 * Can test a server configuration without saving it (for validation before add/edit)
 * or test an existing server by ID.
 *
 * Request body:
 * - config: McpServerConfig (full config to test, used when adding/editing)
 * - OR serverId: string (ID of existing server to test)
 *
 * Response: { success: boolean, result: McpTestResult }
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import type { McpServerConfig } from '@automaker/types';
import { McpTestService, type McpTestResult } from '../../../services/mcp-test-service.js';
import { getErrorMessage, logError, logger } from '../common.js';

interface TestMcpServerRequest {
  /** Full server config to test (for new/edited servers) */
  config?: McpServerConfig;
  /** ID of existing server to test */
  serverId?: string;
  /** Optional timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
}

interface TestMcpServerResponse {
  success: boolean;
  result?: McpTestResult;
  error?: string;
}

/**
 * Create handler factory for POST /api/settings/mcp-servers/test
 *
 * @param settingsService - Instance of SettingsService for looking up existing servers
 * @returns Express request handler
 */
export function createTestMcpServerHandler(settingsService: SettingsService) {
  const mcpTestService = new McpTestService();

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { config, serverId, timeoutMs } = req.body as TestMcpServerRequest;

      // Must provide either config or serverId
      if (!config && !serverId) {
        res.status(400).json({
          success: false,
          error: 'Must provide either config or serverId',
        } as TestMcpServerResponse);
        return;
      }

      let serverConfig: McpServerConfig;

      if (config) {
        // Test provided config directly
        serverConfig = config;
      } else {
        // Look up existing server by ID
        const settings = await settingsService.getGlobalSettings();
        const existingServer = settings.mcpServers?.find((s) => s.id === serverId);

        if (!existingServer) {
          res.status(404).json({
            success: false,
            error: `MCP server not found: ${serverId}`,
          } as TestMcpServerResponse);
          return;
        }

        serverConfig = existingServer;
      }

      logger.info(`Testing MCP server: ${serverConfig.name}`);

      // Test the server
      const result = await mcpTestService.testServer(serverConfig, timeoutMs);

      logger.info(
        `MCP server test ${result.success ? 'passed' : 'failed'}: ${serverConfig.name}` +
          (result.tools?.length ? ` (${result.tools.length} tools)` : '')
      );

      res.json({
        success: true,
        result,
      } as TestMcpServerResponse);
    } catch (error) {
      logError(error, 'Test MCP server failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as TestMcpServerResponse);
    }
  };
}

/**
 * POST /api/settings/mcp-servers/test-all - Test all configured MCP servers
 *
 * Tests all MCP servers in global settings and returns results for each.
 *
 * Response: { success: boolean, results: Record<string, McpTestResult> }
 */
export function createTestAllMcpServersHandler(settingsService: SettingsService) {
  const mcpTestService = new McpTestService();

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { timeoutMs } = req.body as { timeoutMs?: number };

      const settings = await settingsService.getGlobalSettings();
      const mcpServers = settings.mcpServers ?? [];

      if (mcpServers.length === 0) {
        res.json({
          success: true,
          results: {},
        });
        return;
      }

      logger.info(`Testing ${mcpServers.length} MCP servers...`);

      // Test all servers in parallel
      const resultsMap = await mcpTestService.testServers(mcpServers, timeoutMs);

      // Convert Map to object for JSON response
      const results: Record<string, McpTestResult> = {};
      for (const [id, result] of resultsMap) {
        results[id] = result;
      }

      const successCount = Object.values(results).filter((r) => r.success).length;
      logger.info(`MCP server tests complete: ${successCount}/${mcpServers.length} passed`);

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      logError(error, 'Test all MCP servers failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
