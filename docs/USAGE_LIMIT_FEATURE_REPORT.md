# Usage Limit Feature - Comprehensive Report

## Overview

The Usage Limit Feature provides a graceful user experience when Claude Code usage limits are reached during Auto Mode operation. Instead of repeatedly failing and showing generic errors, the system now:

1. **Detects usage limits proactively** - Checks limits before starting Auto Mode
2. **Shows a user-friendly dialog** - Displays a clear message with options to schedule resume
3. **Automatically resumes** - Can automatically restart Auto Mode when the scheduled time arrives

## Architecture

### Components

#### Backend (`apps/server/src/services/`)

1. **`auto-mode-service.ts`**
   - **`startAutoLoop()`**: Checks usage limits BEFORE starting the auto loop
   - **`signalShouldPause()`**: Fetches usage data when pausing due to quota/rate limits
   - **`trackFailureAndCheckPause()`**: Detects ambiguous CLI exits as potential quota issues

2. **`claude-usage-service.ts`**
   - Executes `claude /usage` CLI command
   - Parses usage percentages and reset times
   - Handles both Mac (expect script) and Windows (node-pty) platforms

3. **`libs/utils/src/error-handler.ts`**
   - **`isAmbiguousCLIExit()`**: Detects generic CLI exit errors that may indicate quota issues
   - **`classifyError()`**: Classifies errors including `quota_exhausted` and `rate_limit`

#### Frontend (`apps/ui/src/`)

1. **`components/views/board-view.tsx`**
   - Checks usage limits when Auto Mode toggle is enabled
   - Prevents starting features if already at limit

2. **`components/dialogs/auto-mode-resume-dialog.tsx`**
   - Modal dialog for scheduling resume
   - Shows current usage and reset times
   - Provides quick duration options and custom input

3. **`hooks/use-auto-mode.ts`**
   - Listens for `auto_mode_paused_failures` event
   - Opens pause dialog when limits are hit
   - Handles `rate_limit` and `quota_exhausted` error types

4. **`hooks/use-auto-mode-scheduler.ts`**
   - Manages scheduled resume times
   - Automatically starts Auto Mode when scheduled time arrives
   - Persists schedules across app restarts

5. **`store/app-store.ts`**
   - Stores `autoModeResumeByProject` (persisted)
   - Manages `autoModePauseDialogOpen` state
   - Actions: `setAutoModeResumeSchedule`, `openAutoModePauseDialog`, etc.

6. **`components/views/board-view/board-header.tsx`**
   - Displays scheduled resume indicator
   - Shows countdown until resume time

## User Flow

### Scenario 1: User Enables Auto Mode While Already at Limit

1. **User Action**: Toggles Auto Mode ON
2. **System Check**:
   - Backend `startAutoLoop()` checks usage via `ClaudeUsageService`
   - If `sessionPercentage >= 100` OR `weeklyPercentage >= 100`:
     - Emits `auto_mode_paused_failures` event
     - Does NOT start the auto loop
3. **UI Response**:
   - `useAutoMode` hook receives event
   - Sets `autoModeRunning` to `false`
   - Opens `AutoModeResumeDialog`
4. **User Options**:
   - Select quick duration (15m, 30m, 1h, 1h 30m, 2h)
   - Enter custom minutes
   - Click "Resume at reset" (uses `sessionResetTime` or `weeklyResetTime`)
   - Click "Keep Paused" (closes dialog, no schedule)
5. **Scheduling**:
   - If user schedules resume:
     - `setAutoModeResumeSchedule()` stores schedule in Zustand (persisted)
     - `useAutoModeScheduler` hook sets up `setTimeout` to resume at scheduled time
   - If user clicks "Keep Paused":
     - Dialog closes, no schedule created

### Scenario 2: User Hits Limit During Auto Mode Operation

1. **During Operation**: Auto Mode is running features
2. **Error Occurs**:
   - Feature execution fails with:
     - Explicit `quota_exhausted` error
     - Explicit `rate_limit` error
     - Ambiguous CLI exit (`isAmbiguousCLIExit()` detects it)
3. **Failure Tracking**:
   - `trackFailureAndCheckPause()` records failure
   - After 2 consecutive failures (or single quota/rate limit):
     - Calls `signalShouldPause()`
4. **Usage Check**:
   - `signalShouldPause()` fetches current usage data
   - Determines `suggestedResumeAt`:
     - If `sessionPercentage >= 100`: uses `sessionResetTime`
     - Else if `weeklyPercentage >= 100`: uses `weeklyResetTime`
