/**
 * Z.ai Provider - Executes queries using Z.ai GLM models
 *
 * Integrates with Z.ai's OpenAI-compatible API to support GLM models
 * with tool calling capabilities. GLM-4.6v is the only model that supports vision.
 */

import { secureFs, validatePath } from '@automaker/platform';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { BaseProvider, type ProviderFeature } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ContentBlock,
  ProviderConfig,
} from './types.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('ZaiProvider');

const execAsync = promisify(exec);

/**
 * Z.ai SSE (Server-Sent Events) streaming response types
 * Matches the format of Z.ai's OpenAI-compatible API
 */
interface ZaiSseToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface ZaiSseDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: ZaiSseToolCallDelta[];
}

interface ZaiSseChoice {
  delta?: ZaiSseDelta;
  finish_reason?: string;
}

interface ZaiSseResponse {
  choices?: ZaiSseChoice[];
}

/**
 * Blocklist of dangerous commands for execute_command tool
 * Only commands that can cause system-wide damage are blocked
 * All other commands are allowed, with real security enforced by ALLOWED_ROOT_DIRECTORY
 */
const BLOCKED_COMMANDS = new Set([
  // Disk destruction commands
  'format',
  'fdisk',
  'diskpart',
  'diskutil',
  // System control commands
  'shutdown',
  'reboot',
  'poweroff',
  'halt',
  'systemctl',
  'init',
  'telinit',
  // User management commands
  'userdel',
  'groupdel',
  'passwd',
  'chpasswd',
]);

/**
 * Dangerous patterns that could cause system-wide damage
 * These are blocked regardless of the command used
 */
const DANGEROUS_PATTERNS = [
  // Recursive delete from root
  /rm\s+-[rf]+\s+\/$/, // rm -rf / (with / at end)
  /rm\s+-[rf]+\s+\\$/, // rm -rf \ (Windows root)
  /del\s+\/$/, // del / (Windows)
  /del\s+\\$/, // del \ (Windows)
  // Recursive delete with wildcards pointing to root
  /rm\s+-[rf]+\s+\/\*/, // rm -rf /* (recursive from root)
  /rm\s+-[rf]+\s+\\\*/, // rm -rf \* (Windows)
  // format/fdisk/shutdown with any arguments
  /format\s/, // format with any args
  /fdisk\s/, // fdisk with any args
  /diskpart\s/, // diskpart with any args
  /diskutil\s/, // diskutil with any args
  /shutdown\s+[a-z-]/i, // shutdown with any flags
  /reboot\s/, // reboot with any args
  /poweroff\s/, // poweroff with any args
  /halt\s/, // halt with any args
  /systemctl\s+(poweroff|reboot|halt)/i, // systemctl poweroff/reboot/halt
];

/**
 * File extensions for grep search - expand to cover more file types
 */
const GREP_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'jsonc',
  'md',
  'mdx',
  'txt',
  'css',
  'scss',
  'sass',
  'less',
  'html',
  'htm',
  'xml',
  'svg',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'py',
  'rb',
  'php',
  'java',
  'go',
  'rs',
  'c',
  'cpp',
  'cc',
  'cxx',
  'h',
  'hpp',
  'sh',
  'bash',
  'zsh',
  'fish',
  'dockerfile',
  'dockerignore',
  'gitignore',
  'gitattributes',
  'env',
  'env.example',
]);

/**
 * Commands that take file paths as arguments
 * Used for additional path validation
 */
const PATH_COMMANDS = new Set<string>([
  'rm',
  'del',
  'erase',
  'mv',
  'move',
  'cp',
  'copy',
  'xcopy',
  'mkdir',
  'md',
  'touch',
  'ln',
  'mklink',
  'cat',
  'type',
  'head',
  'tail',
  'ls',
  'dir',
  'find',
  'findstr',
  'grep',
  'sed',
  'git',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'bun',
  'node',
  'python',
  'python3',
  'tsc',
  'vitest',
  'jest',
  'pytest',
  'mocha',
]);

/**
 * Flags that indicate next arg is a path (e.g., -f, -o, --out)
 */
const PATH_FLAGS = new Set([
  '-f',
  '-o',
  '-i',
  '--file',
  '--output',
  '--out',
  '-C',
  '-c',
  '--config',
]);

/**
 * Extract path from --flag=value or -Cvalue format
 * Returns the path part if found, null otherwise
 */
function extractPathFromFlag(arg: string): string | null {
  // Handle --flag=path or --flag:path format
  if (arg.startsWith('--')) {
    const eqMatch = arg.match(/^--[^=]+=(.+)/);
    if (eqMatch) return eqMatch[1];
    const colonMatch = arg.match(/^--[^:]+:(.+)/);
    if (colonMatch) return colonMatch[1];
  }
  // Handle -Cpath or -fpath format (single dash with value attached)
  if (arg.startsWith('-') && !arg.startsWith('--') && arg.length > 2) {
    // Some flags like -C, -f, -o can have attached values
    const flag = arg.slice(0, 2);
    if (PATH_FLAGS.has(flag)) {
      return arg.slice(2);
    }
  }
  return null;
}

/**
 * Check if an argument looks like a file path
 */
function looksLikePath(arg: string): boolean {
  return (
    arg.startsWith('./') ||
    arg.includes('/') ||
    arg.includes('\\') ||
    /^\w+\.\w+$/.test(arg) ||
    arg === '-' ||
    arg === '.'
  );
}

/**
 * Validate and sanitize a shell command
 * @param command - Command string to sanitize
 * @param cwd - Current working directory for path validation
 * @returns Object with command and sanitized arguments
 * @throws Error if command is blocked or contains dangerous patterns
 */
