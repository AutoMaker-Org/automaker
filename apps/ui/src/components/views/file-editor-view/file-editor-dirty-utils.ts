/**
 * Normalize line endings to `\n` so that comparisons match CodeMirror's
 * internal representation. CodeMirror always converts `\r\n` and `\r` to
 * `\n`, so raw disk content with Windows/old-Mac line endings would
 * otherwise cause a false dirty state.
 */
export function normalizeLineEndings(text: string): string {
  return text.indexOf('\r') !== -1 ? text.replace(/\r\n?/g, '\n') : text;
}

export function computeIsDirty(content: string, originalContent: string): boolean {
  return normalizeLineEndings(content) !== normalizeLineEndings(originalContent);
}

export function updateTabWithContent<
  T extends { originalContent: string; content: string; isDirty: boolean },
>(tab: T, content: string): T {
  return { ...tab, content, isDirty: computeIsDirty(content, tab.originalContent) };
}

export function markTabAsSaved<
  T extends { originalContent: string; content: string; isDirty: boolean },
>(tab: T, content: string): T {
  return { ...tab, content, originalContent: content, isDirty: false };
}
