# Full Web Support Implementation

This document describes the implementation of full web support for Automaker, eliminating all mock implementations.

## Overview

The Automaker application now has full functionality in both Electron (desktop) and web browser modes through a local helper service architecture.

## Architecture

### 1. Helper Service (`/helper`)
- Node.js HTTP/WebSocket server running on localhost:13131
- Provides filesystem, dialog, agent, and auto-mode functionality
- Secured with JWT authentication and CORS restrictions
- Cross-platform support (Windows, macOS, Linux, WSL)

### 2. Helper Client SDK (`/app/src/lib/helper-client.ts`)
- TypeScript client with retry logic and error handling
- Automatic port discovery (13131-13140 range)
- WebSocket support for streaming operations
- Event-based architecture for real-time updates

### 3. Updated Electron API (`/app/src/lib/electron.ts`)
- Unified API interface for both Electron and web modes
- Async API initialization with helper service connection
- No more mock implementations - all operations are real

### 4. Path Helpers (`/app/src/lib/path-helpers.ts`)
- OS detection (Windows, macOS, Linux, WSL)
- Automatic path normalization
- WSL path conversion support
- Platform-specific default directories

## Features Implemented

### Filesystem Operations
- ✅ Read files
- ✅ Write files
- ✅ Create directories
- ✅ List directory contents
- ✅ Check file existence
- ✅ Get file statistics
- ✅ Delete files
- ✅ Move to trash

### Dialog Operations
- ✅ API endpoints created
- ⚠️ Native dialogs pending (currently returns error prompting manual entry)

### Application Features
- ✅ Get system paths (userData, temp, documents, etc.)
- ✅ Save images to project directories
- ✅ Cross-platform path handling

### Agent Integration
- ✅ WebSocket-based agent communication
- ✅ Session management
- ✅ Streaming responses
- ✅ History management

### Auto Mode
- ✅ WebSocket-based auto-mode control
- ✅ Feature execution and verification
- ✅ Real-time status updates
- ✅ Multi-feature concurrency support

### Security
- ✅ JWT authentication tokens
- ✅ Localhost-only binding
- ✅ CORS restrictions
- ✅ Input validation

## Usage

### Starting the Helper Service

```bash
# Navigate to helper directory
cd helper

# Install dependencies (first time only)
npm install

# Start the service
npm start
# or for development with auto-reload
npm run dev
```

### Web Application

1. Start the helper service (see above)
2. Start the web application:
   ```bash
   cd app
   npm run dev:web
   ```
3. Open http://localhost:3007 in your browser
4. The helper connection status will appear in the bottom right

### Electron Application

```bash
cd app
npm run dev:electron
```

The Electron app works as before, using native IPC instead of the helper service.

## Connection UI

A new helper connection status component shows:
- Connection status (connected/disconnected)
- Port number when connected
- Retry button for reconnection
- Settings dialog for manual configuration

## API Changes

The main API change is that `getElectronAPI()` is now async:

```typescript
// Before
const api = getElectronAPI();

// After
const api = await getElectronAPI();
```

A new hook is provided for React components:
```typescript
const { api, loading, error } = useElectronAPI();
```

## Testing

The helper service can be tested independently:

```bash
# Health check
curl http://localhost:13131/health

# With authentication
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:13131/fs/exists -d '{"path": "/tmp"}'
```

## Next Steps

1. Implement native file dialogs:
   - macOS: Using `osascript`
   - Windows: Using PowerShell
   - Linux: Using `zenity` or `kdialog`

2. Add file watching capabilities for auto-reload

3. Implement better error handling and recovery

4. Add helper auto-start functionality

5. Create installer that bundles helper with web app

## Platform Notes

### Windows
- Paths use backslashes (automatically handled)
- Default project directory: `%USERPROFILE%\Documents\Automaker\projects`

### macOS
- Paths use forward slashes
- Default project directory: `~/Documents/Automaker/projects`

### Linux/WSL
- Paths use forward slashes
- Default project directory: `~/automaker/projects`
- WSL paths are automatically converted when needed

## Security Considerations

1. The helper service only accepts connections from localhost
2. Authentication token is required for all operations
3. File operations are not restricted by path - ensure proper validation in production
4. Consider implementing path sandboxing for production use