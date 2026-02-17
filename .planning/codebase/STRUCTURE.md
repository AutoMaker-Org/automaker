# Codebase Structure

**Analysis Date:** 2026-01-27

## Directory Layout

```
automaker/
├── apps/                        # Application packages
│   ├── ui/                      # React + Electron frontend (port 3007)
│   │   ├── src/
│   │   │   ├── main.ts          # Electron/Vite entry point
│   │   │   ├── app.tsx          # Root React component (splash, router)
│   │   │   ├── renderer.tsx     # Electron renderer entry
│   │   │   ├── routes/          # TanStack Router file-based routes
│   │   │   ├── components/      # React components (views, dialogs, UI, layout)
│   │   │   ├── store/           # Zustand state management
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── lib/             # Utilities (API client, electron, queries, etc.)
│   │   │   ├── electron/        # Electron main & preload process files
│   │   │   ├── config/          # UI configuration (fonts, themes, routes)
│   │   │   └── styles/          # CSS and theme files
│   │   ├── public/              # Static assets
│   │   └── tests/               # E2E Playwright tests
│   │
│   └── server/                  # Express backend (port 3008)
│       ├── src/
│       │   ├── index.ts         # Express app initialization, route mounting
│       │   ├── routes/          # REST API endpoints (30+ route folders)
│       │   ├── services/        # Business logic services
│       │   ├── providers/       # AI model provider implementations
│       │   ├── lib/             # Utilities (events, auth, helpers, etc.)
│       │   ├── middleware/      # Express middleware
│       │   └── types/           # Server-specific type definitions
│       └── tests/               # Unit tests (Vitest)
│
├── libs/                        # Shared npm packages (@automaker/*)
│   ├── types/                   # @automaker/types (no dependencies)
│   │   └── src/
│   │       ├── index.ts         # Main export with all type definitions
│   │       ├── feature.ts       # Feature, FeatureStatus, etc.
│   │       ├── provider.ts      # Provider interfaces, model definitions
│   │       ├── settings.ts      # Global and project settings types
│   │       ├── event.ts         # Event types for real-time updates
│   │       ├── session.ts       # AgentSession, conversation types
│   │       ├── model*.ts        # Model-specific types (cursor, codex, gemini, etc.)
│   │       └── ... 20+ more type files
│   │
│   ├── utils/                   # @automaker/utils (logging, errors, images, context)
│   │   └── src/
│   │       ├── logger.ts        # createLogger() with LogLevel enum
│   │       ├── errors.ts        # classifyError(), error types
│   │       ├── image-utils.ts   # Image processing, base64 encoding
│   │       ├── context-loader.ts # loadContextFiles() for AI prompts
│   │       └── ... more utilities
│   │
│   ├── platform/                # @automaker/platform (paths, security, OS)
│   │   └── src/
│   │       ├── index.ts         # Path getters (getFeatureDir, getFeaturesDir, etc.)
│   │       ├── secure-fs.ts     # Secure filesystem operations
│   │       └── config/          # Claude auth detection, allowed paths
│   │
│   ├── prompts/                 # @automaker/prompts (AI prompt templates)
│   │   └── src/
│   │       ├── index.ts         # Main prompts export
│   │       └── *-prompt.ts      # Prompt templates for different features
│   │
│   ├── model-resolver/          # @automaker/model-resolver
│   │   └── src/
│   │       └── index.ts         # resolveModelString() for model aliases
│   │
│   ├── dependency-resolver/     # @automaker/dependency-resolver
│   │   └── src/
│   │       └── index.ts         # Resolve feature dependencies
│   │
│   ├── git-utils/               # @automaker/git-utils (git operations)
│   │   └── src/
│   │       ├── index.ts         # getGitRepositoryDiffs(), worktree management
│   │       └── ... git helpers
│   │
│   ├── spec-parser/             # @automaker/spec-parser
│   │   └── src/
│   │       └── ... spec parsing utilities
│   │
│   └── tsconfig.base.json       # Base TypeScript config for all packages
│
├── .automaker/                  # Project data directory (created by app)
│   ├── features/                # Feature storage
│   │   └── {featureId}/
│   │       ├── feature.json     # Feature metadata and content
│   │       ├── agent-output.md  # Agent execution results
│   │       └── images/          # Feature images
│   ├── context/                 # Context files (CLAUDE.md, etc.)
│   ├── settings.json            # Per-project settings
│   ├── spec.md                  # Project specification
│   └── analysis.json            # Project structure analysis
│
├── data/                        # Global data directory (default, configurable)
│   ├── settings.json            # Global settings, profiles
│   ├── credentials.json         # Encrypted API keys
│   ├── sessions-metadata.json   # Chat session metadata
│   └── agent-sessions/          # Conversation histories
│
├── .planning/                   # Generated documentation by GSD orchestrator
│   └── codebase/               # Codebase analysis documents
│       ├── ARCHITECTURE.md     # Architecture patterns and layers
│       ├── STRUCTURE.md        # This file
│       ├── STACK.md            # Technology stack
│       ├── INTEGRATIONS.md     # External API integrations
│       ├── CONVENTIONS.md      # Code style and naming
│       ├── TESTING.md          # Testing patterns
│       └── CONCERNS.md         # Technical debt and issues
│
├── .github/                     # GitHub Actions workflows
├── scripts/                     # Build and utility scripts
├── tests/                       # Test data and utilities
├── docs/                        # Documentation
├── package.json                 # Root workspace config
├── package-lock.json            # Lock file
├── CLAUDE.md                    # Project instructions for Claude Code
├── DEVELOPMENT_WORKFLOW.md      # Development guidelines
└── README.md                    # Project overview
```

