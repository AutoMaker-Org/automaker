# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Rules (CRITICAL)

These rules are **NON-NEGOTIABLE** and must always be followed when working in this codebase.

### Supreme Rule: Reality Over Appearance

The system must reflect reality, not convenience. If something is hard, slow, complex, or inconvenient:

- → You handle it correctly
- → You do not bypass it
- → You do not fake it

**A system that "works" by lying is worse than broken.**

### Core Mandates

1. **NO STUBS. EVER. FULL IMPLEMENTATION MANDATE**
   - ❌ FORBIDDEN: Stubs, placeholders, TODO logic, "return None for now", fake data paths
   - ✅ REQUIRED: FULLY IMPLEMENTED production-quality logic, complete error handling, all edge cases covered
   - If logic is not ready → fully develop it first → then add it. Never ship incomplete code.

2. **IMPLEMENT, DON'T REMOVE (DEFAULT RULE)**
   - **DEFAULT DECISION: ALWAYS IMPLEMENT**
   - ✅ IMPLEMENT IT when: Feature is partially implemented, has bugs, code is messy, tests are missing
   - ⚠️ REMOVE ONLY if ALL are true: Technically Impossible, Dead Code, Architectural Contradiction, External Blocking
   - ❌ NEVER REMOVE because: "It's half-implemented", "It's too complex", "There's bugs"

3. **ERRORS ARE SIGNALS, NOT INCONVENIENCES**
   - ❌ FORBIDDEN: Suppressing exceptions, blanket try/catch, ignoring warnings, logging and continuing blindly
   - ✅ REQUIRED: STOP workflow immediately on error, IDENTIFY root cause, FIX the cause, RESUME only after validation

4. **NO SILENT FALLBACKS**
   - Every fallback must be: Explicit, Logged, Visible in UI/output, Require confirmation if critical
   - If a fallback changes behavior → it's a state change, not a convenience

5. **EVERY WARNING IS A BUG**
   - Performance warnings → Bug, Data warnings → Bug, API warnings → Bug, Deprecation warnings → Bug
   - If you don't fix a warning → document WHY, document RISK, accept RESPONSIBILITY, make it VISIBLE

6. **FAIL LOUDLY, FAIL EARLY**
   - Every critical component must: Fail loudly, Fail explicitly, Fail early
   - ❌ FORBIDDEN: Silent degradation, partial success without notice, "best guess" execution

7. **YOU VERIFY EVERYTHING**
   - Your RESPONSIBILITY: Verify every class, function, and entire codebase
   - ❌ NEVER ASK USER: "Does this work?", "Can you test it?", "Is this correct?"
   - When you ship code → it MUST be verified. Not optional.

8. **ROOT CAUSE OR NOTHING**
   - When something breaks, ask: **"What actually caused this?"**
   - ❌ FORBIDDEN FIXES: Retry loops without cause, arbitrary timeout increases, sleeps to hide race conditions
   - ✅ ALLOWED: Structural correction, Architectural correction, Explicit handling of real root cause

9. **DON'T SHIP UNEXPLAINED CODE**
   - Before shipping code, you MUST: Explain the logic, Explain failure modes, Explain risks, Trace execution path
   - If you cannot do these → code is not allowed in system

10. **UI MUST NEVER LIE**
    - ❌ FORBIDDEN: UI showing "OK" when system is degraded, hiding errors to keep UI clean
    - UI must reflect ground truth, even if ugly.

### Decision Matrix

```
INCOMPLETE FEATURE FOUND
         ↓
    ┌─────────────────────────────┐
    │ Is it IMPOSSIBLE to │
    │ implement?             │
    └──────────┬──────────────┘
               │ NO
      YES │     │
         ↓      ↓
    Consider │ FULLY IMPLEMENT
    removal  │
         │      ↓
         │  ✅ PRODUCTION CODE
```

**DEFAULT: IMPLEMENT. ALWAYS.**

## Package Manager Support

This codebase supports multiple package managers: **npm**, **bun**, **pnpm**, and **yarn**.

When writing scripts or commands:

- **DO NOT** hardcode `npm run` - use package manager detection
- The `scripts/get-package-manager.mjs` utility can detect the active package manager
- In Playwright config, use the `getRunCommand()` helper function
- Postinstall scripts should handle all package managers appropriately

### Bun Support

To use bun as your package manager:

```bash
bun install                    # Install dependencies
bun run dev                    # Run development mode
bun run build                  # Build for production
bun run test                   # Run tests
```

**Important notes about bun:**

