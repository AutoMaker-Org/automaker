/**
 * Automation Runtime Types - Shared models for automation definitions and execution
 */

export type AutomationScope = 'global' | 'project';

/**
 * Supported trigger types for automations
 * - manual: Always available, triggered via API or UI
 * - event: Triggered by internal AutoMaker events
 * - schedule: Time-based trigger using cron expressions
 * - webhook: HTTP endpoint trigger
 * - date: One-time execution at specific date/time
 */
export type AutomationTriggerType = 'manual' | 'event' | 'schedule' | 'webhook' | 'date';

/**
 * Schedule trigger configuration using cron expressions
 */
export interface AutomationScheduleTrigger {
  type: 'schedule';
  /** Cron expression (e.g., "0 9 * * *" for 9 AM daily) */
  cron: string;
  /** Optional timezone for schedule (e.g., "America/New_York") */
  timezone?: string;
}

/**
 * Event trigger configuration for internal AutoMaker events
 */
export interface AutomationEventTrigger {
  type: 'event';
  /** Event type to listen for (e.g., "feature:completed", "feature:created") */
  event: string;
  /** Optional filter expression for event payload matching */
  filter?: string;
}

/**
 * Webhook trigger configuration for HTTP endpoint triggers
 */
export interface AutomationWebhookTrigger {
  type: 'webhook';
  /** Secret token for webhook authentication (validated via X-Automation-Token header) */
  secret?: string;
  /** HTTP methods allowed (default: POST) */
  methods?: ('GET' | 'POST' | 'PUT' | 'PATCH')[];
}

/**
 * Date trigger configuration for one-time execution
 */
export interface AutomationDateTrigger {
  type: 'date';
  /** ISO 8601 date/time string for one-time execution */
  date: string;
  /** Optional timezone for date interpretation */
  timezone?: string;
}

/**
 * Manual trigger configuration (always available)
 */
export interface AutomationManualTrigger {
  type: 'manual';
}

/**
 * Union type for all trigger configurations
 */
export type AutomationTriggerConfig =
  | AutomationManualTrigger
  | AutomationEventTrigger
  | AutomationScheduleTrigger
  | AutomationWebhookTrigger
  | AutomationDateTrigger;

/**
 * Legacy trigger interface for backward compatibility
 * @deprecated Use AutomationTriggerConfig instead
 */
export interface AutomationTrigger {
  type: AutomationTriggerType;
  event?: string;
  cron?: string;
  timezone?: string;
  date?: string;
  methods?: ('GET' | 'POST' | 'PUT' | 'PATCH')[];
  secret?: string;
  filter?: string;
  metadata?: Record<string, unknown>;
}

export type AutomationVariablePrimitive = string | number | boolean | null;

export type AutomationVariableValue =
  | AutomationVariablePrimitive
  | AutomationVariableValue[]
  | { [key: string]: AutomationVariableValue };

export type BuiltInAutomationStepType =
  | 'create-feature'
  | 'manage-feature'
  | 'run-ai-prompt'
  | 'run-typescript-code'
  | 'define-variable'
  | 'set-variable'
  | 'call-http-endpoint'
  | 'run-script-exec'
  | 'emit-event'
  | 'if'
  | 'loop'
  | 'call-automation'
  | 'git-status'
  | 'git-branch'
  | 'git-commit'
  | 'git-push'
  | 'git-pull'
  | 'git-checkout'
  | 'start-auto-mode'
  | 'stop-auto-mode'
  | 'get-auto-mode-status'
  | 'set-auto-mode-concurrency'
  | 'write-file';

export type AutomationStepEditorComponentKey =
  | 'createFeature'
  | 'manageFeature'
  | 'runAiPrompt'
  | 'runTypeScriptCode'
  | 'defineVariable'
  | 'callHttpEndpoint'
  | 'runScriptExec'
  | 'emitEvent'
  | 'ifConditional'
  | 'loop'
  | 'callAutomation'
  | 'gitStatus'
  | 'gitBranch'
  | 'gitCommit'
  | 'gitPush'
  | 'gitPull'
  | 'gitCheckout'
  | 'startAutoMode'
  | 'stopAutoMode'
  | 'getAutoModeStatus'
  | 'setAutoModeConcurrency'
  | 'writeFile'
  | 'genericJson';

