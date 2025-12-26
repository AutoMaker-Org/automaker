import { useMemo } from 'react';
import type { WorktreeInfo, WorktreeGroup } from '../types';

interface UseWorktreeGroupsOptions {
  worktrees: WorktreeInfo[];
  projectPath: string; // Kept for API compatibility, but no longer used for grouping
}

interface UseWorktreeGroupsResult {
  groups: WorktreeGroup[];
  individualWorktrees: WorktreeInfo[];
}

/**
 * Extracts the prefix from a branch name.
 *
 * @param branch - The full branch name (e.g., "feature/mcp-integration")
 * @returns An object with prefix and suffix, or null if no prefix exists
 *
 * @example
 * extractBranchPrefix("feature/mcp-integration") // { prefix: "feature", suffix: "mcp-integration" }
 * extractBranchPrefix("fix/worktree-bug") // { prefix: "fix", suffix: "worktree-bug" }
 * extractBranchPrefix("main") // null
 * extractBranchPrefix("develop") // null
 */
function extractBranchPrefix(branch: string): { prefix: string; suffix: string } | null {
  const slashIndex = branch.indexOf('/');
  if (slashIndex === -1) {
    return null;
  }
  return {
    prefix: branch.substring(0, slashIndex),
    suffix: branch.substring(slashIndex + 1),
  };
}

/**
 * Hook to group worktrees by their branch name prefix.
 *
 * Worktrees with branch names that contain a prefix (e.g., "feature/auth", "fix/bug")
 * are grouped together by their prefix (e.g., "feature", "fix").
 *
 * Main worktree and worktrees with branches that have no prefix (e.g., "main", "develop")
 * are returned as individual worktrees that should be displayed as separate tabs.
 *
 * @example
 * // Given worktrees with branches:
 * // - "main" (isMain: true)
 * // - "feature/mcp-integration"
 * // - "feature/terminal-kanban"
 * // - "fix/worktree-bug"
 * // - "develop"
 * //
 * // Returns:
 * // groups: [
 * //   { folderName: "feature", folderPath: "feature", worktrees: [...] },
 * //   { folderName: "fix", folderPath: "fix", worktrees: [...] }
 * // ]
 * // individualWorktrees: [main, develop]
 */
export function useWorktreeGroups({
  worktrees,
}: UseWorktreeGroupsOptions): UseWorktreeGroupsResult {
  const { groups, individualWorktrees } = useMemo(() => {
    const prefixMap = new Map<string, WorktreeInfo[]>();
    const individual: WorktreeInfo[] = [];

    worktrees.forEach((worktree) => {
      // Main worktree is always displayed as individual tab
      if (worktree.isMain) {
        individual.push(worktree);
        return;
      }

      // Extract prefix from branch name (e.g., "feature" from "feature/mcp-integration")
      const branchParts = extractBranchPrefix(worktree.branch);

      if (branchParts) {
        // Branch has a prefix - group by prefix
        const { prefix } = branchParts;
        if (!prefixMap.has(prefix)) {
          prefixMap.set(prefix, []);
        }
        prefixMap.get(prefix)!.push(worktree);
      } else {
        // Branch has no prefix (e.g., "main", "develop") - display as individual tab
        individual.push(worktree);
      }
    });

    // Convert map to sorted groups array
    const sortedGroups: WorktreeGroup[] = Array.from(prefixMap.entries())
      .map(([prefix, groupWorktrees]) => ({
        folderPath: prefix,
        folderName: prefix,
        worktrees: groupWorktrees.sort((a, b) => a.branch.localeCompare(b.branch)),
      }))
      .sort((a, b) => a.folderName.localeCompare(b.folderName));

    // Sort individual worktrees: main first, then alphabetically by branch
    const sortedIndividual = individual.sort((a, b) => {
      if (a.isMain) return -1;
      if (b.isMain) return 1;
      return a.branch.localeCompare(b.branch);
    });

    return {
      groups: sortedGroups,
      individualWorktrees: sortedIndividual,
    };
  }, [worktrees]);

  return {
    groups,
    individualWorktrees,
  };
}
