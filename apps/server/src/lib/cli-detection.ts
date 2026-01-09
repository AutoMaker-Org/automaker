/**
 * Unified CLI Detection Framework
 *
 * Provides consistent CLI detection and management across all providers
 */

import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '@automaker/utils';

const logger = createLogger('CliDetection');

export interface CliInfo {
  name: string;
  command: string;
  version?: string;
  path?: string;
  installed: boolean;
  authenticated: boolean;
  authMethod: 'cli' | 'api_key' | 'none';
  platform?: string;
  architectures?: string[];
}

export interface CliDetectionOptions {
  timeout?: number;
  includeWsl?: boolean;
  wslDistribution?: string;
}

export interface CliDetectionResult {
  cli: CliInfo;
  detected: boolean;
  issues: string[];
}

export interface UnifiedCliDetection {
  claude?: CliDetectionResult;
  codex?: CliDetectionResult;
  cursor?: CliDetectionResult;
}

/**
 * CLI Configuration for different providers
 */
const CLI_CONFIGS = {
  claude: {
    name: 'Claude CLI',
    commands: ['claude'],
    versionArgs: ['--version'],
    installCommands: {
      darwin: 'brew install anthropics/claude/claude',
      linux: 'curl -fsSL https://claude.ai/install.sh | sh',
      win32: 'iwr https://claude.ai/install.ps1 -UseBasicParsing | iex',
    },
  },
  codex: {
    name: 'Codex CLI',
    commands: ['codex', 'openai'],
    versionArgs: ['--version'],
    installCommands: {
      darwin: 'npm install -g @openai/codex-cli',
      linux: 'npm install -g @openai/codex-cli',
      win32: 'npm install -g @openai/codex-cli',
    },
  },
  cursor: {
    name: 'Cursor CLI',
    commands: ['cursor-agent', 'cursor'],
    versionArgs: ['--version'],
    installCommands: {
      darwin: 'brew install cursor/cursor/cursor-agent',
      linux: 'curl -fsSL https://cursor.sh/install.sh | sh',
      win32: 'iwr https://cursor.sh/install.ps1 -UseBasicParsing | iex',
    },
  },
} as const;

/**
 * Detect if a CLI is installed and available
 */
export async function detectCli(
  provider: keyof typeof CLI_CONFIGS,
  options: CliDetectionOptions = {}
): Promise<CliDetectionResult> {
  const config = CLI_CONFIGS[provider];
  const { timeout = 5000, includeWsl = false, wslDistribution } = options;
  const issues: string[] = [];

  const cliInfo: CliInfo = {
    name: config.name,
    command: '',
    installed: false,
    authenticated: false,
    authMethod: 'none',
  };

  try {
    // Find the command in PATH
    const command = await findCommand([...config.commands]);
    if (command) {
      cliInfo.command = command;
    }

    if (!cliInfo.command) {
      issues.push(`${config.name} not found in PATH`);
      return { cli: cliInfo, detected: false, issues };
    }

    cliInfo.path = cliInfo.command;
    cliInfo.installed = true;

    // Get version
    try {
      cliInfo.version = await getCliVersion(cliInfo.command, [...config.versionArgs], timeout);
    } catch (error) {
      issues.push(`Failed to get ${config.name} version: ${error}`);
    }

    // Check authentication
    cliInfo.authMethod = await checkCliAuth(provider, cliInfo.command);
    cliInfo.authenticated = cliInfo.authMethod !== 'none';

    return { cli: cliInfo, detected: true, issues };
  } catch (error) {
    issues.push(`Error detecting ${config.name}: ${error}`);
    return { cli: cliInfo, detected: false, issues };
  }
}

/**
 * Detect all CLIs in the system
 */
export async function detectAllCLis(
  options: CliDetectionOptions = {}
): Promise<UnifiedCliDetection> {
  const results: UnifiedCliDetection = {};

  // Detect all providers in parallel
  const providers = Object.keys(CLI_CONFIGS) as Array<keyof typeof CLI_CONFIGS>;
  const detectionPromises = providers.map(async (provider) => {
    const result = await detectCli(provider, options);
    return { provider, result };
  });

  const detections = await Promise.all(detectionPromises);

  for (const { provider, result } of detections) {
    results[provider] = result;
  }

  return results;
}

/**
 * Find the first available command from a list of alternatives
 */
export async function findCommand(commands: string[]): Promise<string | null> {
  for (const command of commands) {
    try {
      const whichCommand = process.platform === 'win32' ? 'where' : 'which';
      const result = execSync(`${whichCommand} ${command}`, {
        encoding: 'utf8',
        timeout: 2000,
      }).trim();

      if (result) {
        return result.split('\n')[0]; // Take first result on Windows
      }
    } catch {
      // Command not found, try next
    }
  }
  return null;
}

/**
 * Get CLI version
 */
export async function getCliVersion(
  command: string,
  args: string[],
  timeout: number = 5000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      timeout,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout) {
        resolve(stdout.trim());
      } else if (stderr) {
        reject(stderr.trim());
      } else {
        reject(`Command exited with code ${code}`);
      }
    });

    child.on('error', reject);
  });
}

