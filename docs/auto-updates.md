# Auto-Updates

Automaker includes a built-in auto-update system that checks for and installs updates from an upstream repository.

## Features

- **Automatic Checking** - Periodic background checks for new versions
- **Toast Notifications** - Non-intrusive notifications when updates are available
- **One-Click Updates** - Pull updates directly from the UI
- **Restart Prompts** - Option to restart immediately or later after updates

## Configuration

Access update settings in **Settings > Updates**:

| Setting                        | Description                       | Default                                          |
| ------------------------------ | --------------------------------- | ------------------------------------------------ |
| Enable automatic update checks | Toggle periodic checking          | `true`                                           |
| Check interval                 | How often to check (1-60 minutes) | `15`                                             |
| Upstream repository URL        | Source repository for updates     | `https://github.com/AutoMaker-Org/automaker.git` |

## Architecture

The update system is designed with **dependency injection** in mind, making it easy to swap the update mechanism (e.g., from git-based to GitHub releases).

### Component Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                         UI Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  UpdatesSection          │  UpdateNotifier                      │
│  (Settings UI)           │  (Toast notifications)               │
│                          │                                      │
│  - Display current       │  - Subscribe to store                │
│    version info          │  - Show "Update Available" toast     │
│  - Manual check/update   │  - Show "Update Installed" toast     │
│    buttons               │  - Handle "Update Now" clicks        │
└──────────────┬───────────┴──────────────┬───────────────────────┘
               │                          │
               ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Updates Store (Zustand)                    │
