# Automaker

An AI-powered application development platform that helps you build applications through natural language specifications and automated implementation.

## Features

- 📝 **Natural Language Specifications** - Define your application using plain English
- 🤖 **AI-Powered Implementation** - Automatic code generation based on specifications
- 📋 **Visual Task Management** - Kanban board for tracking features and progress
- 🔄 **Auto Mode** - Autonomous implementation with Plan-Act-Verify workflow
- 💬 **Interactive Agent** - Chat with AI to refine and implement features
- 🖼️ **Context Management** - Attach images and files for better AI understanding
- 🌐 **Cross-Platform** - Works as desktop app (Electron) or web app with helper service

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/automaker.git
cd automaker
```

2. Install dependencies:
```bash
cd app
npm install
```

### Running Automaker

#### As Desktop Application (Electron)

```bash
cd app
npm run dev:electron
```

#### As Web Application

For web mode, you need to run both the helper service and the web app.

**Quick Start (Recommended for Development):**
```bash
./start-dev.sh
```

This script automatically starts both the helper service and web app, and handles cleanup on exit.

**Manual Start:**

1. **Start the Helper Service** (in a separate terminal):
```bash
cd helper
npm install  # first time only
npm run dev   # for development (auto-reload on changes)
# OR
npm start     # for production (requires `npm run build` first)
```

The helper service provides filesystem and system access for the web application.

2. **Start the Web Application**:
```bash
cd app
npm run dev:web
```

3. Open http://localhost:3007 in your browser

**Testing the Connection:**
```bash
./test-connection.sh
```

This verifies the helper service is running and accessible.

The helper connection status will appear in the bottom right. If disconnected, check the browser console for detailed connection logs.

### Building for Production

#### Desktop Application

```bash
cd app
npm run build:electron
```

This creates distributable packages in `app/release/`.

#### Web Application

```bash
cd app
npm run build
```

## Project Structure

```
automaker/
├── app/                  # Main application (Next.js + Electron)
│   ├── src/             # Source code
│   ├── electron/        # Electron main process
│   └── public/          # Static assets
├── helper/              # Helper service for web mode
│   ├── src/            # Helper service source
│   └── API_DESIGN.md   # API documentation
└── docs/               # Documentation
```

## How It Works

1. **Create a Project** - Start by creating a new project or opening an existing one
2. **Define Specifications** - Write your application requirements in plain English
3. **Generate Features** - AI analyzes your spec and creates implementable features
4. **Implement Features** - Use Auto Mode for autonomous implementation or Interactive Agent for guided development
5. **Track Progress** - Monitor feature implementation on the Kanban board
6. **Test & Iterate** - Verify implementations and refine as needed

## Platform Support

- **Windows** - Full support with native file dialogs
- **macOS** - Full support with native file dialogs
- **Linux** - Full support with GTK dialogs
- **WSL** - Full support with automatic path conversion

## Security

- Helper service is bound to localhost only
- Authentication via JWT tokens
- CORS restricted to local origins
- File operations can be sandboxed (configure in settings)

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## License

[MIT License](LICENSE)

## Support

- Documentation: [https://docs.automaker.dev](https://docs.automaker.dev)
- Issues: [GitHub Issues](https://github.com/yourusername/automaker/issues)
- Discord: [Join our community](https://discord.gg/automaker)