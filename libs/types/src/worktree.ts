/**
 * Worktree and PR-related types
 * Shared across server and UI components
 */

/** GitHub PR states as returned by the GitHub API (uppercase) */
export type PRState = 'OPEN' | 'MERGED' | 'CLOSED';

/** Valid PR states for validation */
export const PR_STATES: readonly PRState[] = ['OPEN', 'MERGED', 'CLOSED'] as const;

/**
 * Validates a PR state value from external APIs (e.g., GitHub CLI).
 * Returns the validated state if it matches a known PRState, otherwise returns 'OPEN' as default.
 * This is safer than type assertions as it handles unexpected values from external APIs.
 *
 * @param state - The state string to validate (can be any string)
 * @returns A valid PRState value
 */
export function validatePRState(state: string | undefined | null): PRState {
  return PR_STATES.find((s) => s === state) ?? 'OPEN';
}

/** PR information stored in worktree metadata */
export interface WorktreePRInfo {
  number: number;
  url: string;
  title: string;
  /** PR state: OPEN, MERGED, or CLOSED */
  state: PRState;
  createdAt: string;
}

/**
 * Request payload for adding a git remote
 */
export interface AddRemoteRequest {
  /** Path to the git worktree/repository */
  worktreePath: string;
  /** Name for the remote (e.g., 'origin', 'upstream') */
  remoteName: string;
  /** URL of the remote repository (HTTPS, SSH, or git:// protocol) */
  remoteUrl: string;
}

/**
 * Result data from a successful add-remote operation
 */
export interface AddRemoteResult {
  /** Name of the added remote */
  remoteName: string;
  /** URL of the added remote */
  remoteUrl: string;
  /** Whether the initial fetch was successful */
  fetched: boolean;
  /** Human-readable status message */
  message: string;
}

/**
 * Successful response from add-remote endpoint
 */
export interface AddRemoteResponse {
  success: true;
  result: AddRemoteResult;
}

/**
 * Error response from add-remote endpoint
 */
export interface AddRemoteErrorResponse {
  success: false;
  error: string;
  /** Optional error code for specific error types (e.g., 'REMOTE_EXISTS') */
  code?: string;
}

/**
 * Merge state information for a git repository
 */
export interface MergeStateInfo {
  /** Whether a merge is currently in progress */
  isMerging: boolean;
  /** Type of merge operation: 'merge' | 'rebase' | 'cherry-pick' | null */
  mergeOperationType: 'merge' | 'rebase' | 'cherry-pick' | null;
  /** Whether the merge completed cleanly (no conflicts) */
  isCleanMerge: boolean;
  /** Files affected by the merge */
  mergeAffectedFiles: string[];
  /** Files with unresolved conflicts */
  conflictFiles: string[];
  /** Whether the current HEAD is a completed merge commit (has multiple parents) */
  isMergeCommit?: boolean;
}
