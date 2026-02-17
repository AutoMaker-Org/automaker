# Architecture

**Analysis Date:** 2026-01-27

## Pattern Overview

**Overall:** Monorepo with layered client-server architecture (Electron-first) and pluggable provider abstraction for AI models.

**Key Characteristics:**

- Event-driven communication via WebSocket between frontend and backend
- Multi-provider AI model abstraction layer (Claude, Cursor, Codex, Gemini, OpenCode, Copilot)
- Feature-centric workflow stored in `.automaker/` directories
- Isolated git worktree execution for each feature
- State management through Zustand stores with API persistence

## Layers

**Presentation Layer (UI):**

- Purpose: React 19 Electron/web frontend with TanStack Router file-based routing
- Location: `apps/ui/src/`
- Contains: Route components, view pages, custom React hooks, Zustand stores, API client
- Depends on: @automaker/types, @automaker/utils, HTTP API backend
- Used by: Electron main process (desktop), web browser (web mode)

**API Layer (Server):**

- Purpose: Express 5 backend exposing RESTful and WebSocket endpoints
- Location: `apps/server/src/`
- Contains: Route handlers, business logic services, middleware, provider adapters
- Depends on: @automaker/types, @automaker/utils, @automaker/platform, Claude Agent SDK
- Used by: UI frontend via HTTP/WebSocket

**Service Layer (Server):**

- Purpose: Business logic and domain operations
- Location: `apps/server/src/services/`
- Contains: AgentService, FeatureLoader, AutoModeService, SettingsService, DevServerService, etc.
- Depends on: Providers, secure filesystem, feature storage
- Used by: Route handlers

**Provider Abstraction (Server):**

- Purpose: Unified interface for different AI model providers
- Location: `apps/server/src/providers/`
- Contains: ProviderFactory, specific provider implementations (ClaudeProvider, CursorProvider, CodexProvider, GeminiProvider, OpencodeProvider, CopilotProvider)
- Depends on: @automaker/types, provider SDKs
- Used by: AgentService

**Shared Library Layer:**

- Purpose: Type definitions and utilities shared across apps
- Location: `libs/`
- Contains: @automaker/types, @automaker/utils, @automaker/platform, @automaker/prompts, @automaker/model-resolver, @automaker/dependency-resolver, @automaker/git-utils, @automaker/spec-parser
- Depends on: None (types has no external deps)
- Used by: All apps and services

## Data Flow

**Feature Execution Flow:**

1. User creates/updates feature via UI (`apps/ui/src/`)
2. UI sends HTTP request to backend (`POST /api/features`)
3. Server route handler invokes FeatureLoader to persist to `.automaker/features/{featureId}/`
4. When executing, AgentService loads feature, creates isolated git worktree via @automaker/git-utils
5. AgentService invokes ProviderFactory to get appropriate AI provider (Claude, Cursor, etc.)
6. Provider executes with context from CLAUDE.md files via @automaker/utils loadContextFiles()
7. Server emits events via EventEmitter throughout execution
8. Events stream to frontend via WebSocket
9. UI updates stores and renders real-time progress
10. Feature results persist back to `.automaker/features/` with generated agent-output.md

**State Management:**

**Frontend State (Zustand):**

- `app-store.ts`: Global app state (projects, features, settings, boards, themes)
- `setup-store.ts`: First-time setup wizard flow
- `ideation-store.ts`: Ideation feature state
- `test-runners-store.ts`: Test runner configurations
- Settings now persist via API (`/api/settings`) rather than localStorage (see use-settings-sync.ts)

**Backend State (Services):**

- SettingsService: Global and project-specific settings (in-memory with file persistence)
- AgentService: Active agent sessions and conversation history
- FeatureLoader: Feature data model operations
- DevServerService: Development server logs
- EventHistoryService: Persists event logs for replay

**Real-Time Updates (WebSocket):**

- Server EventEmitter emits TypedEvent (type + payload)
- WebSocket handler subscribes to events and broadcasts to all clients
- Frontend listens on multiple WebSocket subscriptions and updates stores

## Key Abstractions

**Feature:**

- Purpose: Represents a development task/story with rich metadata
- Location: @automaker/types → `libs/types/src/feature.ts`
- Fields: id, title, description, status, images, tasks, priority, etc.
- Stored: `.automaker/features/{featureId}/feature.json`

**Provider:**