export type AutomationStepConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'enum'
  | 'string[]';

export interface AutomationStepConfigFieldSchema {
  key: string;
  type: AutomationStepConfigFieldType;
  required?: boolean;
  label: string;
  description?: string;
  placeholder?: string;
  defaultValue?: unknown;
  options?: string[];
}

export interface AutomationStepConfigSchema {
  type: 'object';
  fields: AutomationStepConfigFieldSchema[];
}

export interface AutomationStepTypeDescriptor {
  type: BuiltInAutomationStepType;
  title: string;
  description: string;
  category: 'features' | 'ai' | 'variables' | 'integrations' | 'flow' | 'git' | 'auto-mode';
  editorComponent: AutomationStepEditorComponentKey;
  inputContract: string;
  outputContract: string;
  configSchema: AutomationStepConfigSchema;
}

export interface AutomationStep {
  id: string;
  type: string;
  name?: string;
  input?: unknown;
  config?: Record<string, unknown>;
  output?: string;
  continueOnError?: boolean;
  timeoutMs?: number;
}

export interface AutomationDefinition {
  version: 1;
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  scope: AutomationScope;
  trigger: AutomationTrigger;
  variables?: Record<string, AutomationVariableValue>;
  steps: AutomationStep[];
  createdAt?: string;
  updatedAt?: string;
}

export type AutomationRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AutomationStepRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface AutomationRunError {
  code: string;
  message: string;
  stepId?: string;
  details?: unknown;
}

export interface AutomationStepRun {
  stepId: string;
  stepType: string;
  status: AutomationStepRunStatus;
  startedAt: string;
  endedAt?: string;
  input?: unknown;
  output?: unknown;
  error?: AutomationRunError;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  scope: AutomationScope;
  status: AutomationRunStatus;
  trigger: AutomationTrigger;
  startedAt: string;
  endedAt?: string;
  stepRuns: AutomationStepRun[];
  variables: {
    system: Record<string, AutomationVariableValue>;
    project: Record<string, AutomationVariableValue>;
    workflow: Record<string, AutomationVariableValue>;
    steps: Record<string, { output: AutomationVariableValue | unknown }>;
  };
  output?: unknown;
  error?: AutomationRunError;
}

/**
 * Auto mode operations interface for controlling the autonomous feature execution loop.
 * Used by automation steps, execution options, and the scheduler service.
 */
export interface AutoModeOperations {
  /** Start auto mode for a project/worktree */
  start: (
    projectPath: string,
    branchName?: string | null,
    maxConcurrency?: number
  ) => Promise<{ success: boolean; maxConcurrency: number; message?: string }>;
  /** Stop auto mode for a project/worktree */
  stop: (
    projectPath: string,
    branchName?: string | null
  ) => Promise<{ success: boolean; runningFeaturesCount: number; message?: string }>;
  /** Get auto mode status for a project/worktree */
  getStatus: (
    projectPath: string,
    branchName?: string | null
  ) => Promise<{
    isRunning: boolean;
    isAutoLoopRunning: boolean;
    runningFeatures: string[];
    runningCount: number;
    maxConcurrency: number;
  }>;
  /** Set max concurrency for auto mode */
  setConcurrency: (
    projectPath: string,
    maxConcurrency: number,
    branchName?: string | null
  ) => Promise<{ success: boolean; maxConcurrency: number }>;
}

export interface ExecuteAutomationOptions {
  projectPath?: string;
  trigger?: Partial<AutomationTrigger>;
  variables?: Record<string, AutomationVariableValue>;
  signal?: AbortSignal;
  /** Auto mode operations for controlling the autonomous feature execution loop */
  autoMode?: AutoModeOperations;
}

