/**
 * System Paths Configuration
 *
 * Centralized configuration for ALL system paths that automaker needs to access
 * outside of the ALLOWED_ROOT_DIRECTORY. These are well-known system paths for
 * tools like GitHub CLI, Claude CLI, Node.js version managers, etc.
 *
 * ALL file system access must go through this module or secureFs.
 * Direct fs imports are NOT allowed anywhere else in the codebase.
 *
 * Categories of system paths:
 * 1. CLI Tools: GitHub CLI, Claude CLI
 * 2. Version Managers: NVM, fnm, Volta
 * 3. Shells: /bin/zsh, /bin/bash, PowerShell
 * 4. Electron userData: API keys, window bounds, app settings
 * 5. Script directories: node_modules, logs (relative to script)
 */

import os from 'os';
import path from 'path';
import fsSync from 'fs';
import fs from 'fs/promises';

// =============================================================================
// System Tool Path Definitions
// =============================================================================

/**
 * Get common paths where GitHub CLI might be installed
 */
export function getGitHubCliPaths(): string[] {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    return [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'gh', 'bin', 'gh.exe'),
      path.join(process.env.ProgramFiles || '', 'GitHub CLI', 'gh.exe'),
    ].filter(Boolean);
  }

  return [
    '/opt/homebrew/bin/gh',
    '/usr/local/bin/gh',
    path.join(os.homedir(), '.local', 'bin', 'gh'),
    '/home/linuxbrew/.linuxbrew/bin/gh',
  ];
}

/**
 * Get common paths where Claude CLI might be installed
 */
export function getClaudeCliPaths(): string[] {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return [
      path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
      path.join(appData, 'npm', 'claude.cmd'),
      path.join(appData, 'npm', 'claude'),
      path.join(appData, '.npm-global', 'bin', 'claude.cmd'),
      path.join(appData, '.npm-global', 'bin', 'claude'),
    ];
  }

  return [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
  ];
}

/**
 * Get the Claude configuration directory path
 */
export function getClaudeConfigDir(): string {
  return path.join(os.homedir(), '.claude');
}

/**
 * Get paths to Claude credential files
 */
export function getClaudeCredentialPaths(): string[] {
  const claudeDir = getClaudeConfigDir();
  return [path.join(claudeDir, '.credentials.json'), path.join(claudeDir, 'credentials.json')];
}

/**
 * Get path to Claude settings file
 */
export function getClaudeSettingsPath(): string {
  return path.join(getClaudeConfigDir(), 'settings.json');
}

/**
 * Get path to Claude stats cache file
 */
export function getClaudeStatsCachePath(): string {
  return path.join(getClaudeConfigDir(), 'stats-cache.json');
}

/**
 * Get path to Claude projects/sessions directory
 */
export function getClaudeProjectsDir(): string {
  return path.join(getClaudeConfigDir(), 'projects');
}

/**
 * Get common shell paths for shell detection
 * Includes both full paths and short names to match $SHELL or PATH entries
 */
export function getShellPaths(): string[] {
  if (process.platform === 'win32') {
    return [
      // Full paths (most specific first)
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      // COMSPEC environment variable (typically cmd.exe)
      process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe',
      // Short names (for PATH resolution)
      'pwsh.exe',
      'pwsh',
      'powershell.exe',
      'powershell',
      'cmd.exe',
      'cmd',
    ];
  }

  // POSIX (macOS, Linux)
  return [
    // Full paths
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
    '/usr/bin/zsh',
    '/usr/bin/bash',
    '/usr/bin/sh',
    '/usr/local/bin/zsh',
    '/usr/local/bin/bash',
    '/opt/homebrew/bin/zsh',
    '/opt/homebrew/bin/bash',
    // Short names (for PATH resolution or $SHELL matching)
    'zsh',
    'bash',
    'sh',
  ];
}

// =============================================================================
// Node.js Version Manager Paths
// =============================================================================

/**
 * Get NVM installation paths
 */
export function getNvmPaths(): string[] {
  const homeDir = os.homedir();

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    return [path.join(appData, 'nvm')];
  }

  return [path.join(homeDir, '.nvm', 'versions', 'node')];
}

/**
 * Get fnm installation paths
 */
