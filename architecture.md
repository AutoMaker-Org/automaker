# AutoMaker Architecture

## Overview

**AutoMaker** is an autonomous AI development studio that enables users to orchestrate AI agents to build software features automatically. It is a cross-platform desktop application (Electron) with a web interface that leverages multiple AI providers (Claude, Z.ai GLM) to implement features described on a Kanban board.

### Key Concepts

- **Agentic Coding**: AI agents implement features autonomously based on user descriptions
- **Git Worktree Isolation**: Safe feature development in isolated branches
- **Multi-Agent Support**: Multiple AI agents can work concurrently
- **Plan Approval**: Review and approve AI-generated implementations before execution
- **Cross-platform**: Works on Windows, macOS, and Linux

---

## Project Structure

```
automaker/
├── apps/                    # Applications
│   ├── ui/                  # Frontend application (Electron + React)
│   └── server/             # Backend server (Node.js/Express)
├── libs/                    # Shared libraries
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Common utilities
│   ├── platform/           # Platform-specific utilities
│   ├── prompts/            # AI prompt templates
│   ├── dependency-resolver/ # Dependency resolution logic
│   ├── model-resolver/     # Model resolution for LLM providers
│   └── git-utils/          # Git operations utilities
├── docs/                    # Documentation
├── scripts/                 # Build and utility scripts
├── test/                    # Test files
├── .github/                # GitHub workflows (CI/CD)
├── .husky/                 # Git hooks
├── docker-compose.yml      # Docker configuration
└── init.mjs               # Main development launcher script
```

### Technology Stack

| Layer                       | Technology                                  |
| --------------------------- | ------------------------------------------- |
| **Frontend Framework**      | React 19.2.3 + TypeScript                   |
| **Desktop Runtime**         | Electron                                    |
| **Build Tool**              | Vite                                        |
| **Routing**                 | TanStack Router                             |
| **Styling**                 | Tailwind CSS v4                             |
| **State Management**        | Zustand                                     |
| **UI Components**           | Radix UI primitives                         |
| **Backend Framework**       | Express.js v5                               |
| **Real-time Communication** | WebSocket (ws)                              |
| **Terminal Emulation**      | xterm.js + node-pty                         |
| **Testing**                 | Vitest (unit/integration), Playwright (E2E) |
| **Package Manager**         | npm with workspaces                         |

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                         Presentation Layer                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React UI (Electron/Web)                   │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐  │  │
│  │  │ Board   │ │ Agent   │ │Terminal │ │  Settings   │  │  │
│  │  │  View   │ │  View   │ │  View   │ │    View     │  │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                        ↑↓                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              State Management (Zustand)                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↕ HTTPS/WSS
┌─────────────────────────────────────────────────────────────┐
│                          API Layer                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Express.js Server                         │  │
│  │  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐  │  │
│  │  │ /api/agent│ │/api/feat.│ │/api/auto-│ │/api/git │  │  │
│  │  └───────────┘ └──────────┘ └──────────┘ └─────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                        ↑↓                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         Services (Business Logic Layer)                │  │
│  │  AutoModeService, AgentService, SettingsService,       │  │
│  │  FeatureLoader, ValidationStorage, GitService          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    Provider & Data Layer                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  AI Providers (BaseProvider Interface)                 │  │
│  │  ┌───────────┐ ┌──────────┐ ┌───────────────────┐     │  │
│  │  │  Claude   │ │  Zai/GLM │ │    OpenAI         │     │  │
│  │  │ Provider  │ │ Provider │ │    (extensible)   │     │  │
│  │  └───────────┘ └──────────┘ └───────────────────┘     │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  File-based Storage (JSON)                             │  │
│  │  - Global settings (~/.config/automaker/)              │  │
│  │  - Project settings (.automaker/)                      │  │
│  │  - Features, sessions, validations                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### UI Framework and Components

The UI is built with **React 19.2.3** using modern React patterns:

- **Component Organization**:
  ```
  apps/ui/src/
  ├── components/
  │   ├── layout/           # Layout components (sidebar, header)
  │   ├── ui/              # Reusable UI primitives
  │   ├── dialogs/         # Modal dialogs
  │   └── views/           # Main view components
  ├── routes/              # TanStack Router definitions
  ├── store/               # Zustand state management
  ├── hooks/               # Custom React hooks
  ├── contexts/            # React contexts
  └── styles/              # Global styles and themes
  ```

### Key UI Views

| View              | Responsibility                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Board View**    | Kanban-style feature management with drag-and-drop, lifecycle management, and Git integration |
| **Agent View**    | Chat-based AI interaction with context awareness                                              |
| **Terminal View** | Integrated terminal with xterm.js                                                             |
| **Analysis View** | Project analysis and visualization                                                            |
| **Settings View** | Configuration management                                                                      |

### Styling System

- **Framework**: Tailwind CSS v4
- **Theming**: 32 built-in themes (16 dark, 16 light) using CSS variables
- **Color Space**: OKLCH for consistency
- **UI Library**: Radix UI primitives for accessibility
- **Effects**: Glass morphism with backdrop blur

### State Management

**Zustand** is the primary state management solution:

```typescript
// Main Store Structure
{
  // Projects
  projects: Project[]
  currentProject: Project | null
  trash: Project[]

  // Features (Kanban)
  features: Feature[]
  autoModeByProject: Record<string, AutoModeState>

  // Sessions
  chatSessions: ChatSession[]
  currentSessionId: string | null

  // Settings
  theme: string
  keyboardShortcuts: KeyboardShortcuts
  apiKeys: Credentials
  aiProfiles: AIProfile[]

  // UI State
  sidebarOpen: boolean
  terminalLayout: TerminalLayout
  ...
}
```

**Persistence Strategy**:

- UI state cached in localStorage (Zustand persist middleware)
- Authoritative data from server (projects, features, sessions)
- Automatic migration from localStorage to file-based storage

---

## Backend Architecture

### API Server (Express.js)

The backend provides both HTTP API and WebSocket communication:

**Core API Routes**:

| Route            | Purpose                       |
| ---------------- | ----------------------------- |
| `/api/health`    | Health check                  |
| `/api/agent`     | Agent conversation management |
| `/api/features`  | Feature CRUD operations       |
| `/api/auto-mode` | Automated feature execution   |
| `/api/worktree`  | Git worktree management       |
| `/api/git`       | Git operations                |
| `/api/github`    | GitHub integration            |
| `/api/sessions`  | Session management            |
| `/api/settings`  | Application settings          |
| `/api/models`    | Model management              |
| `/api/terminal`  | Terminal access (WebSocket)   |

### Middleware Stack

1. **Request Logging** - Custom morgan logger
2. **CORS** - Configurable origin policy
3. **JSON Parsing** - 50MB limit for large payloads
4. **Authentication** - API key validation (optional)
5. **Path Validation** - Security middleware

### WebSocket Communication

Real-time updates via WebSocket events:

```typescript
// Event Types
'agent:stream'; // Agent conversation streaming
'auto-mode:event'; // Auto-mode progress updates
'auto_mode_feature_start';
'auto_mode_feature_complete';
'auto_mode_task_started';
'auto_mode_task_complete';
'plan_approval_required';
```

---

## Data Layer

### Storage Architecture

AutoMaker uses **file-based storage** (no traditional database):

```
~/.config/automaker/              # Global storage
├── settings.json                 # Global preferences
├── credentials.json              # API keys (separated for security)
├── sessions-metadata.json        # Session index
└── agent-sessions/               # Individual session files

{project}/.automaker/             # Project-specific storage
├── settings.json                 # Project overrides
├── features/
│   └── {featureId}/
│       ├── feature.json          # Feature definition
│       ├── plan.md               # Generated plan
│       └── agent-output.md       # Agent execution log
├── validations/                  # GitHub issue validation
├── board/                        # Kanban customization
├── context/                      # User-uploaded context files
├── images/                       # Project images
└── app_spec.txt                  # Application specification
```

