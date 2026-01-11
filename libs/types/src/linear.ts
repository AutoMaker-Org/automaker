/**
 * Linear Integration Types
 *
 * Types for Linear issue tracker integration.
 * Linear uses GraphQL API, we use @linear/sdk for type-safe access.
 */

// ============================================================================
// Core Linear Entities
// ============================================================================

/**
 * LinearTeam - A team in Linear organization
 */
export interface LinearTeam {
  /** Unique team identifier */
  id: string;
  /** Short team key (e.g., "ENG", "PROD") */
  key: string;
  /** Team display name */
  name: string;
  /** Optional team description */
  description?: string;
  /** Team color (hex) */
  color?: string;
  /** Team icon identifier */
  icon?: string;
}

/**
 * LinearProject - A project within a team
 */
export interface LinearProject {
  /** Unique project identifier */
  id: string;
  /** Project name */
  name: string;
  /** Optional description */
  description?: string;
  /** Project state: planned, started, paused, completed, canceled */
  state: string;
  /** Target completion date (ISO string) */
  targetDate?: string;
  /** Project start date (ISO string) */
  startDate?: string;
  /** Completion progress (0-100) */
  progress: number;
  /** Parent team ID */
  teamId: string;
}

/**
 * LinearUser - A user in Linear
 */
export interface LinearUser {
  /** Unique user identifier */
  id: string;
  /** User's full name */
  name: string;
  /** Display name (may differ from name) */
  displayName: string;
  /** Email address */
  email?: string;
  /** Avatar image URL */
  avatarUrl?: string;
  /** Whether this is the currently authenticated user */
  isMe?: boolean;
}

/**
 * LinearLabel - An issue label
 */
export interface LinearLabel {
  /** Unique label identifier */
  id: string;
  /** Label name */
  name: string;
  /** Label color (hex) */
  color: string;
  /** Optional description */
  description?: string;
}

/**
 * LinearWorkflowState - Issue workflow state
 */
export interface LinearWorkflowState {
  /** Unique state identifier */
  id: string;
  /** State name (e.g., "In Progress", "Done") */
  name: string;
  /** State color (hex) */
  color: string;
  /** State category type */
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
  /** Position in workflow order */
  position: number;
}

/**
 * LinearIssue - A complete issue from Linear
 */
export interface LinearIssue {
  /** Unique issue identifier */
  id: string;
  /** Human-readable identifier (e.g., "ENG-123") */
  identifier: string;
  /** Issue title */
  title: string;
  /** Issue description (markdown) */
  description?: string;
  /** Rich text description data (Prosemirror JSON) */
  descriptionData?: string;
  /** Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low */
  priority: number;
  /** Human-readable priority label */
  priorityLabel: string;
  /** Current workflow state */
  state: LinearWorkflowState;
  /** Assigned user */
  assignee?: LinearUser;
  /** Issue creator */
  creator?: LinearUser;
  /** Parent team */
  team: LinearTeam;
  /** Associated project */
  project?: LinearProject;
  /** Attached labels */
  labels: LinearLabel[];
  /** Story point estimate */
  estimate?: number;
  /** Direct URL to issue */
  url: string;
  /** Creation timestamp (ISO) */
  createdAt: string;
  /** Last update timestamp (ISO) */
  updatedAt: string;
  /** When work started (ISO) */
  startedAt?: string;
  /** When completed (ISO) */
  completedAt?: string;
  /** When canceled (ISO) */
  canceledAt?: string;
  /** Due date (YYYY-MM-DD) */
  dueDate?: string;
  /** Parent issue reference */
  parent?: {
    id: string;
    identifier: string;
    title: string;
  };
  /** Child issues */
  children?: Array<{
    id: string;
    identifier: string;
    title: string;
  }>;
  /** Attachments */
  attachments?: LinearAttachment[];
}

/**
 * LinearAttachment - File or link attachment
 */
export interface LinearAttachment {
  /** Unique attachment identifier */
  id: string;
  /** Attachment title */
  title: string;
  /** Subtitle or description */
  subtitle?: string;
  /** URL to the attachment */
  url: string;
  /** Icon URL */
  iconUrl?: string;
  /** Source type (e.g., "figma", "github") */
  sourceType?: string;
}

/**
 * LinearComment - Issue comment
 */
