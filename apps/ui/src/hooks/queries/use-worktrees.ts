/**
 * Worktrees Query Hooks
 *
 * React Query hooks for fetching worktree data.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

const WORKTREE_REFETCH_ON_FOCUS = false;
const WORKTREE_REFETCH_ON_RECONNECT = false;

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
  featureId?: string;
  linkedToBranch?: string;
}

interface RemovedWorktree {
  path: string;
  branch: string;
}

interface WorktreesResult {
  worktrees: WorktreeInfo[];
  removedWorktrees: RemovedWorktree[];
}

/**
 * Fetch all worktrees for a project
 *
 * @param projectPath - Path to the project
 * @param includeDetails - Whether to include detailed info (default: true)
 * @returns Query result with worktrees array and removed worktrees
 *
 * @example
 * ```tsx
 * const { data, isLoading, refetch } = useWorktrees(currentProject?.path);
 * const worktrees = data?.worktrees ?? [];
 * ```
 */
export function useWorktrees(projectPath: string | undefined, includeDetails = true) {
  return useQuery({
    queryKey: queryKeys.worktrees.all(projectPath ?? ''),
    queryFn: async (): Promise<WorktreesResult> => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.worktree.listAll(projectPath, includeDetails);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch worktrees');
      }
      return {
        worktrees: result.worktrees ?? [],
        removedWorktrees: result.removedWorktrees ?? [],
      };
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.WORKTREES,
    refetchOnWindowFocus: WORKTREE_REFETCH_ON_FOCUS,
    refetchOnReconnect: WORKTREE_REFETCH_ON_RECONNECT,
  });
}

/**
 * Fetch worktree info for a specific feature
 *
 * @param projectPath - Path to the project
 * @param featureId - ID of the feature
 * @returns Query result with worktree info
 */
export function useWorktreeInfo(projectPath: string | undefined, featureId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.worktrees.single(projectPath ?? '', featureId ?? ''),
    queryFn: async () => {
      if (!projectPath || !featureId) throw new Error('Missing project path or feature ID');
      const api = getElectronAPI();
      const result = await api.worktree.getInfo(projectPath, featureId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch worktree info');
      }
      return result;
    },
    enabled: !!projectPath && !!featureId,
    staleTime: STALE_TIMES.WORKTREES,
    refetchOnWindowFocus: WORKTREE_REFETCH_ON_FOCUS,
    refetchOnReconnect: WORKTREE_REFETCH_ON_RECONNECT,
  });
}

/**
 * Fetch worktree status for a specific feature
 *
 * @param projectPath - Path to the project
 * @param featureId - ID of the feature
 * @returns Query result with worktree status
 */
export function useWorktreeStatus(projectPath: string | undefined, featureId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.worktrees.status(projectPath ?? '', featureId ?? ''),
    queryFn: async () => {
      if (!projectPath || !featureId) throw new Error('Missing project path or feature ID');
      const api = getElectronAPI();
      const result = await api.worktree.getStatus(projectPath, featureId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch worktree status');
      }
      return result;
    },
    enabled: !!projectPath && !!featureId,
    staleTime: STALE_TIMES.WORKTREES,
    refetchOnWindowFocus: WORKTREE_REFETCH_ON_FOCUS,
    refetchOnReconnect: WORKTREE_REFETCH_ON_RECONNECT,
  });
}

/**
 * Fetch worktree diffs for a specific feature
 *
 * @param projectPath - Path to the project
 * @param featureId - ID of the feature
 * @returns Query result with files and diff content
 */
export function useWorktreeDiffs(projectPath: string | undefined, featureId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.worktrees.diffs(projectPath ?? '', featureId ?? ''),
    queryFn: async () => {
      if (!projectPath || !featureId) throw new Error('Missing project path or feature ID');
      const api = getElectronAPI();
      const result = await api.worktree.getDiffs(projectPath, featureId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch diffs');
      }
      return {
        files: result.files ?? [],
        diff: result.diff ?? '',
      };
    },
    enabled: !!projectPath && !!featureId,
    staleTime: STALE_TIMES.WORKTREES,
    refetchOnWindowFocus: WORKTREE_REFETCH_ON_FOCUS,
    refetchOnReconnect: WORKTREE_REFETCH_ON_RECONNECT,
  });
}

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote?: boolean;
  lastCommit?: string;
  upstream?: string;
}

interface BranchesResult {
  branches: BranchInfo[];
  aheadCount: number;
  behindCount: number;
  hasRemoteBranch: boolean;
  isGitRepo: boolean;
  hasCommits: boolean;
}

/**
 * Fetch available branches for a worktree
 *
 * @param worktreePath - Path to the worktree
 * @param includeRemote - Whether to include remote branches
 * @returns Query result with branches, ahead/behind counts, and git repo status
 */
export function useWorktreeBranches(worktreePath: string | undefined, includeRemote = false) {
  return useQuery({
    // Include includeRemote in query key so different configurations have separate caches
    queryKey: queryKeys.worktrees.branches(worktreePath ?? '', includeRemote),
    queryFn: async (): Promise<BranchesResult> => {
      if (!worktreePath) throw new Error('No worktree path');
      const api = getElectronAPI();
      const result = await api.worktree.listBranches(worktreePath, includeRemote);

      // Handle special git status codes
      if (result.code === 'NOT_GIT_REPO') {
        return {
          branches: [],
          aheadCount: 0,
          behindCount: 0,
          hasRemoteBranch: false,
          isGitRepo: false,
          hasCommits: false,
        };
      }
      if (result.code === 'NO_COMMITS') {
        return {
          branches: [],
          aheadCount: 0,
          behindCount: 0,
          hasRemoteBranch: false,
          isGitRepo: true,
          hasCommits: false,
        };
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch branches');
      }

      return {
        branches: result.result?.branches ?? [],
        aheadCount: result.result?.aheadCount ?? 0,
        behindCount: result.result?.behindCount ?? 0,
        hasRemoteBranch: result.result?.hasRemoteBranch ?? false,
        isGitRepo: true,
        hasCommits: true,
      };
    },
    enabled: !!worktreePath,
    staleTime: STALE_TIMES.WORKTREES,
    refetchOnWindowFocus: WORKTREE_REFETCH_ON_FOCUS,
    refetchOnReconnect: WORKTREE_REFETCH_ON_RECONNECT,
  });
}

/**
 * Fetch init script for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with init script content
 */
export function useWorktreeInitScript(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.worktrees.initScript(projectPath ?? ''),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.worktree.getInitScript(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch init script');
      }
      return {
        exists: result.exists ?? false,
        content: result.content ?? '',
      };
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.SETTINGS,
    refetchOnWindowFocus: WORKTREE_REFETCH_ON_FOCUS,
    refetchOnReconnect: WORKTREE_REFETCH_ON_RECONNECT,
  });
}

/**
 * Fetch available editors
 *
 * @returns Query result with available editors
 */
export function useAvailableEditors() {
  return useQuery({
    queryKey: queryKeys.worktrees.editors(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.worktree.getAvailableEditors();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch editors');
      }
      return result.editors ?? [];
    },
    staleTime: STALE_TIMES.CLI_STATUS,
    refetchOnWindowFocus: WORKTREE_REFETCH_ON_FOCUS,
    refetchOnReconnect: WORKTREE_REFETCH_ON_RECONNECT,
  });
}
