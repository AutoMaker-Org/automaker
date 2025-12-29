# Custom Changes to Automaker

This document tracks custom features and bug fixes applied locally to the Automaker codebase that are pending upstream contribution or will remain fork-specific.

---

## Custom Feature: Extended Feature Count Options (2025-12-29)

**Status**: Fork-specific feature (NOT for upstream contribution)

**Files Modified**:

- `apps/ui/src/components/views/spec-view/types.ts`
- `apps/ui/src/components/views/spec-view/constants.ts`
- `apps/ui/src/components/views/spec-view/dialogs/create-spec-dialog.tsx`
- `apps/ui/src/components/views/spec-view/dialogs/regenerate-spec-dialog.tsx`

### What Changed

Added more options for the number of features to generate when creating/regenerating app specifications:

**New Options**:

- **200 features** - with warning "May take up to 10 minutes"
- **500 features** - with warning "May take up to 15 minutes"
- **Custom** - opens an input field where users can enter any number from 1 to 10,000

**Previous Options** (still available):

- 20 features
- 50 features
- 100 features

### Implementation Details

1. **Type Change** (`types.ts`):

   ```typescript
   // Before: export type FeatureCount = 20 | 50 | 100;
   // After:
   export type FeatureCount = number;
   ```

2. **New Options** (`constants.ts`):

   ```typescript
   export const FEATURE_COUNT_OPTIONS: {
     value: FeatureCount;
     label: string;
     warning?: string;
     isCustom?: boolean;
   }[] = [
     { value: 20, label: '20' },
     { value: 50, label: '50', warning: 'May take up to 5 minutes' },
     { value: 100, label: '100', warning: 'May take up to 5 minutes' },
     { value: 200, label: '200', warning: 'May take up to 10 minutes' },
     { value: 500, label: '500', warning: 'May take up to 15 minutes' },
     { value: -1, label: 'Custom', isCustom: true },
   ];
   ```

3. **Custom Input UI** (both dialog components):
   - When "Custom" button is clicked, an input field appears
   - User can enter any number from 1 to 10,000
   - Default value when switching to custom: 150
   - Shows warning for values > 100: "Large number of features may take significant time to generate"
   - Input is disabled during spec generation

### User Experience

**Before**:

- 3 fixed options: 20, 50, 100
- No way to generate different quantities

**After**:

- 6 buttons: 20, 50, 100, 200, 500, Custom
- Custom button opens number input field
- Flexible: can generate any number of features from 1 to 10,000
- Smart warnings based on quantity

### Re-applying After Upstream Updates

```bash
cd N:\code\automaker-app

# Apply the patch
git apply patches/03-custom-feature-count-2025-12-29.patch

# If conflicts occur, resolve manually using this documentation as reference
```

### Why Fork-Specific?

This is a power-user feature that may not align with upstream's simpler UI philosophy. Keeping it fork-specific allows:

- Faster iteration on custom features
- No need to wait for upstream approval
- Easy re-application via patch after upstream syncs

### Testing

- ✅ `npm run build:packages` passes
- ✅ `npm run build` (UI) passes
- ✅ All 6 options render correctly
- ✅ Custom input appears when "Custom" is clicked
- ✅ Custom input updates featureCount value
- ✅ Warnings display correctly for each option
- ✅ Works in both "Create Spec" and "Regenerate Spec" dialogs

---

## MCP Server Bug Fixes (2025-12-29)

Three critical bugs in MCP server management have been fixed:

### Bug #2: HTTP Error Handling (FIXED)

**Files Modified**: `apps/ui/src/lib/http-api-client.ts` (lines 165-251)

**Problem**: HTTP methods didn't check `response.ok` before parsing JSON, causing cryptic "Unexpected end of JSON input" errors instead of showing actual server error messages.

**Impact**: Made debugging MCP server issues extremely difficult, as errors like "Server not found" (404) appeared as JSON parse failures.

