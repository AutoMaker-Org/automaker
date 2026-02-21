/**
 * branch-sync-service - Sync a local base branch with its remote tracking branch
 *
 * Provides logic to detect remote tracking branches, check whether a branch
 * is checked out in any worktree, and fast-forward a local branch to match
 * its remote counterpart.  Extracted from the worktree create route so
 * the git logic is decoupled from HTTP request/response handling.
 */

import { createLogger, getErrorMessage } from '@automaker/utils';
import { execGitCommand } from '../lib/git.js';

const logger = createLogger('BranchSyncService');

/** Timeout for git fetch operations (30 seconds) */
const FETCH_TIMEOUT_MS = 30_000;

// ============================================================================
// Types
// ============================================================================

/**
 * Result of attempting to sync a base branch with its remote.
 */
export interface BaseBranchSyncResult {
  /** Whether the sync was attempted */
  attempted: boolean;
  /** Whether the sync succeeded */
  synced: boolean;
  /** Whether the ref was resolved (but not synced, e.g. remote ref, tag, or commit hash) */
  resolved?: boolean;
  /** The remote that was synced from (e.g. 'origin') */
  remote?: string;
  /** The commit hash the base branch points to after sync */
  commitHash?: string;
  /** Human-readable message about the sync result */
  message?: string;
  /** Whether the branch had diverged (local commits ahead of remote) */
  diverged?: boolean;
  /** Whether the user can proceed with a stale local copy */
  canProceedWithStale?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Detect the remote tracking branch for a given local branch.
 *
 * @param projectPath - Path to the git repository
 * @param branchName - Local branch name to check (e.g. 'main')
 * @returns Object with remote name and remote branch, or null if no tracking branch
 */
export async function getTrackingBranch(
  projectPath: string,
  branchName: string
): Promise<{ remote: string; remoteBranch: string } | null> {
  try {
    // git rev-parse --abbrev-ref <branch>@{upstream} returns e.g. "origin/main"
    const upstream = await execGitCommand(
      ['rev-parse', '--abbrev-ref', `${branchName}@{upstream}`],
      projectPath
    );
    const trimmed = upstream.trim();
    if (!trimmed) return null;

    // First, attempt to determine the remote name explicitly via git config
    // so that remotes whose names contain slashes are handled correctly.
    let remote: string | null = null;
    try {
      const configRemote = await execGitCommand(
        ['config', '--get', `branch.${branchName}.remote`],
        projectPath
      );
      const configRemoteTrimmed = configRemote.trim();
      if (configRemoteTrimmed) {
        remote = configRemoteTrimmed;
      }
    } catch {
      // git config lookup failed — will fall back to string splitting below
    }

    if (remote) {
      // Strip the known remote prefix (plus the separating '/') to get the remote branch.
      // The upstream string is expected to be "<remote>/<remoteBranch>".
      const prefix = `${remote}/`;
      if (trimmed.startsWith(prefix)) {
        return {
          remote,
          remoteBranch: trimmed.substring(prefix.length),
        };
      }
      // Upstream doesn't start with the expected prefix — fall through to split
    }

    // Fall back: split on the FIRST slash, which favors the common case of
    // single-name remotes with slash-containing branch names (e.g.
    // "origin/feature/foo" → remote="origin", remoteBranch="feature/foo").
    // Remotes with slashes in their names are uncommon and are already handled
    // by the git-config lookup above; this fallback only runs when that lookup
    // fails, so optimizing for single-name remotes is the safer default.
    const slashIndex = trimmed.indexOf('/');
    if (slashIndex > 0) {
      return {
        remote: trimmed.substring(0, slashIndex),
        remoteBranch: trimmed.substring(slashIndex + 1),
      };
    }
    return null;
  } catch {
    // No upstream tracking branch configured
    return null;
  }
}

/**
 * Check whether a branch is checked out in ANY worktree (main or linked).
 * Uses `git worktree list --porcelain` to enumerate all worktrees and
 * checks if any of them has the given branch as their HEAD.
 *
 * Returns the absolute path of the worktree where the branch is checked out,
 * or null if the branch is not checked out anywhere. Callers can use the
 * returned path to run commands (e.g. `git merge`) inside the correct worktree.
 *
 * This prevents using `git update-ref` on a branch that is checked out in
 * a linked worktree, which would desync that worktree's HEAD.
 */
export async function isBranchCheckedOut(
  projectPath: string,
  branchName: string
): Promise<string | null> {
  try {
    const stdout = await execGitCommand(['worktree', 'list', '--porcelain'], projectPath);
    const lines = stdout.split('\n');
    let currentWorktreePath: string | null = null;
    let currentBranch: string | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentWorktreePath = line.slice(9);
      } else if (line.startsWith('branch ')) {
        currentBranch = line.slice(7).replace('refs/heads/', '');
      } else if (line === '') {
        // End of a worktree entry — check for match, then reset for the next
        if (currentBranch === branchName && currentWorktreePath) {
          return currentWorktreePath;
        }
        currentWorktreePath = null;
        currentBranch = null;
      }
    }

