/**
 * Common utilities for GitHub routes
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GitHub');

export const execAsync = promisify(exec);

// Extended PATH to include common tool installation locations
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

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function logError(error: unknown, context: string): void {
  logger.error(`${context}:`, error);
}
