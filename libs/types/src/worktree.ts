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
