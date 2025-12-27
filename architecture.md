# AutoMaker Architecture

## Overview

**AutoMaker** is an autonomous AI development studio that enables users to orchestrate AI agents to build software features automatically. It is a cross-platform desktop application (Electron) with a web interface that leverages the Claude Agent SDK to implement features described on a Kanban board.

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
│  │  │  Claude   │ │  Google  │ │    OpenAI         │     │  │
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

Extensible provider system for multiple AI models:

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

**Current Providers**:

- **Claude Provider**: Primary implementation with full feature support
- **Extensible**: Comments indicate support for Cursor, OpenAI, Google

**Provider Factory**: Routes model IDs to appropriate provider

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
   - API keys for Claude, Google, OpenAI
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
| `ALLOWED_ROOT_DIRECTORY` | Security boundary for file operations |
| `DATA_DIR`               | Custom data directory location        |
| `AUTOMAKER_API_KEY`      | Server API authentication             |
| `CORS_ORIGIN`            | Cross-origin restrictions             |
| `TERMINAL_ENABLED`       | Terminal access control               |

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

1. Extend `BaseProvider` class
2. Implement required abstract methods
3. Add to `ProviderFactory` model routing

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
2. **Zustand State Management** - Simple, powerful, with persistence
3. **File-based Storage** - Lightweight, portable, no database required
4. **Provider Architecture** - Extensible AI model integration
5. **Git Worktree Isolation** - Safe concurrent feature development
6. **Real-time Events** - WebSocket-based live updates
7. **Comprehensive Testing** - Unit, integration, and E2E coverage
8. **Cross-platform** - Electron desktop apps for Windows, macOS, Linux