- The postinstall script (`apps/ui/scripts/postinstall.mjs`) handles native module installation for Electron
- Playwright config automatically detects bun and uses appropriate commands
- TypeScript target is ES2020 - avoid using ES2022+ features like `.at()` method for arrays
- The `.at()` array method is ES2022; use `array[array.length - 1]` for last element access instead

## Project Overview

Automaker is an autonomous AI development studio built as an npm workspace monorepo. It provides a Kanban-based workflow where AI agents (powered by Claude Agent SDK) implement features in isolated git worktrees.

## Common Commands

```bash
# Development
npm run dev                 # Interactive launcher (choose web or electron)
npm run dev:web             # Web browser mode (localhost:3007)
npm run dev:electron        # Desktop app mode
npm run dev:electron:debug  # Desktop with DevTools open
npm run dev:server          # Server only (port 3008)
npm run dev:full            # Both server and web UI concurrently

# Building
npm run build               # Build web application
npm run build:packages      # Build all shared packages (required before other builds)
npm run build:electron      # Build desktop app for current platform
npm run build:server        # Build server only

# Docker
npm run dev:docker          # Run with Docker Compose

# Testing
npm run test                # E2E tests (Playwright, headless)
npm run test:headed         # E2E tests with browser visible
npm run test:server         # Server unit tests (Vitest)
npm run test:packages       # All shared package tests
npm run test:all            # All tests (packages + server)

# Single test file
npm run test:server -- tests/unit/specific.test.ts

# Linting and formatting
npm run lint                # ESLint
npm run format              # Prettier write
npm run format:check        # Prettier check
```

## Architecture

### Monorepo Structure

```
automaker/
├── apps/
│   ├── ui/           # React + Vite + Electron frontend (port 3007)
│   └── server/       # Express + WebSocket backend (port 3008)
└── libs/             # Shared packages (@automaker/*)
    ├── types/        # Core TypeScript definitions (no dependencies)
    ├── utils/        # Logging, errors, image processing, context loading
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security, process spawning
    ├── model-resolver/    # Claude model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    └── git-utils/    # Git operations & worktree management
```

### Package Dependency Chain

Packages can only depend on packages above them:

```
@automaker/types (no dependencies)
    ↓
@automaker/utils, @automaker/prompts, @automaker/platform, @automaker/model-resolver, @automaker/dependency-resolver
    ↓
@automaker/git-utils
    ↓
@automaker/server, @automaker/ui
```

### Key Technologies

- **Frontend**: React 19, Vite 7, Electron 39, TanStack Router, Zustand 5, Tailwind CSS 4
- **Backend**: Express 5, WebSocket (ws), Claude Agent SDK, node-pty
- **Testing**: Playwright (E2E), Vitest (unit)

### Server Architecture

The server (`apps/server/src/`) follows a service-oriented architecture:

