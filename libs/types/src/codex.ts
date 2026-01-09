/** Sandbox modes for Codex CLI command execution */
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/** Approval policies for Codex CLI tool execution */
export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never';

/** Codex event types emitted by CLI */
export type CodexEventType =
  | 'thread.started'
  | 'turn.started'
  | 'turn.completed'
  | 'turn.failed'
  | 'item.completed'
  | 'error';

/** Codex item types in CLI events */
export type CodexItemType =
  | 'agent_message'
  | 'reasoning'
  | 'command_execution'
  | 'file_change'
  | 'mcp_tool_call'
  | 'web_search'
  | 'plan_update';

/** Codex CLI event structure */
export interface CodexEvent {
  type: CodexEventType;
  thread_id?: string;
  item?: {
    type: CodexItemType;
    content?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Codex CLI configuration (stored in .automaker/codex-config.json) */
export interface CodexCliConfig {
  /** Default model to use when not specified */
  defaultModel?: string;
  /** List of enabled models */
  models?: string[];
}

/** Codex authentication status */
export interface CodexAuthStatus {
  authenticated: boolean;
  method: 'oauth' | 'api_key' | 'none';
  hasCredentialsFile?: boolean;
  error?: string;
}
