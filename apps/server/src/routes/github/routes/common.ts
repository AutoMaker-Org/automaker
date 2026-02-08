/**
 * Common utilities for GitHub routes
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('GitHub');

export { execAsync, extendedPath, execEnv } from '../../../lib/exec-env.js';

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function logError(error: unknown, context: string): void {
  logger.error(`${context}:`, error);
}
