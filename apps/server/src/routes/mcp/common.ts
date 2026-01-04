/**
 * Common utilities for MCP routes
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('MCP');

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Log error with prefix
 */
export function logError(error: unknown, message: string): void {
  logger.error(`${message}:`, error);
}