export interface AutomationStepExecutionContext {
  runId: string;
  automationId: string;
  projectPath?: string;
  step: AutomationStep;
  input: unknown;
  previousOutput: unknown;
  variables: {
    system: Record<string, AutomationVariableValue>;
    project: Record<string, AutomationVariableValue>;
    workflow: Record<string, AutomationVariableValue>;
    steps: Record<string, { output: AutomationVariableValue | unknown }>;
  };
  resolveTemplate?: <T = unknown>(value: T) => T;
  emitEvent?: (type: string, payload: Record<string, unknown>) => void;
  executeAutomationById?: (
    automationId: string,
    options?: { scope?: AutomationScope; variables?: Record<string, AutomationVariableValue> }
  ) => Promise<AutomationRun>;
  executeSteps?: (
    steps: AutomationStep[],
    options?: { initialInput?: unknown }
  ) => Promise<unknown>;
  /** Auto mode operations for controlling the autonomous feature execution loop */
  autoMode?: AutoModeOperations;
  setWorkflowVariable: (name: string, value: AutomationVariableValue | unknown) => void;
}

export interface AutomationStepExecutor {
  type: string;
  execute: (context: AutomationStepExecutionContext) => Promise<unknown> | unknown;
}

// ============================================================================
// Scheduler State Types - Persisted state for trigger management
// ============================================================================

/**
 * Status of a scheduled automation run
 */
export type ScheduledRunStatus = 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Represents a scheduled upcoming run for an automation
 */
export interface ScheduledRun {
  /** Unique identifier for this scheduled run */
  id: string;
  /** ID of the automation to run */
  automationId: string;
  /** Scope of the automation */
  scope: AutomationScope;
  /** Project path for project-scoped automations */
  projectPath?: string;
  /** ISO 8601 timestamp when the run is scheduled */
  scheduledFor: string;
  /** Trigger type that caused this scheduling */
  triggerType: AutomationTriggerType;
  /** Current status of the scheduled run */
  status: ScheduledRunStatus;
  /** When this run was created */
  createdAt: string;
  /** When this run was last updated */
  updatedAt: string;
  /** ID of the actual run if executed */
  runId?: string;
  /** Error message if scheduling or execution failed */
  error?: string;
}

/**
 * Scheduler state persisted to survive server restarts
 */
export interface AutomationSchedulerState {
  /** Version for schema migrations */
  version: 1;
  /** ISO 8601 timestamp of last state update */
  updatedAt: string;
  /** All scheduled runs */
  scheduledRuns: ScheduledRun[];
  /** Webhook tokens for webhook-triggered automations (automationId -> secret) */
  webhookSecrets: Record<string, string>;
}

/**
 * Event emitted by the scheduler for status updates
 */
export interface AutomationSchedulerEvent {
  type: 'scheduled' | 'started' | 'completed' | 'failed' | 'cancelled';
  scheduledRunId: string;
  automationId: string;
  scheduledFor: string;
  runId?: string;
  error?: string;
  timestamp: string;
}

/**
 * Options for triggering an automation manually
 */
export interface TriggerAutomationOptions {
  /** Override scope detection */
  scope?: AutomationScope;
  /** Project path for project-scoped automations */
  projectPath?: string;
  /** Additional variables to pass to the automation */
  variables?: Record<string, AutomationVariableValue>;
  /** Trigger metadata (e.g., webhook payload, event data) */
  triggerMetadata?: Record<string, unknown>;
}

/**
 * Structured error codes for scheduler operation failures.
 * Allows callers to distinguish failure reasons without string-matching error messages.
 */
export type SchedulerOperationErrorCode =
  | 'NOT_FOUND'
  | 'DISABLED'
  | 'INVALID_TOKEN'
  | 'METHOD_NOT_ALLOWED'
  | 'EXECUTION_FAILED';

/**
 * Result of a scheduler operation
 */
export interface SchedulerOperationResult {
  success: boolean;
  scheduledRunId?: string;
  error?: string;
  /** Structured error code for programmatic status mapping */
  errorCode?: SchedulerOperationErrorCode;
}

/**
 * Webhook trigger request payload
 */