### Data Models

**Feature** (core entity):

```typescript
{
  id: string                    // T001, T002, etc.
  description: string
  status: 'backlog' | 'pending' | 'in_progress' | 'waiting_approval' | 'verified' | 'completed'
  planningMode: 'skip' | 'lite' | 'spec' | 'full'
  requirePlanApproval: boolean
  skipTests: boolean
  dependencies: string[]
  priority: 1 | 2 | 3
  branchName: string
  imagePaths: string[]
  planSpec?: ParsedTask[]
}
```

**Settings**:

- Global settings: theme, keyboard shortcuts, AI profiles, project history
- Project settings: per-project overrides
- Credentials: API keys (masked in UI)

### Service Layer

| Service             | Responsibility                            |
| ------------------- | ----------------------------------------- |
| `SettingsService`   | Atomic file operations for settings       |
| `AgentService`      | Conversation sessions and message storage |
| `FeatureLoader`     | Feature data and image management         |
| `AutoModeService`   | Autonomous feature execution              |
| `ValidationStorage` | GitHub validation CRUD                    |

---

## Automation System

### Feature Lifecycle

```
┌──────────┐    ┌──────────┐    ┌────────────┐    ┌──────────┐    ┌───────────┐
│ Backlog  │ → │ Pending  │ → │ In Progress │ → │ Verified │ → │ Completed │
└──────────┘    └──────────┘    └────────────┘    └──────────┘    └───────────┘
                      ↑                                   ↓
                      └─────── Waiting Approval ──────────┘
```

### AutoModeService (Execution Engine)

**Core Components**:

- **Auto Loop**: Continuous scheduler with configurable concurrency (default: 3)
- **Dependency Resolution**: Topological sort (Kahn's algorithm)
- **Worktree Management**: Isolated development environments
- **Progress Tracking**: Real-time event emission

**Execution Flow**:

1. Load pending features and resolve dependencies
2. Create/select Git worktree for isolation
3. Generate specification (if planning mode enabled)
4. Wait for user approval (if required)
5. Execute agent with appropriate prompt
6. Verify implementation (tests or manual)
7. Commit changes to Git

### Planning Modes

| Mode     | Description                                       |
| -------- | ------------------------------------------------- |
| **Skip** | No planning, direct implementation                |
| **Lite** | Brief outline (Goal, Approach, Files, Risks)      |
| **Spec** | Structured specification with acceptance criteria |
| **Full** | Comprehensive SDD with phases and detailed plan   |

### Task Parsing

Tasks extracted from markdown specs:

```
- [ ] T001: Implement authentication | File: src/auth.ts
- [ ] T002: Add tests | File: src/auth.test.ts
```

---

## Provider System

### AI Provider Architecture

Extensible provider system for multiple AI models with a unified query interface:

```typescript
abstract class BaseProvider {
  abstract getName(): string;
  abstract executeQuery(options: ExecuteOptions): AsyncGenerator<ContentBlock>;
  abstract detectInstallation(): Promise<boolean>;
  abstract getAvailableModels(): ModelInfo[];

  supportsFeature(feature: 'tools' | 'vision' | 'mcp' | 'browser' | 'extendedThinking'): boolean;
  validateConfig(): { valid: boolean; errors: string[] };
}
```

**Provider-Agnostic Query Execution**:

All AI routes use `executeProviderQuery()` instead of provider-specific SDKs:

```typescript
// Provider-agnostic query that routes to Claude or Zai automatically
import { executeProviderQuery } from '@/lib/provider-query.js';

const stream = executeProviderQuery({
  cwd: projectPath,
  prompt: userPrompt,
  useCase: 'chat', // Routes to appropriate model
  apiKeys: await getApiKeys(),
  modelOverride: model, // Optional explicit model
  options: {
    systemPrompt,
    maxTurns: 1,
    allowedTools: [],
  },
});
```

This ensures:

- **Unified interface** - Single code path for all providers
- **Automatic routing** - Model ID determines provider
- **Feature parity** - Structured output, tools, vision work across providers
- **Easy extensibility** - New providers integrate via BaseProvider interface

**Current Providers**:

| Provider   | Models                                  | Tools | Vision | MCP\* | Browser | Extended Thinking |
| ---------- | --------------------------------------- | :---: | :----: | :---: | :-----: | :---------------: |
| **Claude** | Opus, Sonnet, Haiku                     |  ✅   |   ✅   |  ✅   |   ✅    |        ✅         |
| **Zai**    | GLM-4.7, GLM-4.6, GLM-4.6v, GLM-4.5-Air |  ✅   |  ✅†   |  N/A  |   ❌    |        ✅         |

\*MCP (Model Context Protocol) is an application-layer feature, not a provider-specific feature. Zai provides MCP servers that any client can connect to.
†Vision support via GLM-4.6v only

### Zai Provider (GLM Models)

The Zai Provider integrates ZhipuAI's GLM models through Z.ai's OpenAI-compatible API:

**API Configuration**:

- **Base URL**: `https://api.z.ai/api/coding/paas/v4`
- **Authentication**: Bearer token via `ZAI_API_KEY` environment variable
- **Provider IDs**: `zai` or `glm`

**Supported Models**:

| Model         | Tier     | Context | Output | Description                          |
| ------------- | -------- | ------- | ------ | ------------------------------------ |
| `glm-4.7`     | Premium  | 128K    | 8K     | Flagship model, strong reasoning     |
| `glm-4.6v`    | Vision   | 128K    | 8K     | Multimodal model with vision support |
| `glm-4.6`     | Balanced | 128K    | 8K     | Balanced performance                 |
| `glm-4.5-air` | Speed    | 128K    | 4K     | Fast for simple tasks                |
| `glm`         | Alias    | -       | -      | Maps to `glm-4.5-air`                |

**Tool Mapping**:

| AutoMaker Tool | Zai Function      | Parameters                                    |
| -------------- | ----------------- | --------------------------------------------- |
| Read           | `read_file`       | `filePath` (required)                         |
| Write          | `write_file`      | `filePath`, `content` (required)              |
| Edit           | `edit_file`       | `filePath`, `oldString`, `newString`          |
| Glob           | `glob_search`     | `pattern` (required), `cwd` (optional)        |
| Grep           | `grep_search`     | `pattern` (required), `searchPath` (optional) |
| Bash           | `execute_command` | `command` (required), `cwd` (optional)        |

**Note**: Optional path parameters default to the project working directory.

**Features**:

- ✅ **Tools**: Full support for all 6 core tools with function calling
- ✅ **Vision**: GLM-4.6v supports multimodal content (base64 images)
- ✅ **Structured Output**: JSON response format via `response_format: { type: 'json_object' }`
- ✅ **Extended Thinking**: All GLM models support thinking mode via `thinking: { type: 'enabled', clear_thinking: false }`
- ❌ **Browser**: Not implemented (no web automation)
- ℹ️ **MCP**: Application-layer feature (Zai provides MCP servers, not consumed by provider)

**Security Features**:

- Path resolution with sandboxing for write operations
- Command execution restrictions (10MB buffer limit)
- Relative path enforcement for file operations
- API key validation via `/models` endpoint

**Vision Handling**:

- GLM-4.6v directly processes images in multimodal requests
- For non-vision Zai models (glm-4.7, glm-4.6, glm-4.5-air) with images:
  - GLM-4.6v describes the images in the context of the prompt
  - Description is prepended as `[Image Context: ...]` to the prompt
  - Selected model continues with text prompt containing image descriptions
- All logic contained within ZaiProvider, no service layer changes needed

**Extended Thinking Mode**:

- All GLM models (glm-4.7, glm-4.6, glm-4.6v, glm-4.5-air) support thinking mode
- Enabled via `thinking: { type: 'enabled', clear_thinking: false }` parameter
- Returns `reasoning_content` field containing preserved reasoning across turns
- Reasoning content is yielded as `{ type: 'reasoning', reasoning_content: string }`
- **UI Display**:
  - Agent view shows reasoning content with Brain icon
  - Collapsible details section with "Show/Hide reasoning" toggle
  - User setting `showReasoningByDefault` controls default expanded state
  - Applies to both Claude (extended thinking) and Zai (thinking mode)
- Set `clear_thinking: false` to preserve reasoning context across conversation turns

**Provider Factory**: Routes model IDs to appropriate provider

- Model IDs starting with `glm-` → ZaiProvider
- Model IDs starting with `claude-` → ClaudeProvider
- Direct provider access via `zai`, `glm`, or `claude`

### Model Resolver System

The `libs/model-resolver` library provides centralized model resolution and routing:

**Resolution Flow**:

```
User Input → Alias Lookup → Provider Detection → Model Selection
```

1. **Full model strings** (e.g., `glm-4.7`, `claude-opus-4.5-20251101`) pass through unchanged
2. **Model aliases** are resolved via provider-specific maps
3. **Provider detection** via model prefix or explicit selection
4. **Provider-aware defaults** via `providerHint` parameter

**Provider-Aware Model Resolution**:

```typescript
resolveModelString(
  modelKey?: string,
  defaultModel?: string,
  providerHint?: 'claude' | 'zai' | 'auto'
): string
```

- `providerHint: 'zai'` → defaults to `glm-4.7`
- `providerHint: 'claude'` → defaults to `claude-opus-4.5-20251101`
- `providerHint: 'auto'` → defaults to Claude (backward compatibility)

**Model Aliases**:

| Alias    | Resolves To                  | Provider |
| -------- | ---------------------------- | -------- |
| `opus`   | `claude-opus-4.5-20251101`   | Claude   |
| `sonnet` | `claude-sonnet-4.5-20251101` | Claude   |
| `haiku`  | `claude-haiku-4.5-20251101`  | Claude   |
| `glm`    | `glm-4.5-air`                | Zai      |

**Provider Type** (`ModelProvider`):

```typescript
type ModelProvider = 'claude' | 'zai';
```

**Display Names**:

- Models have UI-friendly labels (e.g., `GLM-4.7`, `Claude Opus`)
- Badge system for model tiers (Premium, Balanced, Speed, Vision)
- Provider metadata for filtering and grouping

---

## Configuration System

### Settings Management

**Three-level storage**:

1. **Global Settings** (`settings.json`):
   - Theme preferences
   - UI state
   - Feature defaults (concurrency, test skipping)
   - AI profiles and model selection
   - Keyboard shortcuts
   - Project history

2. **Credentials** (`credentials.json`):
   - API keys for Claude, Google, OpenAI, Zai
   - Stored separately for security

3. **Project Settings** (`.automaker/settings.json`):
   - Theme overrides
   - Worktree configuration
   - Board customization
   - Session persistence

### Environment Variables

| Variable                 | Purpose                               |
| ------------------------ | ------------------------------------- |
| `ANTHROPIC_API_KEY`      | Claude API authentication             |
| `ZAI_API_KEY`            | Z.ai GLM API authentication           |
| `ALLOWED_ROOT_DIRECTORY` | Security boundary for file operations |
| `DATA_DIR`               | Custom data directory location        |
| `AUTOMAKER_API_KEY`      | Server API authentication             |
| `CORS_ORIGIN`            | Cross-origin restrictions             |
| `TERMINAL_ENABLED`       | Terminal access control               |

### Model Selection Environment Variables

| Variable                      | Purpose                       |
| ----------------------------- | ----------------------------- |
| `AUTOMAKER_MODEL_SPEC`        | Model for spec generation     |
| `AUTOMAKER_MODEL_FEATURES`    | Model for feature generation  |
| `AUTOMAKER_MODEL_SUGGESTIONS` | Model for suggestions         |
| `AUTOMAKER_MODEL_CHAT`        | Model for chat sessions       |
| `AUTOMAKER_MODEL_AUTO`        | Model for auto-mode execution |
| `AUTOMAKER_MODEL_DEFAULT`     | Default fallback model        |

### Security

- Path validation via `libs/platform/src/security.ts`
- Protection against directory traversal
- Atomic file writes for data integrity
- API key masking in UI

---

## Testing Infrastructure

### Testing Stack

| Tool            | Purpose                    |
| --------------- | -------------------------- |
| **Vitest**      | Unit and integration tests |
| **Playwright**  | E2E browser testing        |
| **V8 Coverage** | Code coverage reporting    |

### Test Organization

```
tests/
├── unit/                   # Isolated component tests
│   ├── lib/
│   ├── providers/
│   ├── routes/
│   └── services/
├── integration/            # Component interaction tests
│   ├── helpers/
│   └── services/
└── e2e/                    # Full application tests
    ├── features/
    └── utils/
```

### Coverage Thresholds

- **Server**: 60% statements, 75% functions
- **Libraries**: 90% statements, 95% functions

---

## Build and Deployment

### Build System

**Frontend**:

- `npm run build` - Web build
- `npm run build:electron` - Electron app
- `npm run build:electron:win` - Windows-specific
- `npm run build:electron:mac` - macOS-specific
- `npm run build:electron:linux` - Linux-specific

**Backend**:

- TypeScript compilation (tsc)
- Development with tsx watch

### Electron Packaging

**electron-builder** for multi-platform distribution:

- **macOS**: DMG and ZIP (Intel + Apple Silicon)
- **Windows**: NSIS installer (x64)
- **Linux**: AppImage and Debian packages (x64)

### CI/CD (GitHub Actions)

| Workflow             | Purpose                        |
| -------------------- | ------------------------------ |
| `test.yml`           | Run tests with coverage        |
| `pr-check.yml`       | Validate builds before merging |
| `release.yml`        | Build and publish releases     |
| `e2e-tests.yml`      | Playwright E2E tests           |
| `format-check.yml`   | Prettier formatting check      |
| `security-audit.yml` | Security vulnerability scan    |

### Version Management

- Source: Git tag version (e.g., `v1.0.0`)
- Format: Semantic Versioning (X.Y.Z)
- Auto-update from GitHub release tag

### Deployment Options

1. **Electron Desktop App** - Distributed via GitHub Releases
2. **Docker Container** - Complete isolation with named volumes
3. **Web Deployment** - Static files served via Nginx

---

## Security Considerations

⚠️ **Important**: AI agents have filesystem access. Recommended precautions:

- Run in Docker containers or VMs for isolation
- Review code before use
- Use `ALLOWED_ROOT_DIRECTORY` to restrict access
- Keep API keys secure

---

## Extension Points

### Adding New AI Providers

The Zai provider integration serves as a reference for adding new AI providers:

**1. Create Provider Class** (`apps/server/src/providers/{provider}-provider.ts`):

```typescript
export class NewProvider extends BaseProvider {
  getName(): string { return 'provider-name'; }
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ContentBlock> { ... }
  async detectInstallation(): Promise<InstallationStatus> { ... }
  getAvailableModels(): ModelInfo[] { ... }
  supportsFeature(feature: FeatureType): boolean { ... }
  validateConfig(): { valid: boolean; errors: string[] } { ... }
}
```

**2. Update Types** (`libs/types/src/`):

- Add provider to `ModelProvider` type
- Create model map (`{PROVIDER}_MODEL_MAP`)
- Add display metadata to `ModelOption[]`
- Add API key field to `Credentials` interface in `settings.ts`

**3. Update Model Resolver** (`libs/model-resolver/src/resolver.ts`):

- Add model alias resolution
- Include provider map in `ALL_MODEL_MAPS`
- Add `providerHint` support for provider-aware defaults

**4. Update Provider Factory** (`apps/server/src/providers/provider-factory.ts`):

- Add routing logic for new provider's model prefix
- Include in `getAllProviders()` return
- Add to `checkAllProviders()` status checks

**5. Update Provider Query** (`apps/server/src/lib/provider-query.ts`):

- Add API key extraction for new provider
- Add provider-specific output format handling if needed

**6. Update UI**:

- Add provider to `apps/ui/src/config/api-providers.ts`
- Update model selector in `apps/ui/src/components/views/`
- Add API key management in settings view
- Add provider to available models endpoint response

**7. Update Tests**:

- Create `{provider}-provider.test.ts` following existing patterns
- Update `provider-factory.test.ts` with new provider routing tests
- Mock provider's API calls in tests

**For Vision-Specific Models** (e.g., GLM-4.6v):

- Add model entry with `supportsVision: true` in provider's `getAvailableModels()`
- Implement `modelSupportsVision()` helper method
- Implement `describeImages()` method to proxy image descriptions via vision model
- Modify `executeQuery()` to detect non-vision model + images and call `describeImages()`
- Update provider types to include `'vision'` tier option

### Adding New Features

The system supports:

- Custom route modules in `/api/`
- New feature types in FeatureLoader
- UI components using existing hooks
- Tool integrations via MCP servers

---

## Communication Patterns

### Frontend ↔ Backend

**Web Mode**:

- HTTP API via `HttpApiClient`
- WebSocket for events
- Terminal WebSocket

**Electron Mode**:

- Inter-process communication (IPC)
- Same API interface
- Local server on same machine

### Event-Driven Architecture

```typescript
// Event types for real-time updates
type EventType =
  | 'agent:stream'
  | 'auto-mode:event'
  | 'auto_mode_feature_start'
  | 'auto_mode_feature_complete'
  | 'auto_mode_task_started'
  | 'auto_mode_task_complete'
  | 'plan_approval_required';
```

---

## Key Dependencies

### Frontend

```json
{
  "react": "^19.2.3",
  "@tanstack/react-router": "^1.0.0",
  "zustand": "^5.0.0",
  "tailwindcss": "^4.0.0",
  "@radix-ui/*": "latest",
  "@xyflow/react": "^12.0.0",
  "@xterm/xterm": "^5.0.0",
  "codemirror": "^6.0.0"
}
```

### Backend

```json
{
  "express": "^5.0.0",
  "ws": "^8.0.0",
  "node-pty": "^1.0.0",
  "@anthropic-ai/claude-agent-sdk": "^1.0.0"
}
```

---

## Development Workflow

### Full Stack Development

```bash
npm run dev:full     # Both server and web UI
npm run dev:web      # Web only
npm run dev:electron # Electron development
```

### Testing

```bash
npm test             # Run all tests
npm run test:unit    # Unit tests only
npm run test:e2e     # E2E tests only
```

---

## Summary

AutoMaker is a sophisticated monorepo combining modern web development with cutting-edge AI capabilities. Key architectural highlights:

1. **Monorepo Structure** - Shared libraries with apps/ui and apps/server
2. **Multi-Provider Support** - Claude and Z.ai (GLM) providers with extensible architecture
3. **Provider-Agnostic Query System** - `executeProviderQuery()` unifies all providers under single interface
4. **Zustand State Management** - Simple, powerful, with persistence
5. **File-based Storage** - Lightweight, portable, no database required
6. **Provider Architecture** - Extensible AI model integration via BaseProvider interface
7. **Model Resolver System** - Centralized model routing, alias resolution, provider-aware defaults
8. **Extended Thinking Support** - UI displays reasoning content for both Claude and Zai with collapsible toggle
9. **Git Worktree Isolation** - Safe concurrent feature development
10. **Real-time Events** - WebSocket-based live updates
11. **Comprehensive Testing** - Unit, integration, and E2E coverage for providers
12. **Cross-platform** - Electron desktop apps for Windows, macOS, Linux

**Zai Integration Status**: ✅ Complete

- All 4 GLM models (glm-4.7, glm-4.6v, glm-4.6, glm-4.5-air) fully integrated
- Tool calling with optional parameters
- Vision support via GLM-4.6v (with fallback for other models)
- Extended thinking mode with UI display
- Provider-agnostic route execution
- Comprehensive test coverage
