/**
 * JSON parsing utilities with enhanced error messages
 *
 * Provides JSON parsing with descriptive error messages and type casting.
 * Note: Type parameter T is used for TypeScript type casting only -
 * no runtime validation is performed.
 */

/**
 * Parse JSON with descriptive error messages and type casting
 *
 * @param json - The JSON string to parse
 * @param context - Context description for error messages (e.g., "listIssues")
 * @returns The parsed value cast as type T (no runtime validation)
 * @throws {Error} With descriptive message if parsing fails
 *
 * @example
 * ```typescript
 * const issues = safeJsonParse<BeadsIssue[]>(stdout, 'listIssues');
 * ```
 */
export function safeJsonParse<T>(json: string, context: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON response from Beads CLI (${context}): ${errorMsg}`);
  }
}

/**
 * Parse JSON with optional default value on error
 *
 * @param json - The JSON string to parse
 * @param defaultValue - The default value to return if parsing fails
 * @returns The parsed value cast as type T, or defaultValue (no runtime validation)
 *
 * @example
 * ```typescript
 * const issues = safeJsonParseOrDefault(stdout, []);
 * ```
 */
export function safeJsonParseOrDefault<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}