- **routes/** - Express route handlers organized by feature (agent, features, auto-mode, worktree, etc.)
- **services/** - Business logic layer with stateful services
  - `AgentService` - Manages AI agent conversations, session state, and provider coordination
  - `AutoModeService` - Handles automated feature generation and execution
  - `FeatureLoader` - Manages feature metadata, images, and file organization
  - `TerminalService` - PTY terminal sessions with WebSocket streaming
  - `SettingsService` - Central configuration management
  - `IdeationService` - Brainstorming and idea generation features
  - `PipelineService` - Multi-phase feature execution
  - `MCPTestService` - MCP (Model Context Protocol) testing
- **providers/** - AI provider abstraction using a registry pattern
  - `ProviderFactory` - Routes model IDs to appropriate provider with priority-based selection
  - `ClaudeProvider` - Anthropic Claude via Claude Agent SDK
  - `CursorProvider` - Cursor IDE models
- **lib/** - Shared utilities (events, auth, worktree metadata, validation)

### Provider Pattern

The system uses a sophisticated provider factory for AI integrations:

```typescript
// Providers auto-register on import with priority-based routing
registerProvider('claude', {
  factory: () => new ClaudeProvider(),
  aliases: ['anthropic'],
  canHandleModel: (model) => model.startsWith('claude-'),
  priority: 0, // Lower = checked later
});
```

- Auto-registration: Providers register when imported
- Priority-based: Higher priority checked first
- Model aliases: 'anthropic' maps to 'claude'
- Fallback: Defaults to claude if no match found

### Frontend Architecture

The UI (`apps/ui/src/`) uses:

- **routes/** - TanStack Router file-based routing (`createFileRoute('/path')`)
- **components/views/** - View-specific folders with components, hooks, shared utilities
- **store/** - Zustand stores with persistence and selective state hydration
- **lib/** - Utilities including HTTP API client and Electron IPC bridge

### Dual-Mode Communication

The frontend supports two communication patterns:

1. **Electron Mode**: Direct IPC calls to preload scripts + HTTP to local server
2. **Web Mode**: HTTP API + WebSocket calls to backend server

The `http-api-client.ts` provides a unified API that adapts to the environment.

## Data Storage

### Per-Project Data (`.automaker/`)

```
.automaker/
├── features/              # Feature JSON files and images
│   └── {featureId}/
│       ├── feature.json
│       ├── agent-output.md
│       └── images/
├── context/               # Context files for AI agents (CLAUDE.md, etc.)
├── settings.json          # Project-specific settings
├── spec.md               # Project specification
└── analysis.json         # Project structure analysis
```

### Global Data (`DATA_DIR`, default `./data`)

```
data/
├── settings.json          # Global settings, profiles, shortcuts
├── credentials.json       # API keys
├── sessions-metadata.json # Chat session metadata
└── agent-sessions/        # Conversation histories
```

## Import Conventions

Always import from shared packages, never from old paths:

```typescript
// ✅ Correct
import type { Feature, ExecuteOptions } from '@automaker/types';
import { createLogger, classifyError } from '@automaker/utils';
import { getEnhancementPrompt } from '@automaker/prompts';
import { getFeatureDir, ensureAutomakerDir } from '@automaker/platform';
import { resolveModelString } from '@automaker/model-resolver';
import { resolveDependencies } from '@automaker/dependency-resolver';
import { getGitRepositoryDiffs } from '@automaker/git-utils';

// ❌ Never import from old paths
import { Feature } from '../services/feature-loader'; // Wrong
import { createLogger } from '../lib/logger'; // Wrong
```

## Key Patterns

### Event-Driven Architecture

All server operations emit events that stream to the frontend via WebSocket:

```typescript
// Services emit events
events.emit('agent-message', { sessionId, message });

// WebSocket clients subscribe
const unsubscribe = events.subscribe((type, payload) => {
  ws.send(JSON.stringify({ type, payload }));
});
```

The server has two WebSocket servers:

- **Events WebSocket** (`/api/events`) - General event streaming
- **Terminal WebSocket** (`/api/terminal`) - PTY terminal I/O

### Route Handler Pattern

Routes follow a consistent factory pattern for handler creation:

```typescript
// Handler factories promote reusability
export function createStartHandler(agentService: AgentService): RequestHandler {
  return async (req, res) => {
    /* ... */
  };
}

// Route definition with validation middleware
router.post('/start', validatePathParams('workingDirectory?'), createStartHandler(agentService));
```

### Git Worktree Isolation

Each feature executes in an isolated git worktree, created via `@automaker/git-utils`. This protects the main branch during AI agent execution.

### Context Files

Project-specific rules are stored in `.automaker/context/` and automatically loaded into agent prompts via `loadContextFiles()` from `@automaker/utils`.

### Model Resolution

Use `resolveModelString()` from `@automaker/model-resolver` to convert model aliases:

- `haiku` → `claude-haiku-4-5`
- `sonnet` → `claude-sonnet-4-20250514`
- `opus` → `claude-opus-4-5-20251101`

## Environment Variables

- `ANTHROPIC_API_KEY` - Anthropic API key (or use Claude Code CLI auth)
- `PORT` - Server port (default: 3008)
- `DATA_DIR` - Data storage directory (default: ./data)
- `ALLOWED_ROOT_DIRECTORY` - Restrict file operations to specific directory
- `AUTOMAKER_MOCK_AGENT=true` - Enable mock agent mode for CI testing
- `VITE_SERVER_URL` - Override server URL for web mode
- `ENABLE_REQUEST_LOGGING` - HTTP request logging (default: true)

## Testing

The project uses Vitest with a project-based configuration:

```bash
# Root vitest.config.ts discovers projects automatically
npm run test:server      # Server unit tests only
npm run test:packages    # All shared package tests
npm run test:all         # Everything
```

Test projects are defined in:

- `libs/*/vitest.config.ts` - Each shared package
- `apps/server/vitest.config.ts` - Server tests

## Security Model

### Path Validation

All file operations are validated against `ALLOWED_ROOT_DIRECTORY` to prevent directory traversal attacks. Use `validatePath()` from `@automaker/platform` before any file operations.

### Environment Isolation

Only explicitly allowed environment variables are passed to external services like the Claude SDK. See `ALLOWED_ENV_VARS` in the codebase.

### Authentication

Multiple authentication methods are supported:

- API key authentication (Electron mode)
- Session token authentication (Web mode)
- Short-lived WebSocket connection tokens (5 minutes)
- CLI authentication integration

### Git Worktree Isolation

Each feature executes in isolated git worktrees for safety and clean separation from the main codebase.
