/**
 * Shared execution utilities
 *
 * Common helpers for spawning child processes with the correct environment.
 * Used by both route handlers and service layers.
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('ExecUtils');

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
