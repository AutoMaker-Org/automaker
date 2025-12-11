# Automaker Helper Service API Design

## Overview
The helper service provides a local HTTP/WebSocket server that enables the web application to access filesystem, dialog, and agent functionality matching the Electron IPC API.

## Architecture

### Server Configuration
- **Port**: 13131 (configurable with fallback to 13132-13140)
- **Host**: localhost only (security)
- **Protocol**: HTTP REST + WebSocket for streaming
- **Auth**: Bearer token authentication
- **CORS**: Restricted to allowed origins

### API Endpoints

#### Health & Auth
```
GET /health
Response: { status: "healthy", version: "1.0.0" }

POST /auth/verify
Headers: Authorization: Bearer <token>
Response: { valid: true }
```

#### Filesystem Operations
```
POST /fs/read
Body: { path: string }
Response: { success: boolean, content?: string, error?: string }

POST /fs/write
Body: { path: string, content: string }
Response: { success: boolean, error?: string }

POST /fs/mkdir
Body: { path: string }
Response: { success: boolean, error?: string }

POST /fs/readdir
Body: { path: string }
Response: { 
  success: boolean, 
  entries?: Array<{ name: string, isDirectory: boolean, isFile: boolean }>,
  error?: string 
}

POST /fs/exists
Body: { path: string }
Response: { exists: boolean }

POST /fs/stat
Body: { path: string }
Response: { 
  success: boolean,
  stats?: { isDirectory: boolean, isFile: boolean, size: number, mtime: string },
  error?: string
}

POST /fs/delete
Body: { path: string }
Response: { success: boolean, error?: string }

POST /fs/trash
Body: { path: string }
Response: { success: boolean, error?: string }
```

#### Dialog Operations
```
POST /dialog/open-directory
Body: { title?: string, defaultPath?: string }
Response: { 
  success: boolean, 
  canceled?: boolean,
  paths?: string[],
  error?: string 
}

POST /dialog/open-file
Body: { 
  title?: string, 
  defaultPath?: string,
  filters?: Array<{ name: string, extensions: string[] }>
}
Response: { 
  success: boolean,
  canceled?: boolean, 
  paths?: string[],
  error?: string 
}
```

#### App Operations
```
GET /app/paths/:name
Params: name = "userData" | "temp" | "desktop" | "documents" | "downloads" | "home"
Response: { path: string }

POST /app/save-image
Body: { 
  data: string, // base64
  filename: string,
  mimeType: string,
  projectPath?: string
}
Response: { success: boolean, path?: string, error?: string }
```

#### Agent Operations (via WebSocket)
```
WebSocket /ws/agent

Messages:
// Client -> Server
{ 
  type: "agent:start",
  sessionId: string,
  workingDirectory: string
}

{ 
  type: "agent:send",
  sessionId: string,
  message: string,
  workingDirectory: string,
  imagePaths?: string[]
}

{ type: "agent:stop", sessionId: string }
{ type: "agent:clear", sessionId: string }
{ type: "agent:getHistory", sessionId: string }

// Server -> Client
{ 
  type: "stream",
  sessionId: string,
  chunk?: string,
  done?: boolean,
  error?: string
}
```

#### Session Management
```
GET /sessions?includeArchived=boolean
Response: { success: boolean, sessions?: Session[], error?: string }

POST /sessions
Body: { name: string, projectPath: string, workingDirectory: string }
Response: { success: boolean, session?: Session, error?: string }

PUT /sessions/:id
Body: { name?: string, tags?: string[] }
Response: { success: boolean, error?: string }

POST /sessions/:id/archive
Response: { success: boolean, error?: string }

POST /sessions/:id/unarchive
Response: { success: boolean, error?: string }

DELETE /sessions/:id
Response: { success: boolean, error?: string }
```

#### Auto Mode Operations (via WebSocket)
```
WebSocket /ws/auto-mode

Messages:
// Client -> Server
{ 
  type: "auto-mode:start",
  projectPath: string,
  maxConcurrency?: number
}

{ type: "auto-mode:stop" }
{ type: "auto-mode:status" }

{ 
  type: "auto-mode:run-feature",
  projectPath: string,
  featureId: string
}

{ 
  type: "auto-mode:verify-feature",
  projectPath: string,
  featureId: string
}

// ... other auto-mode operations

// Server -> Client
{ 
  type: "event",
  event: AutoModeEvent
}
```

## Path Helpers Integration

All path operations will use the path helpers for:
- OS detection (Windows/Mac/Linux/WSL)
- Path normalization (separators)
- WSL path conversion (optional)
- Default project roots per platform

## Security

1. **Authentication**: Required bearer token for all endpoints
2. **CORS**: Only allow specific origins (configurable)
3. **Localhost only**: Bind to 127.0.0.1
4. **Rate limiting**: Prevent abuse
5. **Input validation**: Sanitize all file paths

## Implementation Plan

1. Core HTTP server with Express.js
2. WebSocket support with ws library
3. Authentication middleware
4. File operation handlers
5. Dialog implementation (using native dialogs where possible)
6. Agent service integration
7. Auto-mode service integration
8. Path helpers integration
9. Error handling and logging
10. Health monitoring