├─────────────────────────────────────────────────────────────────┤
│  State:                  │  Actions:                            │
│  - info                  │  - fetchInfo()                       │
│  - updateAvailable       │  - checkForUpdates()                 │
│  - remoteVersion         │  - pullUpdates()                     │
│  - isChecking/isPulling  │  - clearError()                      │
│  - error                 │  - reset()                           │
│  - lastChecked           │                                      │
├─────────────────────────────────────────────────────────────────┤
│  Injected Dependencies:                                         │
│  - IUpdatesApiClient     (how to fetch/check/pull)              │
│  - IUpdateEventEmitter   (how to notify other components)       │
└──────────────┬───────────────────────────┬──────────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────┐  ┌───────────────────────────────────┐
│   useUpdatePolling()     │  │        Server API                 │
│   (Polling Hook)         │  │   /api/updates/*                  │
├──────────────────────────┤  ├───────────────────────────────────┤
│  - Respects settings     │  │  GET  /info   - Installation info │
│  - Interval-based        │  │  GET  /check  - Check for updates │
│  - Pauses when disabled  │  │  POST /pull   - Pull updates      │
└──────────────────────────┘  └───────────────────────────────────┘
```

### Key Files

| File                                                                     | Purpose                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------- |
| `libs/types/src/updates.ts`                                              | Type definitions (abstract, mechanism-agnostic) |
| `apps/ui/src/store/updates-store.ts`                                     | Zustand store with DI interfaces                |
| `apps/ui/src/hooks/use-update-polling.ts`                                | Polling logic (when to check)                   |
| `apps/ui/src/components/updates/update-notifier.tsx`                     | Toast notifications                             |
| `apps/ui/src/components/views/settings-view/updates/updates-section.tsx` | Settings UI                                     |
| `apps/server/src/routes/updates/`                                        | Server-side update logic                        |

## Swapping the Update Mechanism

The update system uses **interface-based dependency injection** to allow swapping the update mechanism without changing UI code.

### Interfaces

```typescript
// How to communicate with the update backend
interface IUpdatesApiClient {
  getInfo(): Promise<UpdateApiResponse<UpdateInfo>>;
  checkForUpdates(): Promise<UpdateApiResponse<UpdateCheckResult>>;
  pullUpdates(): Promise<UpdateApiResponse<UpdatePullResult>>;
}

// How to notify other components about updates
interface IUpdateEventEmitter {
  emitUpdatePulled(detail: { newVersion: string; alreadyUpToDate: boolean }): void;
}
```

### Example: Custom API Client

To use a different update mechanism (e.g., GitHub Releases API):

```typescript
// my-custom-api-client.ts
import type {
  IUpdatesApiClient,
  UpdateApiResponse,
  UpdateInfo,
  UpdateCheckResult,
  UpdatePullResult,
} from '@automaker/types';

export const createGitHubReleasesClient = (): IUpdatesApiClient => ({
  async getInfo(): Promise<UpdateApiResponse<UpdateInfo>> {
    // Read current version from package.json or version file
    const currentVersion = await readCurrentVersion();

    return {
      success: true,
      result: {
        installPath: process.cwd(),
        currentVersion,
        currentVersionShort: currentVersion,
        currentBranch: null,
        hasLocalChanges: false,
        sourceUrl: 'https://github.com/AutoMaker-Org/automaker/releases',
        autoUpdateEnabled: true,
        checkIntervalMinutes: 5,
        updateType: 'release',
      },
    };
  },

  async checkForUpdates(): Promise<UpdateApiResponse<UpdateCheckResult>> {
    // Fetch latest release from GitHub API
    const response = await fetch(
      'https://api.github.com/repos/AutoMaker-Org/automaker/releases/latest'
    );
    const release = await response.json();

    const currentVersion = await readCurrentVersion();
    const latestVersion = release.tag_name;

    return {
      success: true,
      result: {
        updateAvailable: latestVersion !== currentVersion,
        localVersion: currentVersion,
        localVersionShort: currentVersion,
        remoteVersion: latestVersion,
        remoteVersionShort: latestVersion,
        sourceUrl: release.html_url,
        installPath: process.cwd(),
      },
    };
  },

  async pullUpdates(): Promise<UpdateApiResponse<UpdatePullResult>> {
    // Download and extract release asset
    // This is where you'd implement the actual update logic
    // ...

    return {
      success: true,
      result: {
        success: true,
        previousVersion: '1.0.0',
        previousVersionShort: '1.0.0',
        newVersion: '1.1.0',
        newVersionShort: '1.1.0',
        alreadyUpToDate: false,
        message: 'Updated from 1.0.0 to 1.1.0',
      },
    };
  },
});
```

### Injecting Custom Client

```typescript
// In your app initialization
import { createUpdatesStore } from '@/store/updates-store';
import { createGitHubReleasesClient } from './my-custom-api-client';

// Create store with custom client
const customClient = createGitHubReleasesClient();
const useCustomUpdatesStore = createUpdatesStore(customClient);

// Or inject at runtime
import { useUpdatesStore } from '@/store/updates-store';
useUpdatesStore.getState().setApiClient(customClient);
```

## Type Definitions

The types are intentionally **abstract** to support different update mechanisms:

```typescript
interface UpdateInfo {
  installPath: string; // Where Automaker is installed
  currentVersion: string | null; // Current version (commit, semver, etc.)
  currentVersionShort: string | null;
  currentBranch: string | null; // Branch or release channel
  hasLocalChanges: boolean;
  sourceUrl: string; // Where updates come from
  autoUpdateEnabled: boolean;
  checkIntervalMinutes: number;
  updateType?: 'git' | 'release' | 'custom';
  mechanismInfo?: Record<string, unknown>; // Mechanism-specific data
}

interface UpdateCheckResult {
  updateAvailable: boolean;
  localVersion: string;
  localVersionShort: string;
  remoteVersion: string | null;
  remoteVersionShort: string | null;
  sourceUrl: string;
  installPath: string;
  error?: string;
}

interface UpdatePullResult {
  success: boolean;
  previousVersion: string;
  previousVersionShort: string;
  newVersion: string;
  newVersionShort: string;
  alreadyUpToDate: boolean;
  message: string;
}
```

## Server-Side Implementation

The default implementation uses **git** to check for and pull updates:

### Check Logic (`/api/updates/check`)

1. Add temporary remote pointing to upstream URL
2. Fetch latest from remote
3. Compare local commit with remote using `git merge-base --is-ancestor`
4. Return whether remote is ahead of local

### Pull Logic (`/api/updates/pull`)

1. Verify no local uncommitted changes
2. Add temporary remote
3. Fetch and merge with `--ff-only` (fast-forward only)
4. Return version change info

### Implementing Alternative Backends

To implement a different update mechanism on the server:

1. Create new route handlers in `apps/server/src/routes/updates/routes/`
2. Implement the same response format as defined in `UpdateInfo`, `UpdateCheckResult`, `UpdatePullResult`
3. The UI will work without changes

## Events

The update system emits a custom event when updates are pulled:

```typescript
// Listen for update events
window.addEventListener('automaker:update-pulled', (event) => {
  const { newVersion, alreadyUpToDate } = event.detail;
  console.log(`Updated to ${newVersion}, already up to date: ${alreadyUpToDate}`);
});
```

## Troubleshooting

### "Git is not installed"

The default update mechanism requires git. Either install git or implement a custom `IUpdatesApiClient`.

### "Local uncommitted changes"

Updates require a clean working directory. Commit or stash changes before updating.

### "Cannot fast-forward merge"

Your local branch has diverged from upstream. Manual intervention required:

```bash
git fetch origin main
git rebase origin/main
# or
git reset --hard origin/main  # Warning: discards local changes
```

### Updates not appearing

1. Check that auto-update is enabled in Settings
2. Verify the upstream URL is correct
3. Check browser console for errors
4. Try manual "Check for Updates" button

---

Last updated: December 2025
