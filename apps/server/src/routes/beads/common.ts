/**
 * Derives a readable string message from an unknown error value.
 *
 * @param error - The error value to extract a message from.
 * @returns The error's `message` if `error` is an `Error`, otherwise the stringified `error` (`String(error)`).
 */

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Log a standardized Beads error message to the console.
 *
 * Extracts a readable message from `error` and writes it to stderr prefixed with a `[Beads]` tag and the provided context.
 *
 * @param error - The error value to derive a message from (may be any value).
 * @param context - Short contextual label included in the log prefix (e.g., the route or operation name)
 */
export function logError(error: unknown, context: string): void {
  const message = getErrorMessage(error);
  console.error(`[Beads] ${context}:`, message);
}