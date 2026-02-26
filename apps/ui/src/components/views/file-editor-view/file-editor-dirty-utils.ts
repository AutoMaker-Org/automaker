export function computeIsDirty(content: string, originalContent: string): boolean {
  return content !== originalContent;
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
