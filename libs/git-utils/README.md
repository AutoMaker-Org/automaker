# @automaker/git-utils

Git operations and utilities for AutoMaker.

## Overview

This package provides git-related utilities including repository detection, status parsing, and diff generation for both tracked and untracked files.

## Installation

```bash
npm install @automaker/git-utils
```

## Exports

### Repository Detection
Check if a path is a git repository.

```typescript
import { isGitRepo } from '@automaker/git-utils';

const isRepo = await isGitRepo('/project/path');
if (isRepo) {
  console.log('This is a git repository');
}
```

### Status Parsing
Parse git status output into structured data.

```typescript
import { parseGitStatus } from '@automaker/git-utils';
import type { FileStatus } from '@automaker/git-utils';

const statusOutput = await execAsync('git status --porcelain');
const files: FileStatus[] = parseGitStatus(statusOutput.stdout);

files.forEach(file => {
  console.log(`${file.statusText}: ${file.path}`);
  // Example: "Modified: src/index.ts"
  // Example: "Untracked: new-file.ts"
});
```

### Diff Generation
Generate diffs including untracked files.

```typescript
import {
  generateSyntheticDiffForNewFile,
  appendUntrackedFileDiffs,
  getGitRepositoryDiffs
} from '@automaker/git-utils';

// Generate diff for single untracked file
const diff = await generateSyntheticDiffForNewFile(
  '/project/path',
  'src/new-file.ts'
);

// Get complete repository diffs (tracked + untracked)
const result = await getGitRepositoryDiffs('/project/path');
console.log(result.diff);        // Combined diff string
console.log(result.files);       // Array of FileStatus
console.log(result.hasChanges);  // Boolean
```

### Non-Git Directory Support
Handle non-git directories by treating all files as new.

```typescript
import {
  listAllFilesInDirectory,
  generateDiffsForNonGitDirectory
} from '@automaker/git-utils';

// List all files (excluding build artifacts)
const files = await listAllFilesInDirectory('/project/path');

// Generate diffs for non-git directory
const result = await generateDiffsForNonGitDirectory('/project/path');
console.log(result.diff);   // Synthetic diffs for all files
console.log(result.files);  // All files as "New" status
```

## Types

### FileStatus
```typescript
interface FileStatus {
  status: string;      // Git status code (M/A/D/R/C/U/?/!)
  path: string;        // File path relative to repo root
  statusText: string;  // Human-readable status
}
```

### Status Codes
- `M` - Modified
- `A` - Added
- `D` - Deleted
- `R` - Renamed
- `C` - Copied
- `U` - Updated
- `?` - Untracked
- `!` - Ignored
- ` ` - Unmodified

### Status Text Examples
- `"Modified"` - File has changes
- `"Added"` - New file in staging
- `"Deleted"` - File removed
- `"Renamed"` - File renamed
- `"Untracked"` - New file not in git
- `"Modified (staged), Modified (unstaged)"` - Changes in both areas

## Usage Example

```typescript
import {
  isGitRepo,
  getGitRepositoryDiffs,
  parseGitStatus
} from '@automaker/git-utils';

async function getProjectChanges(projectPath: string) {
  const isRepo = await isGitRepo(projectPath);

  if (!isRepo) {
    console.log('Not a git repository, analyzing all files...');
  }

  const result = await getGitRepositoryDiffs(projectPath);

  if (!result.hasChanges) {
    console.log('No changes detected');
    return;
  }

  console.log(`Found ${result.files.length} changed files:\n`);

  // Group by status
  const byStatus = result.files.reduce((acc, file) => {
    acc[file.statusText] = acc[file.statusText] || [];
    acc[file.statusText].push(file.path);
    return acc;
  }, {} as Record<string, string[]>);

  Object.entries(byStatus).forEach(([status, paths]) => {
    console.log(`${status}:`);
    paths.forEach(path => console.log(`  - ${path}`));
  });

  return result.diff;
}
```

## Features

### Binary File Detection
Automatically detects binary files by extension and generates appropriate diff markers.

**Supported binary extensions:**
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, etc.
- Documents: `.pdf`, `.doc`, `.docx`, etc.
- Archives: `.zip`, `.tar`, `.gz`, etc.
- Media: `.mp3`, `.mp4`, `.wav`, etc.
- Fonts: `.ttf`, `.otf`, `.woff`, etc.

### Large File Handling
Files larger than 1MB show size information instead of full content.

### Synthetic Diff Format
Generates unified diff format for untracked files:
```diff
diff --git a/new-file.ts b/new-file.ts
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,10 @@
+export function hello() {
+  console.log('Hello');
+}
```

### Directory Filtering
When scanning non-git directories, automatically excludes:
- `node_modules`, `.git`, `.automaker`
- Build outputs: `dist`, `build`, `out`, `tmp`, `.tmp`
- Framework caches: `.next`, `.nuxt`, `.cache`, `coverage`
- Language-specific: `__pycache__` (Python), `target` (Rust), `vendor` (Go/PHP), `.gradle` (Gradle), `.venv`/`venv` (Python)

## Error Handling

Git operations can fail for various reasons. This package provides graceful error handling patterns:

### Common Error Scenarios

**1. Repository Not Found**
```typescript
const isRepo = await isGitRepo('/path/does/not/exist');
// Returns: false (no exception thrown)
```

**2. Not a Git Repository**
```typescript
const result = await getGitRepositoryDiffs('/not/a/git/repo');
// Fallback behavior: treats all files as "new"
// Returns synthetic diffs for all files in directory
```

**3. Git Command Failures**
```typescript
// Permission errors, corrupted repos, or git not installed
try {
  const result = await getGitRepositoryDiffs('/project');
} catch (error) {
  // Handle errors from git commands
  // Errors are logged via @automaker/utils logger
  console.error('Git operation failed:', error);
}
```

**4. File Read Errors**
```typescript
// When generating synthetic diffs for inaccessible files
const diff = await generateSyntheticDiffForNewFile('/path', 'locked-file.txt');
// Returns placeholder: "[Unable to read file content]"
// Error is logged but doesn't throw
```

### Best Practices

1. **Check repository status first**:
   ```typescript
   const isRepo = await isGitRepo(path);
   if (!isRepo) {
     // Handle non-git case appropriately
   }
   ```

2. **Expect non-git directories**:
   - `getGitRepositoryDiffs()` automatically handles both cases
   - Always returns a valid result structure

3. **Monitor logs**:
   - Errors are logged with the `[GitUtils]` prefix
   - Check logs for permission issues or git configuration problems

4. **Handle edge cases**:
   - Empty repositories (no commits yet)
   - Detached HEAD states
   - Corrupted git repositories
   - Missing git binary

## Dependencies

- `@automaker/types` - FileStatus type definition
- `@automaker/utils` - Logger utilities

## Used By

- `@automaker/server` - Git routes, worktree operations, feature context
