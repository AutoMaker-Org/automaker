/**
 * POST /api/mcp/test - Test MCP server connection and list tools
 *
 * Tests connection to an MCP server and returns available tools.
 *
 * SECURITY: Only accepts serverId to look up saved configs. Does NOT accept
 * arbitrary serverConfig to prevent drive-by command execution attacks.
 * Users must explicitly save a server config through the UI before testing.
 *
 * Request body:
 *   { serverId: string } - Test server by ID from settings
 *
 * Response: { success: boolean, tools?: MCPToolInfo[], error?: string, connectionTime?: number }
 */

import type { Request, Response } from 'express';
import type { MCPTestService } from '../../../services/mcp-test-service.js';
import { getErrorMessage, logError } from '../common.js';

interface TestServerRequest {
  serverId: string;
}

/**
 * Create handler factory for POST /api/mcp/test
 */
export function createTestServerHandler(mcpTestService: MCPTestService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as TestServerRequest;

      if (!body.serverId || typeof body.serverId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'serverId is required',
        });
        return;
      }

      const result = await mcpTestService.testServerById(body.serverId);
      res.json(result);
    } catch (error) {
      logError(error, 'Test server failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
