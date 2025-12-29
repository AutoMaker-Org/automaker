/**
 * MCP routes - HTTP API for testing MCP servers
 *
 * Provides endpoints for:
 * - Testing MCP server connections
 * - Listing available tools from MCP servers
 *
 * Mounted at /api/mcp in the main server.
 */

import { Router } from 'express';
import type { MCPTestService } from '../../services/mcp-test-service.js';
import { createTestServerHandler } from './routes/test-server.js';
import { createListToolsHandler } from './routes/list-tools.js';

/**
 * Create MCP router with all endpoints
 *
 * Endpoints:
 * - POST /test - Test MCP server connection
 * - POST /tools - List tools from MCP server
 *
 * @param mcpTestService - Instance of MCPTestService for testing connections
 * @returns Express Router configured with all MCP endpoints
 */
export function createMCPRoutes(mcpTestService: MCPTestService): Router {
  const router = Router();

  // Test MCP server connection
  router.post('/test', createTestServerHandler(mcpTestService));

  // List tools from MCP server
  router.post('/tools', createListToolsHandler(mcpTestService));

  return router;
}
