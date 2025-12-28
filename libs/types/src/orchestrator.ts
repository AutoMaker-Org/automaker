/**
 * Orchestrator types for autonomous workflow management
 *
 * The orchestrator manages the complete development lifecycle:
 * - Research (Greptile, Exa, LSP)
 * - Task creation and management (Vibe-Kanban)
 * - Implementation (Claude agents)
 * - Code review and validation
 * - PR creation and management
 * - Fix loops for comments/conflicts
 */

/**
 * Orchestrator Task States
 * Maps to Vibe-Kanban columns with internal workflow states
 */
export type OrchestratorTaskState =
  | 'todo' // Initial state - needs research
  | 'researching' // Research in progress
  | 'in_progress' // Implementation in progress
  | 'in_review' // Code review/auto-validation
  | 'queue_for_pr' // Ready for PR creation
  | 'pr_created' // PR created, waiting for feedback
  | 'pr_fixes_needed' // PR has comments/conflicts to address
  | 'ready_for_merge' // Ready for human approval
  | 'completed'; // Done

/**
 * Orchestrator Configuration
 */
export interface OrchestratorConfig {
  /** Polling interval in milliseconds (default: 30000 = 30s) */
  pollInterval: number;
  /** Vibe-Kanban project ID (auto-detected if null) */
  projectId: string | null;
  /** Vibe-Kanban project name (for auto-detection) */
  projectName: string;
  /** Exa API key */
  exaApiKey: string;
  /** Exa MCP server URL */
  exaMcpUrl: string;
  /** Maximum concurrent research tasks */
  maxConcurrentResearch: number;
  /** Whether to auto-start tasks after creation */
  autoStartTasks: boolean;
  /** GitHub repository for PR creation (owner/repo format) */
  githubRepository: string;
  /** Default base branch for PRs */
  defaultBaseBranch: string;
  /** Whether the orchestrator is currently running */
  isRunning: boolean;
  /** Greptile API key for semantic code search */
  greptileApiKey?: string;
  /** Greptile API URL */
  greptileApiUrl?: string;
  /** Whether to auto-start workspace sessions for tasks */
  autoStartWorkspaceSessions: boolean;
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  pollInterval: 30000, // 30 seconds
  projectId: null,
  projectName: process.env.ORCHESTRATOR_PROJECT_NAME || 'DevFlow',
  exaApiKey: process.env.EXA_API_KEY || '9b2f9ab7-c27c-4763-b0ef-2c743232dab9',
  exaMcpUrl: 'https://mcp.exa.ai/mcp',
  maxConcurrentResearch: parseInt(process.env.ORCHESTRATOR_MAX_CONCURRENT_RESEARCH || '3', 10),
  autoStartTasks: process.env.ORCHESTRATOR_AUTO_START_TASKS !== 'false',
  githubRepository: process.env.ORCHESTRATOR_GITHUB_REPO || 'oxtsotsi/DevFlow',
  defaultBaseBranch: process.env.ORCHESTRATOR_DEFAULT_BRANCH || 'main',
  isRunning: false,
  greptileApiKey: process.env.GREPTILE_API_KEY,
  greptileApiUrl: process.env.GREPTILE_API_URL || 'https://api.greptile.com',
  autoStartWorkspaceSessions: process.env.ORCHESTRATOR_AUTO_START_WORKSPACE === 'true',
};

/**
 * Research Result from Phase 1
 */
export interface ResearchResult {
  /** Task ID this research relates to */
  taskId: string;
  /** Greptile semantic search results */
  greptileResults: GreptileSearchResult[];
  /** Exa web research results */
  exaResults: ExaSearchResult[];
  /** LSP code analysis */
  lspAnalysis: LSPCodeAnalysis;
  /** Recommended implementation approach */
  recommendations: string[];
  /** Potential risks or blockers identified */
  risks: string[];
  /** Generated subtasks from research */
  subtasks: ResearchSubtask[];
}

/**
 * Subtask generated from research
 */
export interface ResearchSubtask {
  /** Subtask ID (auto-generated) */
  id: string;
  /** Subtask title */
  title: string;
  /** Detailed description */
  description: string;
  /** Primary files affected */
  files: string[];
  /** Estimated complexity */
  complexity: 'low' | 'medium' | 'high';
  /** Dependencies (other subtask IDs) */
  dependencies: string[];
  /** Acceptance criteria */
  acceptanceCriteria: string[];
}

/**
 * Greptile Search Result
 */
export interface GreptileSearchResult {
  /** Repository name */
  repository: string;
  /** File path */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Code snippet */
  code: string;
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Function/class name if applicable */
  symbolName?: string;
}

/**
 * Exa Search Result
 */
export interface ExaSearchResult {
  /** Result title */
  title: string;
  /** URL */
  url: string;
  /** Content snippet */
  snippet: string;
  /** Relevance score */
  score: number;
  /** Published date (if available) */
  publishedDate?: string;
  /** Author (if available) */
  author?: string;
}

/**
 * LSP Code Analysis Result
 */
export interface LSPCodeAnalysis {
  /** Type definitions found */
  types: Array<{ name: string; file: string; line: number }>;
  /** Dependencies identified */
  dependencies: Array<{ name: string; version?: string }>;
  /** References to similar code */
  references: Array<{ file: string; line: number; context: string }>;
  /** Import/require statements */
  imports: Array<{ module: string; file: string; line: number }>;
  /** Exported symbols */
  exports: Array<{ name: string; file: string; line: number }>;
}

/**
 * PR Comment Analysis Result
 */
