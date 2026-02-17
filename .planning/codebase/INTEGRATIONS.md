# External Integrations

**Analysis Date:** 2026-01-27

## APIs & External Services

**AI/LLM Providers:**

- Claude (Anthropic)
  - SDK: `@anthropic-ai/claude-agent-sdk` (0.1.76)
  - Auth: `ANTHROPIC_API_KEY` environment variable or stored credentials
  - Features: Extended thinking, vision/images, tools, streaming
  - Implementation: `apps/server/src/providers/claude-provider.ts`
  - Models: Opus 4.5, Sonnet 4, Haiku 4.5, and legacy models
  - Custom endpoints: `ANTHROPIC_BASE_URL` (optional)

- GitHub Copilot
  - SDK: `@github/copilot-sdk` (0.1.16)
  - Auth: GitHub OAuth (via `gh` CLI) or `GITHUB_TOKEN` environment variable
  - Features: Tools, streaming, runtime model discovery
  - Implementation: `apps/server/src/providers/copilot-provider.ts`
  - CLI detection: Searches for Copilot CLI binary
  - Models: Dynamic discovery via `copilot models list`

- OpenAI Codex/GPT-4
  - SDK: `@openai/codex-sdk` (0.77.0)
  - Auth: `OPENAI_API_KEY` environment variable or stored credentials
  - Features: Extended thinking, tools, sandbox execution
  - Implementation: `apps/server/src/providers/codex-provider.ts`
  - Execution modes: CLI (with sandbox) or SDK (direct API)
  - Models: Dynamic discovery via Codex CLI or SDK

- Google Gemini
  - Implementation: `apps/server/src/providers/gemini-provider.ts`
  - Features: Vision support, tools, streaming

- OpenCode (AWS/Azure/other)
  - Implementation: `apps/server/src/providers/opencode-provider.ts`
  - Supports: Amazon Bedrock, Azure models, local models
  - Features: Flexible provider architecture

- Cursor Editor
  - Implementation: `apps/server/src/providers/cursor-provider.ts`
  - Features: Integration with Cursor IDE

**Model Context Protocol (MCP):**

- SDK: `@modelcontextprotocol/sdk` (1.25.2)
- Purpose: Connect AI agents to external tools and data sources
- Implementation: `apps/server/src/services/mcp-test-service.ts`, `apps/server/src/routes/mcp/`
- Configuration: Per-project in `.automaker/` directory

## Data Storage

**Databases:**

- None - This codebase does NOT use traditional databases (SQL/NoSQL)
- All data stored as files in local filesystem

**File Storage:**

- Local filesystem only
- Locations:
  - `.automaker/` - Project-specific data (features, context, settings)
  - `./data/` or `DATA_DIR` env var - Global data (settings, credentials, sessions)
- Secure file operations: `@automaker/platform` exports `secureFs` for restricted file access

**Caching:**

- In-memory caches for:
  - Model lists (Copilot, Codex runtime discovery)
  - Feature metadata
  - Project specifications
- No distributed/persistent caching system

## Authentication & Identity

**Auth Provider:**

- Custom implementation (no third-party provider)
- Authentication methods:
  1. Claude Max Plan (OAuth via Anthropic CLI)
  2. API Key mode (ANTHROPIC_API_KEY)
  3. Custom provider profiles with API keys
  4. Token-based session authentication for WebSocket

**Implementation:**

- `apps/server/src/lib/auth.ts` - Auth middleware
- `apps/server/src/routes/auth/` - Auth routes
- Session tokens for WebSocket connections
- Credential storage in `./data/credentials.json` (encrypted/protected)

## Monitoring & Observability

**Error Tracking:**

- None - No automatic error reporting service integrated
- Custom error classification: `@automaker/utils` exports `classifyError()`
- User-friendly error messages: `getUserFriendlyErrorMessage()`

**Logs:**

- Console logging with configurable levels
- Logger: `@automaker/utils` exports `createLogger()`
- Log levels: ERROR, WARN, INFO, DEBUG
- Environment: `LOG_LEVEL` env var (optional)
- Storage: Logs output to console/stdout (no persistent logging to files)

**Usage Tracking:**

