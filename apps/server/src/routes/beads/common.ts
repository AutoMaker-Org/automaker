/**
 * Common utilities for beads routes
 */

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function logError(error: unknown, context: string): void {
  const message = getErrorMessage(error);
  console.error(`[Beads] ${context}:`, message);
}
