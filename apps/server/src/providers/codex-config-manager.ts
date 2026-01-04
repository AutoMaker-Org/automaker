/**
 * Codex CLI configuration manager for MCP servers
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type McpServerConfig = {
  command?: string;
  url?: string;
  args?: string[];
  enabled_tools?: string[];
  enabledTools?: string[];
  startup_timeout_sec?: number;
  tool_timeout_sec?: number;
  env?: Record<string, string>;
};

export class CodexConfigManager {
  async configureMcpServers(
    _cwd: string,
    mcpServers: Record<string, unknown>
  ): Promise<string | null> {
    if (!mcpServers || Object.keys(mcpServers).length === 0) {
      return null;
    }

    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const configDir = codexHome;
    const configPath = path.join(configDir, 'config.toml');

    await fs.mkdir(configDir, { recursive: true });

    let existing = '';
    try {
      existing = await fs.readFile(configPath, 'utf-8');
    } catch {
      existing = '';
    }

    const merged = this.mergeConfig(existing, mcpServers);
    await fs.writeFile(configPath, merged, 'utf-8');

    return configPath;
  }

  private mergeConfig(existing: string, mcpServers: Record<string, unknown>): string {
    let content = existing.trim();

    for (const [name, value] of Object.entries(mcpServers)) {
      if (!name || typeof name !== 'string') {
        continue;
      }

      if (this.hasServerBlock(content, name)) {
        continue;
      }

      const block = this.renderServerBlock(name, value as McpServerConfig);
      if (block) {
        content = `${content}\n\n${block}`.trim();
      }
    }

    return `${content.trim()}\n`;
  }

  private renderServerBlock(name: string, config: McpServerConfig): string | null {
    if (!config || typeof config !== 'object') {
      return null;
    }

    const command = typeof config.command === 'string' ? config.command : undefined;
    const url = typeof config.url === 'string' ? config.url : undefined;
    if (!command && !url) {
      return null;
    }

    const args = Array.isArray(config.args) ? config.args : [];
    const enabledTools = Array.isArray(config.enabled_tools)
      ? config.enabled_tools
      : Array.isArray(config.enabledTools)
        ? config.enabledTools
        : [];
    const startupTimeout = Number.isFinite(config.startup_timeout_sec)
      ? config.startup_timeout_sec
      : undefined;
    const toolTimeout = Number.isFinite(config.tool_timeout_sec)
      ? config.tool_timeout_sec
      : undefined;

    const lines = [`[mcp_servers.${name}]`];

    if (command) {
      lines.push(`command = ${this.formatValue(command)}`);
    }
    if (url) {
      lines.push(`url = ${this.formatValue(url)}`);
    }

    if (args.length > 0) {
      lines.push(`args = ${this.formatValue(args)}`);
    }
    if (enabledTools.length > 0) {
      lines.push(`enabled_tools = ${this.formatValue(enabledTools)}`);
    }
    if (startupTimeout !== undefined) {
      lines.push(`startup_timeout_sec = ${this.formatValue(startupTimeout)}`);
    }
    if (toolTimeout !== undefined) {
      lines.push(`tool_timeout_sec = ${this.formatValue(toolTimeout)}`);
    }

    if (config.env && typeof config.env === 'object') {
      const envEntries = Object.entries(config.env);
      if (envEntries.length > 0) {
        lines.push('', `[mcp_servers.${name}.env]`);
        for (const [key, value] of envEntries) {
          lines.push(`${this.formatKey(key)} = ${this.formatValue(value)}`);
        }
      }
    }

    return lines.join('\n');
  }

  private formatValue(value: unknown): string {
    if (Array.isArray(value)) {
      const items = value.map((item) => this.formatValue(item));
      return `[${items.join(', ')}]`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'string') {
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    return '""';
  }

  private formatKey(key: string): string {
    if (/^[A-Za-z0-9_-]+$/.test(key)) {
      return key;
    }
    return this.formatValue(key);
  }

  private hasServerBlock(content: string, name: string): boolean {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headerRegex = new RegExp(`^\\[mcp_servers\\.${escaped}\\]$`, 'm');
    return headerRegex.test(content);
  }
}
