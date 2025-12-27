<!-- TEST: Auto PR Creation via Workspace - Test Comment Added -->
<!-- This comment verifies the automatic PR creation workflow -->

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
  - [Powered by Claude Code](#powered-by-claude-code)
  - [Why This Matters](#why-this-matters)
- [Security Disclaimer](#security-disclaimer)
- [Community & Support](#community--support)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
- [How to Run](#how-to-run)
  - [Development Mode](#development-mode)
    - [Electron Desktop App (Recommended)](#electron-desktop-app-recommended)
    - [Web Browser Mode](#web-browser-mode)
  - [Building for Production](#building-for-production)
  - [Running Production Build](#running-production-build)
  - [Testing](#testing)
  - [Linting](#linting)
  - [Authentication Options](#authentication-options)
  - [Persistent Setup (Optional)](#persistent-setup-optional)
- [Features](#features)
- [Beads UI Integration](#beads-ui-integration)
- [Tech Stack](#tech-stack)
- [Learn More](#learn-more)
- [License](#license)

</details>

Automaker is an autonomous AI development studio that transforms how you build software. Instead of manually writing every line of code, you describe features on a Kanban board and watch as AI agents powered by Claude Code automatically implement them.

![Automaker UI](https://i.imgur.com/jdwKydM.png)

## What Makes Automaker Different?

Traditional development tools help you write code. Automaker helps you **orchestrate AI agents** to build entire features autonomously. Think of it as having a team of AI developers working for you—you define what needs to be built, and Automaker handles the implementation.

### The Workflow

1. **Add Features** - Describe features you want built (with text, images, or screenshots)
2. **Move to "In Progress"** - Automaker automatically assigns an AI agent to implement the feature
3. **Watch It Build** - See real-time progress as the agent writes code, runs tests, and makes changes
4. **Review & Verify** - Review the changes, run tests, and approve when ready
5. **Ship Faster** - Build entire applications in days, not weeks

### Powered by Claude Code

Automaker leverages the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code) to give AI agents full access to your codebase. Agents can read files, write code, execute commands, run tests, and make git commits—all while working in isolated git worktrees to keep your main branch safe.

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

👉 **Join the Discord:**  
https://discord.gg/jjem7aEDKU

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/AutoMaker-Org/automaker.git
cd automaker

# 2. Install dependencies
npm install

# 3. Build local shared packages
npm run build:packages

# 4. Run Automaker (pick your mode)
npm run dev
# Then choose your run mode when prompted, or use specific commands below
```

### Claude Code Plugin Setup

This project includes the [minimal-claude](https://github.com/KenKaiii/minimal-claude) plugin for code quality automation:

**Available Commands:**

- `/setup-code-quality` - Auto-detect and configure linting/type-checking
- `/setup-claude-md` - Generate code quality guidelines for AI agents
- `/setup-commits` - Create custom commit command with quality checks

The plugin installs automatically when you run `claude` in this repository.

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

```bash
# Build Next.js app
npm run build

# Build Electron app for distribution
npm run build:electron
```

### Running Production Build

```bash
# Start production Next.js server
npm run start
```

### Testing

```bash
# Run tests headless
npm run test

# Run tests with browser visible
npm run test:headed
```

### Linting

```bash
# Run ESLint
npm run lint
```

### Authentication Options

Automaker supports multiple authentication methods (in order of priority):

| Method           | Environment Variable | Description                     |
| ---------------- | -------------------- | ------------------------------- |
| API Key (env)    | `ANTHROPIC_API_KEY`  | Anthropic API key               |
| API Key (stored) | —                    | Anthropic API key stored in app |

### Persistent Setup (Optional)

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
export ANTHROPIC_API_KEY="YOUR_API_KEY_HERE"
```

Then restart your terminal or run `source ~/.bashrc`.

## Features

- 📋 **Kanban Board** - Visual drag-and-drop board to manage features through backlog, in progress, waiting approval, and verified stages
- 🤖 **AI Agent Integration** - Automatic AI agent assignment to implement features when moved to "In Progress"
- 🧠 **Multi-Model Support** - Choose from multiple AI models including Claude Opus, Sonnet, and more
- 💭 **Extended Thinking** - Enable extended thinking modes for complex problem-solving
- 📡 **Real-time Agent Output** - View live agent output, logs, and file diffs as features are being implemented
- 🔍 **Project Analysis** - AI-powered project structure analysis to understand your codebase
- 📁 **Context Management** - Add context files to help AI agents understand your project better
- 💡 **Feature Suggestions** - AI-generated feature suggestions based on your project
- 🖼️ **Image Support** - Attach images and screenshots to feature descriptions
- ⚡ **Concurrent Processing** - Configure concurrency to process multiple features simultaneously
- 🧪 **Test Integration** - Automatic test running and verification for implemented features
- 🔀 **Git Integration** - View git diffs and track changes made by AI agents
- 👤 **AI Profiles** - Create and manage different AI agent profiles for various tasks
- 💬 **Chat History** - Keep track of conversations and interactions with AI agents
- ⌨️ **Keyboard Shortcuts** - Efficient navigation and actions via keyboard shortcuts
- 🎨 **Dark/Light Theme** - Beautiful UI with theme support
- 🖥️ **Cross-Platform** - Desktop application built with Electron for Windows, macOS, and Linux

## Beads UI Integration

Automaker integrates with [beads-ui](https://github.com/mantoni/beads-ui), a local web UI for the Beads CLI that provides a visual interface for collaborating on issues with your coding agent.

### What is Beads UI?

Beads UI is a local web interface that works alongside the `bd` CLI tool to provide:

- 📊 **Visual Issue Management** - View and manage issues in a clean web interface
- 🔍 **Search & Filter** - Quickly find issues by status, labels, or text
- 📋 **Multiple Views** - Switch between Issues list, Epics view, and Kanban board
- ⚡ **Live Updates** - Real-time sync with your beads database
- ⌨️ **Keyboard Navigation** - Efficient keyboard shortcuts for power users

### Installation

Beads UI is installed as a global npm package:

```bash
# Install beads-ui globally
npm install -g beads-ui

# Verify installation
bdui --version
```

> **Note:** The `bd` CLI must be installed and accessible in your PATH. Beads UI respects the `BD_BIN` environment variable if you need to specify a custom path to the `bd` executable.

### Starting Beads UI

Launch the Beads UI web interface:

```bash
# Start Beads UI (default port: 3000)
bdui start

# Start and automatically open in browser
bdui start --open

# Start on custom port
bdui start --port 3001

# Start with custom beads database path
bdui start --db /path/to/beads.db
```

### Stopping Beads UI

Beads UI runs as a background daemon. To stop it:

```bash
# Stop the beads-ui service
bdui stop

# Check if beads-ui is running
bdui status
```

### NPM Helper Scripts

Automaker includes convenient npm scripts for common Beads UI operations:

```bash
# Start Beads UI (default port: 3000)
npm run beads

# Start Beads UI and automatically open in browser
npm run beads:open

# Stop the Beads UI service
npm run beads:stop

# Check if Beads UI is running
npm run beads:status

# List all issues using the bd CLI
npm run beads:issues
```

These scripts provide shorthand commands for the most common Beads UI operations, making it easier to integrate Beads UI into your development workflow.

### Using Beads UI with Automaker

1. **Start Automaker** in development mode (`npm run dev`)
2. **Launch Beads UI** in a separate terminal (`npm run beads:open`)
3. **Access the UI** at `http://localhost:3000` (or your custom port)
4. **View Issues** from your `.beads/beads.db` database in the web interface

### View Modes

Beads UI provides three different views:

- **Issues View** - Traditional list of all issues with status indicators
- **Epics View** - Group issues by epic/feature for high-level planning
- **Board View** - Kanban-style board for visual workflow management

Switch between views using the navigation menu or keyboard shortcuts.

### Keyboard Shortcuts

| Shortcut | Action                       |
| -------- | ---------------------------- |
| `?`      | Show keyboard shortcuts help |
| `/`      | Focus search box             |
| `c`      | Create new issue             |
| `n`      | Next issue                   |
| `p`      | Previous issue               |
| `e`      | Edit selected issue          |
| `s`      | Change issue status          |

### Troubleshooting

**Port already in use:**

```bash
# Use a different port
bdui start --port 3001
```

**bd CLI not found:**

```bash
# Verify bd is installed
which bd

# Set custom path if needed
export BD_BIN=/path/to/bd
```

**Database not found:**

```bash
# Ensure beads database exists
ls -la .beads/beads.db

# Create a new issue to initialize the database
bd create "Initial issue"
```

### Integration Notes

- Beads UI reads from the same `.beads/beads.db` database used by Automaker
- Changes made via the `bd` CLI or Automaker will appear in Beads UI in real-time
- Beads UI runs independently and can be used alongside Automaker's built-in Kanban board
- The default port (3000) may conflict with Automaker's web mode; use `--port` to specify an alternative

## Tech Stack

- [Next.js](https://nextjs.org) - React framework
- [Electron](https://www.electronjs.org/) - Desktop application framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
- [dnd-kit](https://dndkit.com/) - Drag and drop functionality

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

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
