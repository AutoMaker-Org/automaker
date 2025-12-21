# @automaker/types

Shared TypeScript type definitions for AutoMaker.

## Overview

This package contains all core type definitions used across AutoMaker's server and UI components. It has no dependencies and serves as the foundation for other packages.

## Installation

```bash
npm install @automaker/types
```

## Exports

### Provider Types
Types for AI provider integration and Claude SDK.

```typescript
import type {
  ProviderConfig,
  ConversationMessage,
  ExecuteOptions,
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition
} from '@automaker/types';
```

### Feature Types
Feature management and workflow types.

```typescript
import type {
  Feature,
  FeatureStatus,
  PlanningMode,
  PlanSpec
} from '@automaker/types';
```

**Feature Interface:**
- `id` - Unique feature identifier
- `category` - Feature category/type
- `description` - Feature description
- `dependencies` - Array of feature IDs this depends on
- `status` - Current status (pending/running/completed/failed/verified)
- `planningMode` - Planning approach (skip/lite/spec/full)
- `planSpec` - Plan specification and approval status

### Session Types
Agent session management.

```typescript
import type {
  AgentSession,
  SessionListItem,
  CreateSessionParams,
  UpdateSessionParams
} from '@automaker/types';
```

### Error Types
Error classification and handling.

```typescript
import type {
  ErrorType,
  ErrorInfo
} from '@automaker/types';
```

### Image Types
Image handling for prompts.

```typescript
import type {
  ImageData,
  ImageContentBlock
} from '@automaker/types';
```

### Model Types
Claude model definitions and mappings.

```typescript
import {
  CLAUDE_MODEL_MAP,
  DEFAULT_MODELS,
  type ModelAlias
} from '@automaker/types';
```

## Usage Example

```typescript
import type { Feature, ExecuteOptions } from '@automaker/types';

const feature: Feature = {
  id: 'auth-feature',
  category: 'backend',
  description: 'Implement user authentication',
  dependencies: ['database-setup'],
  status: 'pending',
  planningMode: 'spec'
};

const options: ExecuteOptions = {
  model: 'claude-sonnet-4-20250514',
  temperature: 0.7
};
```

## Dependencies

None - this is a pure types package.

**IMPORTANT**: This package must NEVER depend on other `@automaker/*` packages to prevent circular dependencies. All other packages depend on this one, making it the foundation of the dependency tree.

## Used By

- `@automaker/utils`
- `@automaker/platform`
- `@automaker/model-resolver`
- `@automaker/dependency-resolver`
- `@automaker/git-utils`
- `@automaker/server`
- `@automaker/ui`

## Circular Dependency Prevention

To maintain the package dependency hierarchy and prevent circular dependencies:

1. **Never add dependencies** to other `@automaker/*` packages in `package.json`
2. **Keep result types here** - For example, `DependencyResolutionResult` should stay in `@automaker/dependency-resolver`, not be moved here
3. **Import only base types** - Other packages can import from here, but this package cannot import from them
4. **Document the rule** - When adding new functionality, ensure it follows this constraint

This constraint ensures a clean one-way dependency flow:
```
@automaker/types (foundation - no dependencies)
    ↓
@automaker/utils, @automaker/platform, etc.
    ↓
@automaker/server, @automaker/ui
```