export function getFnmPaths(): string[] {
  const homeDir = os.homedir();

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
    return [
      path.join(homeDir, '.fnm', 'node-versions'),
      path.join(localAppData, 'fnm', 'node-versions'),
    ];
  }

  if (process.platform === 'darwin') {
    return [
      path.join(homeDir, '.local', 'share', 'fnm', 'node-versions'),
      path.join(homeDir, 'Library', 'Application Support', 'fnm', 'node-versions'),
    ];
  }

  return [
    path.join(homeDir, '.local', 'share', 'fnm', 'node-versions'),
    path.join(homeDir, '.fnm', 'node-versions'),
  ];
}

/**
 * Get common Node.js installation paths (not version managers)
 */
export function getNodeSystemPaths(): string[] {
  if (process.platform === 'win32') {
    return [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'nodejs', 'node.exe'),
      path.join(
        process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
        'nodejs',
        'node.exe'
      ),
    ];
  }

  if (process.platform === 'darwin') {
    return ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'];
  }

  // Linux
  return ['/usr/bin/node', '/usr/local/bin/node', '/snap/bin/node'];
}

/**
 * Get Scoop installation path for Node.js (Windows)
 */
export function getScoopNodePath(): string {
  return path.join(os.homedir(), 'scoop', 'apps', 'nodejs', 'current', 'node.exe');
}

/**
 * Get Chocolatey installation path for Node.js (Windows)
 */
export function getChocolateyNodePath(): string {
  return path.join(
    process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey',
    'bin',
    'node.exe'
  );
}

/**
 * Get WSL detection path
 */
export function getWslVersionPath(): string {
  return '/proc/version';
}

/**
 * Extended PATH environment for finding system tools
 */
export function getExtendedPath(): string {
  const paths = [
    process.env.PATH,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    `${process.env.HOME}/.local/bin`,
  ];

  return paths.filter(Boolean).join(process.platform === 'win32' ? ';' : ':');
}

// =============================================================================
// System Path Access Methods (Unconstrained - only for system tool detection)
// =============================================================================

/**
 * Check if a file exists at a system path (synchronous)
 * IMPORTANT: This bypasses ALLOWED_ROOT_DIRECTORY restrictions.
 * Only use for checking system tool installation paths.
 */
export function systemPathExists(filePath: string): boolean {
  if (!isAllowedSystemPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not an allowed system path`);
  }
  return fsSync.existsSync(filePath);
}

/**
 * Check if a file is accessible at a system path (async)
 * IMPORTANT: This bypasses ALLOWED_ROOT_DIRECTORY restrictions.
 * Only use for checking system tool installation paths.
 */
export async function systemPathAccess(filePath: string): Promise<boolean> {
  if (!isAllowedSystemPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not an allowed system path`);
  }
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file has execute permission (synchronous)
 * On Windows, only checks existence (X_OK is not meaningful)
 */
export function systemPathIsExecutable(filePath: string): boolean {
  if (!isAllowedSystemPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not an allowed system path`);
  }
  try {
    if (process.platform === 'win32') {
      fsSync.accessSync(filePath, fsSync.constants.F_OK);
    } else {
      fsSync.accessSync(filePath, fsSync.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file from an allowed system path (async)
 * IMPORTANT: This bypasses ALLOWED_ROOT_DIRECTORY restrictions.
 * Only use for reading Claude config files and similar system configs.
 */
export async function systemPathReadFile(
  filePath: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<string> {
  if (!isAllowedSystemPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not an allowed system path`);
  }
  return fs.readFile(filePath, encoding);
}

/**
 * Read a file from an allowed system path (synchronous)
 */
export function systemPathReadFileSync(
  filePath: string,
  encoding: BufferEncoding = 'utf-8'
): string {
  if (!isAllowedSystemPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not an allowed system path`);
  }
  return fsSync.readFileSync(filePath, encoding);
}

/**
 * Write a file to an allowed system path (synchronous)
 */
export function systemPathWriteFileSync(
  filePath: string,
  data: string,
  options?: { encoding?: BufferEncoding; mode?: number }
): void {
  if (!isAllowedSystemPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not an allowed system path`);
  }
  fsSync.writeFileSync(filePath, data, options);
}

