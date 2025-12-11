# Helper Bridge Architecture

## Overview

The helper service now acts as a pure **bridge** to the existing Electron services, ensuring a single source of truth for all business logic. This means:

1. **No code duplication** - All logic lives in `app/electron/` services
2. **Consistent behavior** - Both Electron app and web app use the exact same code
3. **Easy maintenance** - Changes to one automatically apply to both

## How It Works

### Bridge Module

`helper/src/bridge/electron-services.ts` imports the Electron services:

```typescript
const agentService = require('../../../app/electron/agent-service.js');
const autoModeService = require('../../../app/electron/auto-mode-service.js');

export { agentService, autoModeService };
```

### WebSocket Handler

`helper/src/websocket/automode.ts` uses autoModeService for all operations:

```typescript
import { autoModeService } from '../bridge/electron-services';

// Example: Running a feature
await autoModeService.runFeature({
  projectPath,
  featureId,
  sendToRenderer: (event) => this.send({ type: 'event', event })
});
```

### HTTP Routes

Routes like filesystem (`helper/src/routes/filesystem.ts`) use native Node.js APIs, which are the same APIs Electron uses.

## Architecture Diagram

```
┌─────────────────┐         ┌─────────────────┐
│   Electron App  │         │    Web App      │
│    (Desktop)    │         │   (Browser)     │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ IPC                       │ HTTP/WS
         │                           │
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  Electron IPC   │         │ Helper Service  │
│   Handlers      │         │   (Bridge)      │
│  (main.js)      │         │                 │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │                           │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Electron Services    │
         │  (Single Source of    │
         │   Truth)              │
         ├───────────────────────┤
         │ • agent-service.js    │
         │ • auto-mode-service.js│
         │ • feature-executor.js │
         │ • feature-loader.js   │
         │ • etc...              │
         └───────────────────────┘
```

## Benefits

### 1. Single Source of Truth
- All business logic in `app/electron/services/`
- Changes automatically apply to both Electron and web
- No risk of drift between implementations

### 2. Zero Code Duplication
- Helper doesn't reimplement features
- Just forwards requests to existing services
- Minimal maintenance overhead

### 3. Seamless Switching
- Users can switch between Electron and web versions
- Identical behavior and features in both
- Same file formats, same project structure

### 4. Easy Testing
- Test the Electron services once
- Both Electron and web benefit from fixes
- Reduced testing surface area

## What Was Bridged

### Auto-Mode Operations (WebSocket)
All auto-mode operations now bridge to `autoModeService`:
- `start()` - Start auto-mode
- `stop()` - Stop auto-mode
- `getStatus()` - Get current status
- `runFeature()` - Execute a feature
- `stopFeature()` - Stop a running feature
- `verifyFeature()` - Verify feature implementation
- `resumeFeature()` - Resume a paused feature
- `followUpFeature()` - Add follow-up changes
- `commitFeature()` - Commit feature changes
- `analyzeProject()` - Analyze project structure

### File System Operations (HTTP)
File operations use native Node.js `fs` APIs (same as Electron):
- Read/write files
- Create/read directories
- Check file existence
- Get file stats
- Delete files
- Move to trash

### Agent Operations (HTTP)
Agent chat operations will bridge to `agentService`:
- Start conversation
- Send message
- Get history
- Stop conversation
- Clear history

## Future Additions

When adding new features:

1. **Add to Electron services** (`app/electron/services/`)
2. **Bridge in helper** - Import and call the service
3. **Both modes get the feature** automatically!

## Example: Adding a New Feature

```typescript
// 1. Add to Electron service (app/electron/services/my-service.js)
class MyService {
  async doSomething(params) {
    // Implementation
  }
}
module.exports = new MyService();

// 2. Bridge in helper (helper/src/bridge/electron-services.ts)
const myService = require('../../../app/electron/services/my-service.js');
export { myService };

// 3. Use in helper routes/websocket
import { myService } from '../bridge/electron-services';

app.post('/my-endpoint', async (req, res) => {
  const result = await myService.doSomething(req.body);
  res.json(result);
});
```

Done! Both Electron and web now have the feature.

## Notes

- Helper service requires the Electron codebase to be present
- Both use the same dependencies (Claude Agent SDK, etc.)
- Configuration (API keys, etc.) should be accessible to both
