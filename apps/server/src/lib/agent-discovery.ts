/**
 * Agent Discovery - Scans filesystem for AGENT.md files
 *
 * Discovers agents from:
 * - ~/.claude/agents/ (user-level, global)
 * - .claude/agents/ (project-level)
 *
 * Similar to Skills, but for custom subagents defined in AGENT.md files.
 */

import path from 'path';
import os from 'os';
import { createLogger } from '@automaker/utils';
import { secureFs, systemPaths } from '@automaker/platform';
import type { AgentDefinition } from '@automaker/types';

const logger = createLogger('AgentDiscovery');

export interface FilesystemAgent {
  name: string; // Directory name (e.g., 'code-reviewer')
  definition: AgentDefinition;
  source: 'user' | 'project';
  filePath: string; // Full path to AGENT.md
}

/**
 * Parse agent .md file frontmatter and content
 * Format:
 * ---
 * name: agent-name  # Optional
 * description: When to use this agent
 * tools: tool1, tool2, tool3  # Optional (comma or space separated list)
 * model: sonnet  # Optional: sonnet, opus, haiku
 * ---
 * System prompt content here...
 */
async function parseAgentFile(
  filePath: string,
  isSystemPath: boolean
): Promise<AgentDefinition | null> {
  try {
    const content = isSystemPath
      ? ((await systemPaths.systemPathReadFile(filePath, 'utf-8')) as string)
      : ((await secureFs.readFile(filePath, 'utf-8')) as string);

    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      logger.warn(`Invalid agent file format (missing frontmatter): ${filePath}`);
      return null;
    }

    const [, frontmatter, prompt] = frontmatterMatch;

    // Parse description (required)
    const description = frontmatter.match(/description:\s*(.+)/)?.[1]?.trim();
    if (!description) {
      logger.warn(`Missing description in agent file: ${filePath}`);
      return null;
    }

    // Parse tools (optional) - supports both comma-separated and space-separated
    const toolsMatch = frontmatter.match(/tools:\s*(.+)/);
    const tools = toolsMatch
      ? toolsMatch[1]
          .split(/[,\s]+/) // Split by comma or whitespace
          .map((t) => t.trim())
          .filter((t) => t && t !== '')
      : undefined;

    // Parse model (optional)
    const modelMatch = frontmatter.match(/model:\s*(\w+)/);
    const model = modelMatch
      ? (modelMatch[1].trim() as 'sonnet' | 'opus' | 'haiku' | 'inherit')
      : undefined;

    return {
      description,
      prompt: prompt.trim(),
      tools,
      model,
    };
  } catch (error) {
    logger.error(`Failed to parse agent file: ${filePath}`, error);
    return null;
  }
}

/**
 * Scan a directory for agent .md files
 * Agents can be in two formats:
 * 1. Flat: agent-name.md (file directly in agents/)
 * 2. Subdirectory: agent-name/AGENT.md (folder + file, similar to Skills)
 */
async function scanAgentsDirectory(
  baseDir: string,
  source: 'user' | 'project'
): Promise<FilesystemAgent[]> {
  const agents: FilesystemAgent[] = [];
  const isSystemPath = source === 'user'; // User directories use systemPaths

  try {
    // Check if directory exists
    const exists = isSystemPath
      ? await systemPaths.systemPathExists(baseDir)
      : await secureFs
          .access(baseDir)
          .then(() => true)
          .catch(() => false);

    if (!exists) {
      logger.debug(`Directory does not exist: ${baseDir}`);
      return agents;
    }

    // Read all entries in the directory
    if (isSystemPath) {
      // For system paths (user directory)
      const entryNames = await systemPaths.systemPathReaddir(baseDir);
      for (const entryName of entryNames) {
        const entryPath = path.join(baseDir, entryName);
        const stat = await systemPaths.systemPathStat(entryPath);

        // Check for flat .md file format (agent-name.md)
        if (stat.isFile() && entryName.endsWith('.md')) {
          const agentName = entryName.slice(0, -3); // Remove .md extension
          const definition = await parseAgentFile(entryPath, true);
          if (definition) {
            agents.push({
              name: agentName,
              definition,
              source,
              filePath: entryPath,
            });
            logger.debug(`Discovered ${source} agent (flat): ${agentName}`);
          }
        }
        // Check for subdirectory format (agent-name/AGENT.md)
        else if (stat.isDirectory()) {
          const agentFilePath = path.join(entryPath, 'AGENT.md');
          const agentFileExists = await systemPaths.systemPathExists(agentFilePath);

          if (agentFileExists) {
            const definition = await parseAgentFile(agentFilePath, true);
            if (definition) {
              agents.push({
                name: entryName,
                definition,
                source,
                filePath: agentFilePath,
              });
              logger.debug(`Discovered ${source} agent (subdirectory): ${entryName}`);
            }
          }
        }
      }
    } else {
      // For project paths (use secureFs)
      const entries = await secureFs.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        // Check for flat .md file format (agent-name.md)
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const agentName = entry.name.slice(0, -3); // Remove .md extension
          const agentFilePath = path.join(baseDir, entry.name);
          const definition = await parseAgentFile(agentFilePath, false);
          if (definition) {
            agents.push({
              name: agentName,
              definition,
              source,
              filePath: agentFilePath,
            });
            logger.debug(`Discovered ${source} agent (flat): ${agentName}`);
          }
        }
        // Check for subdirectory format (agent-name/AGENT.md)
        else if (entry.isDirectory()) {
          const agentDir = path.join(baseDir, entry.name);
          const agentFilePath = path.join(agentDir, 'AGENT.md');

          const agentFileExists = await secureFs
            .access(agentFilePath)
            .then(() => true)
            .catch(() => false);

          if (agentFileExists) {
            const definition = await parseAgentFile(agentFilePath, false);
            if (definition) {
              agents.push({
                name: entry.name,
                definition,
                source,
                filePath: agentFilePath,
              });
              logger.debug(`Discovered ${source} agent (subdirectory): ${entry.name}`);
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Failed to scan agents directory: ${baseDir}`, error);
  }

  return agents;
}

/**
 * Discover all filesystem-based agents from user and project sources
 */
export async function discoverFilesystemAgents(
  projectPath?: string,
  sources: Array<'user' | 'project'> = ['user', 'project']
): Promise<FilesystemAgent[]> {
  const agents: FilesystemAgent[] = [];

  // Discover user-level agents from ~/.claude/agents/
  if (sources.includes('user')) {
    const userAgentsDir = path.join(os.homedir(), '.claude', 'agents');
    const userAgents = await scanAgentsDirectory(userAgentsDir, 'user');
    agents.push(...userAgents);
    logger.info(`Discovered ${userAgents.length} user-level agents from ${userAgentsDir}`);
  }

  // Discover project-level agents from .claude/agents/
  if (sources.includes('project') && projectPath) {
    const projectAgentsDir = path.join(projectPath, '.claude', 'agents');
    const projectAgents = await scanAgentsDirectory(projectAgentsDir, 'project');
    agents.push(...projectAgents);
    logger.info(`Discovered ${projectAgents.length} project-level agents from ${projectAgentsDir}`);
  }

  return agents;
}