/**
 * Read directory contents from an allowed system path (async)
 * IMPORTANT: This bypasses ALLOWED_ROOT_DIRECTORY restrictions.
 */
export async function systemPathReaddir(dirPath: string): Promise<string[]> {
  if (!isAllowedSystemPath(dirPath)) {
    throw new Error(`[SystemPaths] Access denied: ${dirPath} is not an allowed system path`);
  }
  return fs.readdir(dirPath);
}

/**
 * Read directory contents from an allowed system path (synchronous)
 */
export function systemPathReaddirSync(dirPath: string): string[] {
  if (!isAllowedSystemPath(dirPath)) {
    throw new Error(`[SystemPaths] Access denied: ${dirPath} is not an allowed system path`);
  }
  return fsSync.readdirSync(dirPath);
}

/**
 * Get file stats from a system path (synchronous)
 */
export function systemPathStatSync(filePath: string): fsSync.Stats {
  if (!isAllowedSystemPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not an allowed system path`);
  }
  return fsSync.statSync(filePath);
}

/**
 * Get file stats from a system path (async)
 */
export async function systemPathStat(filePath: string): Promise<fsSync.Stats> {
  if (!isAllowedSystemPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not an allowed system path`);
  }
  return fs.stat(filePath);
}

// =============================================================================
// Path Validation
// =============================================================================

/**
 * All paths that are allowed for system tool detection
 */
function getAllAllowedSystemPaths(): string[] {
  return [
    // GitHub CLI paths
    ...getGitHubCliPaths(),
    // Claude CLI paths
    ...getClaudeCliPaths(),
    // Claude config directory and files
    getClaudeConfigDir(),
    ...getClaudeCredentialPaths(),
    getClaudeSettingsPath(),
    getClaudeStatsCachePath(),
    getClaudeProjectsDir(),
    // Shell paths
    ...getShellPaths(),
    // Node.js system paths
    ...getNodeSystemPaths(),
    getScoopNodePath(),
    getChocolateyNodePath(),
    // WSL detection
    getWslVersionPath(),
  ];
}

/**
 * Get all allowed directories (for recursive access)
 */
function getAllAllowedSystemDirs(): string[] {
  return [
    // Claude config
    getClaudeConfigDir(),
    getClaudeProjectsDir(),
    // Version managers (need recursive access for version directories)
    ...getNvmPaths(),
    ...getFnmPaths(),
  ];
}

/**
 * Check if a path is an allowed system path
 * Paths must either be exactly in the allowed list, or be inside an allowed directory
 */
