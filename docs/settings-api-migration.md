# Settings API-First Migration

## Overview

This document summarizes the migration from localStorage-based settings persistence to an API-first approach. The goal was to ensure settings are consistent between Electron and web modes by using the server's `settings.json` as the single source of truth.

## Problem

Previously, settings were stored in two places:

1. **Browser localStorage** (via Zustand persist middleware) - isolated per browser/Electron instance
2. **Server files** (`{DATA_DIR}/settings.json`)

This caused settings drift between Electron and web modes since each had its own localStorage.

## Solution

All settings are now:

1. **Fetched from the server API** on app startup
2. **Synced back to the server API** when changed (with debouncing)
3. **No longer cached in localStorage** (persist middleware removed)

## Files Changed

### New Files

#### `apps/ui/src/hooks/use-settings-sync.ts`

New hook that:

- Waits for migration to complete before starting
- Subscribes to Zustand store changes
- Debounces sync to server (1000ms delay)
- Handles special case for `currentProjectId` (extracted from `currentProject` object)

### Modified Files

#### `apps/ui/src/store/app-store.ts`

- Removed `persist` middleware from Zustand store
- Added new state fields:
  - `worktreePanelCollapsed: boolean`
  - `lastProjectDir: string`
  - `recentFolders: string[]`
- Added corresponding setter actions

#### `apps/ui/src/store/setup-store.ts`

- Removed `persist` middleware from Zustand store

#### `apps/ui/src/hooks/use-settings-migration.ts`

Complete rewrite to:

- Run in both Electron and web modes (not just Electron)
- Parse localStorage data and merge with server data
- Prefer server data, but use localStorage for missing arrays (projects, profiles, etc.)
- Export `waitForMigrationComplete()` for coordination with sync hook
- Handle `currentProjectId` to restore the currently open project

#### `apps/ui/src/App.tsx`

- Added `useSettingsSync` hook
- Wait for migration to complete before rendering router (prevents race condition)
- Show loading state while settings are being fetched

#### `apps/ui/src/routes/__root.tsx`

- Removed persist middleware hydration checks (no longer needed)
- Set `setupHydrated` to `true` by default

#### `apps/ui/src/components/views/board-view/worktree-panel/worktree-panel.tsx`

- Changed from localStorage to app store for `worktreePanelCollapsed`

#### `apps/ui/src/components/dialogs/file-browser-dialog.tsx`

- Changed from localStorage to app store for `recentFolders`

#### `apps/ui/src/lib/workspace-config.ts`

- Changed from localStorage to app store for `lastProjectDir`

#### `libs/types/src/settings.ts`

- Added `currentProjectId: string | null` to `GlobalSettings` interface
- Added to `DEFAULT_GLOBAL_SETTINGS`

## Settings Synced to Server

The following fields are synced to the server when they change:

```typescript
const SETTINGS_FIELDS_TO_SYNC = [
  'theme',
  'sidebarOpen',
  'chatHistoryOpen',
  'maxConcurrency',
  'defaultSkipTests',
  'enableDependencyBlocking',
  'skipVerificationInAutoMode',
  'useWorktrees',
  'defaultPlanningMode',
  'defaultRequirePlanApproval',
  'muteDoneSound',
  'enhancementModel',
  'validationModel',
  'phaseModels',
  'enabledCursorModels',
  'cursorDefaultModel',
  'autoLoadClaudeMd',
  'keyboardShortcuts',
  'mcpServers',
  'promptCustomization',
  'projects',
  'trashedProjects',
  'currentProjectId',
  'projectHistory',
  'projectHistoryIndex',
  'lastSelectedSessionByProject',
  'worktreePanelCollapsed',
  'lastProjectDir',
  'recentFolders',
];
```

## Data Flow

### On App Startup

```
1. App mounts
   └── Shows "Loading settings..." screen

2. useSettingsMigration runs
   ├── Waits for API key initialization
   ├── Reads localStorage data (if any)
   ├── Fetches settings from server API
   ├── Merges data (prefers server, uses localStorage for missing arrays)
   ├── Hydrates Zustand store (including currentProject from currentProjectId)
   ├── Syncs merged data back to server (if needed)
   └── Signals completion via waitForMigrationComplete()

3. useSettingsSync initializes
   ├── Waits for migration to complete
   ├── Stores initial state hash
   └── Starts subscribing to store changes

4. Router renders
   ├── Root layout reads currentProject (now properly set)
   └── Navigates to /board if project was open
```

### On Settings Change

```
1. User changes a setting
   └── Zustand store updates

2. useSettingsSync detects change
   ├── Debounces for 1000ms
   └── Syncs to server via API

3. Server writes to settings.json
```

## Migration Logic

When merging localStorage with server data:

1. **Server has data** → Use server data as base
2. **Server missing arrays** (projects, mcpServers, etc.) → Use localStorage arrays
3. **Server missing objects** (lastSelectedSessionByProject) → Use localStorage objects
4. **Simple values** (lastProjectDir, currentProjectId) → Use localStorage if server is empty

## Exported Functions

### `useSettingsMigration()`

Hook that handles initial settings hydration. Returns:

- `checked: boolean` - Whether hydration is complete
- `migrated: boolean` - Whether data was migrated from localStorage
- `error: string | null` - Error message if failed

### `useSettingsSync()`

Hook that handles ongoing sync. Returns:

- `loaded: boolean` - Whether sync is initialized
- `syncing: boolean` - Whether currently syncing
- `error: string | null` - Error message if failed

### `waitForMigrationComplete()`

Returns a Promise that resolves when migration is complete. Used for coordination.

### `forceSyncSettingsToServer()`

Manually triggers an immediate sync to server.

### `refreshSettingsFromServer()`

Fetches latest settings from server and updates store.

## Testing

All 1001 server tests pass after these changes.

## Notes

- **sessionStorage** is still used for session-specific state (splash screen shown, auto-mode state)
- **Terminal layouts** are stored in the app store per-project (not synced to API - considered transient UI state)
- The server's `{DATA_DIR}/settings.json` is the single source of truth
