/**
 * Codex Config Manager - Writes MCP server configuration for Codex CLI
 */

import path from 'path';
import type { McpServerConfig } from '@automaker/types';
import * as secureFs from '../lib/secure-fs.js';

const CODEX_CONFIG_DIR = '.codex';
const CODEX_CONFIG_FILENAME = 'config.toml';
const CODEX_MCP_SECTION = 'mcp_servers';

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function formatTomlArray(values: string[]): string {
  const formatted = values.map((value) => formatTomlString(value)).join(', ');
  return `[${formatted}]`;
}

function formatTomlInlineTable(values: Record<string, string>): string {
  const entries = Object.entries(values).map(
    ([key, value]) => `${key} = ${formatTomlString(value)}`
  );
  return `{ ${entries.join(', ')} }`;
}

function formatTomlKey(key: string): string {
  return `"${key.replace(/"/g, '\\"')}"`;
}

function buildServerBlock(name: string, server: McpServerConfig): string[] {
  const lines: string[] = [];
  const section = `${CODEX_MCP_SECTION}.${formatTomlKey(name)}`;
  lines.push(`[${section}]`);

  if (server.type) {
    lines.push(`type = ${formatTomlString(server.type)}`);
  }

  if ('command' in server && server.command) {
    lines.push(`command = ${formatTomlString(server.command)}`);
  }

  if ('args' in server && server.args && server.args.length > 0) {
    lines.push(`args = ${formatTomlArray(server.args)}`);
  }

  if ('env' in server && server.env && Object.keys(server.env).length > 0) {
    lines.push(`env = ${formatTomlInlineTable(server.env)}`);
  }

  if ('url' in server && server.url) {
    lines.push(`url = ${formatTomlString(server.url)}`);
  }

  if ('headers' in server && server.headers && Object.keys(server.headers).length > 0) {
    lines.push(`headers = ${formatTomlInlineTable(server.headers)}`);
  }

  return lines;
}

export class CodexConfigManager {
  async configureMcpServers(
    cwd: string,
    mcpServers: Record<string, McpServerConfig>
  ): Promise<void> {
    const configDir = path.join(cwd, CODEX_CONFIG_DIR);
    const configPath = path.join(configDir, CODEX_CONFIG_FILENAME);

    await secureFs.mkdir(configDir, { recursive: true });

    const blocks: string[] = [];
    for (const [name, server] of Object.entries(mcpServers)) {
      blocks.push(...buildServerBlock(name, server), '');
    }

    const content = blocks.join('\n').trim();
    if (content) {
      await secureFs.writeFile(configPath, content + '\n', 'utf-8');
    }
  }
}
