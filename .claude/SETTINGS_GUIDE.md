# DevFlow Claude Code Settings Guide

## Overview

This guide explains the optimal Claude Code settings for the DevFlow autonomous AI development studio workflow.

---

## 1. General Settings (Settings UI)

### Theme & Appearance

```json
{
  "theme": "dark",
  "fontSize": 14,
  "fontFamily": "JetBrains Mono, Fira Code, monospace",
  "showLineNumbers": true,
  "wordWrap": true,
  "minimap": true
}
```

### Notifications

- **Enabled**: Yes
- **Sounds**: No ( distraction-free )
- **Task Completion**: Yes
- **Errors**: Yes

---

## 2. Project Settings

### Project Scripts

These scripts are available in the CLI via `npm run`:

```json
{
  "dev": "npm run dev",
  "dev:server": "npm run dev:server",
  "dev:ui": "npm run dev:ui",
  "build": "npm run build",
  "build:packages": "npm run build:packages",
  "test": "npm run test:all",
  "test:server": "npm run test:server",
  "lint": "npm run lint",
  "format": "npm run format",
  "typecheck": "npx tsc -p apps/server/tsconfig.json --noEmit"
}
```

---

## 3. MCP Servers Configuration

Configure these MCP servers for the **CLAUDE_CODE** agent:

### Core MCP Servers

```json
{
  "mcpServers": {
    "vibe-kanban": {
      "command": "npx",
      "args": ["-y", "@vibe-kanban/mcp-server@latest"],
      "disabled": false
    },
    "greptile": {
      "command": "npx",
      "args": ["-y", "@greptile/mcp-server@latest"],
      "env": {
        "GREPTILE_API_KEY": "YOUR_KEY_HERE",
        "GREPTILE_REPO": "oxtsotsi/DevFlow",
        "GREPTILE_BRANCH": "main"
      },
      "disabled": false
    },
    "exa": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-exa@latest"],
      "env": {
        "EXA_API_KEY": "YOUR_KEY_HERE"
      },
      "disabled": false
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/oxtsotsi/Webrnds/DevFlow"],
      "disabled": false
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN_HERE"
      },
      "disabled": false
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"],
      "disabled": false
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "disabled": false
    },
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"],
      "disabled": false
    }
  }
}
```

### MCP Tool Permissions

Add these to `permissions.allow` in `.claude/settings.json`:

```json
[
  "Read(.claude/**)",
  "Write(.claude/**)",
  "Edit(.claude/**)",
  "mcp__vibe_kanban__*",
  "mcp__plugin_greptile_greptile__*",
  "mcp__exa__*",
  "mcp__web_reader__webReader",
  "mcp__grep__searchGitHub",
  "mcp__4_5v_mcp__analyze_image"
]
```

---

## 4. Agent Configuration

### CLAUDE_CODE Agent

```json
{
  "model": "claude-sonnet-4.5-20250114",
  "maxTokens": 200000,
  "temperature": 0.0,
  "timeout": 300000,
  "maxToolRoundtrips": 30
}
```

---

## 5. Orchestrator Environment Variables

Set these in `apps/server/.env`:

```bash
# Greptile API key for semantic code search
GREPTILE_API_KEY=your-key-here

# Exa API key for web research
EXA_API_KEY=your-key-here

# Vibe-Kanban project
ORCHESTRATOR_PROJECT_NAME=DevFlow

# Orchestrator behavior
ORCHESTRATOR_AUTO_START_TASKS=true
ORCHESTRATOR_AUTO_START_WORKSPACE=false
ORCHESTRATOR_POLL_INTERVAL=30000
ORCHESTRATOR_MAX_CONCURRENT_RESEARCH=3

# GitHub repository
ORCHESTRATOR_GITHUB_REPO=oxtsotsi/DevFlow
ORCHESTRATOR_DEFAULT_BRANCH=main
```

---

## 6. Vibe-Kanban MCP Tools

Available tools (configured in permissions):

| Tool                      | Description                           |
| ------------------------- | ------------------------------------- |
| `list_projects`           | List all Vibe-Kanban projects         |
| `list_tasks`              | List tasks in a project               |
| `create_task`             | Create a new task                     |
| `update_task`             | Update task title/description/status  |
| `get_task`                | Get detailed task information         |
| `delete_task`             | Delete a task                         |
| `list_repos`              | List repositories in a project        |
| `start_workspace_session` | Start a Claude Code workspace session |

### Can Vibe-Kanban create PRs?

**No**, Vibe-Kanban MCP does NOT directly create PRs. PR creation is handled by:

1. The orchestrator via GitHub CLI (`gh pr create`)
2. GitHub MCP server (`@modelcontextprotocol/server-github`)

---

## 7. File Edit Permissions

**Key Addition**: Agents can now edit `.claude/**` files including:

- `.claude/settings.json` - Agent can configure its own settings
- `.claude/commands/` - Agent can create custom commands
- `.claude/SETTINGS_GUIDE.md` - This file

This enables self-configuration workflows where the orchestrator can adjust settings based on project needs.

---

## 8. Quick Setup Checklist

- [ ] Add API keys to `apps/server/.env` (Greptile, Exa)
- [ ] Add API keys to MCP Server Configuration (Greptile, Exa, GitHub)
- [ ] Verify Vibe-Kanban MCP is connected
- [ ] Test orchestrator: `POST /orchestrator/start`
- [ ] Create a test task in Vibe-Kanban
- [ ] Verify workspace session starts (if enabled)

---

## 9. Troubleshooting

### MCP Tools Not Available

- Check MCP server is running: `npx @vibe-kanban/mcp-server@latest`
- Verify API keys are set
- Check permissions.allow includes the MCP tools

### Orchestrator Not Starting

- Check `apps/server/.env` has required variables
- Verify Vibe-Kanban project exists or can be auto-created
- Check server logs: `npm run dev:server`

### Workspace Sessions Not Starting

- Set `ORCHESTRATOR_AUTO_START_WORKSPACE=true`
- Verify repos are configured in Vibe-Kanban project
- Check CLAUDE_CODE agent has MCP server configuration
