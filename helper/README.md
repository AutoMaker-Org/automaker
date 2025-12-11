# Automaker Helper Service

The helper service provides local filesystem and system access for the Automaker web application, enabling full functionality when running outside of Electron.

## Features

- **Filesystem Operations**: Read, write, delete files and directories
- **Dialog Support**: File and directory selection dialogs (platform-specific)
- **Agent Integration**: Run AI agents with local filesystem access
- **Auto Mode**: Autonomous feature implementation with local project access
- **Session Management**: Persistent conversation history
- **Cross-Platform**: Works on Windows, macOS, Linux, and WSL

## Installation

```bash
cd helper
npm install
```

## Usage

### Starting the Helper

```bash
npm start
# or for development with auto-reload
npm run dev
```

The helper will start on port 13131 by default (or the next available port up to 13140).

### Security

- The helper only accepts connections from localhost
- Authentication is required using a bearer token
- The token is displayed when the helper starts
- CORS is restricted to localhost origins only

### Configuration

Environment variables:
- `HELPER_AUTH_SECRET`: Custom auth secret (default: auto-generated)
- `WORKSPACE_ROOT`: Root directory for file operations (default: current directory)
- `DEBUG`: Enable debug logging

## API Documentation

See [API_DESIGN.md](./API_DESIGN.md) for the complete API specification.

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## Platform-Specific Notes

### Windows
- File paths use backslashes
- Dialogs will use PowerShell (when implemented)

### macOS
- File paths use forward slashes
- Dialogs will use osascript (when implemented)

### Linux
- File paths use forward slashes
- Dialogs will use zenity or kdialog (when implemented)

### WSL
- Automatic path conversion between Windows and WSL formats
- Can access both WSL filesystem and Windows drives via /mnt/c/