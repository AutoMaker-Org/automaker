import type { GitHubIssue, StoredValidation } from '@/lib/electron';

export interface IssueRowProps {
  issue: GitHubIssue;
  isSelected: boolean;
  onClick: () => void;
  onOpenExternal: () => void;
  formatDate: (date: string) => string;
  /** Cached validation for this issue (if any) */
  cachedValidation?: StoredValidation | null;
  /** Whether validation is currently running for this issue */
  isValidating?: boolean;
}

export interface IssueDetailPanelProps {
  issue: GitHubIssue;
  validatingIssues: Set<number>;
  cachedValidations: Map<number, StoredValidation>;
  onValidateIssue: (
    issue: GitHubIssue,
    options?: { showDialog?: boolean; forceRevalidate?: boolean }
  ) => Promise<void>;
  onViewCachedValidation: (issue: GitHubIssue) => Promise<void>;
  onOpenInGitHub: (url: string) => void;
  onClose: () => void;
  onShowRevalidateConfirm: () => void;
  formatDate: (date: string) => string;
}
