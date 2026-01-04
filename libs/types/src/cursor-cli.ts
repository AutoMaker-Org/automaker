import type { CursorModelId } from './cursor-models.js';

/**
 * Cursor CLI configuration file schema
 * Stored in: .automaker/cursor-config.json
 */
export interface CursorCliConfig {
  defaultModel?: CursorModelId;
  models?: CursorModelId[]; // Enabled models
  mcpServers?: string[]; // MCP server configs to load
  rules?: string[]; // .cursor/rules paths
}

// =============================================================================
// Cursor CLI Permissions Configuration
// Based on: https://cursor.com/docs/cli/reference/permissions
// =============================================================================

/**
 * Permission string format for Cursor CLI
 * Examples:
 * - "Shell(git)" - Allow/deny git commands
 * - "Shell(npm)" - Allow/deny npm commands
 * - "Read(.env*)" - Allow/deny reading .env files
 * - "Write(src/**)" - Allow/deny writing to src directory
 */
export type CursorPermissionString = string;

/**
 * Cursor CLI permissions configuration
 * Used in ~/.cursor/cli-config.json or <project>/.cursor/cli.json
 */
export interface CursorCliPermissions {
  /**
   * Permitted operations
   * Format: "Shell(command)", "Read(path)", "Write(path)"
   */
  allow: CursorPermissionString[];

  /**
   * Forbidden operations (takes precedence over allow)
   * Format: "Shell(command)", "Read(path)", "Write(path)"
   */
  deny: CursorPermissionString[];
}

/**
 * Full Cursor CLI config file format (cli-config.json / cli.json)
 * See: https://cursor.com/docs/cli/reference/configuration
 */
export interface CursorCliConfigFile {
  /** Schema version (currently 1) */
  version: 1;

  /** Editor settings (global only) */
  editor?: {
    vimMode?: boolean;
  };

  /** Model settings (global only) */
  model?: {
    default?: string;
  };

  /** Permissions (can be project-level) */
  permissions?: CursorCliPermissions;
}

/**
 * Predefined permission profiles for different use cases
 */
export type CursorPermissionProfile = 'strict' | 'development' | 'custom';

/**
 * Permission profile definitions
 */
export interface CursorPermissionProfileConfig {
  id: CursorPermissionProfile;
  name: string;
  description: string;
  permissions: CursorCliPermissions;
}

/**
 * Strict profile - For read-only operations
 * Denies all shell commands and writes
 */
export const CURSOR_STRICT_PROFILE: CursorPermissionProfileConfig = {
  id: 'strict',
  name: 'Strict (Read-Only)',
  description: 'Denies all shell commands and file writes. Safe for analysis tasks.',
  permissions: {
    allow: [
      'Read(**/*)', // Allow reading all files
    ],
    deny: [
      'Shell(*)', // Deny all shell commands
      'Write(**/*)', // Deny all file writes
      'Read(.env*)', // Deny reading env files
      'Read(**/*.pem)', // Deny reading private keys
      'Read(**/*.key)', // Deny reading key files
      'Read(**/credentials*)', // Deny reading credentials
    ],
  },
};

/**
 * Development profile - For feature implementation
 * Allows safe operations, blocks destructive ones
 */
export const CURSOR_DEVELOPMENT_PROFILE: CursorPermissionProfileConfig = {
  id: 'development',
  name: 'Development',
  description: 'Allows file edits and safe shell commands. Blocks destructive operations.',
  permissions: {
    allow: [
      'Read(**/*)', // Allow reading all files
      'Write(**/*)', // Allow writing files
      'Shell(npm)', // npm install, run, test
      'Shell(pnpm)', // pnpm install, run, test
      'Shell(yarn)', // yarn install, run, test
      'Shell(bun)', // bun install, run, test
      'Shell(node)', // node scripts
      'Shell(npx)', // npx commands
      'Shell(git)', // git operations (except push)
      'Shell(tsc)', // TypeScript compiler
      'Shell(eslint)', // Linting
      'Shell(prettier)', // Formatting
      'Shell(jest)', // Testing
      'Shell(vitest)', // Testing
      'Shell(cargo)', // Rust
      'Shell(go)', // Go
      'Shell(python)', // Python
      'Shell(pip)', // Python packages
      'Shell(poetry)', // Python packages
      'Shell(make)', // Makefiles
      'Shell(docker)', // Docker (build, not run with --rm)
      'Shell(ls)', // List files
      'Shell(cat)', // Read files
      'Shell(echo)', // Echo
      'Shell(mkdir)', // Create directories
      'Shell(cp)', // Copy files
      'Shell(mv)', // Move files
      'Shell(touch)', // Create files
      'Shell(pwd)', // Print working directory
      'Shell(which)', // Find executables
      'Shell(head)', // Read file head
      'Shell(tail)', // Read file tail
      'Shell(grep)', // Search
      'Shell(find)', // Find files
      'Shell(wc)', // Word count
      'Shell(sort)', // Sort
      'Shell(uniq)', // Unique lines
      'Shell(diff)', // Diff files
      'Shell(curl)', // HTTP requests (read-only fetching)
      'Shell(wget)', // Downloads
    ],
    deny: [
      // Destructive file operations
      'Shell(rm)', // No file deletion
      'Shell(rmdir)', // No directory deletion
      'Shell(shred)', // No secure delete

      // Dangerous git operations
      'Shell(git push)', // No pushing (user should review)
      'Shell(git push --force)', // Definitely no force push
      'Shell(git reset --hard)', // No hard reset

      // Package publishing
      'Shell(npm publish)', // No publishing packages
      'Shell(pnpm publish)', // No publishing packages
      'Shell(yarn publish)', // No publishing packages

      // System/network operations
      'Shell(sudo)', // No sudo
      'Shell(su)', // No su
      'Shell(chmod)', // No permission changes
      'Shell(chown)', // No ownership changes
      'Shell(kill)', // No process killing
      'Shell(pkill)', // No process killing
      'Shell(killall)', // No process killing
      'Shell(shutdown)', // No shutdown
      'Shell(reboot)', // No reboot
      'Shell(systemctl)', // No systemd
      'Shell(service)', // No services
      'Shell(iptables)', // No firewall
      'Shell(ssh)', // No SSH
      'Shell(scp)', // No SCP

      // Sensitive file access
      'Read(.env*)', // No reading env files
      'Read(**/*.pem)', // No reading private keys
      'Read(**/*.key)', // No reading key files
      'Read(**/credentials*)', // No reading credentials
      'Read(**/.git/config)', // No reading git config (may have tokens)
      'Read(**/id_rsa*)', // No reading SSH keys
      'Read(**/id_ed25519*)', // No reading SSH keys
      'Write(.env*)', // No writing env files
      'Write(**/*.pem)', // No writing keys
      'Write(**/*.key)', // No writing keys
    ],
  },
};

