# Technology Stack

**Analysis Date:** 2026-01-27

## Languages

**Primary:**

- TypeScript 5.9.3 - Used across all packages, apps, and configuration
- JavaScript (Node.js) - Runtime execution for scripts and tooling

**Secondary:**

- YAML 2.7.0 - Configuration files
- CSS/Tailwind CSS 4.1.18 - Frontend styling

## Runtime

**Environment:**

- Node.js 22.x (>=22.0.0 <23.0.0) - Required version, specified in `.nvmrc`

**Package Manager:**

- npm - Monorepo workspace management via npm workspaces
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core - Frontend:**

- React 19.2.3 - UI framework with hooks and concurrent features
- Vite 7.3.0 - Build tool and dev server (`apps/ui/vite.config.ts`)
- Electron 39.2.7 - Desktop application runtime (`apps/ui/package.json`)
- TanStack Router 1.141.6 - File-based routing (React)
- Zustand 5.0.9 - State management (lightweight alternative to Redux)
- TanStack Query (React Query) 5.90.17 - Server state management

**Core - Backend:**

- Express 5.2.1 - HTTP server framework (`apps/server/package.json`)
- WebSocket (ws) 8.18.3 - Real-time bidirectional communication
- Claude Agent SDK (@anthropic-ai/claude-agent-sdk) 0.1.76 - AI provider integration

**Testing:**

- Playwright 1.57.0 - End-to-end testing (`apps/ui` E2E tests)
- Vitest 4.0.16 - Unit testing framework (runs on all packages and server)
- @vitest/ui 4.0.16 - Visual test runner UI
- @vitest/coverage-v8 4.0.16 - Code coverage reporting

**Build/Dev:**

- electron-builder 26.0.12 - Electron app packaging and distribution
- @vitejs/plugin-react 5.1.2 - Vite React support
- vite-plugin-electron 0.29.0 - Vite plugin for Electron main process
- vite-plugin-electron-renderer 0.14.6 - Vite plugin for Electron renderer
- ESLint 9.39.2 - Code linting (`apps/ui`)
- @typescript-eslint/eslint-plugin 8.50.0 - TypeScript ESLint rules
- Prettier 3.7.4 - Code formatting (root-level config)
- Tailwind CSS 4.1.18 - Utility-first CSS framework
- @tailwindcss/vite 4.1.18 - Tailwind Vite integration

**UI Components & Libraries:**

- Radix UI - Unstyled accessible component library (@radix-ui packages)
  - react-dropdown-menu 2.1.16
  - react-dialog 1.1.15
  - react-select 2.2.6
  - react-tooltip 1.2.8
  - react-tabs 1.1.13
  - react-collapsible 1.1.12
  - react-checkbox 1.3.3
  - react-radio-group 1.3.8
  - react-popover 1.1.15
  - react-slider 1.3.6
  - react-switch 1.2.6
  - react-scroll-area 1.2.10
  - react-label 2.1.8
- Lucide React 0.562.0 - Icon library
- Geist 1.5.1 - Design system UI library
- Sonner 2.0.7 - Toast notifications

**Code Editor & Terminal:**

- @uiw/react-codemirror 4.25.4 - Code editor React component
- CodeMirror (@codemirror packages) 6.x - Editor toolkit
- xterm.js (@xterm/xterm) 5.5.0 - Terminal emulator
- @xterm/addon-fit 0.10.0 - Fit addon for terminal
- @xterm/addon-search 0.15.0 - Search addon for terminal
- @xterm/addon-web-links 0.11.0 - Web links addon
- @xterm/addon-webgl 0.18.0 - WebGL renderer for terminal

**Diagram/Graph Visualization:**

- @xyflow/react 12.10.0 - React flow diagram library
- dagre 0.8.5 - Graph layout algorithms

**Markdown/Content Rendering:**

- react-markdown 10.1.0 - Markdown parser and renderer
- remark-gfm 4.0.1 - GitHub Flavored Markdown support
- rehype-raw 7.0.0 - Raw HTML support in markdown
- rehype-sanitize 6.0.0 - HTML sanitization

**Data Validation & Parsing:**

- zod 3.24.1 or 4.0.0 - Schema validation and TypeScript type inference

**Utilities:**

- class-variance-authority 0.7.1 - CSS variant utilities
- clsx 2.1.1 - Conditional className utility
- cmdk 1.1.1 - Command menu/palette
- tailwind-merge 3.4.0 - Tailwind CSS conflict resolution
- usehooks-ts 3.1.1 - TypeScript React hooks
- @dnd-kit (drag-and-drop) 6.3.1 - Drag and drop library

