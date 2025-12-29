/**
 * Common utilities for MCP routes
 */

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
  console.error(`[MCP] ${message}:`, error);
}