/**
 * All available permission profiles
 */
export const CURSOR_PERMISSION_PROFILES: CursorPermissionProfileConfig[] = [
  CURSOR_STRICT_PROFILE,
  CURSOR_DEVELOPMENT_PROFILE,
];

/**
 * Cursor authentication status
 */
export interface CursorAuthStatus {
  authenticated: boolean;
  method: 'login' | 'api_key' | 'none';
  hasCredentialsFile?: boolean;
}

/**
 * NOTE: Reuse existing InstallationStatus from provider.ts
 * The existing type already has: installed, path, version, method, hasApiKey, authenticated
 *
 * Add 'login' to the method union if needed:
 * method?: 'cli' | 'npm' | 'brew' | 'sdk' | 'login';
 */

/**
 * Cursor stream-json event types (from CLI output)
 */
export interface CursorSystemEvent {
  type: 'system';
  subtype: 'init';
  apiKeySource: 'env' | 'flag' | 'login';
  cwd: string;
  session_id: string;
  model: string;
  permissionMode: string;
}

export interface CursorUserEvent {
  type: 'user';
  message: {
    role: 'user';
    content: Array<{ type: 'text'; text: string }>;
  };
  session_id: string;
}

export interface CursorAssistantEvent {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{ type: 'text'; text: string }>;
  };
  session_id: string;
}

export interface CursorToolCallEvent {
  type: 'tool_call';
  subtype: 'started' | 'completed';
  call_id: string;
  tool_call: {
    readToolCall?: {
      args: { path: string; offset?: number; limit?: number };
      result?: {
        success?: {
          content: string;
          isEmpty: boolean;
          exceededLimit: boolean;
          totalLines: number;
          totalChars: number;
        };
      };
    };
    writeToolCall?: {
      args: { path: string; fileText: string; toolCallId?: string };
      result?: {
        success?: {
          path: string;
          linesCreated: number;
          fileSize: number;
        };
      };
    };
    editToolCall?: {
      args: { path: string; oldText?: string; newText?: string };
      result?: {
        success?: Record<string, unknown>;
      };
    };
    shellToolCall?: {
      args: { command: string };
      result?: {
        success?: {
          exitCode: number;
          stdout?: string;
          stderr?: string;
        };
        rejected?: {
          reason: string;
        };
      };
    };
    deleteToolCall?: {
      args: { path: string };
      result?: {
        success?: Record<string, unknown>;
        rejected?: {
          reason: string;
        };
      };
    };
    grepToolCall?: {
      args: { pattern: string; path?: string };
      result?: {
        success?: {
          matchedLines: number;
        };
      };
    };
    lsToolCall?: {
      args: { path: string; ignore?: string[] };
      result?: {
        success?: {
          childrenFiles: number;
          childrenDirs: number;
        };
      };
    };
    globToolCall?: {
      args: { globPattern: string; targetDirectory?: string };
      result?: {
        success?: {
          totalFiles: number;
        };
      };
    };
    semSearchToolCall?: {
      args: { query: string; targetDirectories?: string[]; explanation?: string };
      result?: {
        success?: {
          results: string;
          codeResults?: Array<{
            path: string;
            content: string;
            score?: number;
          }>;
        };
      };
    };
    readLintsToolCall?: {
      args: { paths: string[] };
      result?: {
        success?: {
          fileDiagnostics: Array<{
            path: string;
            diagnostics: Array<{
              message: string;
              severity: string;
              line?: number;
              column?: number;
            }>;
          }>;
          totalFiles: number;
          totalDiagnostics: number;
        };
      };
    };
    function?: {
      name: string;
      arguments: string;
    };
  };
  session_id: string;
}

export interface CursorResultEvent {
  type: 'result';
  subtype: 'success' | 'error';
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  result: string;
  session_id: string;
  request_id?: string;
  error?: string;
}

export type CursorStreamEvent =
  | CursorSystemEvent
  | CursorUserEvent
  | CursorAssistantEvent
  | CursorToolCallEvent
  | CursorResultEvent;