    // Check the last entry (if output doesn't end with a blank line)
    if (currentBranch === branchName && currentWorktreePath) {
      return currentWorktreePath;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Build a BaseBranchSyncResult for cases where we proceed with a stale local copy.
 * Extracts the repeated pattern of getting the short commit hash with a fallback.
 */
export async function buildStaleResult(
  projectPath: string,
  branchName: string,
  remote: string | undefined,
  message: string,
  extra?: Partial<BaseBranchSyncResult>
): Promise<BaseBranchSyncResult> {
  let commitHash: string | undefined;
  try {
    const hash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
    commitHash = hash.trim();
  } catch {
    /* ignore — commit hash is non-critical */
  }
  return {
    attempted: true,
    synced: false,
    remote,
    commitHash,
    message,
    canProceedWithStale: true,
    ...extra,
  };
}

// ============================================================================
// Main Sync Function
// ============================================================================

/**
 * Sync a local base branch with its remote tracking branch using fast-forward only.
 *
 * This function:
 * 1. Detects the remote tracking branch for the given local branch
 * 2. Fetches latest from that remote (unless skipFetch is true)
 * 3. Attempts a fast-forward-only update of the local branch
 * 4. If the branch has diverged, reports the divergence and allows proceeding with stale copy
 * 5. If no remote tracking branch exists, skips silently
 *
 * @param projectPath - Path to the git repository
 * @param branchName - The local branch name to sync (e.g. 'main')
 * @param skipFetch - When true, skip the internal git fetch (caller has already fetched)
 * @returns Sync result with status information
 */
export async function syncBaseBranch(
  projectPath: string,
  branchName: string,
  skipFetch = false
): Promise<BaseBranchSyncResult> {
  // Check if the branch exists as a local branch (under refs/heads/).
  // This correctly handles branch names containing slashes (e.g. "feature/abc",
  // "fix/issue-123") which are valid local branch names, not remote refs.
  let existsLocally = false;
  try {
    await execGitCommand(['rev-parse', '--verify', `refs/heads/${branchName}`], projectPath);
    existsLocally = true;
  } catch {
    existsLocally = false;
  }

  if (!existsLocally) {
    // Not a local branch — check if it's a valid ref (remote ref, tag, or commit hash).
    // No synchronization is performed here; we only resolve the ref to a commit hash.
    try {
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      return {
        attempted: false,
        synced: false,
        resolved: true,
        commitHash: commitHash.trim(),
        message: `Ref '${branchName}' resolved (not a local branch; no sync performed)`,
      };
    } catch {
      return {
        attempted: false,
        synced: false,
        message: `Ref '${branchName}' not found`,
      };
    }
  }

  // Detect remote tracking branch
  const tracking = await getTrackingBranch(projectPath, branchName);
  if (!tracking) {
    // No remote tracking branch — skip silently
    logger.info(`Branch '${branchName}' has no remote tracking branch, skipping sync`);
    try {
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      return {
        attempted: false,
        synced: false,
        commitHash: commitHash.trim(),
        message: `Branch '${branchName}' has no remote tracking branch`,
      };
    } catch {
      return {
        attempted: false,
        synced: false,
        message: `Branch '${branchName}' has no remote tracking branch`,
      };
    }
  }

  logger.info(
    `Syncing base branch '${branchName}' from ${tracking.remote}/${tracking.remoteBranch}`
  );

  // Fetch the specific remote unless the caller has already performed a fetch
  // (e.g. via `git fetch --all`) and passed skipFetch=true to avoid redundant work.
  if (!skipFetch) {
    try {
      const fetchController = new AbortController();
      const fetchTimer = setTimeout(() => fetchController.abort(), FETCH_TIMEOUT_MS);
      try {
        await execGitCommand(
          ['fetch', tracking.remote, tracking.remoteBranch, '--quiet'],
          projectPath,
          undefined,
          fetchController
        );
      } finally {
        clearTimeout(fetchTimer);
      }
    } catch (fetchErr) {
      // Fetch failed — network error, auth error, etc.
      // Allow proceeding with stale local copy
      const errMsg = getErrorMessage(fetchErr);
      logger.warn(`Failed to fetch ${tracking.remote}/${tracking.remoteBranch}: ${errMsg}`);
      return buildStaleResult(
        projectPath,
        branchName,
        tracking.remote,
        `Failed to fetch from remote: ${errMsg}. Proceeding with local copy.`
      );
    }
  } else {
    logger.info(`Skipping fetch for '${branchName}' (caller already fetched from remotes)`);
  }

  // Check if the local branch is behind, ahead, or diverged from the remote
  const remoteRef = `${tracking.remote}/${tracking.remoteBranch}`;
  try {
    // Count commits ahead and behind
    const revListOutput = await execGitCommand(
      ['rev-list', '--left-right', '--count', `${branchName}...${remoteRef}`],
      projectPath
    );
    const parts = revListOutput.trim().split(/\s+/);
    const ahead = parseInt(parts[0], 10) || 0;
    const behind = parseInt(parts[1], 10) || 0;

    if (ahead === 0 && behind === 0) {
      // Already up to date
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      logger.info(`Branch '${branchName}' is already up to date with ${remoteRef}`);
      return {
        attempted: true,
        synced: true,
        remote: tracking.remote,
        commitHash: commitHash.trim(),
        message: `Branch '${branchName}' is already up to date`,
      };
    }

    if (ahead > 0 && behind > 0) {
      // Branch has diverged — cannot fast-forward
      logger.warn(
        `Branch '${branchName}' has diverged from ${remoteRef} (${ahead} ahead, ${behind} behind)`
      );
      return buildStaleResult(
        projectPath,
        branchName,
        tracking.remote,
        `Branch '${branchName}' has diverged from ${remoteRef} (${ahead} commit(s) ahead, ${behind} behind). Using local copy to avoid overwriting local commits.`,
        { diverged: true }
      );
    }

    if (ahead > 0 && behind === 0) {
      // Local is ahead — nothing to pull, already has everything from remote plus more
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      logger.info(`Branch '${branchName}' is ${ahead} commit(s) ahead of ${remoteRef}`);
      return {
        attempted: true,
        synced: true,
        remote: tracking.remote,
        commitHash: commitHash.trim(),
        message: `Branch '${branchName}' is ${ahead} commit(s) ahead of remote`,
      };
    }

    // behind > 0 && ahead === 0 — can fast-forward
    logger.info(
      `Branch '${branchName}' is ${behind} commit(s) behind ${remoteRef}, fast-forwarding`
    );

    // Determine whether the branch is currently checked out (returns the
    // worktree path where it is checked out, or null if not checked out)
    const worktreePath = await isBranchCheckedOut(projectPath, branchName);

    if (worktreePath) {
      // Branch is checked out in a worktree — use git merge --ff-only
      // Run the merge inside the worktree that has the branch checked out
      try {
        await execGitCommand(['merge', '--ff-only', remoteRef], worktreePath);
      } catch (mergeErr) {
        const errMsg = getErrorMessage(mergeErr);
        logger.warn(`Fast-forward merge failed for '${branchName}': ${errMsg}`);
        return buildStaleResult(
          projectPath,
          branchName,
          tracking.remote,
          `Fast-forward merge failed: ${errMsg}. Proceeding with local copy.`
        );
      }
    } else {
      // Branch is NOT checked out — use git update-ref to fast-forward without checkout
      // This is safe because we already verified the branch is strictly behind (ahead === 0)
      try {
        const remoteCommit = await execGitCommand(['rev-parse', remoteRef], projectPath);
        await execGitCommand(
          ['update-ref', `refs/heads/${branchName}`, remoteCommit.trim()],
          projectPath
        );
      } catch (updateErr) {
        const errMsg = getErrorMessage(updateErr);
        logger.warn(`update-ref failed for '${branchName}': ${errMsg}`);
        return buildStaleResult(
          projectPath,
          branchName,
          tracking.remote,
          `Failed to fast-forward branch: ${errMsg}. Proceeding with local copy.`
        );
      }
    }

    // Successfully fast-forwarded
    const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
    logger.info(`Successfully synced '${branchName}' to ${commitHash.trim()} from ${remoteRef}`);
    return {
      attempted: true,
      synced: true,
      remote: tracking.remote,
      commitHash: commitHash.trim(),
      message: `Fast-forwarded '${branchName}' by ${behind} commit(s) from ${remoteRef}`,
    };
  } catch (err) {
    // Unexpected error during rev-list or merge — proceed with stale
    const errMsg = getErrorMessage(err);
    logger.warn(`Unexpected error syncing '${branchName}': ${errMsg}`);
    return buildStaleResult(
      projectPath,
      branchName,
      tracking.remote,
      `Sync failed: ${errMsg}. Proceeding with local copy.`
    );
  }
}
