/**
 * Git branch name validation utilities
 * Prevents command injection and ensures valid git branch names
 */

/**
 * Validates a git branch name to prevent command injection
 *
 * Safe characters: alphanumeric, dots, underscores, hyphens, forward slashes
 * Invalid patterns: "..", leading "-", leading ".", control characters
 *
 * @param branchName - The branch name to validate
 * @returns true if valid, false otherwise
 */
export function isSafeBranchName(branchName: string): boolean {
  if (!branchName || typeof branchName !== 'string') {
    return false;
  }

  // Branch names must not be empty or just whitespace
  if (branchName.trim().length === 0) {
    return false;
  }

  // Must not start with a dash (could be interpreted as option)
  if (branchName.startsWith('-')) {
    return false;
  }

  // Must not start or end with a dot
  if (branchName.startsWith('.') || branchName.endsWith('.')) {
    return false;
  }

  // Must not contain ".." (path traversal)
  if (branchName.includes('..')) {
    return false;
  }

  // Must not contain shell metacharacters or control characters
  // Allowed: alphanumeric, dots, underscores, hyphens, forward slashes
  const safePattern = /^[a-zA-Z0-9._/-]+$/;
  if (!safePattern.test(branchName)) {
    return false;
  }

  // Must not contain consecutive slashes
  if (branchName.includes('//')) {
    return false;
  }

  // Must not end with .lock (git internal)
  if (branchName.endsWith('.lock')) {
    return false;
  }

  // Must not be just "." or ".."
  if (branchName === '.' || branchName === '..') {
    return false;
  }

  // Additional git ref restrictions
  // Cannot contain: space, ~, ^, :, \, ?, *, [
  const invalidChars = /[\s~^:\\?*[\]]/;
  if (invalidChars.test(branchName)) {
    return false;
  }

  return true;
}

/**
 * Validates and throws an error if branch name is unsafe
 *
 * @param branchName - The branch name to validate
 * @throws Error if branch name is invalid
 */
export function validateBranchName(branchName: string): void {
  if (!isSafeBranchName(branchName)) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names must contain only alphanumeric characters, dots, underscores, hyphens, and forward slashes. ` +
        `They cannot start with "-" or ".", contain "..", or include special characters.`
    );
  }
}