export interface PRCommentAnalysis {
  /** Comment ID */
  id: string;
  /** Comment author */
  author: string;
  /** Comment body */
  body: string;
  /** Parsed issue type */
  issueType: 'conflict' | 'suggestion' | 'question' | 'ci_failure' | 'other';
  /** Files affected */
  affectedFiles: string[];
  /** Recommended action */
  recommendedAction: 'fix' | 'respond' | 'ignore';
  /** Similar patterns found via Greptile */
  similarPatterns?: string[];
  /** Suggested fix (if applicable) */
  suggestedFix?: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Orchestrator State Snapshot
 */
export interface OrchestratorState {
  /** Whether orchestrator is running */
  isRunning: boolean;
  /** Current phase active */
  currentPhase: OrchestratorPhase | null;
  /** Tasks being processed */
  activeTaskIds: string[];
  /** Last poll timestamp */
  lastPollAt: string | null;
  /** Next scheduled poll timestamp */
  nextPollAt: string | null;
  /** Statistics */
  stats: OrchestratorStats;
  /** Current configuration */
  config: OrchestratorConfig;
  /** Connected services status */
  services: ServiceStatus;
}

/**
 * Orchestrator phases
 */
export type OrchestratorPhase =
  | 'idle'
  | 'researching'
  | 'implementing'
  | 'reviewing'
  | 'creating_pr'
  | 'monitoring_pr'
  | 'fixing'
  | 'finalizing';

/**
 * Orchestrator statistics
 */
export interface OrchestratorStats {
  /** Total tasks processed */
  totalTasksProcessed: number;
  /** Tasks completed */
  tasksCompleted: number;
  /** PRs created */
  prsCreated: number;
  /** PRs merged */
  prsMerged: number;
  /** Research queries performed */
  researchQueries: number;
  /** Fixes applied */
  fixesApplied: number;
  /** Errors encountered */
  errorsEncountered: number;
  /** Uptime in milliseconds */
  uptime: number;
}

/**
 * Service status
 */
export interface ServiceStatus {
  /** Vibe-Kanban connection */
  vibeKanban: 'connected' | 'disconnected' | 'error';
  /** Exa connection */
  exa: 'connected' | 'disconnected' | 'error';
  /** Greptile connection */
  greptile: 'connected' | 'disconnected' | 'error';
  /** GitHub connection */
  github: 'connected' | 'disconnected' | 'error';
}

/**
 * Vibe-Kanban task (as returned by MCP)
 */
export interface VibeKanbanTask {
  /** Task UUID */
  id: string;
  /** Project UUID */
  projectId: string;
  /** Task title */
  title: string;
  /** Task description */
  description: string;
  /** Task status */
  status: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Vibe-Kanban project (as returned by MCP)
 */
export interface VibeKanbanProject {
  /** Project UUID */
  id: string;
  /** Project name */
  name: string;
  /** Creation timestamp */
  createdAt: string;
}

/**
 * Vibe-Kanban repository (as returned by MCP)
 */
export interface VibeKanbanRepo {
  /** Repository UUID */
  id: string;
  /** Repository URL */
  url: string;
  /** Branch name */
  branch?: string;
}

/**
 * State transition validation result
 */
export interface StateTransitionResult {
  /** Whether transition was valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Validation warnings */
  warnings: string[];
}

/**
 * Orchestrator event payloads
 */
export interface OrchestratorEventPayloads {
  'orchestrator:started': {
    timestamp: string;
    config: OrchestratorConfig;
  };
  'orchestrator:stopped': {
    timestamp: string;
    reason?: string;
  };
  'orchestrator:poll': {
    timestamp: string;
    activeTasks: string[];
    phase: OrchestratorPhase;
  };
  'orchestrator:error': {
    error: string;
    phase?: OrchestratorPhase;
    taskId?: string;
    timestamp: string;
  };
  'orchestrator:research-started': {
    taskId: string;
    description: string;
    timestamp: string;
  };
  'orchestrator:research-completed': {
    taskId: string;
    result: ResearchResult;
    timestamp: string;
  };
  'orchestrator:task-created': {
    taskId: string;
    title: string;
    parentId?: string;
    timestamp: string;
  };
  'orchestrator:task-updated': {
    taskId: string;
    oldStatus: OrchestratorTaskState;
    newStatus: OrchestratorTaskState;
    timestamp: string;
  };
  'orchestrator:state-changed': {
    taskId: string;
    from: OrchestratorTaskState;
    to: OrchestratorTaskState;
    timestamp: string;
  };
  'orchestrator:invalid-transition': {
    taskId: string;
    from: OrchestratorTaskState;
    to: OrchestratorTaskState;
    timestamp: string;
  };
  'orchestrator:validation-failed': {
    taskId: string;
    state: OrchestratorTaskState;
    issues: string[];
    timestamp: string;
  };
  'orchestrator:pr-created': {
    taskId: string;
    prNumber: number;
    prUrl: string;
    timestamp: string;
  };
  'orchestrator:pr-comment-analysis': {
    taskId: string;
    prNumber: number;
    analyses: PRCommentAnalysis[];
    timestamp: string;
  };
  'orchestrator:phase-changed': {
    from: OrchestratorPhase;
    to: OrchestratorPhase;
    timestamp: string;
  };
  'orchestrator:workspace-started': {
    taskId: string;
    timestamp: string;
  };
  'orchestrator:workspace-failed': {
    taskId: string;
    error: string;
    timestamp: string;
  };
  'mcp:tool-call': {
    toolName: string;
    params: Record<string, unknown>;
    timestamp?: string;
  };
  'mcp:tool-success': {
    toolName: string;
    duration: number;
    timestamp: string;
  };
  'mcp:tool-error': {
    toolName: string;
    error: string;
    duration?: number;
    timestamp: string;
  };
}
