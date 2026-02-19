/**
 * Service for resolving PR target information from git remotes.
 *
 * Extracts remote-parsing and target-resolution logic that was previously
 * inline in the create-pr route handler.
 */

import { execAsync, execEnv, isValidRemoteName } from '../routes/worktree/common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('PRService');

export interface ParsedRemote {
  owner: string;
  repo: string;
}

export interface PrTargetResult {
  repoUrl: string | null;
  targetRepo: string | null;
  pushOwner: string | null;
  upstreamRepo: string | null;
  originOwner: string | null;
  parsedRemotes: Map<string, ParsedRemote>;
}

/**
 * Parse all git remotes for the given repo path and resolve the PR target.
 *
 * @param worktreePath - Working directory of the repository / worktree
 * @param pushRemote   - Remote used for pushing (e.g. "origin")
 * @param targetRemote - Explicit remote to target the PR against (optional)
 *
 * @throws {Error} When targetRemote is specified but not found among repository remotes
 * @throws {Error} When pushRemote is not found among parsed remotes (when targetRemote is specified)
 */
export async function resolvePrTarget({
  worktreePath,
  pushRemote,
  targetRemote,
}: {
  worktreePath: string;
  pushRemote: string;
  targetRemote?: string;
}): Promise<PrTargetResult> {
  // Validate remote names
  if (pushRemote !== undefined && !isValidRemoteName(pushRemote)) {
    throw new Error(`Invalid push remote name: "${pushRemote}"`);
  }
  if (targetRemote !== undefined && !isValidRemoteName(targetRemote)) {
    throw new Error(`Invalid target remote name: "${targetRemote}"`);
  }

  let repoUrl: string | null = null;
  let upstreamRepo: string | null = null;
  let originOwner: string | null = null;
  const parsedRemotes: Map<string, ParsedRemote> = new Map();

  try {
    const { stdout: remotes } = await execAsync('git remote -v', {
      cwd: worktreePath,
      env: execEnv,
    });

    // Parse remotes to detect fork workflow and get repo URL
    const lines = remotes.split(/\r?\n/); // Handle both Unix and Windows line endings
    for (const line of lines) {
      // Try multiple patterns to match different remote URL formats
      // Pattern 1: git@github.com:owner/repo.git (fetch)
      // Pattern 2: https://github.com/owner/repo.git (fetch)
      // Pattern 3: https://github.com/owner/repo (fetch)
      let match = line.match(/^(\w+)\s+.*[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\s+\(fetch\)/);
      if (!match) {
        // Try SSH format: git@github.com:owner/repo.git
        match = line.match(/^(\w+)\s+git@[^:]+:([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);
      }
      if (!match) {
        // Try HTTPS format: https://github.com/owner/repo.git
        match = line.match(/^(\w+)\s+https?:\/\/[^/]+\/([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);
      }

      if (match) {
        const [, remoteName, owner, repo] = match;
        parsedRemotes.set(remoteName, { owner, repo });
        if (remoteName === 'upstream') {
          upstreamRepo = `${owner}/${repo}`;
          repoUrl = `https://github.com/${owner}/${repo}`;
        } else if (remoteName === 'origin') {
          originOwner = owner;
          if (!repoUrl) {
            repoUrl = `https://github.com/${owner}/${repo}`;
          }
        }
      }
    }
  } catch {
    // Couldn't parse remotes - will try fallback
  }

  // When a targetRemote is explicitly specified, validate that it is known
  // before using it. Silently falling back to auto-detection when the caller
  // explicitly requested a remote that doesn't exist is misleading, so we
  // fail fast here instead.
  if (targetRemote && parsedRemotes.size > 0 && !parsedRemotes.has(targetRemote)) {
    throw new Error(`targetRemote "${targetRemote}" not found in repository remotes`);
  }

  // When a targetRemote is explicitly specified, override fork detection
  // to use the specified remote as the PR target
  let targetRepo: string | null = null;
  let pushOwner: string | null = null;
  if (targetRemote && parsedRemotes.size > 0) {
    const targetInfo = parsedRemotes.get(targetRemote);
    const pushInfo = parsedRemotes.get(pushRemote);

    // If the push remote is not found in the parsed remotes, we cannot
    // determine the push owner and would build incorrect URLs. Fail fast
    // instead of silently proceeding with null values.
    if (!pushInfo) {
      logger.warn('Push remote not found in parsed remotes', {
        pushRemote,
        targetRemote,
        availableRemotes: [...parsedRemotes.keys()],
      });
      throw new Error(`Push remote "${pushRemote}" not found in repository remotes`);
    }

    if (targetInfo) {
      targetRepo = `${targetInfo.owner}/${targetInfo.repo}`;
      repoUrl = `https://github.com/${targetInfo.owner}/${targetInfo.repo}`;
    }
    pushOwner = pushInfo.owner;

    // Override the auto-detected upstream/origin with explicit targetRemote
    // Only treat as cross-remote if target differs from push remote
    if (targetRemote !== pushRemote && targetInfo) {
      upstreamRepo = targetRepo;
      originOwner = pushOwner;
    } else if (targetInfo) {
      // Same remote for push and target - regular (non-fork) workflow
      upstreamRepo = null;
      originOwner = targetInfo.owner;
      repoUrl = `https://github.com/${targetInfo.owner}/${targetInfo.repo}`;
    }
  }

  // Fallback: Try to get repo URL from git config if remote parsing failed
  if (!repoUrl) {
    try {
      const { stdout: originUrl } = await execAsync('git config --get remote.origin.url', {
        cwd: worktreePath,
        env: execEnv,
      });
      const url = originUrl.trim();

      // Parse URL to extract owner/repo
      // Handle both SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo.git)
      const match = url.match(/[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
      if (match) {
        const [, owner, repo] = match;
        originOwner = owner;
        repoUrl = `https://github.com/${owner}/${repo}`;
      }
    } catch {
      // Failed to get repo URL from config
    }
  }

  return {
    repoUrl,
    targetRepo,
    pushOwner,
    upstreamRepo,
    originOwner,
    parsedRemotes,
  };
}