export function isAllowedSystemPath(filePath: string): boolean {
  const normalizedPath = path.resolve(filePath);
  const allowedPaths = getAllAllowedSystemPaths();

  // Check for exact match
  if (allowedPaths.includes(normalizedPath)) {
    return true;
  }

  // Check if the path is inside an allowed directory
  const allowedDirs = getAllAllowedSystemDirs();

  for (const allowedDir of allowedDirs) {
    const normalizedAllowedDir = path.resolve(allowedDir);
    // Check if path is exactly the allowed dir or inside it
    if (
      normalizedPath === normalizedAllowedDir ||
      normalizedPath.startsWith(normalizedAllowedDir + path.sep)
    ) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Electron userData Operations
// =============================================================================

// Store the Electron userData path (set by Electron main process)
let electronUserDataPath: string | null = null;

/**
 * Set the Electron userData path (called from Electron main process)
 */
export function setElectronUserDataPath(userDataPath: string): void {
  electronUserDataPath = userDataPath;
}

/**
 * Get the Electron userData path
 */
export function getElectronUserDataPath(): string | null {
  return electronUserDataPath;
}

/**
 * Check if a path is within the Electron userData directory
 */
export function isElectronUserDataPath(filePath: string): boolean {
  if (!electronUserDataPath) return false;
  const normalizedPath = path.resolve(filePath);
  const normalizedUserData = path.resolve(electronUserDataPath);
  return (
    normalizedPath === normalizedUserData ||
    normalizedPath.startsWith(normalizedUserData + path.sep)
  );
}

/**
 * Read a file from Electron userData directory
 */
export function electronUserDataReadFileSync(
  relativePath: string,
  encoding: BufferEncoding = 'utf-8'
): string {
  if (!electronUserDataPath) {
    throw new Error('[SystemPaths] Electron userData path not initialized');
  }
  const fullPath = path.join(electronUserDataPath, relativePath);
  return fsSync.readFileSync(fullPath, encoding);
}

/**
 * Write a file to Electron userData directory
 */
export function electronUserDataWriteFileSync(
  relativePath: string,
  data: string,
  options?: { encoding?: BufferEncoding; mode?: number }
): void {
  if (!electronUserDataPath) {
    throw new Error('[SystemPaths] Electron userData path not initialized');
  }
  const fullPath = path.join(electronUserDataPath, relativePath);
  fsSync.writeFileSync(fullPath, data, options);
}

/**
 * Check if a file exists in Electron userData directory
 */
export function electronUserDataExists(relativePath: string): boolean {
  if (!electronUserDataPath) return false;
  const fullPath = path.join(electronUserDataPath, relativePath);
  return fsSync.existsSync(fullPath);
}

// =============================================================================
// Script Directory Operations (for init.mjs and similar)
// =============================================================================

// Store the script's base directory
let scriptBaseDir: string | null = null;

/**
 * Set the script base directory
 */
export function setScriptBaseDir(baseDir: string): void {
  scriptBaseDir = baseDir;
}

/**
 * Get the script base directory
 */
export function getScriptBaseDir(): string | null {
  return scriptBaseDir;
}

/**
 * Check if a file exists relative to script base directory
 */
export function scriptDirExists(relativePath: string): boolean {
  if (!scriptBaseDir) {
    throw new Error('[SystemPaths] Script base directory not initialized');
  }
  const fullPath = path.join(scriptBaseDir, relativePath);
  return fsSync.existsSync(fullPath);
}

/**
 * Create a directory relative to script base directory
 */
export function scriptDirMkdirSync(relativePath: string, options?: { recursive?: boolean }): void {
  if (!scriptBaseDir) {
    throw new Error('[SystemPaths] Script base directory not initialized');
  }
  const fullPath = path.join(scriptBaseDir, relativePath);
  fsSync.mkdirSync(fullPath, options);
}

/**
 * Create a write stream for a file relative to script base directory
 */
export function scriptDirCreateWriteStream(relativePath: string): fsSync.WriteStream {
  if (!scriptBaseDir) {
    throw new Error('[SystemPaths] Script base directory not initialized');
  }
  const fullPath = path.join(scriptBaseDir, relativePath);
  return fsSync.createWriteStream(fullPath);
}

// =============================================================================
// Electron App Bundle Operations (for accessing app's own files)
// =============================================================================

// Store the Electron app bundle paths (can have multiple allowed directories)
let electronAppDirs: string[] = [];
let electronResourcesPath: string | null = null;

/**
 * Set the Electron app directories (called from Electron main process)
 * In development mode, pass the project root to allow access to source files.
 * In production mode, pass __dirname and process.resourcesPath.
 *
 * @param appDirOrDirs - Single directory or array of directories to allow
 * @param resourcesPath - Optional resources path (for packaged apps)
 */
export function setElectronAppPaths(appDirOrDirs: string | string[], resourcesPath?: string): void {
  electronAppDirs = Array.isArray(appDirOrDirs) ? appDirOrDirs : [appDirOrDirs];
  electronResourcesPath = resourcesPath || null;
}

/**
 * Check if a path is within the Electron app bundle (any of the allowed directories)
 */
function isElectronAppPath(filePath: string): boolean {
  const normalizedPath = path.resolve(filePath);

  // Check against all allowed app directories
  for (const appDir of electronAppDirs) {
    const normalizedAppDir = path.resolve(appDir);
    if (
      normalizedPath === normalizedAppDir ||
      normalizedPath.startsWith(normalizedAppDir + path.sep)
    ) {
      return true;
    }
  }

  // Check against resources path (for packaged apps)
  if (electronResourcesPath) {
    const normalizedResources = path.resolve(electronResourcesPath);
    if (
      normalizedPath === normalizedResources ||
      normalizedPath.startsWith(normalizedResources + path.sep)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a file exists within the Electron app bundle
 */
export function electronAppExists(filePath: string): boolean {
  if (!isElectronAppPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not within Electron app bundle`);
  }
  return fsSync.existsSync(filePath);
}

/**
 * Read a file from the Electron app bundle
 */
export function electronAppReadFileSync(filePath: string): Buffer {
  if (!isElectronAppPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not within Electron app bundle`);
  }
  return fsSync.readFileSync(filePath);
}

/**
 * Get file stats from the Electron app bundle
 */
export function electronAppStatSync(filePath: string): fsSync.Stats {
  if (!isElectronAppPath(filePath)) {
    throw new Error(`[SystemPaths] Access denied: ${filePath} is not within Electron app bundle`);
  }
  return fsSync.statSync(filePath);
}

/**
 * Get file stats from the Electron app bundle (async with callback for compatibility)
 */
export function electronAppStat(
  filePath: string,
  callback: (err: NodeJS.ErrnoException | null, stats: fsSync.Stats | undefined) => void
): void {
  if (!isElectronAppPath(filePath)) {
    callback(
      new Error(`[SystemPaths] Access denied: ${filePath} is not within Electron app bundle`),
      undefined
    );
    return;
  }
  fsSync.stat(filePath, callback);
}

/**
 * Read a file from the Electron app bundle (async with callback for compatibility)
 */
export function electronAppReadFile(
  filePath: string,
  callback: (err: NodeJS.ErrnoException | null, data: Buffer | undefined) => void
): void {
  if (!isElectronAppPath(filePath)) {
    callback(
      new Error(`[SystemPaths] Access denied: ${filePath} is not within Electron app bundle`),
      undefined
    );
    return;
  }
  fsSync.readFile(filePath, callback);
}

// =============================================================================
// High-level Tool Detection Methods
// =============================================================================

/**
 * Find the first existing path from a list of system paths
 */
export async function findFirstExistingPath(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    if (await systemPathAccess(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Check if GitHub CLI is installed and return its path
 */
export async function findGitHubCliPath(): Promise<string | null> {
  return findFirstExistingPath(getGitHubCliPaths());
}

/**
 * Check if Claude CLI is installed and return its path
 */
export async function findClaudeCliPath(): Promise<string | null> {
  return findFirstExistingPath(getClaudeCliPaths());
}

/**
 * Get Claude authentication status by checking various indicators
 */
export interface ClaudeAuthIndicators {
  hasCredentialsFile: boolean;
  hasSettingsFile: boolean;
  hasStatsCacheWithActivity: boolean;
  hasProjectsSessions: boolean;
  credentials: {
    hasOAuthToken: boolean;
    hasApiKey: boolean;
  } | null;
}

export async function getClaudeAuthIndicators(): Promise<ClaudeAuthIndicators> {
  const result: ClaudeAuthIndicators = {
    hasCredentialsFile: false,
    hasSettingsFile: false,
    hasStatsCacheWithActivity: false,
    hasProjectsSessions: false,
    credentials: null,
  };

  // Check settings file
  try {
    if (await systemPathAccess(getClaudeSettingsPath())) {
      result.hasSettingsFile = true;
    }
  } catch {
    // Ignore errors
  }

  // Check stats cache for recent activity
  try {
    const statsContent = await systemPathReadFile(getClaudeStatsCachePath());
    const stats = JSON.parse(statsContent);
    if (stats.dailyActivity && stats.dailyActivity.length > 0) {
      result.hasStatsCacheWithActivity = true;
    }
  } catch {
    // Ignore errors
  }

  // Check for sessions in projects directory
  try {
    const sessions = await systemPathReaddir(getClaudeProjectsDir());
    if (sessions.length > 0) {
      result.hasProjectsSessions = true;
    }
  } catch {
    // Ignore errors
  }

  // Check credentials files
  const credentialPaths = getClaudeCredentialPaths();
  for (const credPath of credentialPaths) {
    try {
      const content = await systemPathReadFile(credPath);
      const credentials = JSON.parse(content);
      result.hasCredentialsFile = true;
      result.credentials = {
        hasOAuthToken: !!(credentials.oauth_token || credentials.access_token),
        hasApiKey: !!credentials.api_key,
      };
      break;
    } catch {
      // Continue to next path
    }
  }

  return result;
}
