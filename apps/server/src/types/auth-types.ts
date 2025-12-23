/**
 * Authentication types and modes for Claude integration
 *
 * Supports dual authentication:
 * - API Key mode: Traditional Anthropic API key
 * - CLI mode: Uses Claude Pro/Max subscription via CLI
 */

/**
 * Authentication method for Claude
 */
export type ClaudeAuthMethod = 'api_key' | 'cli' | 'auto';

/**
 * Configuration for Claude authentication
 */
export interface ClaudeAuthConfig {
  /**
   * Preferred authentication method
   * - 'api_key': Use ANTHROPIC_API_KEY
   * - 'cli': Use Claude CLI (requires `claude login`)
   * - 'auto': Try CLI first, fallback to API key
   */
  method: ClaudeAuthMethod;

  /**
   * API key (only used if method is 'api_key' or 'auto')
   */
  apiKey?: string;

  /**
   * Path to Claude CLI binary (auto-detected if not provided)
   */
  cliPath?: string;

  /**
   * Force CLI authentication even if API key is available
   */
  forceCLI?: boolean;
}

/**
 * Authentication status for Claude
 */
export interface ClaudeAuthStatus {
  /**
   * Whether authentication is available and valid
   */
  authenticated: boolean;

  /**
   * Active authentication method
   */
  method?: ClaudeAuthMethod;

  /**
   * Details about API key authentication
   */
  apiKey?: {
    configured: boolean;
    valid?: boolean;
  };

  /**
   * Details about CLI authentication
   */
  cli?: {
    installed: boolean;
    authenticated: boolean;
    version?: string;
    path?: string;
  };

  /**
   * Error message if authentication failed
   */
  error?: string;
}

/**
 * Settings for authentication preferences
 */
export interface AuthSettings {
  /**
   * Preferred Claude authentication method
   */
  claudeAuthMethod: ClaudeAuthMethod;

  /**
   * Whether to save API keys to .env file
   */
  persistApiKeys: boolean;

  /**
   * Whether to auto-detect and use CLI if available
   */
  autoDetectCLI: boolean;
}

/**
 * Default authentication settings
 */
export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  claudeAuthMethod: 'auto',
  persistApiKeys: true,
  autoDetectCLI: true,
};
