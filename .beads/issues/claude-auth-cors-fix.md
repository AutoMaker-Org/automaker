---
title: 'Fix: Claude CLI authentication detection + CORS configuration'
status: done
priority: high
category: Infrastructure
labels: [bug, authentication, cors, claude-cli]
created: 2025-12-25T21:20:00Z
updated: 2025-12-25T21:20:00Z
---

## Summary

Fixed Claude CLI authentication detection and CORS configuration issues that prevented the DevFlow UI from recognizing authenticated Claude CLI installations.

## Problems Fixed

### 1. Authentication Detection Bug

**Issue**: Server did not support Claude CLI 2.x credential format

**Details**:

- Claude CLI 2.x stores OAuth tokens in a nested structure: `claudeAiOauth.accessToken`
- Old code only checked for root-level `oauth_token` or `access_token` fields
- Result: Authenticated users appeared as "Not Installed"

**Files Modified**:

- `apps/server/src/routes/setup/get-claude-status.ts:158`

**Fix Applied**:

```typescript
// Before (broken):
if (credentials.oauth_token || credentials.access_token)

// After (fixed):
if (credentials.claudeAiOauth?.accessToken || credentials.oauth_token || credentials.access_token)
```

### 2. CORS Configuration Issue

**Issue**: UI could not communicate with backend API due to incorrect CORS origin

**Details**:

- UI runs on `http://localhost:3007`
- Server only allowed CORS from `http://localhost:3008`
- Result: Browser blocked all API requests with CORS errors

**Files Modified**:

- `apps/server/src/index.ts:15,58-60` - Added path import and dotenv configuration
- `.env` (created) - Set `CORS_ORIGIN=http://localhost:3007`

**Fix Applied**:

```typescript
// Added import
import path from 'path';

// Updated dotenv loading
const projectRoot = process.env.INIT_CWD || process.cwd();
dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config(); // Fallback to default behavior
```

## Changes

### Modified Files

1. **apps/server/src/routes/setup/get-claude-status.ts**
   - Line 158: Added support for `claudeAiOauth?.accessToken`
   - Maintains backward compatibility with old credential format

2. **apps/server/src/index.ts**
   - Line 15: Added `import path from 'path'`
   - Lines 58-60: Load .env from project root for CORS configuration

### Created Files

1. **.env** (project root)

   ```
   CORS_ORIGIN=http://localhost:3007
   ```

   - Not committed to git (in .gitignore)
   - Required for web mode development

2. **docs/fixes/claude-authentication-cors-fix.md**
   - Comprehensive documentation
   - Troubleshooting steps
   - Deployment notes

## Results

### Before Fix

```
Claude CLI: Not Installed ❌
API Key: Not Set ❌
Browser Console: CORS errors ❌
```

### After Fix

```
Claude CLI: Verified ✅ (version 2.0.76)
Authentication Method: OAuth Token ✅
Path: /home/oxtsotsi/.local/bin/claude ✅
Browser Console: No errors ✅
```

## Verification Steps

1. Check Claude CLI version: `claude --version` → should show 2.0.76
2. Verify credentials: `cat ~/.claude/.credentials.json` → should show `claudeAiOauth`
3. Check server logs: Should see `[CORS] ✓ Origin set to: http://localhost:3007`
4. Check browser console: Should see successful API calls, no CORS errors
5. Check UI Settings: Should show "Verified" status for Claude CLI

## Deployment Notes

For developers experiencing similar issues:

1. Ensure `.env` file exists in project root with `CORS_ORIGIN=http://localhost:3007`
2. Restart server after changes: `npm run dev:server`
3. Hard refresh browser: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
4. Check server logs for CORS configuration confirmation

## Related Documentation

See `docs/fixes/claude-authentication-cors-fix.md` for detailed technical documentation, including:

- Root cause analysis
- Code examples
- Troubleshooting guide
- Future improvement suggestions
