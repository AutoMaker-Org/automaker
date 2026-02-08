/**
 * Shared exec environment with extended PATH for shell commands.
 *
 * Electron apps don't inherit the user's shell PATH, so we add common
 * tool installation locations. Used by forge-detector and route handlers.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

export const extendedPath = [
  process.env.PATH,
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/home/linuxbrew/.linuxbrew/bin',
  `${process.env.HOME}/.local/bin`,
]
  .filter(Boolean)
  .join(':');

export const execEnv = {
  ...process.env,
  PATH: extendedPath,
};
