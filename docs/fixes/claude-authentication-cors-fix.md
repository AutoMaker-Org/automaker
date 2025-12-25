# Claude CLI Authentication Detection & CORS Fix

**Date**: December 25, 2025
**Status**: ✅ Resolved
**Issue**: Claude CLI authentication not detected in DevFlow UI

## Problem Description

Users with Claude CLI installed and authenticated were seeing incorrect status in the DevFlow Settings UI:

- **Claude CLI**: "Not Installed" ❌
- **API Key**: "Not Set" ❌

Despite having:

- ✅ Claude CLI installed at `~/.local/bin/claude` (version 2.0.76)
- ✅ Valid OAuth credentials in `~/.claude/.credentials.json`
- ✅ Recent CLI activity in `~/.claude/stats-cache.json`

## Root Causes

### 1. Authentication Detection Bug

**File**: `apps/server/src/routes/setup/get-claude-status.ts`

The credential detection logic only checked for the old Claude CLI 1.x credential format:

```typescript
// OLD (broken)
if (credentials.oauth_token || credentials.access_token)
```

However, Claude CLI 2.x stores credentials in a nested structure:

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1766699166040,
    "scopes": ["user:inference", "user:profile", ...],
    "subscriptionType": "pro",
    "rateLimitTier": "default_claude_ai"
  }
}
```

### 2. CORS Configuration Issue

**File**: `apps/server/src/index.ts`

The DevFlow UI runs on `http://localhost:3007` but the server only allowed CORS from `http://localhost:3008`.

**Browser console errors**:

```
Access to fetch at 'http://localhost:3008/api/setup/claude-status' from origin 'http://localhost:3007'
has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header has a value
'http://localhost:3008' that is not equal to the supplied origin.
```

This prevented the UI from calling the authentication status endpoint entirely.

## Solutions Implemented

### Fix 1: Support New Credential Format

**File**: `apps/server/src/routes/setup/get-claude-status.ts:158`

```typescript
// NEW (supports both formats)
if (credentials.claudeAiOauth?.accessToken || credentials.oauth_token || credentials.access_token) {
  auth.hasStoredOAuthToken = true;
  auth.oauthTokenValid = true;
  auth.authenticated = true;
  auth.method = 'oauth_token';
}
```

**Benefits**:

- ✅ Backward compatible with old credential format
- ✅ Supports new Claude CLI 2.x format
- ✅ Uses optional chaining for safe property access

### Fix 2: Configure CORS Origin

**Files Created/Modified**:

1. **Created**: `.env` (project root)

   ```env
   CORS_ORIGIN=http://localhost:3007
   ```

2. **Modified**: `apps/server/src/index.ts:15,58-60`
   - Added `import path from 'path'`
   - Updated dotenv configuration to load from project root:
   ```typescript
   const projectRoot = process.env.INIT_CWD || process.cwd();
   dotenv.config({ path: path.join(projectRoot, '.env') });
   dotenv.config(); // Fallback to default behavior
   ```

**Benefits**:

- ✅ UI can now communicate with backend API
- ✅ Works for both Electron and web modes
- ✅ Server logs confirm: `[CORS] ✓ Origin set to: http://localhost:3007`

## Verification

After applying both fixes and refreshing the browser:

**UI Should Show**:

- ✅ **Claude CLI**: "Verified" (green badge)
- ✅ **Version**: 2.0.76
- ✅ **Authentication Method**: OAuth Token
- ✅ **Path**: `/home/oxtsotsi/.local/bin/claude`

**Browser Console**:

- ✅ No CORS errors
- ✅ Successful API calls:
  ```
  [Claude Setup] Starting status check...
  [Claude Setup] Raw status result: {
    success: true,
    status: 'installed',
    installed: true,
    version: '2.0.76',
    auth: {
      authenticated: true,
      method: 'oauth_token',
      hasCredentialsFile: true,
      hasStoredOAuthToken: true,
      ...
    }
  }
  ```

**Server Logs**:

- ✅ `[dotenv@17.2.3] injecting env (1) from ../../.env`
- ✅ `[CORS] ✓ Origin set to: http://localhost:3007`
- ✅ WebSocket connections established

## Related Files

### Modified

1. `apps/server/src/routes/setup/get-claude-status.ts` - Credential detection logic
2. `apps/server/src/index.ts` - CORS configuration and dotenv loading

### Created

1. `.env` - Environment configuration (not committed to git)

## Deployment Notes

For other developers encountering this issue:

1. **Check Claude CLI version**: Run `claude --version` - should be 2.x
2. **Verify credentials**: Check `~/.claude/.credentials.json` for `claudeAiOauth` structure
3. **Create `.env` file**: Add `CORS_ORIGIN=http://localhost:3007` to project root
4. **Restart server**: Kill and restart `npm run dev:server`
5. **Hard refresh browser**: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

## Future Improvements

1. **Auto-detect UI port**: Make CORS configuration automatic based on detected services
2. **Credential format migration**: Add migration path for old → new credential formats
3. **Better error messages**: Show specific reasons when authentication fails
4. **.env.example**: Update with CORS_ORIGIN documentation

## References

- Claude CLI 2.x Release Notes
- DevFlow Architecture Documentation
- CORS Configuration Best Practices