export interface WebhookTriggerPayload {
  /** Automation ID to trigger */
  automationId: string;
  /** Secret token for authentication */
  token?: string;
  /** Request body/parameters to pass as trigger metadata */
  payload?: unknown;
}

// ============================================================================
// Variable System Types - Comprehensive variable management
// ============================================================================

/**
 * Variable scope types
 * - system: Read-only variables provided by automaker
 * - project: User-defined variables stored per-project
 * - workflow: Variables defined within an automation
 * - steps: Output from previous steps
 */
export type VariableScope = 'system' | 'project' | 'workflow' | 'steps';

/**
 * Metadata describing a variable
 */
export interface VariableDescriptor {
  /** Variable name */
  name: string;
  /** Scope the variable belongs to */
  scope: VariableScope;
  /** Human-readable description */
  description: string;
  /** Example value or usage */
  example?: string;
  /** Whether the variable is read-only */
  readOnly: boolean;
  /** Data type hint for the variable value */
  typeHint?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
}

/**
 * System variable provider function type
 */
export type SystemVariableProvider = (
  projectPath?: string
) => Promise<Record<string, AutomationVariableValue>> | Record<string, AutomationVariableValue>;

/**
 * System variable definition with provider
 */
export interface SystemVariableDefinition extends Omit<VariableDescriptor, 'scope' | 'readOnly'> {
  /** Function to compute the variable value */
  provider: SystemVariableProvider;
  /** Variable is always read-only for system scope */
  readOnly: true;
  scope: 'system';
}

/**
 * Project variable stored in .automaker/settings.json
 */
export interface ProjectVariable {
  /** Variable name */
  name: string;
  /** Variable value (JSON-compatible) */
  value: AutomationVariableValue;
  /** Optional description */
  description?: string;
  /** When the variable was created */
  createdAt: string;
  /** When the variable was last updated */
  updatedAt: string;
}

/**
 * Workflow variable defined in automation definition
 * This extends the existing automation.variables record
 */
export interface WorkflowVariableDefinition {
  /** Variable name */
  name: string;
  /** Default value */
  defaultValue?: AutomationVariableValue;
  /** Optional description */
  description?: string;
}

/**
 * Step output variable reference
 */
export interface StepOutputReference {
  /** Step ID that produced the output */
  stepId: string;
  /** Optional path within the output object */
  path?: string;
}

/**
 * Complete variable context passed to template resolution
 */
export interface VariableContext {
  system: Record<string, AutomationVariableValue>;
  project: Record<string, AutomationVariableValue>;
  workflow: Record<string, AutomationVariableValue>;
  steps: Record<string, { output: AutomationVariableValue | unknown }>;
  run?: {
    id: string;
    automationId: string;
    startedAt: string;
  };
}

/**
 * Variable browser group for UI display
 */
export interface VariableBrowserGroup {
  /** Group name (scope name) */
  name: string;
  /** Group label for display */
  label: string;
  /** Variables in this group */
  variables: VariableDescriptor[];
}

/**
 * Options for listing available variables
 */
export interface ListVariablesOptions {
  /** Include system variables */
  includeSystem?: boolean;
  /** Include project variables */
  includeProject?: boolean;
  /** Include workflow variables from a specific automation */
  workflowVariables?: WorkflowVariableDefinition[];
  /** Include step outputs from automation steps */
  stepOutputs?: Array<{ stepId: string; stepName?: string }>;
  /** Project path for project-scoped variables */
  projectPath?: string;
}

/**
 * Result of listing available variables
 */
export interface ListVariablesResult {
  /** All available variables grouped by scope */
  groups: VariableBrowserGroup[];
  /** Total count of variables */
  total: number;
}

/**
 * Request to set a project variable
 */
export interface SetProjectVariableRequest {
  /** Variable name */
  name: string;
  /** Variable value */
  value: AutomationVariableValue;
  /** Optional description */
  description?: string;
}

/**
 * Request to delete a project variable
 */
export interface DeleteProjectVariableRequest {
  /** Variable name to delete */
  name: string;
}