export interface LinearComment {
  /** Unique comment identifier */
  id: string;
  /** Comment body (markdown) */
  body: string;
  /** Comment author */
  user?: LinearUser;
  /** Creation timestamp (ISO) */
  createdAt: string;
  /** Last update timestamp (ISO) */
  updatedAt: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * LinearConnectionStatus - Result of connection check
 */
export interface LinearConnectionStatus {
  /** Whether connection is successful */
  connected: boolean;
  /** Current authenticated user */
  user?: LinearUser;
  /** Organization info */
  organization?: {
    id: string;
    name: string;
    urlKey: string;
  };
  /** Error message if not connected */
  error?: string;
}

/**
 * LinearIssueFilters - Filters for issue queries
 */
export interface LinearIssueFilters {
  /** Filter by team ID */
  teamId?: string;
  /** Filter by project ID */
  projectId?: string;
  /** Filter by state types */
  stateType?: Array<LinearWorkflowState['type']>;
  /** Filter by label IDs */
  labelIds?: string[];
  /** Filter by specific assignee ID */
  assigneeId?: string;
  /** Filter to only issues assigned to current user */
  myIssuesOnly?: boolean;
  /** Filter by specific label name (convenience) */
  labelName?: string;
  /** Include completed/canceled issues */
  includeCompleted?: boolean;
  /** Text search query */
  search?: string;
  /** Maximum issues to return */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
}

/**
 * LinearIssuesResult - Paginated issues response
 */
export interface LinearIssuesResult {
  /** Whether request succeeded */
  success: boolean;
  /** Retrieved issues */
  issues?: LinearIssue[];
  /** Pagination info */
  pageInfo?: {
    hasNextPage: boolean;
    endCursor?: string;
  };
  /** Error message if failed */
  error?: string;
}

/**
 * LinearTeamsResult - Teams list response
 */
export interface LinearTeamsResult {
  /** Whether request succeeded */
  success: boolean;
  /** Retrieved teams */
  teams?: LinearTeam[];
  /** Error message if failed */
  error?: string;
}

/**
 * LinearProjectsResult - Projects list response
 */
export interface LinearProjectsResult {
  /** Whether request succeeded */
  success: boolean;
  /** Retrieved projects */
  projects?: LinearProject[];
  /** Error message if failed */
  error?: string;
}

/**
 * LinearIssueResult - Single issue response
 */
export interface LinearIssueResult {
  /** Whether request succeeded */
  success: boolean;
  /** Retrieved issue */
  issue?: LinearIssue;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Import Types
// ============================================================================

/**
 * LinearImportOptions - Options for importing issues as features
 */
export interface LinearImportOptions {
  /** Issue IDs to import */
  issueIds: string[];
  /** Target status for imported features */
  targetStatus: 'backlog' | 'in-progress';
  /** Include issue description in feature */
  includeDescription: boolean;
  /** Use first label as category */
  includeLabelsAsCategory: boolean;
  /** Add link back to Linear issue */
  linkBackToLinear: boolean;
}

/**
 * LinearImportResult - Result of import operation
 */
export interface LinearImportResult {
  /** Whether import succeeded (at least partial) */
  success: boolean;
  /** Number of successfully imported issues */
  importedCount: number;
  /** Imported feature mappings */
  features?: Array<{
    featureId: string;
    linearIssueId: string;
    linearIdentifier: string;
  }>;
  /** Errors for failed imports */
  errors?: Array<{
    linearIssueId: string;
    error: string;
  }>;
}

// ============================================================================
// Settings Types
// ============================================================================

/**
 * LinearFilterPreset - Saved filter configuration
 */
export interface LinearFilterPreset {
  /** Unique preset identifier */
  id: string;
  /** Preset display name */
  name: string;
  /** Filter configuration */
  filters: LinearIssueFilters;
  /** Whether this is the default preset */
  isDefault?: boolean;
}

/**
 * LinearSettings - Linear integration settings
 */
export interface LinearSettings {
  /** Default team to show issues from */
  defaultTeamId?: string;
  /** Default project filter */
  defaultProjectId?: string;
  /** Show only issues assigned to current user by default */
  defaultMyIssuesOnly?: boolean;
  /** State types to include by default */
  defaultStateTypes?: Array<LinearWorkflowState['type']>;
  /** Default label filter (e.g., "automaker") */
  defaultLabelFilter?: string;
  /** Auto-sync interval in minutes (0 = manual only) */
  autoSyncInterval?: number;
  /** Saved filter presets */
  savedPresets?: LinearFilterPreset[];
}