**Font Libraries:**

- @fontsource - Web font packages (Cascadia Code, Fira Code, IBM Plex, Inconsolata, Inter, etc.)

**Development Utilities:**

- cross-spawn 7.0.6 - Cross-platform process spawning
- dotenv 17.2.3 - Environment variable loading
- tsx 4.21.0 - TypeScript execution for Node.js
- tree-kill 1.2.2 - Process tree killer utility
- node-pty 1.1.0-beta41 - PTY/terminal interface for Node.js

## Key Dependencies

**Critical - AI/Agent Integration:**

- @anthropic-ai/claude-agent-sdk 0.1.76 - Core Claude AI provider
- @github/copilot-sdk 0.1.16 - GitHub Copilot integration
- @openai/codex-sdk 0.77.0 - OpenAI Codex/GPT-4 integration
- @modelcontextprotocol/sdk 1.25.2 - Model Context Protocol servers

**Infrastructure - Internal Packages:**

- @automaker/types 1.0.0 - Shared TypeScript type definitions
- @automaker/utils 1.0.0 - Logging, error handling, utilities
- @automaker/platform 1.0.0 - Path management, security, process spawning
- @automaker/prompts 1.0.0 - AI prompt templates
- @automaker/model-resolver 1.0.0 - Claude model alias resolution
- @automaker/dependency-resolver 1.0.0 - Feature dependency ordering
- @automaker/git-utils 1.0.0 - Git operations & worktree management
- @automaker/spec-parser 1.0.0 - Project specification parsing

**Server Utilities:**

- express 5.2.1 - Web framework
- cors 2.8.5 - CORS middleware
- morgan 1.10.1 - HTTP request logger
- cookie-parser 1.4.7 - Cookie parsing middleware
- yaml 2.7.0 - YAML parsing and generation

**Type Definitions:**

- @types/express 5.0.6
- @types/node 22.19.3
- @types/react 19.2.7
- @types/react-dom 19.2.3
- @types/dagre 0.7.53
- @types/ws 8.18.1
- @types/cookie 0.6.0
- @types/cookie-parser 1.4.10
- @types/cors 2.8.19
- @types/morgan 1.9.10

**Optional Dependencies (Platform-specific):**

- lightningcss (various platforms) 1.29.2 - CSS parser (alternate to PostCSS)
- dmg-license 1.0.11 - DMG license dialog for macOS

## Configuration

**Environment:**

- `.env` and `.env.example` files in `apps/server/` and `apps/ui/`
- `dotenv` library loads variables from `.env` files
- Key env vars:
  - `ANTHROPIC_API_KEY` - Claude API authentication
  - `OPENAI_API_KEY` - OpenAI/Codex authentication
  - `GITHUB_TOKEN` - GitHub API access
  - `ANTHROPIC_BASE_URL` - Custom Claude endpoint (optional)
  - `HOST` - Server bind address (default: 0.0.0.0)
  - `HOSTNAME` - Hostname for URLs (default: localhost)
  - `PORT` - Server port (default: 3008)
  - `DATA_DIR` - Data storage directory (default: ./data)
  - `ALLOWED_ROOT_DIRECTORY` - Restrict file operations
  - `AUTOMAKER_MOCK_AGENT` - Enable mock agent for testing
  - `AUTOMAKER_AUTO_LOGIN` - Skip login in dev (disabled in production)
  - `VITE_HOSTNAME` - Frontend API hostname

**Build:**

- `apps/ui/electron-builder.config.json` or `apps/ui/package.json` build config
- Electron builder targets:
  - macOS: DMG and ZIP
  - Windows: NSIS installer
  - Linux: AppImage, DEB, RPM
- Vite config: `apps/ui/vite.config.ts`, `apps/server/tsconfig.json`
- TypeScript config: `tsconfig.json` files in each package

## Platform Requirements

**Development:**

- Node.js 22.x
- npm (included with Node.js)
- Git (for worktree operations)
- Python (optional, for some dev scripts)

**Production:**

- Electron desktop app: Windows, macOS, Linux
- Web browser: Modern Chromium-based browsers
- Server: Any platform supporting Node.js 22.x

**Deployment Target:**

- Local desktop (Electron)
- Local web server (Express + Vite)
- Remote server deployment (Docker, systemd, or other orchestration)

---

_Stack analysis: 2026-01-27_