function sanitizeCommand(
  command: string,
  cwd: string
): { command: string; args: string[]; redirects: string[]; pipes: string[] } {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error('Command cannot be empty');
  }

  // Check for dangerous patterns first (before parsing)
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error(`Dangerous command pattern blocked: ${trimmed}`);
    }
  }

  // Extract shell pipes (|) before parsing arguments
  // Pipes chain commands together: cmd1 | cmd2
  const pipes: string[] = [];
  let workCommand = trimmed;

  // Handle pipe separators first (before ampersands)
  const pipeParts = workCommand.split(/\|/);
  if (pipeParts.length > 1) {
    pipes.push(...pipeParts.slice(1).map((p) => p.trim()));
    workCommand = pipeParts[0].trim();
  }

  // Extract Windows-style ampersand separators (&, &&)
  // Windows: cmd1 & cmd2 runs async, cmd1 && cmd2 runs sequentially
  // We'll treat them like pipes but they go to the pipes array
  const ampersandParts = workCommand.split(/&&?/);
  if (ampersandParts.length > 1) {
    pipes.push(...ampersandParts.slice(1).map((p) => p.trim()));
    workCommand = ampersandParts[0].trim();
  }

  // Extract shell redirects before parsing arguments
  // Supported redirects: >, >>, <, 2>, 2>>, 2>&1, etc.
  const redirects: string[] = [];
  let commandWithoutRedirects = workCommand;

  // Pattern to match redirect operators with their targets
  // Matches: >file, >>file, <file, 2>file, 2>>file, 2>&1, etc.
  const redirectPattern = /(\d*>&?\d*|>>?|<)\s*(\S+|&\d+)/g;
  let match;
  while ((match = redirectPattern.exec(workCommand)) !== null) {
    redirects.push(match[0]);
  }

  // Remove redirects from command for validation (we'll add them back later)
  commandWithoutRedirects = workCommand.replace(redirectPattern, '').trim();

  // Split by whitespace but respect quotes
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < commandWithoutRedirects.length; i++) {
    const char = commandWithoutRedirects[i];

    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  if (parts.length === 0) {
    throw new Error('Command cannot be empty');
  }

  const baseCommand = parts[0];

  // Windows is case-insensitive, also normalize .exe, .bat, .cmd extensions
  const normalizedCommand = baseCommand.toLowerCase().replace(/\.(exe|bat|cmd)$/, '');

  // Check if command is in blocklist (case-insensitive for Windows)
  const commandBlocked = Array.from(BLOCKED_COMMANDS).some(
    (blocked) => blocked.toLowerCase() === normalizedCommand
  );

  if (commandBlocked) {
    throw new Error(`Command blocked for security: ${baseCommand}`);
  }

  // Check for path traversal in ALL arguments (including --flag=value forms)
  for (let i = 1; i < parts.length; i++) {
    const arg = parts[i];
    const embeddedPath = extractPathFromFlag(arg);
    if (arg.includes('..') || (embeddedPath && embeddedPath.includes('..'))) {
      throw new Error(`Path traversal not allowed: ${arg}`);
    }
  }

  // Track symlink target for ln command (ln source target - target is 2nd path arg)
  let symlinkTargetIndex = -1;
  if (baseCommand === 'ln') {
    // ln creates source -> target, where target is the second path-like arg
    let pathCount = 0;
    for (let i = 1; i < parts.length; i++) {
      const arg = parts[i];
      const embeddedPath = extractPathFromFlag(arg);
      const hasPath = looksLikePath(arg) || embeddedPath !== null;
      if (hasPath || PATH_FLAGS.has(arg)) {
        pathCount++;
        if (pathCount === 2) {
          symlinkTargetIndex = i;
          break;
        }
      }
    }
  }

  // Validate path-like arguments using platform guard
  let nextArgIsPath = false;
  for (let i = 1; i < parts.length; i++) {
    const arg = parts[i];
    const embeddedPath = extractPathFromFlag(arg);

    // Check if this arg should be treated as a path
    if (nextArgIsPath || (PATH_COMMANDS.has(baseCommand) && looksLikePath(arg))) {
      // Use platform guard - blocks absolute paths and outside-root
      const resolved = path.resolve(cwd, arg);
      validatePath(resolved); // Throws if outside ALLOWED_ROOT_DIRECTORY
      nextArgIsPath = false;
    } else if (embeddedPath !== null) {
      // Handle --flag=path or -Cpath format
      const resolved = path.resolve(cwd, embeddedPath);
      validatePath(resolved); // Throws if outside ALLOWED_ROOT_DIRECTORY
    } else if (PATH_FLAGS.has(arg)) {
      nextArgIsPath = true;
    }
  }

  // Special check for ln: verify symlink target won't point outside root
  if (baseCommand === 'ln' && symlinkTargetIndex > 0) {
    const targetArg = parts[symlinkTargetIndex];
    const embeddedPath = extractPathFromFlag(targetArg);
    const pathToCheck = embeddedPath || targetArg;

    // For symlinks, verify the target exists and resolve to check if it escapes
    const resolvedTarget = path.resolve(cwd, pathToCheck);
    // Check if the target itself is within allowed root
    try {
      validatePath(resolvedTarget);
    } catch {
      throw new Error(`Symlink target outside allowed root: ${pathToCheck}`);
    }
  }

  return { command: baseCommand, args: parts.slice(1), redirects, pipes };
}

/**
 * Z.ai API configuration
 * API base URL can be overridden via ZAI_API_BASE_URL or ZAI_API_URL environment variables
 */
const ZAI_API_BASE =
  process.env.ZAI_API_BASE_URL || process.env.ZAI_API_URL || 'https://api.z.ai/api/coding/paas/v4';
const ZAI_MODEL = 'glm-4.7';

/**
 * Tool definitions for Z.ai function calling
 * Maps AutoMaker tools to Z.ai function format
 */
const ZAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to read',
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating directories if needed',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to write',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['filePath', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing old_string with new_string',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to edit',
          },
          oldString: {
            type: 'string',
            description: 'String to replace',
          },
          newString: {
            type: 'string',
            description: 'Replacement string',
          },
        },
        required: ['filePath', 'oldString', 'newString'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'glob_search',
      description: 'Search for files matching a glob pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern (e.g., "**/*.ts")',
          },
          cwd: {
            type: 'string',
            description: 'Current working directory (defaults to project root if not provided)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_search',
      description: 'Search for content in files using regex pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Regex pattern to search for',
          },
          searchPath: {
            type: 'string',
            description: 'Path to search in (defaults to project root if not provided)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'execute_command',
      description: 'Execute a shell command (use with caution)',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Command to execute',
          },
          cwd: {
            type: 'string',
            description:
              'Working directory for command execution (defaults to project root if not provided)',
          },
        },
        required: ['command'],
      },
    },
  },
];

/**
 * Validate glob pattern for security
 */
function validateGlobPattern(pattern: string): void {
  // Check for path traversal
  if (pattern.includes('..')) {
    throw new Error('Path traversal not allowed in glob pattern');
  }

  // Check for command injection characters
  // Note: Allow / and \ as path separators for glob patterns
  // Allow : for Windows drive letters in patterns like C:/folder/**
  // Allow * ? {} [] as they are glob wildcards
  const dangerousChars = /[;&|`$()<>"]/;
  if (dangerousChars.test(pattern)) {
    throw new Error('Invalid characters in glob pattern');
  }

  // Check for absolute paths (but allow patterns like **/*.ts)
  if (path.isAbsolute(pattern) && !pattern.includes('*')) {
    throw new Error('Absolute paths not allowed in glob pattern');
  }
}

/**
 * Native glob implementation using fs.readdir
 * No external dependencies or shell commands for better security
 */
async function glob(pattern: string, cwd: string): Promise<string[]> {
  validateGlobPattern(pattern);

  try {
    const results: string[] = [];
    const regex = globToRegex(pattern, cwd);
    const maxDepth = (pattern.match(/\//g) || []).length + 2; // Limit recursion depth

    async function walkDir(dir: string, depth: number): Promise<void> {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(cwd, fullPath);

          // Skip dot files unless explicitly requested
          if (!pattern.includes('.') && entry.name.startsWith('.')) {
            continue;
          }

          // Check if the path matches the pattern
          if (regex.test(relativePath)) {
            results.push(relativePath.replace(/\\/g, '/'));
          }

          // Recurse into directories
          if (entry.isDirectory()) {
            // Check if pattern might have deeper matches
            if (pattern.includes('/') || pattern.includes('*')) {
              await walkDir(fullPath, depth + 1);
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    await walkDir(cwd, 0);
    return results;
  } catch (error) {
    logger.warn(`Glob failed: ${(error as Error).message}`);
    return [];
  }
}

/**
 * Convert a glob pattern to a RegExp for matching
 */
function globToRegex(globPattern: string, basePath: string): RegExp {
  // Escape special regex characters except for glob wildcards
  let regexStr = globPattern
    .replace(/\./g, '\\.') // Literal dots
    .replace(/\?/g, '[^/]') // ? matches any single character except /
    .replace(/\*\*/g, '.*') // ** matches any number of path segments
    .replace(/\*/g, '[^/]*'); // * matches any characters except /

  return new RegExp(`^${regexStr}$`);
}

/**
 * Native grep implementation using fs and glob
 * No shell commands involved for better security
 */
async function grep(
  pattern: string,
  searchPath: string
): Promise<Array<{ path: string; line: number; text: string }>> {
  // Validate pattern for security
  // Since we use native RegExp (not shell), allow most regex metacharacters
  // Only block shell command separators that could enable injection
  if (/[;|`]/.test(pattern)) {
    throw new Error('Invalid characters in grep pattern');
  }

  // Check for path traversal attempts in pattern
  if (pattern.includes('..')) {
    throw new Error('Path traversal not allowed in grep pattern');
  }

  try {
    // Find all files with matching extensions in the search path
    const extensionPatterns = Array.from(GREP_EXTENSIONS).flatMap((ext) => [
      `**/*.${ext}`,
      `**/*.${ext.toUpperCase()}`,
    ]);

    // Collect all matching file paths
    const filePathsSet = new Set<string>();
    for (const extPattern of extensionPatterns) {
      const matches = await glob(extPattern, searchPath);
      for (const match of matches) {
        filePathsSet.add(match);
      }
    }

    const filePaths = Array.from(filePathsSet).slice(0, 1000); // Limit to 1000 files

    // Search through each file
    const results: Array<{ path: string; line: number; text: string }> = [];
    const regex = new RegExp(pattern, 'i'); // Case-insensitive search

    for (const filePath of filePaths) {
      try {
        const fullPath = path.resolve(searchPath, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({
              path: filePath,
              line: i + 1,
              text: lines[i].trim().substring(0, 200), // Limit text length
            });
          }
        }
      } catch {
        // Skip files that can't be read
        continue;
      }
    }

    return results;
  } catch (error) {
    logger.warn(`Grep failed: ${(error as Error).message}`);
    return [];
  }
}

/**
 * Safely resolve a file path relative to baseCwd
 * For read operations, allows paths outside baseCwd (for context)
 * For write operations, restricts to within baseCwd (for security)
 * Enhanced with symlink checking and null byte detection
 */
