# Automaker

Automaker is an autonomous AI development studio that helps you build software faster using AI-powered agents. It provides a visual Kanban board interface to manage features, automatically assigns AI agents to implement them, and tracks progress through an intuitive workflow from backlog to verified completion.

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
> **[Read the full disclaimer](../DISCLAIMER.md)**

---

## Getting Started

**Step 1:** Clone this repository:

```bash
git clone git@github.com:AutoMaker-Org/automaker.git
cd automaker
```

**Step 2:** Install dependencies:

```bash
npm install
```

### Windows notes (in-app Claude auth)

- Node.js 22.x
- Prebuilt PTY is bundled; Visual Studio build tools are not required for Claude auth.
- If you prefer the external terminal flow, set `CLAUDE_AUTH_DISABLE_PTY=1`.
- If you later add native modules beyond the prebuilt PTY, you may still need VS Build Tools + Python to rebuild those.

**Step 3:** Run the Claude Code setup token command:

```bash
claude setup-token
```

> **⚠️ Warning:** This command will print your token to your terminal. Be careful if you're streaming or sharing your screen, as the token will be visible to anyone watching.

**Step 4:** Export the Claude Code OAuth token in your shell:

```bash
export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"
```

**Step 5:** Start the development server:

```bash
npm run dev:electron
```

This will start both the Next.js development server and the Electron application.

### Auth smoke test (Windows)

1. Ensure dependencies are installed (prebuilt pty is included).
2. Run `npm run dev:electron` and open the Setup modal.
3. Click Start on Claude auth; watch the embedded terminal stream logs.
4. Successful runs show “Token captured automatically.”; otherwise copy/paste the token from the log.
5. Optional: `node --test tests/claude-cli-detector.test.js` to verify token parsing.

**Step 6:** MOST IMPORTANT: Run the Following after all is setup

```bash
echo "W"
echo "W"
echo "W"
echo "W"
echo "W"
echo "W"
echo "W"
echo "W"
```

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

See [LICENSE](../LICENSE) for details.