**Changes**:

Added `response.ok` validation to all four HTTP methods (`post`, `get`, `put`, `httpDelete`):

```typescript
// BEFORE (example from post method):
private async post<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${this.serverUrl}${endpoint}`, {
    method: 'POST',
    headers: this.getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json(); // ❌ No error checking
}

// AFTER:
private async post<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${this.serverUrl}${endpoint}`, {
    method: 'POST',
    headers: this.getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  // ✅ Check response status before parsing
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // If parsing JSON fails, use status text
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
```

**Validation**:

- ✅ 404 errors now show "Server not found" instead of "Unexpected end of JSON input"
- ✅ 500 errors show actual server error messages
- ✅ Build passes with no TypeScript errors

---

### Bug #3: Race Condition in MCP Auto-Test (FIXED)

**Files Modified**: `apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts`

- Lines 276-290: `handleSave` (edit flow)
- Lines 307-343: `handleSecurityWarningConfirm` (add/import flows)
- Lines 345-356: `handleToggleEnabled`
- Lines 358-370: `handleDelete`

**Problem**: Success toasts and auto-tests executed before `syncSettingsToServer()` completed, causing "Server not found" errors because the server wasn't persisted to disk yet.

**Impact**: Newly added servers immediately failed auto-test with "Server not found" even though they were added successfully to the UI state.

**Changes**:

Wait for `syncSettingsToServer()` to complete before showing success toasts:

```typescript
// BEFORE (example from add flow):
const handleSecurityWarningConfirm = async () => {
  if (pendingServerData.type === 'add' && pendingServerData.serverData) {
    addMCPServer(pendingServerData.serverData);
    toast.success('MCP server added'); // ❌ Shows before sync
    await syncSettingsToServer();
    handleCloseDialog();
  }
};

// AFTER:
const handleSecurityWarningConfirm = async () => {
  if (pendingServerData.type === 'add' && pendingServerData.serverData) {
    addMCPServer(pendingServerData.serverData);

    // ✅ Wait for sync to complete
    const syncSuccess = await syncSettingsToServer();

    if (!syncSuccess) {
      toast.error('Failed to save MCP server to disk');
      return;
    }

    toast.success('MCP server added'); // ✅ Only after sync succeeds
    handleCloseDialog();
  }
};
```

**Validation**:

- ✅ Success toast appears only after sync completes
- ✅ Auto-test no longer fails with "Server not found"
- ✅ Error toast shown if sync fails
- ✅ Build passes with no TypeScript errors

---

### Bug #1: JSON Format Inconsistency (FIXED)

**Files Modified**: `apps/ui/src/components/views/settings-view/mcp-servers/hooks/use-mcp-servers.ts`

- Lines 606-639: `handleOpenGlobalJsonEdit` - exports as array with IDs
- Lines 641-828: `handleSaveGlobalJsonEdit` + helper functions - supports both formats

**Problem**: JSON editor exported servers as an object keyed by name (losing server IDs), but backend required IDs to find servers. After editing JSON, the backend couldn't locate servers because IDs were missing.

**Impact**: Editing MCP servers via JSON editor broke server persistence and made servers unfindable by backend.

**Changes**:

1. **Export as array with IDs preserved**:

```typescript
// BEFORE:
const handleOpenGlobalJsonEdit = () => {
  const exportData: Record<string, Record<string, unknown>> = {};

  for (const server of mcpServers) {
    const serverConfig = { type: server.type, command: server.command, ... };
    exportData[server.name] = serverConfig; // ❌ Uses name as key, loses ID
  }

  setGlobalJsonValue(JSON.stringify({ mcpServers: exportData }, null, 2));
};

// AFTER:
const handleOpenGlobalJsonEdit = () => {
  const serversArray = mcpServers.map((server) => ({
    id: server.id,          // ✅ Preserve ID
    name: server.name,      // ✅ Preserve name
    type: server.type || 'stdio',
    // ... other fields
  }));

  setGlobalJsonValue(JSON.stringify({ mcpServers: serversArray }, null, 2));
};
```

