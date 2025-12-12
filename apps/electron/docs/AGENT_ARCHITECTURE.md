# Agent Architecture - Surviving Next.js Restarts

## Problem Statement

When using the Automaker app to iterate on itself:

1. Agent modifies code files
2. Next.js hot-reloads and restarts
3. API routes are killed
4. Agent conversation is lost

## Solution: Electron Main Process Agent

The agent now runs in the **Electron main process** instead of Next.js API routes. This provides:

- ✅ **Survives Next.js restarts** - Main process is independent of renderer
- ✅ **Persistent state** - Conversations saved to disk automatically
- ✅ **Real-time streaming** - IPC events for live updates
- ✅ **Session recovery** - Reconnects automatically after restart

## Architecture Overview

```
┌─────────────────────────────────────────┐
│   Electron Main Process                 │
│   ┌───────────────────────────────┐     │
│   │  Agent Service                │     │
│   │  - Manages sessions           │     │
│   │  - Runs Claude Agent SDK      │     │
│   │  - Persists to disk           │     │
│   │  - Streams via IPC            │     │
│   └───────────────────────────────┘     │
└──────────────┬──────────────────────────┘
               │ IPC (survives restarts)
┌──────────────┴──────────────────────────┐
│   Electron Renderer (Next.js)           │
│   ┌───────────────────────────────┐     │
│   │  React Frontend               │     │
│   │  - useElectronAgent hook      │     │
│   │  - Auto-reconnects            │     │
│   │  - Real-time updates          │     │
│   └───────────────────────────────┘     │
└─────────────────────────────────────────┘
```

## Key Components

### 1. Agent Service (`electron/agent-service.js`)

The core service running in the Electron main process:

- **Session Management**: Tracks multiple conversations by session ID
- **State Persistence**: Saves conversations to `userData/agent-sessions/*.json`
- **Streaming**: Sends real-time updates to renderer via IPC
- **Tool Support**: Full Read/Write/Edit/Bash/Grep/Glob capabilities
- **Error Recovery**: Continues after errors, saves state

### 2. IPC Handlers (`electron/main.js`)

Electron main process handlers:

- `agent:start` - Initialize or resume a session
- `agent:send` - Send a message (returns immediately)
- `agent:getHistory` - Retrieve conversation history
- `agent:stop` - Stop current execution
- `agent:clear` - Clear conversation
- `agent:stream` - Event emitted for streaming updates

### 3. Preload Bridge (`electron/preload.js`)

Secure IPC bridge exposed to renderer:

```javascript
window.electronAPI.agent.start(sessionId, workingDir);
window.electronAPI.agent.send(sessionId, message, workingDir);
window.electronAPI.agent.onStream(callback);
```

### 4. React Hook (`src/hooks/use-electron-agent.ts`)

Easy-to-use React hook:

```typescript
const {
  messages, // Conversation history
  isProcessing, // Agent is working
  isConnected, // Session initialized
  sendMessage, // Send user message
  stopExecution, // Stop current task
  clearHistory, // Clear conversation
  error, // Error state
} = useElectronAgent({
  sessionId: "project_xyz",
  workingDirectory: "/path/to/project",
  onToolUse: (tool) => console.log("Using:", tool),
});
```

### 5. Frontend Component (`src/components/views/agent-view.tsx`)

Updated to use IPC instead of HTTP:

- Generates session ID from project path
- Auto-reconnects on mount
- Shows tool usage in real-time
- Displays connection status

## Data Flow

### Sending a Message

1. User types message in React UI
2. `sendMessage()` calls `window.electronAPI.agent.send()`
3. IPC handler in main process receives message
4. Agent service starts processing
5. Main process streams updates via `agent:stream` events
6. React hook receives events and updates UI
7. Conversation saved to disk

### Surviving a Restart

1. Agent is modifying code → Next.js restarts
2. React component unmounts
3. **Main process keeps running** (agent continues)
4. React component remounts after restart
5. Calls `agent:start` with same session ID
6. Main process returns full conversation history
7. Subscribes to `agent:stream` events
8. UI shows complete conversation + live updates

## Session Storage

Sessions are stored in:

```
<userData>/agent-sessions/<sessionId>.json
```

Each session file contains:

```json
[
  {
    "id": "msg_1234_abc",
    "role": "user",
    "content": "Add a new feature...",
    "timestamp": "2024-12-07T12:00:00.000Z"
  },
  {
    "id": "msg_1235_def",
    "role": "assistant",
    "content": "I'll help you add that feature...",
    "timestamp": "2024-12-07T12:00:05.000Z"
  }
]
```

## Session ID Generation

Session IDs are generated from project paths:

```typescript
const sessionId = `project_${projectPath.replace(/[^a-zA-Z0-9]/g, "_")}`;
```

This ensures:

- Each project has its own conversation
- Conversations persist across app restarts
- Multiple projects can run simultaneously

## Streaming Events

The agent emits these event types:

### `message`

User message added to conversation

### `stream`

Assistant response streaming (updates in real-time)

### `tool_use`

Agent is using a tool (Read, Write, Edit, etc.)

### `complete`

Agent finished processing

### `error`

Error occurred during processing

## Configuration

The agent is configured with:

```javascript
{
  model: "claude-opus-4-5-20251101",
  maxTurns: 20,
  cwd: workingDirectory,
  allowedTools: [
    "Read", "Write", "Edit", "Glob", "Grep",
    "Bash", "WebSearch", "WebFetch"
  ],
  permissionMode: "acceptEdits",  // Auto-approve file edits
  sandbox: {
    enabled: true,                // Sandboxed bash execution
    autoAllowBashIfSandboxed: true
  }
}
```

## Benefits

### For Self-Iteration

Now you can ask the agent to modify Automaker itself:

```
User: "Add a dark mode toggle to the settings"
Agent: *modifies files*
→ Next.js restarts
→ Agent continues working
→ UI reconnects automatically
→ Shows full conversation history
```

### For Long-Running Tasks

The agent can work on complex tasks that take multiple turns:

```
User: "Implement authentication with GitHub OAuth"
Agent:
  1. Creates auth API routes
  2. Next.js restarts
  3. Agent continues: Adds middleware
  4. Next.js restarts again
  5. Agent continues: Updates UI components
  6. All changes tracked, conversation preserved
```

## Testing

To test the architecture:

1. Open a project in Automaker
2. Ask the agent to modify a file in `src/`
3. Watch Next.js restart
4. Verify the conversation continues
5. Check that history is preserved
6. Restart the entire Electron app
7. Verify conversation loads from disk

## Troubleshooting

### "Electron API not available"

- Make sure you're running in Electron, not browser
- Check `window.isElectron` is `true`

### Session not persisting

- Check userData directory exists
- Verify write permissions
- Look for errors in Electron console

### Next.js restart kills agent

- Verify agent service is in `electron/main.js`
- Check IPC handlers are registered
- Ensure not using HTTP `/api/chat` route

## Future Enhancements

- [ ] Multiple concurrent sessions
- [ ] Export conversation history
- [ ] Undo/redo for agent actions
- [ ] Progress bars for long-running tasks
- [ ] Voice input/output
- [ ] Agent memory across sessions
