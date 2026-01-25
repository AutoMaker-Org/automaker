import type { GitHubIssue, StoredValidation, GitHubComment } from '@/lib/electron';
import type { ModelId, LinkedPRInfo, PhaseModelEntry } from '@automaker/types';

// ============================================================================
// Issues Filter State Types
// ============================================================================

/**
 * Available sort columns for issues list
 */
export const ISSUES_SORT_COLUMNS = [
  'title',
  'created_at',
  'updated_at',
  'comments',
  'number',
] as const;

export type IssuesSortColumn = (typeof ISSUES_SORT_COLUMNS)[number];

/**
 * Sort direction options
 */
export type IssuesSortDirection = 'asc' | 'desc';

/**
 * Available issue state filter values
 */
export const ISSUES_STATE_FILTER_OPTIONS = ['open', 'closed', 'all'] as const;

export type IssuesStateFilter = (typeof ISSUES_STATE_FILTER_OPTIONS)[number];

/**
 * Validation status filter values for filtering issues by validation state
 */
export const ISSUES_VALIDATION_STATUS_OPTIONS = ['validated', 'not_validated', 'stale'] as const;

export type IssuesValidationStatus = (typeof ISSUES_VALIDATION_STATUS_OPTIONS)[number];

/**
 * Sort configuration for issues list
 */
export interface IssuesSortConfig {
  column: IssuesSortColumn;
  direction: IssuesSortDirection;
}

/**
 * Main filter state interface for the GitHub Issues view
 *
 * This interface defines all filterable/sortable state for the issues list.
 * It follows the same pattern as GraphFilterState but is tailored for GitHub issues.
 */
export interface IssuesFilterState {
  /** Search query for filtering by issue title or body */
  searchQuery: string;
  /** Filter by issue state (open/closed/all) */
  stateFilter: IssuesStateFilter;
  /** Filter by selected labels (matches any) */
  selectedLabels: string[];
  /** Filter by selected assignees (matches any) */
  selectedAssignees: string[];
  /** Filter by selected milestones (matches any) */
  selectedMilestones: string[];
  /** Filter by validation status */
  validationStatusFilter: IssuesValidationStatus | null;
  /** Current sort configuration */
  sortConfig: IssuesSortConfig;
}

/**
 * Result of applying filters to the issues list
 */
export interface IssuesFilterResult {
  /** Array of GitHubIssue objects that match the current filters */
  matchedIssues: GitHubIssue[];
  /** Available labels from all issues (for filter dropdown population) */
  availableLabels: string[];
  /** Available assignees from all issues (for filter dropdown population) */
  availableAssignees: string[];
  /** Available milestones from all issues (for filter dropdown population) */
  availableMilestones: string[];
  /** Whether any filter is currently active */
  hasActiveFilter: boolean;
  /** Total count of matched issues */
  matchedCount: number;
}

/**
 * Default values for IssuesFilterState
 */
export const DEFAULT_ISSUES_FILTER_STATE: IssuesFilterState = {
  searchQuery: '',
  stateFilter: 'open',
  selectedLabels: [],
  selectedAssignees: [],
  selectedMilestones: [],
  validationStatusFilter: null,
  sortConfig: {
    column: 'updated_at',
    direction: 'desc',
  },
};

// ============================================================================
// Component Props Types
// ============================================================================

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
    effectiveModel: ModelId;
    isOverridden: boolean;
    setOverride: (entry: PhaseModelEntry | null) => void;
  };
}
