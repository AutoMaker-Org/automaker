# @automaker/platform

Platform-specific utilities for AutoMaker.

## Overview

This package provides platform-specific utilities including path management, subprocess handling, and security validation. It handles AutoMaker's directory structure and system operations.

## Installation

```bash
npm install @automaker/platform
```

## Exports

### Path Management
AutoMaker directory structure utilities.

```typescript
import {
  getAutomakerDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getBoardDir,
  getImagesDir,
  getContextDir,
  getWorktreesDir,
  getAppSpecPath,
  getBranchTrackingPath,
  ensureAutomakerDir
} from '@automaker/platform';

// Get AutoMaker directory: /project/.automaker
const automakerDir = getAutomakerDir('/project/path');

// Get features directory: /project/.automaker/features
const featuresDir = getFeaturesDir('/project/path');

// Get specific feature directory: /project/.automaker/features/feature-id
const featureDir = getFeatureDir('/project/path', 'feature-id');

// Get feature images: /project/.automaker/features/feature-id/images
const imagesDir = getFeatureImagesDir('/project/path', 'feature-id');

// Ensure .automaker directory exists
await ensureAutomakerDir('/project/path');
```

### Subprocess Management
Spawn and manage subprocesses with JSON-lines output.

```typescript
import { spawnJSONLProcess, spawnProcess } from '@automaker/platform';

// Spawn process with JSONL output parsing
const result = await spawnJSONLProcess({
  command: 'claude-agent',
  args: ['--output', 'jsonl'],
  cwd: '/project/path',
  onLine: (data) => console.log('Received:', data),
  onError: (error) => console.error('Error:', error)
});

// Spawn regular process
const output = await spawnProcess({
  command: 'git',
  args: ['status'],
  cwd: '/project/path'
});
```

### Security Validation
Path validation and security checks.

```typescript
import {
  initAllowedPaths,
  isPathAllowed,
  validatePath,
  getAllowedPaths,
  getAllowedRootDirectory,
  getDataDirectory,
  PathNotAllowedError
} from '@automaker/platform';

// Initialize allowed paths from environment
// Reads ALLOWED_ROOT_DIRECTORY and DATA_DIR environment variables
initAllowedPaths();

// Check if path is allowed
if (isPathAllowed('/project/path')) {
  console.log('Path is allowed');
}

// Validate and normalize path (throws PathNotAllowedError if not allowed)
try {
  const safePath = validatePath('/requested/path');
} catch (error) {
  if (error instanceof PathNotAllowedError) {
    console.error('Access denied:', error.message);
  }
}

// Get configured directories
const rootDir = getAllowedRootDirectory(); // or null if not configured
const dataDir = getDataDirectory(); // or null if not configured
const allowed = getAllowedPaths(); // array of all allowed paths
```

## Usage Example

```typescript
import {
  getFeatureDir,
  ensureAutomakerDir,
  spawnJSONLProcess,
  validatePath
} from '@automaker/platform';

async function executeFeature(projectPath: string, featureId: string) {
  // Validate project path
  const safePath = validatePath(projectPath);

  // Ensure AutoMaker directory exists
  await ensureAutomakerDir(safePath);

  // Get feature directory
  const featureDir = getFeatureDir(safePath, featureId);

  // Execute agent in feature directory
  const result = await spawnJSONLProcess({
    command: 'claude-agent',
    args: ['execute'],
    cwd: featureDir,
    onLine: (data) => {
      if (data.type === 'progress') {
        console.log('Progress:', data.progress);
      }
    }
  });

  return result;
}
```

## Security Model

Path security is enforced through two environment variables:

### Environment Variables

- **ALLOWED_ROOT_DIRECTORY**: Primary security boundary. When set, all file operations must be within this directory.
- **DATA_DIR**: Application data directory (settings, credentials). Always allowed regardless of ALLOWED_ROOT_DIRECTORY.

### Behavior

1. **When ALLOWED_ROOT_DIRECTORY is set**: Only paths within this directory (or DATA_DIR) are allowed. Attempts to access other paths will throw `PathNotAllowedError`.

2. **When ALLOWED_ROOT_DIRECTORY is not set**: All paths are allowed (backward compatibility mode).

3. **DATA_DIR exception**: Paths within DATA_DIR are always allowed, even if outside ALLOWED_ROOT_DIRECTORY. This ensures settings and credentials are always accessible.

### Example Configuration

```bash
# Docker/containerized environment
ALLOWED_ROOT_DIRECTORY=/workspace
DATA_DIR=/app/data

# Development (no restrictions)
# Leave ALLOWED_ROOT_DIRECTORY unset for full access
```

### Secure File System

The `secureFs` module wraps Node.js `fs` operations with path validation:

```typescript
import { secureFs } from '@automaker/platform';

// All operations validate paths before execution
await secureFs.readFile('/workspace/project/file.txt');
await secureFs.writeFile('/workspace/project/output.txt', data);
await secureFs.mkdir('/workspace/project/new-dir', { recursive: true });
```

## Directory Structure

AutoMaker uses the following directory structure:

```
/project/
├── .automaker/
│   ├── features/          # Feature storage
│   │   └── {featureId}/
│   │       ├── feature.json
│   │       └── images/
│   ├── board/             # Board configuration
│   ├── context/           # Context files
│   ├── images/            # Global images
│   ├── worktrees/         # Git worktrees
│   ├── app-spec.md        # App specification
│   └── branch-tracking.json
```

## Dependencies

- `@automaker/types` - Type definitions

## Used By

- `@automaker/server`
