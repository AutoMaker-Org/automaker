/**
 * Setup Service Interface
 * Manages CLI installation and authentication
 */

import type { ServiceResult, Subscription, IService } from "../types";
import type { InstallProgressEvent, AuthProgressEvent } from "../types/events";

export interface CLIAuthStatus {
  authenticated: boolean;
  method: string;
  hasCredentialsFile?: boolean;
  hasToken?: boolean;
  hasStoredOAuthToken?: boolean;
  hasStoredApiKey?: boolean;
  hasEnvOAuthToken?: boolean;
  hasEnvApiKey?: boolean;
  hasAuthFile?: boolean;
  hasEnvKey?: boolean;
}

export interface CLIStatus {
  installed: boolean;
  status?: string;
  path: string | null;
  version: string | null;
  method?: string;
  auth?: CLIAuthStatus;
}

export interface PlatformInfo {
  platform: string;
  arch: string;
  homeDir: string;
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
}

export interface InstallResult {
  message: string;
}

export interface AuthClaudeResult {
  token?: string;
  requiresManualAuth?: boolean;
  terminalOpened?: boolean;
  command?: string;
  message?: string;
  output?: string;
}

export interface AuthCodexResult {
  requiresManualAuth?: boolean;
  command?: string;
}

export interface ApiKeysStatus {
  hasAnthropicKey: boolean;
  hasAnthropicOAuthToken?: boolean;
  hasOpenAIKey: boolean;
  hasGoogleKey: boolean;
}

export interface ConfigureCodexMcpResult {
  configPath: string;
}

export interface ISetupService extends IService {
  /**
   * Get Claude CLI installation and auth status
   */
  getClaudeStatus(): Promise<ServiceResult<CLIStatus>>;

  /**
   * Get Codex CLI installation and auth status
   */
  getCodexStatus(): Promise<ServiceResult<CLIStatus>>;

  /**
   * Install Claude CLI
   */
  installClaude(): Promise<ServiceResult<InstallResult>>;

  /**
   * Install Codex CLI
   */
  installCodex(): Promise<ServiceResult<InstallResult>>;

  /**
   * Authenticate Claude CLI
   */
  authClaude(): Promise<ServiceResult<AuthClaudeResult>>;

  /**
   * Authenticate Codex CLI
   */
  authCodex(apiKey?: string): Promise<ServiceResult<AuthCodexResult>>;

  /**
   * Store an API key securely
   */
  storeApiKey(provider: string, apiKey: string): Promise<ServiceResult>;

  /**
   * Check which API keys are stored
   */
  getApiKeys(): Promise<ServiceResult<ApiKeysStatus>>;

  /**
   * Configure Codex MCP server for a project
   */
  configureCodexMcp(
    projectPath: string
  ): Promise<ServiceResult<ConfigureCodexMcpResult>>;

  /**
   * Get platform information
   */
  getPlatform(): Promise<ServiceResult<PlatformInfo>>;

  /**
   * Subscribe to installation progress events
   */
  onInstallProgress(callback: (event: InstallProgressEvent) => void): Subscription;

  /**
   * Subscribe to authentication progress events
   */
  onAuthProgress(callback: (event: AuthProgressEvent) => void): Subscription;
}

// Re-export event types for convenience
export type { InstallProgressEvent, AuthProgressEvent } from "../types/events";
