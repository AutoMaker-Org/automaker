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
  /** Whether a merge, rebase, or cherry-pick is in progress with conflicts */
  hasConflicts?: boolean;
  /** Type of conflict operation in progress */
  conflictType?: 'merge' | 'rebase' | 'cherry-pick';
  /** List of files with conflicts */
  conflictFiles?: string[];
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
  /** Whether the actual URL/port has been detected from server output */
  urlDetected?: boolean;
}

export interface TestSessionInfo {
  sessionId: string;
  worktreePath: string;
  /** The test command being run (from project settings) */
  command: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  testFile?: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  duration?: number;
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

export interface MergeConflictInfo {
  sourceBranch: string;
  targetBranch: string;
  targetWorktreePath: string;
  /** List of files with conflicts, if available */
  conflictFiles?: string[];
  /** Type of operation that caused the conflict */
  operationType?: 'merge' | 'rebase' | 'cherry-pick';
}

export interface BranchSwitchConflictInfo {
  worktreePath: string;
  branchName: string;
  previousBranch: string;
}

/** Info passed when a checkout failure triggers a stash-pop that itself produces conflicts */
export interface StashPopConflictInfo {
  worktreePath: string;
  branchName: string;
  stashPopConflictMessage: string;
}

/** Info passed when a stash apply/pop operation results in merge conflicts */
export interface StashApplyConflictInfo {
  worktreePath: string;
  branchName: string;
  stashRef: string;
  operation: 'apply' | 'pop';
  conflictFiles: string[];
}

export interface WorktreePanelProps {
  projectPath: string;
  onCreateWorktree: () => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onCreateBranch: (worktree: WorktreeInfo) => void;
  onAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onAutoAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onResolveConflicts: (worktree: WorktreeInfo) => void;
  onCreateMergeConflictResolutionFeature?: (conflictInfo: MergeConflictInfo) => void;
  /** Called when branch switch stash reapply results in merge conflicts */
  onBranchSwitchConflict?: (conflictInfo: BranchSwitchConflictInfo) => void;
  /** Called when checkout fails and the stash-pop restoration itself produces merge conflicts */
  onStashPopConflict?: (conflictInfo: StashPopConflictInfo) => void;
  /** Called when stash apply/pop results in merge conflicts and user wants AI resolution */
  onStashApplyConflict?: (conflictInfo: StashApplyConflictInfo) => void;
  /** Called when a branch is deleted during merge - features should be reassigned to main */
  onBranchDeletedDuringMerge?: (branchName: string) => void;
  onRemovedWorktrees?: (removedWorktrees: Array<{ path: string; branch: string }>) => void;
  runningFeatureIds?: string[];
  features?: FeatureInfo[];
  branchCardCounts?: Record<string, number>; // Map of branch name to unarchived card count
  refreshTrigger?: number;
}
