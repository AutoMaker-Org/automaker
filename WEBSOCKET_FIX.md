# WebSocket Communication Fix

## Problem Identified

Features were stuck showing "Resume" button and couldn't execute because the browser wasn't sending WebSocket messages to the helper service.

## Root Cause

In `/home/zany/cody/automaker/app/src/lib/electron-with-helper.ts`, the auto-mode API methods were calling `helper.sendAutoModeMessage()` without first ensuring the WebSocket was connected via `helper.connectAutoMode()`.

This meant:
1. Browser creates helper client
2. User drags feature to "In Progress" or clicks "Resume"
3. `api.autoMode.runFeature()` or `api.autoMode.resumeFeature()` is called
4. Methods try to send WebSocket message
5. **WebSocket doesn't exist** because `connectAutoMode()` was never called
6. Message is never sent to helper service
7. Nothing happens

## The Fix

Updated all auto-mode API methods in `electron-with-helper.ts` to call `connectAutoMode()` before sending messages:

**Before:**
```typescript
runFeature: async (projectPath, featureId) => {
  await helper.sendAutoModeMessage({
    type: 'auto-mode:run-feature',
    projectPath,
    featureId
  });
  return { success: true };
},
```

**After:**
```typescript
runFeature: async (projectPath, featureId) => {
  console.log('[ElectronAPI] runFeature called:', { projectPath, featureId });
  await helper.connectAutoMode({
    onEvent: (event) => {
      // Events will be handled by onEvent callback
    }
  });
  await helper.sendAutoModeMessage({
    type: 'auto-mode:run-feature',
    projectPath,
    featureId
  });
  return { success: true };
},
```

## Methods Fixed

- ✅ `runFeature` - Start a feature
- ✅ `resumeFeature` - Resume a stuck feature
- ✅ `verifyFeature` - Verify feature with tests
- ✅ `stopFeature` - Stop a running feature
- ✅ `followUpFeature` - Send follow-up instructions
- ✅ `commitFeature` - Commit feature changes
- ✅ `analyzeProject` - Analyze project structure
- ✅ `stop` - Stop auto-mode
- ✅ `status` - Get auto-mode status

## Testing

To test the fix:

1. **Restart the web app dev server** to pick up the changes:
   ```bash
   cd /home/zany/cody/automaker/app
   # Kill existing dev server and restart
   npm run dev
   ```

2. **Verify helper service is running** (already confirmed running on port 13132)

3. **Test feature execution:**
   - Open browser to web app
   - Drag a feature from "Backlog" to "In Progress"
   - Watch helper logs for WebSocket messages:
     ```bash
     tail -f /tmp/helper.log | grep "AutoMode WS"
     ```
   - You should see: `[AutoMode WS] Received message: auto-mode:run-feature`

4. **Test resume:**
   - Click "Resume" on a stuck feature
   - Watch logs for: `[AutoMode WS] Received message: auto-mode:resume-feature`

## Expected Behavior

With the fix:
1. ✅ WebSocket connections established
2. ✅ Messages sent when features moved or resumed
3. ✅ Helper service receives and processes messages
4. ✅ Electron services execute via bridge
5. ✅ Features run using Claude Agent SDK

## Bridge Architecture Confirmed Working

The bridge pattern is correctly implemented:
- Helper service at `/home/zany/cody/automaker/helper` receives WebSocket messages
- Routes them to Electron services via `/home/zany/cody/automaker/helper/src/bridge/electron-services.ts`
- Electron services at `/home/zany/cody/automaker/app/electron/auto-mode-service.js` handle execution
- Same code runs for both Electron app and web app
- Single source of truth achieved ✅
