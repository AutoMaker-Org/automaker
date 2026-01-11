/**
 * Codex App-Server JSON-RPC Types
 *
 * Type definitions for communicating with Codex CLI's app-server via JSON-RPC protocol.
 * These types match the response structures from the `codex app-server` command.
 */

/**
 * Response from model/list JSON-RPC method
 * Returns list of available Codex models for the authenticated user
 */
export interface AppServerModelResponse {
  data: AppServerModel[];
  nextCursor: string | null;
}

export interface AppServerModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  supportedReasoningEfforts: AppServerReasoningEffort[];
  defaultReasoningEffort: string;
  isDefault: boolean;
}

export interface AppServerReasoningEffort {
  reasoningEffort: string;
  description: string;
}

/**
 * Response from account/read JSON-RPC method
 * Returns current authentication state and account information
 */
export interface AppServerAccountResponse {
  account: AppServerAccount | null;
  requiresOpenaiAuth: boolean;
}

export interface AppServerAccount {
  type: 'apiKey' | 'chatgpt';
  email?: string;
  planType?: string;
}

/**
 * Response from account/rateLimits/read JSON-RPC method
 * Returns rate limit information for the current user
 */
export interface AppServerRateLimitsResponse {
  rateLimits: AppServerRateLimits;
}

export interface AppServerRateLimits {
  primary: AppServerRateLimitWindow | null;
  secondary: AppServerRateLimitWindow | null;
  planType?: string;
}

export interface AppServerRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number;
}

/**
 * Generic JSON-RPC request structure
 */
export interface JsonRpcRequest {
  method: string;
  id: number;
  params?: unknown;
}

/**
 * Generic JSON-RPC response structure
 */
export interface JsonRpcResponse<T = unknown> {
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