- Purpose: Abstracts different AI model implementations
- Location: `apps/server/src/providers/{provider}-provider.ts`
- Interface: Common execute() method with consistent message format
- Implementations: Claude, Cursor, Codex, Gemini, OpenCode, Copilot
- Factory: ProviderFactory picks correct provider based on model ID

**Event:**

- Purpose: Real-time updates streamed to frontend
- Location: @automaker/types → `libs/types/src/event.ts`
- Format: { type: EventType, payload: unknown }
- Examples: agent-started, agent-step, agent-complete, feature-updated, etc.

**AgentSession:**

- Purpose: Represents a conversation between user and AI agent
- Location: @automaker/types → `libs/types/src/session.ts`
- Contains: Messages (user + assistant), metadata, creation timestamp
- Stored: `{DATA_DIR}/agent-sessions/{sessionId}.json`

**Settings:**

- Purpose: Configuration for global and per-project behavior
- Location: @automaker/types → `libs/types/src/settings.ts`
- Stored: Global in `{DATA_DIR}/settings.json`, per-project in `.automaker/settings.json`
- Service: SettingsService in `apps/server/src/services/settings-service.ts`

## Entry Points

**Server:**

- Location: `apps/server/src/index.ts`
- Triggers: `npm run dev:server` or Docker startup
- Responsibilities:
  - Initialize Express app with middleware
  - Create shared EventEmitter for WebSocket streaming
  - Bootstrap services (SettingsService, AgentService, FeatureLoader, etc.)
  - Mount API routes at `/api/*`
  - Create WebSocket servers for agent streaming and terminal sessions
  - Load and apply user settings (log level, request logging, etc.)

**UI (Web):**

- Location: `apps/ui/src/main.ts` (Vite entry), `apps/ui/src/app.tsx` (React component)
- Triggers: `npm run dev:web` or `npm run build`
- Responsibilities:
  - Initialize Zustand stores from API settings
  - Setup React Router with TanStack Router
  - Render root layout with sidebar and main content area
  - Handle authentication via verifySession()

**UI (Electron):**

- Location: `apps/ui/src/main.ts` (Vite entry), `apps/ui/electron/main-process.ts` (Electron main process)
- Triggers: `npm run dev:electron`
- Responsibilities:
  - Launch local server via node-pty
  - Create native Electron window
  - Bridge IPC between renderer and main process
  - Provide file system access via preload.ts APIs

## Error Handling

**Strategy:** Layered error classification and user-friendly messaging

**Patterns:**

**Backend Error Handling:**

- Errors classified via `classifyError()` from @automaker/utils
- Classification: ParseError, NetworkError, AuthenticationError, RateLimitError, etc.
- Response format: `{ success: false, error: { type, message, code }, details? }`
- Example: `apps/server/src/lib/error-handler.ts`

**Frontend Error Handling:**

- HTTP errors caught by api-fetch.ts with retry logic
- WebSocket disconnects trigger reconnection with exponential backoff
- Errors shown in toast notifications via `sonner` library
- Validation errors caught and displayed inline in forms

**Agent Execution Errors:**

- AgentService wraps provider calls in try-catch
- Aborts handled specially via `isAbortError()` check
- Rate limit errors trigger cooldown before retry
- Model-specific errors mapped to user guidance

## Cross-Cutting Concerns

**Logging:**

- Framework: @automaker/utils createLogger()
- Pattern: `const logger = createLogger('ModuleName')`
- Levels: ERROR, WARN, INFO, DEBUG (configurable via settings)
- Output: stdout (dev), files (production)

**Validation:**

- File path validation: @automaker/platform initAllowedPaths() enforces restrictions
- Model ID validation: @automaker/model-resolver resolveModelString()
- JSON schema validation: Manual checks in route handlers (no JSON schema lib)
- Authentication: Session token validation via validateWsConnectionToken()

**Authentication:**

- Frontend: Session token stored in httpOnly cookie
- Backend: authMiddleware checks token on protected routes
- WebSocket: validateWsConnectionToken() for upgrade requests
- Providers: API keys stored encrypted in `{DATA_DIR}/credentials.json`

**Internationalization:**

- Not detected - strings are English-only

**Performance:**

- Code splitting: File-based routing via TanStack Router
- Lazy loading: React.lazy() in route components
- Caching: React Query for HTTP requests (query-keys.ts defines cache strategy)
- Image optimization: Automatic base64 encoding for agent context
- State hydration: Settings loaded once at startup, synced via API

---

_Architecture analysis: 2026-01-27_