/**
 * Check authentication status for a CLI
 */
export async function checkCliAuth(
  provider: keyof typeof CLI_CONFIGS,
  command: string
): Promise<'cli' | 'api_key' | 'none'> {
  try {
    switch (provider) {
      case 'claude':
        return await checkClaudeAuth(command);
      case 'codex':
        return await checkCodexAuth(command);
      case 'cursor':
        return await checkCursorAuth(command);
      default:
        return 'none';
    }
  } catch {
    return 'none';
  }
}

/**
 * Check Claude CLI authentication
 */
async function checkClaudeAuth(command: string): Promise<'cli' | 'api_key' | 'none'> {
  try {
    // Check for environment variable
    if (process.env.ANTHROPIC_API_KEY) {
      return 'api_key';
    }

    // Try running a simple command to check CLI auth
    const result = await getCliVersion(command, ['--version'], 3000);
    if (result) {
      return 'cli'; // If version works, assume CLI is authenticated
    }
  } catch {
    // Version command might work even without auth, so we need a better check
  }

  // Try a more specific auth check
  return new Promise((resolve) => {
    const child = spawn(command, ['whoami'], {
      stdio: 'pipe',
      timeout: 3000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout && !stderr.includes('not authenticated')) {
        resolve('cli');
      } else {
        resolve('none');
      }
    });

    child.on('error', () => {
      resolve('none');
    });
  });
}

/**
 * Check Codex CLI authentication
 */
async function checkCodexAuth(command: string): Promise<'cli' | 'api_key' | 'none'> {
  // Check for environment variable
  if (process.env.OPENAI_API_KEY) {
    return 'api_key';
  }

  try {
    // Try a simple auth check
    const result = await getCliVersion(command, ['--version'], 3000);
    if (result) {
      return 'cli';
    }
  } catch {
    // Version check failed
  }

  return 'none';
}

/**
 * Check Cursor CLI authentication
 */
async function checkCursorAuth(command: string): Promise<'cli' | 'api_key' | 'none'> {
  // Check for environment variable
  if (process.env.CURSOR_API_KEY) {
    return 'api_key';
  }

  // Check for credentials files
  const credentialPaths = [
    path.join(os.homedir(), '.cursor', 'credentials.json'),
    path.join(os.homedir(), '.config', 'cursor', 'credentials.json'),
    path.join(os.homedir(), '.cursor', 'auth.json'),
    path.join(os.homedir(), '.config', 'cursor', 'auth.json'),
  ];

  for (const credPath of credentialPaths) {
    try {
      if (fs.existsSync(credPath)) {
        const content = fs.readFileSync(credPath, 'utf8');
        const creds = JSON.parse(content);
        if (creds.accessToken || creds.token || creds.apiKey) {
          return 'cli';
        }
      }
    } catch {
      // Invalid credentials file
    }
  }

  // Try a simple command
  try {
    const result = await getCliVersion(command, ['--version'], 3000);
    if (result) {
      return 'cli';
    }
  } catch {
    // Version check failed
  }

  return 'none';
}

/**
 * Get installation instructions for a provider
 */
export function getInstallInstructions(
  provider: keyof typeof CLI_CONFIGS,
  platform: NodeJS.Platform = process.platform
): string {
  const config = CLI_CONFIGS[provider];
  const command = config.installCommands[platform as keyof typeof config.installCommands];

  if (!command) {
    return `No installation instructions available for ${provider} on ${platform}`;
  }

  return command;
}

/**
 * Get platform-specific CLI paths and versions
 */
export function getPlatformCliPaths(provider: keyof typeof CLI_CONFIGS): string[] {
  const config = CLI_CONFIGS[provider];
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      return [
        `/usr/local/bin/${config.commands[0]}`,
        `/opt/homebrew/bin/${config.commands[0]}`,
        path.join(os.homedir(), '.local', 'bin', config.commands[0]),
      ];

    case 'linux':
      return [
        `/usr/bin/${config.commands[0]}`,
        `/usr/local/bin/${config.commands[0]}`,
        path.join(os.homedir(), '.local', 'bin', config.commands[0]),
        path.join(os.homedir(), '.npm', 'global', 'bin', config.commands[0]),
      ];

    case 'win32':
      return [
        path.join(
          os.homedir(),
          'AppData',
          'Local',
          'Programs',
          config.commands[0],
          `${config.commands[0]}.exe`
        ),
        path.join(process.env.ProgramFiles || '', config.commands[0], `${config.commands[0]}.exe`),
        path.join(
          process.env.ProgramFiles || '',
          config.commands[0],
          'bin',
          `${config.commands[0]}.exe`
        ),
      ];

    default:
      return [];
  }
}

/**
 * Validate CLI installation
 */
export function validateCliInstallation(cliInfo: CliInfo): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!cliInfo.installed) {
    issues.push('CLI is not installed');
  }

  if (cliInfo.installed && !cliInfo.version) {
    issues.push('Could not determine CLI version');
  }

  if (cliInfo.installed && cliInfo.authMethod === 'none') {
    issues.push('CLI is not authenticated');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