## Directory Purposes

**apps/ui/:**

- Purpose: React frontend for desktop (Electron) and web modes
- Build system: Vite 7 with TypeScript
- Styling: Tailwind CSS 4
- State: Zustand 5 with API persistence
- Routing: TanStack Router with file-based structure
- Desktop: Electron 39 with preload IPC bridge

**apps/server/:**

- Purpose: Express backend API and service layer
- Build system: TypeScript → JavaScript
- Runtime: Node.js 18+
- WebSocket: ws library for real-time streaming
- Process management: node-pty for terminal isolation

**libs/types/:**

- Purpose: Central type definitions (no dependencies, fast import)
- Used by: All other packages and apps
- Pattern: Single namespace export from index.ts
- Build: Compiled to ESM only

**libs/utils/:**

- Purpose: Shared utilities for logging, errors, file operations, image processing
- Used by: Server, UI, other libraries
- Notable: `createLogger()`, `classifyError()`, `loadContextFiles()`, `readImageAsBase64()`

**libs/platform/:**

- Purpose: OS-agnostic path management and security enforcement
- Used by: Server services for file operations
- Notable: Path normalization, allowed directory enforcement, Claude auth detection

**libs/prompts/:**

- Purpose: AI prompt templates injected into agent context
- Used by: AgentService when executing features
- Pattern: Function exports that return prompt strings

## Key File Locations

**Entry Points:**

**Server:**

- `apps/server/src/index.ts`: Express server initialization, route mounting, WebSocket setup

**UI (Web):**

- `apps/ui/src/main.ts`: Vite entry point
- `apps/ui/src/app.tsx`: Root React component

**UI (Electron):**

- `apps/ui/src/main.ts`: Vite entry point
- `apps/ui/src/electron/main-process.ts`: Electron main process
- `apps/ui/src/preload.ts`: Electron preload script for IPC bridge

**Configuration:**

- `apps/server/src/index.ts`: PORT, HOST, HOSTNAME, DATA_DIR env vars
- `apps/ui/src/config/`: Theme options, fonts, model aliases
- `libs/types/src/settings.ts`: Settings schema
- `.env.local`: Local development overrides (git-ignored)

**Core Logic:**

**Server:**

- `apps/server/src/services/agent-service.ts`: AI agent execution engine (31KB)
- `apps/server/src/services/auto-mode-service.ts`: Feature batching and automation (216KB - largest)
- `apps/server/src/services/feature-loader.ts`: Feature persistence and loading
- `apps/server/src/services/settings-service.ts`: Settings management
- `apps/server/src/providers/provider-factory.ts`: AI provider selection

**UI:**

- `apps/ui/src/store/app-store.ts`: Global state (84KB - largest frontend file)
- `apps/ui/src/lib/http-api-client.ts`: API client with auth (92KB)
- `apps/ui/src/components/views/board-view.tsx`: Kanban board (70KB)
- `apps/ui/src/routes/__root.tsx`: Root layout with session init (32KB)

**Testing:**

**E2E Tests:**

- `apps/ui/tests/`: Playwright tests organized by feature area
  - `settings/`, `features/`, `projects/`, `agent/`, `utils/`, `context/`

**Unit Tests:**

- `libs/*/tests/`: Package-specific Vitest tests
- `apps/server/src/tests/`: Server integration tests

