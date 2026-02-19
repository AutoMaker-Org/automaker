/**
 * Git validation utilities
 *
 * Canonical validators for git-related inputs (branch names, etc.)
 * used across the server codebase.
 */

/** Maximum allowed length for git branch names */
export const MAX_BRANCH_NAME_LENGTH = 250;

/**
 * Validate a git branch name to prevent command injection and ensure
 * it conforms to safe git ref naming rules.
 *
 * Enforces:
 * - Allowed characters: alphanumeric, dot (.), underscore (_), slash (/), dash (-)
 * - First character must NOT be a dash (prevents git argument injection via
 *   names like "-flag" or "--option")
 * - Rejects path-traversal sequences (..)
 * - Rejects NUL bytes (\0)
 * - Enforces a maximum length of {@link MAX_BRANCH_NAME_LENGTH} characters
 *
 * @param name - The branch name to validate
 * @returns `true` when the name is safe to pass to git commands
 *
 * @example
 * ```typescript
 * isValidBranchName('feature/my-branch');  // true
 * isValidBranchName('-flag');              // false (starts with dash)
 * isValidBranchName('a..b');              // false (contains ..)
 * isValidBranchName('a\0b');             // false (contains NUL)
 * ```
 */
export function isValidBranchName(name: string): boolean {
  // Must not contain NUL bytes
  if (name.includes('\0')) return false;
  // Must not contain path-traversal sequences
  if (name.includes('..')) return false;
  // First char must be alphanumeric, dot, underscore, or slash (not dash).
  // Remaining chars may also include dash.
  // Must be within the length limit.
  return /^[a-zA-Z0-9._/][a-zA-Z0-9._\-/]*$/.test(name) && name.length < MAX_BRANCH_NAME_LENGTH;
}

/**
 * Validate git remote name to prevent command injection.
 * Matches the strict validation used in add-remote.ts:
 * - Rejects empty strings and names that are too long
 * - Disallows names that start with '-' or '.'
 * - Forbids the substring '..'
 * - Rejects '/' characters
 * - Rejects NUL bytes
 * - Must consist only of alphanumerics, hyphens, underscores, and dots
 *
 * @param name - The remote name to validate
 * @returns `true` when the name is safe to pass to git commands
 *
 * @example
 * ```typescript
 * isValidRemoteName('origin');       // true
 * isValidRemoteName('upstream');     // true
 * isValidRemoteName('-flag');        // false (starts with dash)
 * isValidRemoteName('a/b');         // false (contains slash)
 * ```
 */
export function isValidRemoteName(name: string): boolean {
  if (!name || name.length >= MAX_BRANCH_NAME_LENGTH) return false;
  if (name.startsWith('-') || name.startsWith('.')) return false;
  if (name.includes('..')) return false;
  if (name.includes('/')) return false;
  if (name.includes('\0')) return false;
  return /^[a-zA-Z0-9._-]+$/.test(name);
}
