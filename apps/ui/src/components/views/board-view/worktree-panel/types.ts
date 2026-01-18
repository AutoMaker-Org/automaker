// Re-export shared types from @automaker/types
export type { PRState, WorktreePRInfo } from '@automaker/types';
import type { PRState, WorktreePRInfo } from '@automaker/types';

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
  hasWorktree: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
  pr?: WorktreePRInfo;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface GitRepoStatus {
  isGitRepo: boolean;
  hasCommits: boolean;
}

export interface DevServerInfo {
  worktreePath: string;
  port: number;
  url: string;
}

export interface FeatureInfo {
  id: string;
  branchName?: string;
}

export interface PRInfo {
  number: number;
  title: string;
  url: string;
  /** PR state: OPEN, MERGED, or CLOSED */
  state: PRState;
  author: string;
  body: string;
  comments: Array<{
    id: number;
    author: string;
    body: string;
    createdAt: string;
    isReviewComment: boolean;
  }>;
  reviewComments: Array<{
    id: number;
    author: string;
    body: string;
    path?: string;
    line?: number;
    createdAt: string;
    isReviewComment: boolean;
  }>;
}

export interface WorktreePanelProps {
  projectPath: string;
  onCreateWorktree: () => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onCreateBranch: (worktree: WorktreeInfo) => void;
  onAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onResolveConflicts: (worktree: WorktreeInfo) => void;
  onMerge: (worktree: WorktreeInfo) => void;
  onRemovedWorktrees?: (removedWorktrees: Array<{ path: string; branch: string }>) => void;
  runningFeatureIds?: string[];
  features?: FeatureInfo[];
  branchCardCounts?: Record<string, number>; // Map of branch name to unarchived card count
  refreshTrigger?: number;
}
