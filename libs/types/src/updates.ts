/**
 * Types for the auto-update feature
 *
 * These types are intentionally abstract to support different update mechanisms:
 * - Git-based (commits)
 * - Release-based (GitHub releases, semantic versions)
 * - Custom (any versioning scheme)
 */

/**
 * Information about the current Automaker installation
 */
export interface UpdateInfo {
  /** Path to the Automaker installation */
  installPath: string;

  /** Current version identifier (commit hash, semver, etc.) */
  currentVersion: string | null;

  /** Short/display version of current version */
  currentVersionShort: string | null;

  /** Current branch (for git) or channel (for releases) */
  currentBranch: string | null;

  /** Whether there are local modifications */
  hasLocalChanges: boolean;

  /** URL of the update source */
  sourceUrl: string;

  /** Whether auto-update is enabled */
  autoUpdateEnabled: boolean;

  /** Check interval in minutes */
  checkIntervalMinutes: number;

  /** Update mechanism type (optional for backwards compatibility) */
  updateType?: 'git' | 'release' | 'custom';

  /** Mechanism-specific info (e.g., isGitRepo, gitAvailable for git) */
  mechanismInfo?: Record<string, unknown>;
}

/**
 * Result of checking for updates
 */
export interface UpdateCheckResult {
  /** Whether an update is available */
  updateAvailable: boolean;

  /** Current local version */
  localVersion: string;

  /** Short/display version of local version */
  localVersionShort: string;

  /** Available remote version (null if check failed) */
  remoteVersion: string | null;

  /** Short/display version of remote version */
  remoteVersionShort: string | null;

  /** URL of the update source */
  sourceUrl: string;

  /** Path to the installation */
  installPath: string;

  /** Error message if check failed */
  error?: string;
}

/**
 * Result of pulling/installing updates
 */
export interface UpdatePullResult {
  /** Whether the update succeeded */
  success: boolean;

  /** Version before update */
  previousVersion: string;

  /** Short/display version before update */
  previousVersionShort: string;

  /** Version after update */
  newVersion: string;

  /** Short/display version after update */
  newVersionShort: string;

  /** Whether already at the latest version */
  alreadyUpToDate: boolean;

  /** Human-readable message about the update */
  message: string;
}

/**
 * API response wrapper for update operations
 */
export interface UpdateApiResponse<T> {
  success: boolean;
  result?: T;
  error?: string;
}