5. **Pause Event**:
   - Emits `auto_mode_paused_failures` event with:
     - `suggestedResumeAt`: ISO timestamp
     - `lastKnownUsage`: Full usage data
     - `errorType`: `quota_exhausted` or `rate_limit`
6. **UI Response**: Same as Scenario 1 (opens dialog)

### Scenario 3: Scheduled Resume

1. **Schedule Created**: User scheduled resume for future time
2. **Persistence**: Schedule stored in `autoModeResumeByProject[projectId]`
3. **On App Load/Project Change**:
   - `useAutoModeScheduler` hook checks for scheduled resume
   - If `resumeAt` is in past: immediately calls `autoMode.start()`
   - If `resumeAt` is in future: sets `setTimeout` to call `autoMode.start()` at that time
4. **Auto Resume**:
   - When scheduled time arrives:
     - `autoMode.start()` is called
     - Auto Mode begins processing features
     - Schedule is cleared

## Data Flow

### Usage Data Structure

```typescript
interface ClaudeUsage {
  sessionPercentage: number; // 0-100, usage for current session
  weeklyPercentage: number; // 0-100, usage for current week
  sonnetWeeklyPercentage: number; // 0-100, Sonnet-specific weekly usage
  sessionResetTime?: string; // ISO timestamp when session resets
  weeklyResetTime?: string; // ISO timestamp when weekly limit resets
  sessionTokensUsed: number;
  sessionLimit: number;
  costUsed: number | null;
  costLimit: number | null;
  costCurrency: string | null;
  sessionResetText: string; // Human-readable reset time
  weeklyResetText: string; // Human-readable reset time
  userTimezone: string;
}
```

### Schedule Data Structure

```typescript
interface AutoModeResumeSchedule {
  resumeAt: string; // ISO timestamp when to resume
  reason?: string; // 'usage_reset' | 'manual_schedule'
  scheduledAt: string; // ISO timestamp when scheduled
  lastKnownUsage?: ClaudeUsage; // Usage data at time of scheduling
}
```

### Event Structure

```typescript
type AutoModeEvent =
  | {
      type: 'auto_mode_paused_failures';
      message: string;
      errorType: string;             // 'quota_exhausted' | 'rate_limit' | 'execution'
      originalError: string;
      failureCount: number;
      projectPath?: string;
      suggestedResumeAt?: string;    // ISO timestamp
      lastKnownUsage?: ClaudeUsage;
    }
  | {
      type: 'auto_mode_error';
      error: string;
      errorType?: 'rate_limit' | 'quota_exhausted' | ...;
      // ...
    }
  // ... other event types
```

## Error Detection

### Explicit Errors

1. **Quota Exhausted**:
   - Error message contains: `overloaded`, `limit reached`, `quota exceeded`, `credit balance`, etc.
   - Classified by `isQuotaExhaustedError()`

2. **Rate Limit**:
   - HTTP 429 status code
   - Error message contains: `rate_limit`, `429`
   - Classified by `isRateLimitError()`

### Ambiguous Errors

**Problem**: Sometimes the Claude Code CLI exits with a generic error (`Claude Code process exited with code 1`) that doesn't explicitly indicate quota issues, but often occurs when quota is exhausted.

**Solution**: `isAmbiguousCLIExit()` detects these patterns:

- `"Claude Code process exited with code 1"`
- `"process exited"`
- `"exited with code"`
- `"exit code 1"`

When detected during consecutive failures, the system treats it as a potential quota issue and checks usage data.

## Key Features

### 1. Proactive Limit Checking

- **Before Starting**: Checks limits before starting Auto Mode loop
- **Prevents Waste**: Avoids attempting to start features that will fail
- **Immediate Feedback**: Shows dialog immediately instead of after failures

### 2. Smart Resume Time Suggestion

- **Session Reset**: If session limit hit, suggests session reset time
- **Weekly Reset**: If weekly limit hit, suggests weekly reset time
- **Priority**: Session reset time takes priority if both limits hit
- **Fallback**: If no reset time available, user can still schedule manually

### 3. Flexible Scheduling

- **Quick Options**: 15m, 30m, 1h, 1h 30m, 2h buttons
- **Custom Duration**: User can enter any number of minutes
- **Reset Time**: One-click "Resume at reset" button
- **Preview**: Shows exact resume time before confirming

### 4. Persistent Scheduling

- **Survives Restarts**: Schedules stored in Zustand persisted storage
- **Per Project**: Each project can have its own schedule
- **Auto Resume**: Automatically resumes when scheduled time arrives
- **Cancellable**: User can cancel scheduled resume from board header

### 5. Visual Feedback