- Claude API usage: `apps/server/src/services/claude-usage-service.ts`
- Codex API usage: `apps/server/src/services/codex-usage-service.ts`
- Tracks: Tokens, costs, rates

## CI/CD & Deployment

**Hosting:**

- Local development: Node.js server + Vite dev server
- Desktop: Electron application (macOS, Windows, Linux)
- Web: Express server deployed to any Node.js host

**CI Pipeline:**

- GitHub Actions likely (`.github/workflows/` present in repo)
- Testing: Playwright E2E, Vitest unit tests
- Linting: ESLint
- Formatting: Prettier

**Build Process:**

- `npm run build:packages` - Build shared packages
- `npm run build` - Build web UI
- `npm run build:electron` - Build Electron apps (platform-specific)
- Electron Builder handles code signing and distribution

## Environment Configuration

**Required env vars:**

- `ANTHROPIC_API_KEY` - For Claude provider (or provide in settings)
- `OPENAI_API_KEY` - For Codex provider (optional)
- `GITHUB_TOKEN` - For GitHub operations (optional)

**Optional env vars:**

- `PORT` - Server port (default 3008)
- `HOST` - Server bind address (default 0.0.0.0)
- `HOSTNAME` - Public hostname (default localhost)
- `DATA_DIR` - Data storage directory (default ./data)
- `ANTHROPIC_BASE_URL` - Custom Claude endpoint
- `ALLOWED_ROOT_DIRECTORY` - Restrict file operations to directory
- `AUTOMAKER_MOCK_AGENT` - Enable mock agent for testing
- `AUTOMAKER_AUTO_LOGIN` - Skip login prompt in dev

**Secrets location:**

- Runtime: Environment variables (`process.env`)
- Stored: `./data/credentials.json` (file-based)
- Retrieval: `apps/server/src/services/settings-service.ts`

## Webhooks & Callbacks

**Incoming:**

- WebSocket connections for real-time agent event streaming
- GitHub webhook routes (optional): `apps/server/src/routes/github/`
- Terminal WebSocket connections: `apps/server/src/routes/terminal/`

**Outgoing:**

- GitHub PRs: `apps/server/src/routes/worktree/routes/create-pr.ts`
- Git operations: `@automaker/git-utils` handles commits, pushes
- Terminal output streaming via WebSocket to clients
- Event hooks: `apps/server/src/services/event-hook-service.ts`

## Credential Management

**API Keys Storage:**

- File: `./data/credentials.json`
- Format: JSON with nested structure for different providers
  ```json
  {
    "apiKeys": {
      "anthropic": "sk-...",
      "openai": "sk-...",
      "github": "ghp_..."
    }
  }
  ```
- Access: `SettingsService.getCredentials()` from `apps/server/src/services/settings-service.ts`
- Security: File permissions should restrict to current user only

**Profile/Provider Configuration:**

- File: `./data/settings.json` (global) or `.automaker/settings.json` (per-project)
- Stores: Alternative provider profiles, model mappings, sandbox settings
- Types: `ClaudeApiProfile`, `ClaudeCompatibleProvider` from `@automaker/types`

## Third-Party Service Integration Points

**Git/GitHub:**

- `@automaker/git-utils` - Git operations (worktrees, commits, diffs)
- Codex/Cursor providers can create GitHub PRs
- GitHub CLI (`gh`) detection for Copilot authentication

**Terminal Access:**

- `node-pty` (1.1.0-beta41) - Pseudo-terminal interface
- `TerminalService` manages terminal sessions
- WebSocket streaming to frontend

**AI Models - Multi-Provider Abstraction:**

- `BaseProvider` interface: `apps/server/src/providers/base-provider.ts`
- Factory pattern: `apps/server/src/providers/provider-factory.ts`
- Allows swapping providers without changing agent logic
- All providers implement: `executeQuery()`, `detectInstallation()`, `getAvailableModels()`

**Process Spawning:**

- `@automaker/platform` exports `spawnProcess()`, `spawnJSONLProcess()`
- Codex CLI execution: JSONL output parsing
- Copilot CLI execution: Subprocess management
- Cursor IDE interaction: Process spawning for tool execution

---

_Integration audit: 2026-01-27_
