/**
 * Discover Agents Route - Returns filesystem-based agents from .claude/agents/
 *
 * Scans both user-level (~/.claude/agents/) and project-level (.claude/agents/)
 * directories for AGENT.md files and returns parsed agent definitions.
 */

import type { Request, Response } from 'express';
import { discoverFilesystemAgents } from '../../../lib/agent-discovery.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('DiscoverAgentsRoute');

interface DiscoverAgentsRequest {
  projectPath?: string;
  sources?: Array<'user' | 'project'>;
}

/**
 * Create handler for discovering filesystem agents
 *
 * POST /api/settings/agents/discover
 * Body: { projectPath?: string, sources?: ['user', 'project'] }
 *
 * Returns:
 * {
 *   success: true,
 *   agents: Array<{
 *     name: string,
 *     definition: AgentDefinition,
 *     source: 'user' | 'project',
 *     filePath: string
 *   }>
 * }
 */
export function createDiscoverAgentsHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { projectPath, sources = ['user', 'project'] } = req.body as DiscoverAgentsRequest;

      logger.info(
        `Discovering agents from sources: ${sources.join(', ')}${projectPath ? ` (project: ${projectPath})` : ''}`
      );

      const agents = await discoverFilesystemAgents(projectPath, sources);

      logger.info(`Discovered ${agents.length} filesystem agents`);

      res.json({
        success: true,
        agents,
      });
    } catch (error) {
      logger.error('Failed to discover agents:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to discover agents',
      });
    }
  };
}
