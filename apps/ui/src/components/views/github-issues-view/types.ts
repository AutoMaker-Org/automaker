import type { GitHubIssue, StoredValidation, GitHubComment } from '@/lib/electron';
import type { ModelAlias, CursorModelId, LinkedPRInfo, PhaseModelEntry } from '@automaker/types';

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

/** Options for issue validation */
export interface ValidateIssueOptions {
  showDialog?: boolean;
  forceRevalidate?: boolean;
  /** Include comments in AI analysis */
  comments?: GitHubComment[];
  /** Linked pull requests */
  linkedPRs?: LinkedPRInfo[];
}

export interface IssueDetailPanelProps {
  issue: GitHubIssue;
  validatingIssues: Set<number>;
  cachedValidations: Map<number, StoredValidation>;
  onValidateIssue: (issue: GitHubIssue, options?: ValidateIssueOptions) => Promise<void>;
  onViewCachedValidation: (issue: GitHubIssue) => Promise<void>;
  onOpenInGitHub: (url: string) => void;
  onClose: () => void;
  /** Called when user wants to revalidate - receives the validation options including comments/linkedPRs */
  onShowRevalidateConfirm: (options: ValidateIssueOptions) => void;
  formatDate: (date: string) => string;
  /** Model override state */
  modelOverride: {
    effectiveModelEntry: PhaseModelEntry;
    effectiveModel: ModelAlias | CursorModelId;
    isOverridden: boolean;
    setOverride: (entry: PhaseModelEntry | null) => void;
  };
}