- **Scheduled Indicator**: Shows in board header when resume is scheduled
- **Countdown**: Displays time until resume (e.g., "Resume at 3:00 PM (2h 15m from now)")
- **Tooltip**: Hover shows full details
- **Cancel Button**: Easy way to cancel scheduled resume

## Testing

### Test Coverage

1. **Backend Tests** (`apps/server/tests/unit/services/auto-mode-service-usage-limit.test.ts`):
   - Usage check before starting loop
   - Pause event emission when limits reached
   - Suggested resume time calculation
   - Priority of session vs weekly reset times
   - Graceful degradation when usage check fails

2. **Utility Tests** (`libs/utils/tests/error-handler.test.ts`):
   - `isAmbiguousCLIExit()` detection
   - Various error message patterns
   - Edge cases (null, undefined, non-Error values)

### Manual Testing Scenarios

1. **Enable Auto Mode at Limit**:
   - Set usage to 100% (mock or real)
   - Toggle Auto Mode ON
   - Verify dialog appears immediately
   - Verify no features are started

2. **Hit Limit During Operation**:
   - Start Auto Mode with features in backlog
   - Let it run until limit is hit
   - Verify dialog appears after failures
   - Verify suggested resume time is shown

3. **Schedule Resume**:
   - Schedule resume for 15 minutes
   - Verify indicator appears in header
   - Wait for scheduled time (or advance system clock)
   - Verify Auto Mode resumes automatically

4. **Cancel Scheduled Resume**:
   - Schedule a resume
   - Click cancel button in header
   - Verify schedule is cleared
   - Verify indicator disappears

5. **Resume at Reset Time**:
   - Hit limit
   - Click "Resume at reset"
   - Verify schedule uses reset time from usage data
   - Verify indicator shows correct time

## Edge Cases Handled

1. **CLI Not Available**:
   - System continues normally if CLI check fails
   - No blocking behavior

2. **Usage Check Fails**:
   - Backend: Continues starting loop (graceful degradation)
   - Frontend: Continues normal operation

3. **No Reset Time Available**:
   - User can still schedule manually
   - Dialog shows custom input options

4. **Multiple Projects**:
   - Each project has independent schedule
   - Switching projects shows correct schedule state

5. **App Restart**:
   - Schedules persist via Zustand
   - Auto resume works after restart

6. **Scheduled Time in Past**:
   - Immediately resumes when detected
   - No waiting required

## Performance Considerations

1. **Usage Check Frequency**:
   - Only checked when:
     - Auto Mode is started
     - Pausing due to failures
   - Not checked on every loop iteration

2. **CLI Command**:
   - Uses timeout (30 seconds)
   - Non-blocking (doesn't prevent Auto Mode if check fails)

3. **State Management**:
   - Schedules stored in persisted Zustand
   - Minimal re-renders (only when schedule changes)

## Future Enhancements

1. **Periodic Usage Checks**:
   - Check usage periodically during operation
   - Proactively pause before hitting limit

2. **Usage Prediction**:
   - Estimate when limit will be hit based on current rate
   - Warn user before limit is reached

3. **Multiple Schedule Types**:
   - Daily schedules
   - Weekly schedules
   - Custom recurring schedules

4. **Usage Analytics**:
   - Track usage patterns
   - Suggest optimal scheduling times

5. **Notifications**:
   - Desktop notifications when limit is hit
   - Notifications when scheduled resume occurs

## Troubleshooting

### Dialog Doesn't Appear

1. Check browser console for errors
2. Verify `auto_mode_paused_failures` event is being emitted
3. Check `useAutoMode` hook is listening to events
4. Verify `openAutoModePauseDialog` is being called

### Schedule Not Persisting

1. Check Zustand persistence is configured
2. Verify `autoModeResumeByProject` is in `partialize`
3. Check browser storage (localStorage/sessionStorage)

### Auto Resume Not Working

1. Check `useAutoModeScheduler` hook is mounted
2. Verify `resumeAt` timestamp is valid
3. Check `autoMode.start()` is available
4. Verify no errors in console

### Usage Check Fails

1. Verify Claude CLI is installed and authenticated
2. Check `claude /usage` command works in terminal
3. Verify platform-specific implementation (Mac vs Windows)
4. Check timeout settings (30 seconds default)

## Conclusion

The Usage Limit Feature provides a seamless experience for users when hitting Claude Code usage limits. It combines proactive checking, user-friendly dialogs, flexible scheduling, and automatic resumption to minimize disruption to the development workflow.

The implementation is robust, handles edge cases gracefully, and provides clear visual feedback throughout the process. The feature is fully tested and ready for production use.
