/**
 * Beads CLI Wrapper
 *
 * Port of server/bd.js from beads-ui to TypeScript
 * Wraps the `bd` CLI commands for Node.js execution
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { getBdBin } from '../common.js';

const exec = promisify(execCallback);

export interface BdOptions {
  cwd?: string;
  noDb?: boolean;
  env?: Record<string, string>;
}

export interface BdResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Execute bd CLI command using spawn (for long-running processes)
 */
export async function runBd(args: string[], options: BdOptions = {}): Promise<string> {
  const bdBin = await getBdBin();
  const spawnArgs = options.noDb ? ['--no-db', ...args] : args;

  return new Promise((resolve, reject) => {
    const child = spawn(bdBin, spawnArgs, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
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
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const error = new Error(`bd command failed with exit code ${code}`) as Error & {
          stderr?: string;
          exitCode?: number | null;
        };
        error.stderr = stderr;
        error.exitCode = code;
        reject(error);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn bd command: ${err.message}`));
    });
  });
}

/**
 * Execute bd CLI command using exec (for simple commands)
 */
export async function runBdExec(args: string[], options: BdOptions = {}): Promise<string> {
  const bdBin = await getBdBin();
  const spawnArgs = options.noDb ? ['--no-db', ...args] : args;
  const cmd = `"${bdBin}" ${spawnArgs.map((arg) => `"${arg}"`).join(' ')}`;

  return exec(cmd, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
  })
    .then(({ stdout }) => stdout.trim())
    .catch((err) => {
      throw new Error(`bd command failed: ${err.message}`);
    });
}

/**
 * Execute bd CLI command and parse JSON output
 */
export async function runBdJson<T>(args: string[], options: BdOptions = {}): Promise<T> {
  const output = await runBd(args, options);

  // Handle empty output
  if (!output) {
    return [] as unknown as T;
  }

  try {
    return JSON.parse(output) as T;
  } catch (err) {
    throw new Error(`Failed to parse JSON output: ${(err as Error).message}\nOutput: ${output}`);
  }
}

/**
 * Get git config user.name
 */
export async function getGitUserName(): Promise<string> {
  try {
    const { stdout } = await exec('git config user.name');
    return stdout.trim() || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/**
 * Get git config user.email
 */
export async function getGitUserEmail(): Promise<string> {
  try {
    const { stdout } = await exec('git config user.email');
    return stdout.trim() || 'unknown@example.com';
  } catch {
    return 'unknown@example.com';
  }
}

/**
 * Get current git branch
 */
export async function getGitBranch(): Promise<string> {
  try {
    const { stdout } = await exec('git rev-parse --abbrev-ref HEAD');
    return stdout.trim() || 'main';
  } catch {
    return 'main';
  }
}

/**
 * Check if Beads database exists at path
 */
export async function checkBeadsDb(path: string): Promise<boolean> {
  const { stat } = await import('fs/promises');
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Beads database path for a project
 */
export function getBeadsDbPath(projectPath: string): string {
  return `${projectPath}/.beads/data.db`;
}

/**
 * Check if project is using JSONL-only mode
 */
export async function isJsonLonlyMode(projectPath: string): Promise<boolean> {
  const { readFile } = await import('fs/promises');
  try {
    const configPath = `${projectPath}/.beads/config.yaml`;
    const config = await readFile(configPath, 'utf-8');
    return config.includes('no-db: true');
  } catch {
    // If no config, check if only JSONL file exists
    const { stat } = await import('fs/promises');
    try {
      await stat(`${projectPath}/.beads/issues.jsonl`);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Run bd command with JSON output
 */
export async function runBdJsonOutput<T>(
  command: string,
  args: string[] = [],
  options: BdOptions = {}
): Promise<T> {
  return runBdJson<T>([command, ...args, '--json'], options);
}
