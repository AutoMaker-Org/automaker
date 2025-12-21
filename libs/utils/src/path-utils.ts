/**
 * Path Utilities - Cross-platform path manipulation helpers
 *
 * Provides functions for normalizing and comparing file system paths
 * across different operating systems (Windows, macOS, Linux).
 */

/**
 * Normalize a path by converting backslashes to forward slashes
 *
 * This ensures consistent path representation across platforms:
 * - Windows: C:\Users\foo\bar -> C:/Users/foo/bar
 * - Unix: /home/foo/bar -> /home/foo/bar (unchanged)
 *
 * @param p - Path string to normalize
 * @returns Normalized path with forward slashes
 *
 * @example
 * ```typescript
 * normalizePath("C:\\Users\\foo\\bar"); // "C:/Users/foo/bar"
 * normalizePath("/home/foo/bar");       // "/home/foo/bar"
 * ```
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Compare two paths for equality after normalization
 *
 * Handles null/undefined values and normalizes paths before comparison.
 * Useful for checking if two paths refer to the same location regardless
 * of platform-specific path separators.
 *
 * @param p1 - First path to compare (or null/undefined)
 * @param p2 - Second path to compare (or null/undefined)
 * @returns true if paths are equal (or both null/undefined), false otherwise
 *
 * @example
 * ```typescript
 * pathsEqual("C:\\foo\\bar", "C:/foo/bar");     // true
 * pathsEqual("/home/user", "/home/user");       // true
 * pathsEqual("/home/user", "/home/other");      // false
 * pathsEqual(null, undefined);                  // false
 * pathsEqual(null, null);                       // true
 * ```
 */
export function pathsEqual(
  p1: string | undefined | null,
  p2: string | undefined | null
): boolean {
  if (!p1 || !p2) return p1 === p2;
  return normalizePath(p1) === normalizePath(p2);
}