async function safeResolvePath(
  baseCwd: string,
  filePath: string,
  allowOutside: boolean = false
): Promise<string> {
  // Check for null byte injection attack
  if (filePath.includes('\0')) {
    throw new Error('Null bytes not allowed in paths');
  }

  // Remove leading slash if present (indicates absolute path on Unix)
  // On Windows, this prevents paths like /home/workspace from becoming C:\home\workspace
  let normalizedPath = filePath.replace(/^\/+/, '');

  // If path starts with ./ or ../, resolve relative to baseCwd
  // If path is absolute (after removing leading slashes), still treat as relative
  const absolutePath = path.resolve(baseCwd, normalizedPath);

  // Security check: only enforce if allowOutside is false
  if (!allowOutside) {
    const relativePath = path.relative(baseCwd, absolutePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Access denied: path "${filePath}" is outside working directory`);
    }

    // Check for symlink escape attempts
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isSymbolicLink()) {
        const targetPath = path.resolve(
          path.dirname(absolutePath),
          await fs.readlink(absolutePath)
        );
        const targetRelative = path.relative(baseCwd, targetPath);
        if (targetRelative.startsWith('..')) {
          throw new Error(`Symlink targets outside working directory: ${filePath}`);
        }
      }
    } catch {
      // File doesn't exist yet - allow for new file creation
      // But check parent directory for symlinks
      try {
        const parentDir = path.dirname(absolutePath);
        const parentStat = await fs.stat(parentDir);
        if (parentStat.isSymbolicLink()) {
          const targetPath = path.resolve(path.dirname(parentDir), await fs.readlink(parentDir));
          const targetRelative = path.relative(baseCwd, targetPath);
          if (targetRelative.startsWith('..')) {
            throw new Error(`Parent directory symlink targets outside working directory`);
          }
        }
      } catch {
        // Parent doesn't exist either - will be created
      }
    }
  }

  return absolutePath;
}

/**
 * Tool execution handlers
 */
async function executeToolCall(
  toolName: string,
  toolArgs: Record<string, unknown>,
  baseCwd: string
): Promise<string> {
  switch (toolName) {
    case 'read_file': {
      const filePath = toolArgs.filePath as string;
      // Allow reading files outside worktree for context
      const absolutePath = await safeResolvePath(baseCwd, filePath, true);
      const content = (await secureFs.readFile(absolutePath, 'utf-8')) as string;
      return content;
    }

    case 'write_file': {
      const filePath = toolArgs.filePath as string;
      const content = toolArgs.content as string;
      // Writes must be within worktree (security)
      const absolutePath = await safeResolvePath(baseCwd, filePath, false);
      // Ensure parent directory exists
      const dir = path.dirname(absolutePath);
      await secureFs.mkdir(dir, { recursive: true });
      await secureFs.writeFile(absolutePath, content, 'utf-8');
      return `Successfully wrote to ${filePath}`;
    }

    case 'edit_file': {
      const filePath = toolArgs.filePath as string;
      const oldString = toolArgs.oldString as string;
      const newString = toolArgs.newString as string;
      // Edits must be within worktree (security)
      const absolutePath = await safeResolvePath(baseCwd, filePath, false);
      const content = (await secureFs.readFile(absolutePath, 'utf-8')) as string;
      const newContent = content.replace(oldString, newString);
      if (newContent === content) {
        throw new Error(`Old string not found in ${filePath}`);
      }
      await secureFs.writeFile(absolutePath, newContent, 'utf-8');
      return `Successfully edited ${filePath}`;
    }

    case 'glob_search': {
      const pattern = toolArgs.pattern as string;
      const searchCwd = (toolArgs.cwd as string) || baseCwd;
      // Restrict to worktree for security
      const safeSearchCwd = await safeResolvePath(baseCwd, searchCwd, false);
      validatePath(safeSearchCwd); // Enforce ALLOWED_ROOT_DIRECTORY
      const results = await glob(pattern, safeSearchCwd);
      return results.join('\n');
    }

    case 'grep_search': {
      const pattern = toolArgs.pattern as string;
      const searchPath = (toolArgs.searchPath as string) || baseCwd;
      // Restrict to worktree for security
      const safeSearchPath = await safeResolvePath(baseCwd, searchPath, false);
      validatePath(safeSearchPath); // Enforce ALLOWED_ROOT_DIRECTORY
      const results = await grep(pattern, safeSearchPath);
      return results.map((r) => `${r.path}:${r.line}:${r.text}`).join('\n');
    }

    case 'execute_command': {
      const command = toolArgs.command as string;
      const commandCwd = (toolArgs.cwd as string) || baseCwd;

      // Resolve and validate cwd using platform guard
      const resolvedCwd = path.isAbsolute(commandCwd)
        ? commandCwd
        : path.resolve(baseCwd, commandCwd);
      validatePath(resolvedCwd); // Throws if outside ALLOWED_ROOT_DIRECTORY

      // Sanitize command with cwd for path validation
      const sanitized = sanitizeCommand(command, resolvedCwd);

      try {
        // Build command with sanitized arguments, redirects, and pipes
        let cmdString = sanitized.command;
        if (sanitized.args.length > 0) {
          cmdString += ` ${sanitized.args.join(' ')}`;
        }
        if (sanitized.redirects.length > 0) {
          cmdString += ` ${sanitized.redirects.join(' ')}`;
        }
        if (sanitized.pipes.length > 0) {
          // Add pipe operators and chained commands
          for (const pipeCmd of sanitized.pipes) {
            cmdString += ` | ${pipeCmd}`;
          }
        }

        const { stdout, stderr } = await execAsync(cmdString, {
          cwd: resolvedCwd,
          maxBuffer: 1024 * 1024, // 1MB
          env: { PATH: process.env.PATH }, // Minimal environment
          timeout: 30000, // 30 second timeout
        });

        return stdout || stderr;
      } catch (error) {
        const errorMessage = (error as Error).message;
        // Check if it's a timeout
        if (errorMessage.includes('timedOut')) {
          return `Command timed out after 30 seconds`;
        }
        return `Command failed: ${errorMessage}`;
      }
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

export class ZaiProvider extends BaseProvider {
  constructor(config?: ProviderConfig) {
    super(config);
  }

  getName(): string {
    return 'zai';
  }

  /**
   * Create an abort signal that combines user abort controller with a timeout
   * @param userController - Optional user-provided abort controller
   * @returns AbortSignal that aborts on user cancel or timeout (5 minutes)
   */
  private createAbortSignal(userController?: AbortController): AbortSignal {
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUT_MS);

    // Store timeout ID and cleanup function for proper cleanup
    (timeoutController as any)._timeoutId = timeoutId;
    (timeoutController as any)._cleanup = () => {
      clearTimeout(timeoutId);
    };

    // Use AbortSignal.any() if available (Node.js 20+), otherwise use fallback
    if ('any' in AbortSignal && typeof AbortSignal.any === 'function') {
      try {
        if (userController) {
          return AbortSignal.any([userController.signal, timeoutController.signal]);
        }
        return timeoutController.signal;
      } catch (e) {
        // Fallback if AbortSignal.any() fails unexpectedly
        logger.warn('[Zai] AbortSignal.any() failed, using fallback');
      }
    }

    // Fallback for Node.js < 20: prioritize user abort, use timeout as backup
    return userController?.signal || timeoutController.signal;
  }

  /**
   * Get API key from credentials
   */
  private getApiKey(): string {
    // Try config first, then environment variable
    if (this.config.apiKey) {
      return this.config.apiKey;
    }
    if (process.env.ZAI_API_KEY) {
      return process.env.ZAI_API_KEY;
    }
    throw new Error('ZAI_API_KEY not configured');
  }

  /**
   * Fetch with retry logic and exponential backoff
   * Retries on network errors, 5xx errors, and 429 rate limit
   * Does NOT retry on 4xx client errors (except 429)
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (response.ok || (!response.ok && response.status < 400)) {
          return response;
        }

        if (response.status === 429) {
          // Rate limit - retry with backoff
          if (attempt < maxRetries - 1) {
            const backoffMs = Math.pow(2, attempt) * 1000;
            logger.warn(
              `[Zai] Rate limited, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`
            );
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
        }

        // Don't retry on other client errors or server errors after exhausting retries
        return response;
      } catch (error) {
        // Retry only on network errors
        if (attempt === maxRetries - 1) {
          logger.error(
            `[Zai] Fetch failed after ${maxRetries} attempts: ${(error as Error).message}`
          );
          throw error;
        }

        // Network error - retry with exponential backoff
        const backoffMs = Math.pow(2, attempt) * 1000;
        logger.warn(
          `[Zai] Network error, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries}): ${(error as Error).message}`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Execute a query using Z.ai API with tool calling support
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const {
      prompt,
      model = ZAI_MODEL,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory = [],
      sdkSessionId,
      outputFormat,
    } = options;

    const apiKey = this.getApiKey();

    // Handle images for non-vision models
    // If a Zai model that doesn't support vision is selected with images,
    // use GLM-4.6v to describe the images and prepend the description to the prompt
    let finalPrompt: string | Array<{ type: string; text?: string; source?: object }> = prompt;
    const finalModel = model;

    if (!this.modelSupportsVision(model)) {
      // Check if prompt contains images
      const hasImages =
        typeof prompt === 'object' &&
        Array.isArray(prompt) &&
        prompt.some((block) => block.type === 'image' || block.source);

      if (hasImages) {
        logger.info(`Model ${model} doesn't support vision, using GLM-4.6v to describe images`);

        try {
          // Filter images - handle both ContentBlock format and ImageAttachment format
          const images = (Array.isArray(prompt) ? prompt : []).filter((block) => {
            if (typeof block !== 'object' || block === null) return false;
            // Handle ContentBlock format { type: 'image', source: {...} }
            if ('type' in block && block.type === 'image') return true;
            if ('source' in block && block.source) return true;
            // Handle ImageAttachment format { data: string, mimeType: string }
            if ('data' in block && 'mimeType' in block) return true;
            return false;
          });
          const textContent = (Array.isArray(prompt) ? prompt : []).filter((block) => {
            if (typeof block !== 'object' || block === null) return false;
            // ContentBlock format - exclude images
            if ('type' in block && block.type === 'image') return false;
            if ('source' in block && block.source) return false;
            // ImageAttachment format - exclude images
            if ('data' in block && 'mimeType' in block) return false;
            return true;
          });
          const textOnly = textContent.map((block) => block.text || '').join('\n');

          // Describe images using GLM-4.6v
          const imageDescription = await this.describeImages(images, textOnly);

          // Combine text with image description
          finalPrompt = textOnly + (imageDescription ? '\n\n' + imageDescription : '');
        } catch (error) {
          logger.warn(`Image description failed: ${(error as Error).message}`);
          // Fall back to text-only content
          if (Array.isArray(prompt)) {
            finalPrompt = prompt.map((block) => block.text || '').join('\n');
          } else {
            finalPrompt = prompt; // Already a string
          }
        }
      }
    }

    // Build messages array
    // Zai supports reasoning_content for preserved thinking mode (API format)
    const messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
      reasoning_content?: string; // Zai API format for thinking mode - preserved across turns
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
      tool_call_id?: string;
    }> = [];

    // Add system prompt
    if (systemPrompt) {
      if (typeof systemPrompt === 'string') {
        messages.push({ role: 'system', content: systemPrompt });
      } else if (systemPrompt.type === 'preset' && systemPrompt.preset === 'claude_code') {
        messages.push({
          role: 'system',
          content:
            'You are an AI programming assistant. You help users write code, debug issues, and build software. Use the available tools to read and edit files, search code, and execute commands.\n\n' +
            'IMPORTANT: Always use RELATIVE paths (e.g., "src/index.ts", "./config.json") for file operations. ' +
            'NEVER use absolute paths like "/home/user/file" or "C:\\Users\\file". ' +
            'All paths are relative to the current working directory.',
        });
      }
    }

    // Add base working directory info to system prompt for clarity
    if (cwd) {
      const dirInfo = `\n\nCurrent working directory: ${cwd}`;
      if (messages.length > 0 && messages[0].role === 'system') {
        const existingContent = messages[0].content;
        messages[0].content = Array.isArray(existingContent)
          ? existingContent
          : typeof existingContent === 'string'
            ? existingContent + dirInfo
            : dirInfo;
      } else {
        messages.unshift({ role: 'system', content: dirInfo.slice(2) });
      }
    }

    // When structured output is requested, add JSON output instruction
    // Z.ai requires this when using response_format: { type: 'json_object' }
    if (outputFormat) {
      const jsonInstruction =
        'You must respond with valid JSON only. Do not include any explanatory text outside the JSON structure.';
      if (messages.length > 0 && messages[0].role === 'system') {
        // Append to existing system prompt
        const existingContent = messages[0].content;
        messages[0].content = Array.isArray(existingContent)
          ? existingContent
          : typeof existingContent === 'string'
            ? `${existingContent}\n\n${jsonInstruction}`
            : jsonInstruction;
      } else {
        // Prepend new system prompt
        messages.unshift({ role: 'system', content: jsonInstruction });
      }
    }

    // Add conversation history
    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        messages.push({
          role: 'user',
          content: this.formatContent(msg.content, cwd, model),
        });
      } else if (msg.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: this.formatContent(msg.content, '', model),
        });
      }
    }

    // Add current prompt
    messages.push({
      role: 'user',
      content: this.formatContent(finalPrompt, cwd, finalModel),
    });

    // Filter tools based on allowedTools
    const toolsToUse = allowedTools
      ? ZAI_TOOLS.filter((tool) => {
          const toolName = tool.function.name;
          // Map tool names to allowed tools
          const toolMap: Record<string, string> = {
            read_file: 'Read',
            write_file: 'Write',
            edit_file: 'Edit',
            glob_search: 'Glob',
            grep_search: 'Grep',
            execute_command: 'Bash',
          };
          return allowedTools.includes(toolMap[toolName] || toolName);
        })
      : ZAI_TOOLS;

    // Tool execution loop
    let turnCount = 0;
    // Use sdkSessionId if provided, otherwise generate a new one
    let sessionId = sdkSessionId || this.generateSessionId();

    while (turnCount < maxTurns) {
      if (abortController?.signal.aborted) {
        yield {
          type: 'error',
          error: 'Request aborted by user',
        };
        return;
      }

      turnCount++;

      try {
        // Call Z.ai API with streaming enabled
        const response = await this.fetchWithRetry(`${ZAI_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            tools: toolsToUse.length > 0 ? toolsToUse : undefined,
            tool_choice: toolsToUse.length > 0 ? 'auto' : undefined,
            stream: true, // Enable streaming for better UX
            temperature: 0.7,
            // Z.ai thinking mode support (GLM-4.7)
            // Default to enabled thinking for GLM-4.7 if not explicitly disabled
            thinking: options.thinking || { type: 'enabled', clear_thinking: false },
            // Z.ai structured output support
            ...(outputFormat && { response_format: { type: 'json_object' } }),
          }),

          // Combine user abort controller with timeout
          signal: this.createAbortSignal(abortController),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Z.ai API error: ${response.status} - ${errorText}`);
        }

        // Parse streaming response (Server-Sent Events format)
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let currentContent = '';
        let currentReasoning = '';
        let currentToolCalls: Map<number, { id: string; name: string; arguments: string }> =
          new Map();
        let finishReason = '';
        let sseBuffer = ''; // Buffer for incomplete SSE lines

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            sseBuffer += chunk;

            // Split into lines, keeping the last incomplete line in buffer
            const lines = sseBuffer.split('\n');
            if (!chunk.endsWith('\n')) {
              // Last line is incomplete, keep it for next chunk
              sseBuffer = lines.pop() || '';
            } else {
              sseBuffer = '';
            }

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;

              const data = trimmed.slice(6); // Remove 'data: ' prefix
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data) as ZaiSseResponse;

                const choice = parsed.choices?.[0];
                if (!choice) continue;

                // Handle content delta
                if (choice.delta?.content) {
                  currentContent += choice.delta.content;

                  // Yield text content incrementally
                  yield {
                    type: 'assistant',
                    session_id: sessionId,
                    message: {
                      role: 'assistant',
                      content: [{ type: 'text', text: choice.delta.content }],
                    },
                  };
                }

                // Handle reasoning content (thinking mode)
                if (choice.delta?.reasoning_content) {
                  currentReasoning += choice.delta.reasoning_content;

                  // Yield thinking content incrementally (unified format)
                  yield {
                    type: 'assistant',
                    session_id: sessionId,
                    message: {
                      role: 'assistant',
                      content: [
                        {
                          type: 'thinking',
                          thinking: choice.delta.reasoning_content,
                        },
                      ],
                    },
                  };
                }

                // Handle tool calls in streaming
                if (choice.delta?.tool_calls) {
                  for (const toolCall of choice.delta.tool_calls) {
                    const index = toolCall.index;

                    if (!currentToolCalls.has(index)) {
                      currentToolCalls.set(index, {
                        id: toolCall.id || '',
                        name: '',
                        arguments: '',
                      });
                    }

                    const current = currentToolCalls.get(index)!;
                    if (toolCall.id) current.id = toolCall.id;
                    if (toolCall.function?.name) current.name = toolCall.function.name;
                    if (toolCall.function?.arguments) {
                      current.arguments += toolCall.function.arguments;
                    }
                  }
                }

                // Track finish reason
                if (choice.finish_reason) {
                  finishReason = choice.finish_reason;
                }
              } catch (parseError) {
                // Skip unparseable chunks
                logger.debug(`Failed to parse SSE chunk: ${(parseError as Error).message}`);
              }
            }

            // Check for completion - only break if all content has been received
            // For 'stop': all deltas should be complete
            // For 'tool_calls': verify all tool calls are complete before breaking
            if (finishReason === 'stop') {
              break;
            }
            if (finishReason === 'tool_calls' && currentToolCalls.size > 0) {
              // Verify all tool calls have complete data (id, name, and arguments)
              const allComplete = Array.from(currentToolCalls.values()).every(
                (tc) => tc.id && tc.name && tc.arguments
              );
              if (allComplete) {
                break;
              }
              // Otherwise continue waiting for complete tool call data
            }
          } // closes while loop
        } finally {
          // closes try block, starts finally
          // Ensure reader is always released to prevent resource leaks
          reader.releaseLock();
        }

        // Safety check: if stream ended with incomplete tool calls, warn and don't execute them
        if (finishReason === 'tool_calls' && currentToolCalls.size > 0) {
          const allComplete = Array.from(currentToolCalls.values()).every(
            (tc) => tc.id && tc.name && tc.arguments
          );
          if (!allComplete) {
            logger.warn('[Zai] Stream ended with incomplete tool calls, skipping execution');
            // Clear incomplete tool calls to prevent execution errors
            currentToolCalls.clear();
          }
        }

        // Add assistant message to history
        messages.push({
          role: 'assistant',
          content: currentContent || undefined,
          reasoning_content: currentReasoning || undefined,
          tool_calls:
            currentToolCalls.size > 0
              ? Array.from(currentToolCalls.values())
                  .filter((tc) => {
                    // Validate that tool call arguments are valid JSON before including
                    try {
                      JSON.parse(tc.arguments);
                      return true;
                    } catch {
                      logger.warn(
                        `[Zai] Discarding invalid tool call: ${tc.name} with malformed arguments`
                      );
                      return false;
                    }
                  })
                  .map((tc) => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                      name: tc.name,
                      arguments: tc.arguments,
                    },
                  }))
              : undefined,
        });

        // Process tool calls after streaming is complete
        // Only execute tools if we received a proper tool_calls finish reason
        if (currentToolCalls.size > 0 && finishReason === 'tool_calls') {
          for (const [index, toolCall] of currentToolCalls) {
            // Validate JSON before processing
            let toolArgs: Record<string, unknown>;
            try {
              toolArgs = JSON.parse(toolCall.arguments);
            } catch {
              // Skip invalid tool calls (already filtered above, but double-check)
              logger.warn(
                `[Zai] Skipping tool ${toolCall.name} with invalid arguments: ${toolCall.arguments}`
              );
              continue;
            }

            const toolName = toolCall.name;

            // Yield tool_use message
            yield {
              type: 'assistant',
              session_id: sessionId,
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    name: toolName,
                    input: toolArgs,
                  },
                ],
              },
            };

            // Execute tool
            try {
              const toolResult = await executeToolCall(toolName, toolArgs, cwd);

              // Add tool result to messages
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: toolResult,
              });

              // Yield tool result
              yield {
                type: 'result',
                parent_tool_use_id: toolCall.id,
                result: toolResult,
              };
            } catch (toolError) {
              const errorMsg = `Tool ${toolName} failed: ${(toolError as Error).message}`;
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: errorMsg,
              });
              yield {
                type: 'error',
                error: errorMsg,
              };
            }
          }

          // Continue loop for another response after tool execution
          continue;
        }

        // If finish_reason is 'stop', we're done
        if (finishReason === 'stop') {
          yield {
            type: 'result',
            result: 'Conversation completed',
          };
          break;
        }
      } catch (error) {
        const errorMsg = (error as Error).message;
        yield {
          type: 'error',
          error: errorMsg,
        };
        throw error;
      }
    }
  }

  /**
   * Format content for API (handle images if present)
   * For GLM-4.6v: formats images for multimodal content
   * For non-vision models: filters to text (should already be handled by image description)
   */
  private formatContent(
    content: string | Array<{ type: string; text?: string; source?: object }>,
    basePath = '',
    model = ''
  ): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
    if (typeof content === 'string') {
      return content;
    }

    // Check if any content block is an image
    const hasImage = content.some((block) => block.type === 'image' || block.source);

    if (!hasImage) {
      return content.map((block) => block.text || '').join('\n');
    }

    // Check if model supports vision (only GLM-4.6v supports vision)
    const supportsVision = this.modelSupportsVision(model);

    // For non-vision models, filter to text-only (fallback safety)
    if (!supportsVision) {
      return content.map((block) => block.text || '').join('\n');
    }

    // Format for multimodal content (GLM-4.6v supports vision)
    return content.map((block) => {
      if (block.type === 'image' && block.source) {
        // Handle image - if it's a file path, convert to data URL
        const source = block.source as { type?: string; media_type?: string; data?: string };
        if (source.type === 'base64') {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${source.media_type || 'image/png'};base64,${source.data}`,
            },
          };
        }
      }
      return { type: 'text', text: block.text || '' };
    }) as Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }

  /**
   * Generate a session ID for conversation tracking
   */
  private generateSessionId(): string {
    return `zai_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Check if the given model supports vision
   * Only GLM-4.6v supports vision among Zai models
   */
  private modelSupportsVision(model: string): boolean {
    return model === 'glm-4.6v';
  }

  /**
   * Describe images using GLM-4.6v (the only vision-capable Zai model)
   * Returns a text description of the images
   */
  private async describeImages(
    images: Array<{ type: string; source?: object }>,
    originalPrompt: string
  ): Promise<string> {
    // Validate image sources - only base64 is supported
    for (const img of images) {
      if (img.source && typeof img.source === 'object') {
        const source = img.source as { type?: string; data?: string };
        // Reject file:// URLs or other URL schemes
        if (source.data && typeof source.data === 'string' && source.data.startsWith('file://')) {
          throw new Error('file:// URLs are not supported in image sources');
        }
        // Reject any source type other than base64
        if (source.type && source.type !== 'base64') {
          throw new Error(
            `Unsupported image source type: ${source.type}. Only base64 is supported.`
          );
        }
      }
    }

    const apiKey = this.getApiKey();

    // Build image-only content for GLM-4.6v
    const imageContent = images
      .map((img) => {
        if (img.type === 'image' && img.source) {
          const source = img.source as { type?: string; media_type?: string; data?: string };
          if (source.type === 'base64') {
            return {
              type: 'image_url',
              image_url: {
                url: `data:${source.media_type || 'image/png'};base64,${source.data}`,
              },
            };
          }
        }
        return null;
      })
      .filter(Boolean);

    const promptForVision = `Please describe these images in the context of: "${originalPrompt.substring(0, 200)}...". Provide a concise description that would help someone understand the visual content.`;

    try {
      const response = await fetch(`${ZAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'glm-4.6v',
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: promptForVision }, ...imageContent],
            },
          ],
          stream: false,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        logger.warn('Failed to describe images, continuing without descriptions');
        return '';
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const description = data.choices?.[0]?.message?.content || '';
      return `[Image Context: ${description}]`;
    } catch (error) {
      logger.warn(`Image description failed: ${(error as Error).message}`);
      return '';
    }
  }

  /**
   * Detect if Z.ai API key is configured
   */
  async detectInstallation(): Promise<InstallationStatus> {
    let apiKey: string;
    try {
      apiKey = this.getApiKey();
    } catch {
      // No API key configured
      return {
        installed: true,
        method: 'sdk',
        hasApiKey: false,
        authenticated: false,
        error: 'ZAI_API_KEY not configured',
      };
    }

    const hasKey = !!apiKey && apiKey.length > 0;
    if (!hasKey) {
      return {
        installed: true,
        method: 'sdk',
        hasApiKey: false,
        authenticated: false,
        error: 'ZAI_API_KEY not configured',
      };
    }

    // Try a simple API call to verify the key works
    try {
      const response = await fetch(`${ZAI_API_BASE}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        return {
          installed: true,
          method: 'sdk',
          hasApiKey: true,
          authenticated: true,
        };
      } else {
        return {
          installed: true,
          method: 'sdk',
          hasApiKey: true,
          authenticated: false,
          error: `API key validation failed: ${response.status}`,
        };
      }
    } catch {
      // Network error - consider as installed but unverified
      return {
        installed: true,
        method: 'sdk',
        hasApiKey: true,
        authenticated: true, // Assume valid if network fails
      };
    }
  }

  /**
   * Get available GLM models
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'glm-4.7',
        name: 'GLM-4.7',
        modelString: 'glm-4.7',
        provider: 'zai',
        description: 'Z.ai flagship model with strong reasoning capabilities and thinking mode',
        contextWindow: 200000,
        maxOutputTokens: 128000,
        supportsVision: false,
        supportsTools: true,
        supportsExtendedThinking: true, // All GLM models support thinking mode
        tier: 'premium',
        default: true,
      },
      {
        id: 'glm-4.6v',
        name: 'GLM-4.6v',
        modelString: 'glm-4.6v',
        provider: 'zai',
        description: 'Multimodal model with vision support and thinking mode',
        contextWindow: 128000,
        maxOutputTokens: 96000,
        supportsVision: true,
        supportsTools: true,
        supportsExtendedThinking: true, // All GLM models support thinking mode
        tier: 'vision',
        default: false,
      },
      {
        id: 'glm-4.6',
        name: 'GLM-4.6',
        modelString: 'glm-4.6',
        provider: 'zai',
        description: 'Balanced performance with strong reasoning and thinking mode',
        contextWindow: 200000,
        maxOutputTokens: 128000,
        supportsVision: false,
        supportsTools: true,
        supportsExtendedThinking: true, // All GLM models support thinking mode
        tier: 'standard',
        default: false,
      },
      {
        id: 'glm-4.5-air',
        name: 'GLM-4.5-Air',
        modelString: 'glm-4.5-air',
        provider: 'zai',
        description: 'Fast and efficient for simple tasks with thinking mode',
        contextWindow: 128000,
        maxOutputTokens: 96000,
        supportsVision: false,
        supportsTools: true,
        supportsExtendedThinking: true, // All GLM models support thinking mode
        tier: 'basic',
        default: false,
      },
    ];
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: ProviderFeature | string): boolean {
    // Normalize legacy feature names for backward compatibility
    const normalizedFeature = BaseProvider.normalizeFeatureName(feature);

    // Zai supports: tools, text, vision (via glm-4.6v), thinking (via all GLM models), structured output
    // Zai does NOT support: mcp, browser (these are application-layer features)
    const supportedFeatures: ProviderFeature[] = [
      'tools',
      'text',
      'vision',
      'thinking', // Zai's thinking mode (GLM reasoning content)
      'structuredOutput',
    ];
    return supportedFeatures.includes(normalizedFeature);
  }

  /**
   * Validate the provider configuration
   */
  validateConfig(): { valid: boolean; errors: string[]; warnings?: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.getApiKey();
    } catch {
      errors.push('ZAI_API_KEY not configured');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
