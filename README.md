<p align="center">
  <img src="apps/ui/public/readme_logo.png" alt="Automaker Logo" height="80" />
</p>

> **[!TIP]**
>
> **Learn more about Agentic Coding!**
>
> Automaker itself was built by a group of engineers using AI and agentic coding techniques to build features faster than ever. By leveraging tools like Cursor IDE and Claude Code CLI, the team orchestrated AI agents to implement complex functionality in days instead of weeks.
>
> **Learn how:** Master these same techniques and workflows in the [Agentic Jumpstart course](https://agenticjumpstart.com/?utm=automaker-gh).

# Automaker

**Stop typing code. Start directing AI agents.**

<details open>
<summary><h2>Table of Contents</h2></summary>

- [What Makes Automaker Different?](#what-makes-automaker-different)
  - [The Workflow](#the-workflow)
  - [Powered by Claude Agent SDK](#powered-by-claude-agent-sdk)
  - [Why This Matters](#why-this-matters)
- [Security Disclaimer](#security-disclaimer)
- [Community & Support](#community--support)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
- [How to Run](#how-to-run)
  - [Development Mode](#development-mode)
  - [Building for Production](#building-for-production)
  - [Testing](#testing)
  - [Linting](#linting)
  - [Environment Configuration](#environment-configuration)
  - [Authentication Setup](#authentication-setup)
- [Features](#features)
  - [Core Workflow](#core-workflow)
  - [AI & Planning](#ai--planning)
  - [Project Management](#project-management)
  - [Collaboration & Review](#collaboration--review)
  - [Developer Tools](#developer-tools)
  - [Advanced Features](#advanced-features)
- [Tech Stack](#tech-stack)
  - [Frontend](#frontend)
  - [Backend](#backend)
  - [Testing & Quality](#testing--quality)
  - [Shared Libraries](#shared-libraries)
- [Available Views](#available-views)
- [Architecture](#architecture)
  - [Monorepo Structure](#monorepo-structure)
  - [How It Works](#how-it-works)
  - [Key Architectural Patterns](#key-architectural-patterns)
  - [Security & Isolation](#security--isolation)
  - [Data Storage](#data-storage)
- [Learn More](#learn-more)
- [License](#license)

</details>

Automaker is an autonomous AI development studio that transforms how you build software. Instead of manually writing every line of code, you describe features on a Kanban board and watch as AI agents powered by Claude Agent SDK automatically implement them. Built with React, Vite, Electron, and Express, Automaker provides a complete workflow for managing AI agents through a desktop application (or web browser), with features like real-time streaming, git worktree isolation, plan approval, and multi-agent task execution.

![Automaker UI](https://i.imgur.com/jdwKydM.png)

## What Makes Automaker Different?

Traditional development tools help you write code. Automaker helps you **orchestrate AI agents** to build entire features autonomously. Think of it as having a team of AI developers working for you—you define what needs to be built, and Automaker handles the implementation.

### The Workflow

1. **Add Features** - Describe features you want built (with text, images, or screenshots)
2. **Move to "In Progress"** - Automaker automatically assigns an AI agent to implement the feature
3. **Watch It Build** - See real-time progress as the agent writes code, runs tests, and makes changes
4. **Review & Verify** - Review the changes, run tests, and approve when ready
5. **Ship Faster** - Build entire applications in days, not weeks

### Powered by Claude Agent SDK

Automaker leverages the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) to give AI agents full access to your codebase. Agents can read files, write code, execute commands, run tests, and make git commits—all while working in isolated git worktrees to keep your main branch safe. The SDK provides autonomous AI agents that can use tools, make decisions, and complete complex multi-step tasks without constant human intervention.

### Why This Matters

The future of software development is **agentic coding**—where developers become architects directing AI agents rather than manual coders. Automaker puts this future in your hands today, letting you experience what it's like to build software 10x faster with AI agents handling the implementation while you focus on architecture and business logic.

---

> **[!CAUTION]**
>
> ## Security Disclaimer
>
> **This software uses AI-powered tooling that has access to your operating system and can read, modify, and delete files. Use at your own risk.**
>
> We have reviewed this codebase for security vulnerabilities, but you assume all risk when running this software. You should review the code yourself before running it.
>
> **We do not recommend running Automaker directly on your local computer** due to the risk of AI agents having access to your entire file system. Please sandbox this application using Docker or a virtual machine.
>
> **[Read the full disclaimer](./DISCLAIMER.md)**

---

## Community & Support

Join the **Agentic Jumpstart** to connect with other builders exploring **agentic coding** and autonomous development workflows.

In the Discord, you can:

- 💬 Discuss agentic coding patterns and best practices
- 🧠 Share ideas for AI-driven development workflows
- 🛠️ Get help setting up or extending Automaker
- 🚀 Show off projects built with AI agents
- 🤝 Collaborate with other developers and contributors

👉 **Join the Discord:** [Agentic Jumpstart Discord](https://discord.gg/jjem7aEDKU)

---

## Getting Started

### Prerequisites

- **Node.js 18+** (tested with Node.js 22)
- **npm** (comes with Node.js)
- **Authentication** (choose one):
  - **[Claude Code CLI](https://code.claude.com/docs/en/overview)** (recommended) - Install and authenticate, credentials used automatically
  - **Anthropic API Key** - Direct API key for Claude Agent SDK ([get one here](https://console.anthropic.com/))

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/AutoMaker-Org/automaker.git
cd automaker

# 2. Install dependencies
npm install

# 3. Build shared packages (Now can be skipped npm install / run dev does it automaticly)
npm run build:packages

# 4. Set up authentication (skip if using Claude Code CLI)
# If using Claude Code CLI: credentials are detected automatically
# If using API key directly, choose one method:

# Option A: Environment variable
export ANTHROPIC_API_KEY="sk-ant-..."

# Option B: Create .env file in project root
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 5. Start Automaker (interactive launcher)
npm run dev
# Choose between:
#   1. Web Application (browser at localhost:3007)
#   2. Desktop Application (Electron - recommended)
```

**Note:** The `npm run dev` command will:

- Check for dependencies and install if needed
- Install Playwright browsers for E2E tests
- Kill any processes on ports 3007/3008
- Present an interactive menu to choose your run mode

## How to Run

### Development Mode

Start Automaker in development mode:

```bash
npm run dev
```

This will prompt you to choose your run mode, or you can specify a mode directly:

#### Electron Desktop App (Recommended)

```bash
# Standard development mode
npm run dev:electron

# With DevTools open automatically
npm run dev:electron:debug

# For WSL (Windows Subsystem for Linux)
npm run dev:electron:wsl

# For WSL with GPU acceleration
npm run dev:electron:wsl:gpu
```

#### Web Browser Mode

```bash
# Run in web browser (http://localhost:3007)
npm run dev:web
```

### Building for Production

#### Web Application

```bash
# Build for web deployment (uses Vite)
npm run build

# Run production build
npm run start
```

#### Desktop Application

```bash
# Build for current platform (macOS/Windows/Linux)
npm run build:electron

# Platform-specific builds
npm run build:electron:mac     # macOS (DMG + ZIP, x64 + arm64)
npm run build:electron:win     # Windows (NSIS installer, x64)
npm run build:electron:linux   # Linux (AppImage + DEB, x64)

# Output directory: apps/ui/release/
```

#### Docker Deployment

```bash
# Build and run with Docker Compose (recommended for security)
docker-compose up -d

# Access at http://localhost:3007
# API at http://localhost:3008
```

### Testing

#### End-to-End Tests (Playwright)

```bash
npm run test            # Headless E2E tests
npm run test:headed     # Browser visible E2E tests
```

#### Unit Tests (Vitest)

```bash
npm run test:server              # Server unit tests
npm run test:server:coverage     # Server tests with coverage
npm run test:packages            # All shared package tests
npm run test:all                 # Packages + server tests
```

#### Test Configuration

- E2E tests run on ports 3007 (UI) and 3008 (server)
- Automatically starts test servers before running
- Uses Chromium browser via Playwright
- Mock agent mode available in CI with `AUTOMAKER_MOCK_AGENT=true`

### Linting

```bash
# Run ESLint
npm run lint
```

### Environment Configuration

#### Authentication (if not using Claude Code CLI)

- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude Agent SDK (not needed if using Claude Code CLI)

### GLM-4.7 (Z.AI) Support

Automaker now supports GLM-4.7, a high-performance coding model available through [Z.AI](https://z.ai). GLM-4.7 is ideal for implementation tasks when combined with a planning model like Claude Opus.

**Key Features:**

- **Plan vs. Code**: Use separate models for planning (Claude) and implementation (GLM-4.7)
- **Cost Effective**: Reduce costs while maintaining high code quality
- **Seamless Integration**: Works with existing Auto Mode and Agent Chat workflows

**Getting Started:**

1. Get a Z.AI API key from [https://z.ai](https://z.ai)
2. Add the key in **Settings → API Keys → Z.AI (GLM Coding Plan)**
3. Create or use the built-in "GLM Coding" profile
4. Select the profile when running features or chatting

For detailed setup instructions, see the [GLM Setup Guide](./docs/glm-setup-guide.md).

### Persistent Setup (Optional)

#### Optional - Server

- `PORT` - Server port (default: 3008)
- `DATA_DIR` - Data storage directory (default: ./data)
- `ENABLE_REQUEST_LOGGING` - HTTP request logging (default: true)

#### Optional - Security

- `AUTOMAKER_API_KEY` - Optional API authentication for the server
- `ALLOWED_ROOT_DIRECTORY` - Restrict file operations to specific directory
- `CORS_ORIGIN` - CORS policy (default: \*)

#### Optional - Development

- `VITE_SKIP_ELECTRON` - Skip Electron in dev mode
- `OPEN_DEVTOOLS` - Auto-open DevTools in Electron

### Authentication Setup

#### Option 1: Claude Code CLI (Recommended)

Install and authenticate the Claude Code CLI following the [official quickstart guide](https://code.claude.com/docs/en/quickstart).

Once authenticated, Automaker will automatically detect and use your CLI credentials. No additional configuration needed!

#### Option 2: Direct API Key

If you prefer not to use the CLI, you can provide an Anthropic API key directly using one of these methods:

##### 2a. Shell Configuration

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Then restart your terminal or run `source ~/.bashrc` (or `source ~/.zshrc`).

##### 2b. .env File

Create a `.env` file in the project root (gitignored):

```bash
ANTHROPIC_API_KEY=sk-ant-...
PORT=3008
DATA_DIR=./data
```

##### 2c. In-App Storage

The application can store your API key securely in the settings UI. The key is persisted in the `DATA_DIR` directory.

## Features

### Core Workflow

- 📋 **Kanban Board** - Visual drag-and-drop board to manage features through backlog, in progress, waiting approval, and verified stages
- 🤖 **AI Agent Integration** - Automatic AI agent assignment to implement features when moved to "In Progress"
- 🔀 **Git Worktree Isolation** - Each feature executes in isolated git worktrees to protect your main branch
- 📡 **Real-time Streaming** - Watch AI agents work in real-time with live tool usage, progress updates, and task completion
- 🔄 **Follow-up Instructions** - Send additional instructions to running agents without stopping them

### AI & Planning

- 🧠 **Multi-Model Support** - Choose from Claude Opus, Sonnet, and Haiku per feature
- 💭 **Extended Thinking** - Enable thinking modes (none, medium, deep, ultra) for complex problem-solving
- 📝 **Planning Modes** - Four planning levels: skip (direct implementation), lite (quick plan), spec (task breakdown), full (phased execution)
- ✅ **Plan Approval** - Review and approve AI-generated plans before implementation begins
- 📊 **Multi-Agent Task Execution** - Spec mode spawns dedicated agents per task for focused implementation

### Project Management

- 🔍 **Project Analysis** - AI-powered codebase analysis to understand your project structure
- 💡 **Feature Suggestions** - AI-generated feature suggestions based on project analysis
- 📁 **Context Management** - Add markdown, images, and documentation files that agents automatically reference
- 🔗 **Dependency Blocking** - Features can depend on other features, enforcing execution order
- 🌳 **Graph View** - Visualize feature dependencies with interactive graph visualization
- 📋 **GitHub Integration** - Import issues, validate feasibility, and convert to tasks automatically

### Collaboration & Review

- 🧪 **Verification Workflow** - Features move to "Waiting Approval" for review and testing
- 💬 **Agent Chat** - Interactive chat sessions with AI agents for exploratory work
- 👤 **AI Profiles** - Create custom agent configurations with different prompts, models, and settings
- 📜 **Session History** - Persistent chat sessions across restarts with full conversation history
- 🔍 **Git Diff Viewer** - Review changes made by agents before approving

### Developer Tools

- 🖥️ **Integrated Terminal** - Full terminal access with tabs, splits, and persistent sessions
- 🖼️ **Image Support** - Attach screenshots and diagrams to feature descriptions for visual context
- ⚡ **Concurrent Execution** - Configure how many features can run simultaneously (default: 3)
- ⌨️ **Keyboard Shortcuts** - Fully customizable shortcuts for navigation and actions
- 🎨 **Theme System** - 25+ themes including Dark, Light, Dracula, Nord, Catppuccin, and more
- 🖥️ **Cross-Platform** - Desktop app for macOS (x64, arm64), Windows (x64), and Linux (x64)
- 🌐 **Web Mode** - Run in browser or as Electron desktop app

### Advanced Features

- 🔐 **Docker Isolation** - Security-focused Docker deployment with no host filesystem access
- 🎯 **Worktree Management** - Create, switch, commit, and create PRs from worktrees
- 📊 **Usage Tracking** - Monitor Claude API usage with detailed metrics
- 🔊 **Audio Notifications** - Optional completion sounds (mutable in settings)
- 💾 **Auto-save** - All work automatically persisted to `.automaker/` directory

## Tech Stack

### Frontend

- **React 19** - UI framework
- **Vite 7** - Build tool and development server
- **Electron 39** - Desktop application framework
- **TypeScript 5.9** - Type safety
- **TanStack Router** - File-based routing
- **Zustand 5** - State management with persistence
- **Tailwind CSS 4** - Utility-first styling with 25+ themes
- **Radix UI** - Accessible component primitives
- **dnd-kit** - Drag and drop for Kanban board
- **@xyflow/react** - Graph visualization for dependencies
- **xterm.js** - Integrated terminal emulator
- **CodeMirror 6** - Code editor for XML/syntax highlighting
- **Lucide Icons** - Icon library

### Backend

- **Node.js** - JavaScript runtime with ES modules
- **Express 5** - HTTP server framework
- **TypeScript 5.9** - Type safety
- **Claude Agent SDK** - AI agent integration (@anthropic-ai/claude-agent-sdk)
- **WebSocket (ws)** - Real-time event streaming
- **node-pty** - PTY terminal sessions

### Testing & Quality

- **Playwright** - End-to-end testing
- **Vitest** - Unit testing framework
- **ESLint 9** - Code linting
- **Prettier 3** - Code formatting
- **Husky** - Git hooks for pre-commit formatting

### Shared Libraries

- **@automaker/types** - Shared TypeScript definitions
- **@automaker/utils** - Logging, error handling, image processing
- **@automaker/prompts** - AI prompt templates
- **@automaker/platform** - Path management and security
- **@automaker/model-resolver** - Claude model alias resolution
- **@automaker/dependency-resolver** - Feature dependency ordering
- **@automaker/git-utils** - Git operations and worktree management

## Available Views

Automaker provides several specialized views accessible via the sidebar or keyboard shortcuts:

| View               | Shortcut | Description                                                                                      |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| **Board**          | `K`      | Kanban board for managing feature workflow (Backlog → In Progress → Waiting Approval → Verified) |
| **Agent**          | `A`      | Interactive chat sessions with AI agents for exploratory work and questions                      |
| **Spec**           | `D`      | Project specification editor with AI-powered generation and feature suggestions                  |
| **Context**        | `C`      | Manage context files (markdown, images) that AI agents automatically reference                   |
| **Profiles**       | `M`      | Create and manage AI agent profiles with custom prompts and configurations                       |
| **Settings**       | `S`      | Configure themes, shortcuts, defaults, authentication, and more                                  |
| **Terminal**       | `T`      | Integrated terminal with tabs, splits, and persistent sessions                                   |
| **GitHub Issues**  | -        | Import and validate GitHub issues, convert to tasks                                              |
| **Running Agents** | -        | View all active agents across projects with status and progress                                  |

### Keyboard Navigation

All shortcuts are customizable in Settings. Default shortcuts:

- **Navigation:** `K` (Board), `A` (Agent), `D` (Spec), `C` (Context), `S` (Settings), `M` (Profiles), `T` (Terminal)
- **UI:** `` ` `` (Toggle sidebar)
- **Actions:** `N` (New item in current view), `G` (Start next features), `O` (Open project), `P` (Project picker)
- **Projects:** `Q`/`E` (Cycle previous/next project)

## Architecture

### Monorepo Structure

Automaker is built as an npm workspace monorepo with two main applications and seven shared packages:

```text
automaker/
├── apps/
│   ├── ui/          # React + Vite + Electron frontend
│   └── server/      # Express + WebSocket backend
└── libs/            # Shared packages
    ├── types/                  # Core TypeScript definitions
    ├── utils/                  # Logging, errors, utilities
    ├── prompts/                # AI prompt templates
    ├── platform/               # Path management, security
    ├── model-resolver/         # Claude model aliasing
    ├── dependency-resolver/    # Feature dependency ordering
    └── git-utils/              # Git operations & worktree management
```

### How It Works

1. **Feature Definition** - Users create feature cards on the Kanban board with descriptions, images, and configuration
2. **Git Worktree Creation** - When a feature starts, a git worktree is created for isolated development
3. **Agent Execution** - Claude Agent SDK executes in the worktree with full file system and command access
4. **Real-time Streaming** - Agent output streams via WebSocket to the frontend for live monitoring
5. **Plan Approval** (optional) - For spec/full planning modes, agents generate plans that require user approval
6. **Multi-Agent Tasks** (spec mode) - Each task in the spec gets a dedicated agent for focused implementation
7. **Verification** - Features move to "Waiting Approval" where changes can be reviewed via git diff
8. **Integration** - After approval, changes can be committed and PRs created from the worktree

### Key Architectural Patterns

- **Event-Driven Architecture** - All server operations emit events that stream to the frontend
- **Provider Pattern** - Extensible AI provider system (currently Claude, designed for future providers)
- **Service-Oriented Backend** - Modular services for agent management, features, terminals, settings
- **State Management** - Zustand with persistence for frontend state across restarts
- **File-Based Storage** - No database; features stored as JSON files in `.automaker/` directory

### Security & Isolation

- **Git Worktrees** - Each feature executes in an isolated git worktree, protecting your main branch
- **Path Sandboxing** - Optional `ALLOWED_ROOT_DIRECTORY` restricts file access
- **Docker Isolation** - Recommended deployment uses Docker with no host filesystem access
- **Plan Approval** - Optional plan review before implementation prevents unwanted changes

### Data Storage

Automaker uses a file-based storage system (no database required):

#### Per-Project Data

Stored in `{projectPath}/.automaker/`:

```text
.automaker/
├── features/              # Feature JSON files and images
│   └── {featureId}/
│       ├── feature.json   # Feature metadata
│       ├── agent-output.md # AI agent output log
│       └── images/        # Attached images
├── context/               # Context files for AI agents
├── settings.json          # Project-specific settings
├── spec.md               # Project specification
├── analysis.json         # Project structure analysis
└── feature-suggestions.json # AI-generated suggestions
```

#### Global Data

Stored in `DATA_DIR` (default `./data`):

```text
data/
├── settings.json          # Global settings, profiles, shortcuts
├── credentials.json       # API keys (encrypted)
├── sessions-metadata.json # Chat session metadata
└── agent-sessions/        # Conversation histories
    └── {sessionId}.json
```

## Learn More

### Documentation

- [Project Documentation](./docs/) - Architecture guides, patterns, and developer docs
- [Docker Isolation Guide](./docs/docker-isolation.md) - Security-focused Docker deployment
- [Shared Packages Guide](./docs/llm-shared-packages.md) - Using monorepo packages

### Community

Join the **Agentic Jumpstart** Discord to connect with other builders exploring **agentic coding**:

👉 [Agentic Jumpstart Discord](https://discord.gg/jjem7aEDKU)

## License

This project is licensed under the **Automaker License Agreement**. See [LICENSE](LICENSE) for the full text.

**Summary of Terms:**

- **Allowed:**
  - **Build Anything:** You can clone and use Automaker locally or in your organization to build ANY product (commercial or free).
  - **Internal Use:** You can use it internally within your company (commercial or non-profit) without restriction.
  - **Modify:** You can modify the code for internal use within your organization (commercial or non-profit).

- **Restricted (The "No Monetization of the Tool" Rule):**
  - **No Resale:** You cannot resell Automaker itself.
  - **No SaaS:** You cannot host Automaker as a service for others.
  - **No Monetizing Mods:** You cannot distribute modified versions of Automaker for money.

- **Liability:**
  - **Use at Own Risk:** This tool uses AI. We are **NOT** responsible if it breaks your computer, deletes your files, or generates bad code. You assume all risk.

- **Contributing:**
  - By contributing to this repository, you grant the Core Contributors full, irrevocable rights to your code (copyright assignment).

**Core Contributors** (Cody Seibert (webdevcody), SuperComboGamer (SCG), Kacper Lachowicz (Shironex, Shirone), and Ben Scott (trueheads)) are granted perpetual, royalty-free licenses for any use, including monetization.
