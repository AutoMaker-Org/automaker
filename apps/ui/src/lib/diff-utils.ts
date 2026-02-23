/**
 * Shared diff parsing utilities.
 *
 * Extracted from commit-worktree-dialog, discard-worktree-changes-dialog,
 * stash-changes-dialog and git-diff-panel to eliminate duplication.
 */

export interface ParsedDiffHunk {
  header: string;
  lines: {
    type: 'context' | 'addition' | 'deletion' | 'header';
    content: string;
    lineNumber?: { old?: number; new?: number };
  }[];
}

export interface ParsedFileDiff {
  filePath: string;
  hunks: ParsedDiffHunk[];
  isNew?: boolean;
  isDeleted?: boolean;
  isRenamed?: boolean;
  /** Pre-computed count of added lines across all hunks */
  additions: number;
  /** Pre-computed count of deleted lines across all hunks */
  deletions: number;
}

/**
 * Parse unified diff format into structured data.
 *
 * Note: The regex `diff --git a\/(.*?) b\/(.*)` uses a non-greedy match for
 * the `a/` path and a greedy match for `b/`. This can mis-handle paths that
 * literally contain " b/" or are quoted by git. In practice this covers the
 * vast majority of real-world paths; exotic cases will fall back to "unknown".
 */
export function parseDiff(diffText: string): ParsedFileDiff[] {
  if (!diffText) return [];

  const files: ParsedFileDiff[] = [];
  const lines = diffText.split('\n');
  let currentFile: ParsedFileDiff | null = null;
  let currentHunk: ParsedDiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git')) {
      if (currentFile) {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        files.push(currentFile);
      }
      const match = line.match(/diff --git a\/(.*?) b\/(.*)/);
      currentFile = {
        filePath: match ? match[2] : 'unknown',
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      currentHunk = null;
      continue;
    }

    if (line.startsWith('new file mode')) {
      if (currentFile) currentFile.isNew = true;
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      if (currentFile) currentFile.isDeleted = true;
      continue;
    }
    if (line.startsWith('rename from') || line.startsWith('rename to')) {
      if (currentFile) currentFile.isRenamed = true;
      continue;
    }
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    if (line.startsWith('@@')) {
      if (currentHunk && currentFile) currentFile.hunks.push(currentHunk);
      const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLineNum = hunkMatch ? parseInt(hunkMatch[1], 10) : 1;
      newLineNum = hunkMatch ? parseInt(hunkMatch[2], 10) : 1;
      currentHunk = {
        header: line,
        lines: [{ type: 'header', content: line }],
      };
      continue;
    }

    if (currentHunk) {
      // Skip trailing empty line produced by split('\n') to avoid phantom context line
      if (line === '' && i === lines.length - 1) {
        continue;
      }
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'addition',
          content: line.substring(1),
          lineNumber: { new: newLineNum },
        });
        newLineNum++;
        if (currentFile) currentFile.additions++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'deletion',
          content: line.substring(1),
          lineNumber: { old: oldLineNum },
        });
        oldLineNum++;
        if (currentFile) currentFile.deletions++;
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({
          type: 'context',
          content: line.substring(1) || '',
          lineNumber: { old: oldLineNum, new: newLineNum },
        });
        oldLineNum++;
        newLineNum++;
      }
    }
  }

  if (currentFile) {
    if (currentHunk) currentFile.hunks.push(currentHunk);
    files.push(currentFile);
  }

  return files;
}

/**
 * Reconstruct old (original) and new (modified) file content from a single-file
 * unified diff string. Used by the CodeMirror merge diff viewer which needs
 * both document versions to compute inline highlighting.
 *
 * For new files (entire content is additions), oldContent will be empty.
 * For deleted files (entire content is deletions), newContent will be empty.
 */
export function reconstructFilesFromDiff(diffText: string): {
  oldContent: string;
  newContent: string;
} {
  if (!diffText) return { oldContent: '', newContent: '' };

  const lines = diffText.split('\n');
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let inHunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip diff header lines
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('rename from') ||
      line.startsWith('rename to') ||
      line.startsWith('similarity index') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode')
    ) {
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    // Skip trailing empty line produced by split('\n')
    if (line === '' && i === lines.length - 1) {
      continue;
    }

    // "\ No newline at end of file" marker
    if (line.startsWith('\\')) {
      continue;
    }

    if (line.startsWith('+')) {
      newLines.push(line.substring(1));
    } else if (line.startsWith('-')) {
      oldLines.push(line.substring(1));
    } else {
      // Context line (starts with space or is empty within hunk)
      const content = line.startsWith(' ') ? line.substring(1) : line;
      oldLines.push(content);
      newLines.push(content);
    }
  }

  return {
    oldContent: oldLines.join('\n'),
    newContent: newLines.join('\n'),
  };
}

/**
 * Split a combined multi-file diff string into per-file diff strings.
 * Each entry in the returned array is a complete diff block for a single file.
 */
export function splitDiffByFile(
  combinedDiff: string
): { filePath: string; diff: string; isNew: boolean; isDeleted: boolean }[] {
  if (!combinedDiff) return [];

  const results: { filePath: string; diff: string; isNew: boolean; isDeleted: boolean }[] = [];
  const lines = combinedDiff.split('\n');
  let currentLines: string[] = [];
  let currentFilePath = '';
  let currentIsNew = false;
  let currentIsDeleted = false;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      // Push previous file if exists
      if (currentLines.length > 0 && currentFilePath) {
        results.push({
          filePath: currentFilePath,
          diff: currentLines.join('\n'),
          isNew: currentIsNew,
          isDeleted: currentIsDeleted,
        });
      }
      currentLines = [line];
      const match = line.match(/diff --git a\/(.*?) b\/(.*)/);
      currentFilePath = match ? match[2] : 'unknown';
      currentIsNew = false;
      currentIsDeleted = false;
    } else {
      if (line.startsWith('new file mode')) currentIsNew = true;
      if (line.startsWith('deleted file mode')) currentIsDeleted = true;
      currentLines.push(line);
    }
  }

  // Push last file
  if (currentLines.length > 0 && currentFilePath) {
    results.push({
      filePath: currentFilePath,
      diff: currentLines.join('\n'),
      isNew: currentIsNew,
      isDeleted: currentIsDeleted,
    });
  }

  return results;
}