**Test Config:**

- `vitest.config.ts`: Root Vitest configuration
- `apps/ui/playwright.config.ts`: Playwright configuration

## Naming Conventions

**Files:**

- **Components:** PascalCase.tsx (e.g., `board-view.tsx`, `session-manager.tsx`)
- **Services:** camelCase-service.ts (e.g., `agent-service.ts`, `settings-service.ts`)
- **Hooks:** use-kebab-case.ts (e.g., `use-auto-mode.ts`, `use-settings-sync.ts`)
- **Utilities:** camelCase.ts (e.g., `api-fetch.ts`, `log-parser.ts`)
- **Routes:** kebab-case with index.ts pattern (e.g., `routes/agent/index.ts`)
- **Tests:** _.test.ts or _.spec.ts (co-located with source)

**Directories:**

- **Feature domains:** kebab-case (e.g., `auto-mode/`, `event-history/`, `project-settings-view/`)
- **Type categories:** kebab-case plural (e.g., `types/`, `services/`, `providers/`, `routes/`)
- **Shared utilities:** kebab-case (e.g., `lib/`, `utils/`, `hooks/`)

**TypeScript:**

- **Types:** PascalCase (e.g., `Feature`, `AgentSession`, `ProviderMessage`)
- **Interfaces:** PascalCase (e.g., `EventEmitter`, `ProviderFactory`)
- **Enums:** PascalCase (e.g., `LogLevel`, `FeatureStatus`)
- **Functions:** camelCase (e.g., `createLogger()`, `classifyError()`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `DEFAULT_TIMEOUT_MS`, `MAX_RETRIES`)
- **Variables:** camelCase (e.g., `featureId`, `settingsService`)

## Where to Add New Code

**New Feature (end-to-end):**

- API Route: `apps/server/src/routes/{feature-name}/index.ts`
- Service Logic: `apps/server/src/services/{feature-name}-service.ts`
- UI Route: `apps/ui/src/routes/{feature-name}.tsx` (simple) or `{feature-name}/` (complex with subdir)
- Store: `apps/ui/src/store/{feature-name}-store.ts` (if complex state)
- Tests: `apps/ui/tests/{feature-name}/` or `apps/server/src/tests/`

**New Component/Module:**

- View Components: `apps/ui/src/components/views/{component-name}/`
- Dialog Components: `apps/ui/src/components/dialogs/{dialog-name}.tsx`
- Shared Components: `apps/ui/src/components/shared/` or `components/ui/` (shadcn)
- Layout Components: `apps/ui/src/components/layout/`

**Utilities:**

- New Library: Create in `libs/{package-name}/` with package.json and tsconfig.json
- Server Utilities: `apps/server/src/lib/{utility-name}.ts`
- Shared Utilities: Extend `libs/utils/src/` or create new lib if self-contained
- UI Utilities: `apps/ui/src/lib/{utility-name}.ts`

**New Provider (AI Model):**

- Implementation: `apps/server/src/providers/{provider-name}-provider.ts`
- Types: Add to `libs/types/src/{provider-name}-models.ts`
- Model Resolver: Update `libs/model-resolver/src/index.ts` with model alias mapping
- Settings: Update `libs/types/src/settings.ts` for provider-specific config

## Special Directories

**apps/ui/electron/:**

- Purpose: Electron-specific code (main process, IPC handlers, native APIs)
- Generated: Yes (preload.ts)
- Committed: Yes

**apps/ui/public/**

- Purpose: Static assets (sounds, images, icons)
- Generated: No
- Committed: Yes

**apps/ui/dist/:**

- Purpose: Built web application
- Generated: Yes
- Committed: No (.gitignore)

**apps/ui/dist-electron/:**

- Purpose: Built Electron app bundle
- Generated: Yes
- Committed: No (.gitignore)

**.automaker/features/{featureId}/:**

- Purpose: Per-feature persistent storage
- Structure: feature.json, agent-output.md, images/
- Generated: Yes (at runtime)
- Committed: Yes (tracked in project git)

**data/:**

- Purpose: Global data directory (global settings, credentials, sessions)
- Generated: Yes (created at first run)
- Committed: No (.gitignore)
- Configurable: Via DATA_DIR env var

**node_modules/:**

- Purpose: Installed dependencies
- Generated: Yes
- Committed: No (.gitignore)

**dist/**, **build/:**

- Purpose: Build artifacts
- Generated: Yes
- Committed: No (.gitignore)

---

_Structure analysis: 2026-01-27_