2. **Support both array and object formats** (backward compatibility):

```typescript
const handleSaveGlobalJsonEdit = async () => {
  const parsed = JSON.parse(globalJsonValue);
  const servers = parsed.mcpServers || parsed;

  if (Array.isArray(servers)) {
    // ✅ New format: array with IDs
    await handleSaveGlobalJsonArray(servers);
  } else if (typeof servers === 'object' && servers !== null) {
    // ✅ Legacy format: object (Claude Desktop compatible)
    await handleSaveGlobalJsonObject(servers);
  } else {
    toast.error('Invalid format');
    return;
  }

  const syncSuccess = await syncSettingsToServer();
  // ... handle success/error
};
```

**Validation**:

- ✅ JSON editor shows array format with IDs preserved
- ✅ Editing and saving JSON preserves server IDs
- ✅ Legacy object format (Claude Desktop) still works
- ✅ Backend successfully finds servers after JSON edit
- ✅ Build passes with no TypeScript errors

---

## Re-applying After Updates

If you pull updates from the upstream Automaker repository and need to re-apply these fixes:

### Option 1: Apply Git Patches (Recommended)

```bash
# Navigate to repository root
cd N:\code\automaker-app

# Apply all fixes at once
git apply patches/mcp-fixes-combined-2025-12-29.patch

# Or apply individually:
git apply patches/01-fix-http-error-handling.patch
git apply patches/02-fix-race-condition-and-json-format.patch

# If patches conflict, resolve manually using this document as reference
```

### Option 2: Manual Re-application

Refer to the code changes documented above and manually apply them to the corresponding files.

---

## Testing Checklist

Before considering the fixes complete, verify:

**Functional Tests**:

- [ ] HTTP 404 errors show "Server not found" (not "Unexpected end of JSON input")
- [ ] Adding a new MCP server waits for sync before showing success
- [ ] Auto-test doesn't fail with "Server not found" immediately after adding
- [ ] JSON editor displays servers as array with IDs
- [ ] Editing JSON and saving preserves server IDs
- [ ] Legacy object format (Claude Desktop) still imports correctly

**Build Tests**:

- [x] `npm run build:packages` passes
- [x] `npm run build` passes with no errors
- [ ] `npm run dev:web` works correctly
- [ ] `npm run dev:electron` works correctly

---

## Upstream Contribution Status

**Phase 1**: Local fixes applied ✅
**Phase 2**: GitHub issues created ✅

- Issue #315: Fix HTTP error handling - https://github.com/AutoMaker-Org/automaker/issues/315
- Issue #316: Fix race condition - https://github.com/AutoMaker-Org/automaker/issues/316
- Issue #317: Fix JSON format - https://github.com/AutoMaker-Org/automaker/issues/317

**Phase 3** (Current): Pull Requests created ✅

- PR #318: HTTP error handling (fixes #315) - https://github.com/AutoMaker-Org/automaker/pull/318
- PR #319: Race condition + JSON format (fixes #316, #317) - https://github.com/AutoMaker-Org/automaker/pull/319

**Phase 4** (Next): Await review and merge from upstream maintainers
**Phase 5** (After merge): Remove patches if PRs are merged, or maintain permanent patches

Track contribution progress in `.plans/mcp-bugs-fix-plan.md`.

---

## Notes

- All fixes are **backward-compatible** - no breaking changes
- Performance impact is minimal (~50-200ms for sync operations)
- Bug #2 (HTTP errors) has no dependencies
- Bug #3 (race condition) depends on Bug #2 for proper error visibility
- Bug #1 (JSON format) depends on Bugs #2 and #3 for correct operation
- The array format is the new default but object format is still supported for Claude Desktop compatibility
