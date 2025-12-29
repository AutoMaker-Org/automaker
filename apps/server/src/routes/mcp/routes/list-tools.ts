/**
 * POST /api/mcp/tools - List tools for an MCP server
 *
 * Lists available tools for an MCP server.
 * Similar to test but focused on tool discovery.
 *
 * SECURITY: Only accepts serverId to look up saved configs. Does NOT accept
 * arbitrary serverConfig to prevent drive-by command execution attacks.
 * Users must explicitly save a server config through the UI before testing.
 *
 * Request body:
 *   { serverId: string } - Get tools by server ID from settings
 *
 * Response: { success: boolean, tools?: MCPToolInfo[], error?: string }
 */

import type { Request, Response } from 'express';
import type { MCPTestService } from '../../../services/mcp-test-service.js';
import { getErrorMessage, logError } from '../common.js';

interface ListToolsRequest {
  serverId: string;
}

/**
 * Create handler factory for POST /api/mcp/tools
 */
export function createListToolsHandler(mcpTestService: MCPTestService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as ListToolsRequest;

      if (!body.serverId || typeof body.serverId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'serverId is required',
        });
        return;
      }

      const result = await mcpTestService.testServerById(body.serverId);

      // Return only tool-related information
      res.json({
        success: result.success,
        tools: result.tools,
        error: result.error,
      });
    } catch (error) {
      logError(error, 'List tools failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
