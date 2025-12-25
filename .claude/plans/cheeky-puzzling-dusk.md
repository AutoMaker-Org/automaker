# Fix Claude Authentication Detection + CORS Configuration

## Issues Found

### 1. ✅ FIXED: Authentication Detection Bug

**Status**: Fixed in [get-claude-status.ts:158](apps/server/src/routes/setup/get-claude-status.ts#L158)

The credential detection code now supports the new Claude CLI 2.x credentials format:

- Old format: `oauth_token` or `access_token` at root level
- New format: `claudeAiOauth.accessToken` (nested structure)

### 2. ❌ BLOCKER: CORS Configuration

**Status**: **NEEDS FIX**

**Problem**: The UI runs on `http://localhost:3007` but the server only allows CORS from `http://localhost:3008`.

**Error from browser console**:

```
Access to fetch at 'http://localhost:3008/api/health' from origin 'http://localhost:3007'
has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header has a value
'http://localhost:3008' that is not equal to the supplied origin.
```

**Root Cause**: In [index.ts:105-106](apps/server/src/index.ts#L105-L106), when `CORS_ORIGIN` is not set, it defaults to `http://localhost:3008` instead of `http://localhost:3007` where the UI actually runs.

## Solution

### Fix CORS Configuration

**Option 1: Update .env file (Recommended)**
Add to `.env`:

```
CORS_ORIGIN=http://localhost:3007
```

**Option 2: Update default in code**
Change [index.ts:106](apps/server/src/index.ts#L106) to default to port 3007:

```typescript
return 'http://localhost:3007';
```

**Option 3: Use wildcard for development**
Set in `.env`:

```
CORS_ORIGIN=*
```

### Testing Plan

1. Apply CORS fix (add `CORS_ORIGIN=http://localhost:3007` to `.env`)
2. Restart the server:
   ```bash
   pkill -f "tsx watch"
   npm run dev:server
   ```
3. Refresh the browser (Ctrl+Shift+R or Cmd+Shift+R)
4. Check browser console - should see:
   - ✅ `[HttpApiClient] WebSocket connected`
   - ✅ No CORS errors
   - ✅ API calls succeeding
5. Navigate to Settings > Claude Setup - should see:
   - ✅ **Claude CLI**: "Verified" (green badge)
   - ✅ Shows CLI version: "2.0.76"
   - ✅ Shows authentication method

## Files to Modify

1. **Create `.env` file** in project root with:
   ```
   CORS_ORIGIN=http://localhost:3007
   ```

OR

2. **Edit `apps/server/src/index.ts`** line 106 to change default

## Verification

After fix, browser console should show:

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
    ...
  }
}
```

And UI should display:

- **Claude CLI**: ✅ Verified (green badge)
- **Version**: 2.0.76
- **Authentication Method**: OAuth Token
