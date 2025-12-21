# @automaker/dependency-resolver

Feature dependency resolution using topological sorting.

## Overview

This package provides dependency resolution for AutoMaker features using Kahn's algorithm with priority-aware ordering. It ensures features are executed in the correct order based on their dependencies.

## Installation

```bash
npm install @automaker/dependency-resolver
```

## Exports

### Resolve Dependencies
Order features based on dependencies and priorities.

```typescript
import { resolveDependencies } from '@automaker/dependency-resolver';
import type { Feature } from '@automaker/types';

const features: Feature[] = [
  {
    id: 'database',
    category: 'backend',
    description: 'Setup database',
    priority: 1
  },
  {
    id: 'auth',
    category: 'backend',
    description: 'Add authentication',
    dependencies: ['database'],
    priority: 2
  },
  {
    id: 'api',
    category: 'backend',
    description: 'Create API endpoints',
    dependencies: ['auth'],
    priority: 3
  }
];

const result = resolveDependencies(features);

console.log(result.orderedFeatures);
// [database, auth, api]

if (result.hasCycle) {
  console.error('Circular dependency detected!');
  console.error('Features in cycle:', result.cyclicFeatures);
}
```

### Check Dependencies Satisfied
Check if a feature's dependencies are satisfied.

```typescript
import { areDependenciesSatisfied } from '@automaker/dependency-resolver';

const allFeatures: Feature[] = [
  { id: 'database', status: 'completed', ... },
  { id: 'auth', status: 'pending', dependencies: ['database'], ... }
];

const authFeature = allFeatures.find(f => f.id === 'auth');

if (areDependenciesSatisfied(authFeature, allFeatures)) {
  console.log('Auth feature is ready to execute');
} else {
  console.log('Waiting for dependencies');
}
```

### Get Blocking Dependencies
Get list of incomplete dependencies blocking a feature.

```typescript
import { getBlockingDependencies } from '@automaker/dependency-resolver';

const blocking = getBlockingDependencies(feature, allFeatures);

if (blocking.length > 0) {
  console.log(`Feature blocked by: ${blocking.join(', ')}`);
} else {
  console.log('No blocking dependencies');
}
```

## Usage Example

```typescript
import {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingDependencies
} from '@automaker/dependency-resolver';
import type { Feature } from '@automaker/types';

async function executeFeatures(features: Feature[]) {
  // Resolve dependency order
  const { orderedFeatures, hasCycle, cyclicFeatures } = resolveDependencies(features);

  if (hasCycle) {
    throw new Error(`Circular dependency: ${cyclicFeatures.join(' → ')}`);
  }

  // Execute in order
  for (const feature of orderedFeatures) {
    // Check if dependencies are satisfied
    if (!areDependenciesSatisfied(feature, features)) {
      const blocking = getBlockingDependencies(feature, features);
      console.log(`Skipping ${feature.id}, blocked by: ${blocking.join(', ')}`);
      continue;
    }

    // Execute feature
    console.log(`Executing: ${feature.id}`);
    await executeFeature(feature);

    // Mark as completed
    feature.status = 'completed';
  }
}
```

## Algorithm

### Topological Sort (Kahn's Algorithm)
1. Calculate in-degree for each feature (number of dependencies)
2. Start with features that have no dependencies (in-degree = 0)
3. Process features in priority order
4. Remove processed features from dependency graph
5. Repeat until all features processed or cycle detected

### Priority Handling
- Features with lower priority numbers execute first
- When multiple features have same in-degree, priority determines order
- Features without explicit priority default to lowest priority

### Cycle Detection
- Detects circular dependencies
- Returns affected features in cycle
- Prevents infinite loops in execution

## Return Types

### DependencyResolutionResult
```typescript
interface DependencyResolutionResult {
  orderedFeatures: Feature[];    // Features in execution order
  hasCycle: boolean;             // True if circular dependency detected
  cyclicFeatures: string[];      // Feature IDs involved in cycle
}
```

## Edge Cases

### Missing Dependencies
Features with dependencies on non-existent features are treated as if the dependency is satisfied (allows flexibility).

### Self-Dependencies
Features depending on themselves are detected as cycles.

### Empty Dependencies Array
Treated same as no dependencies - feature is ready immediately.

## Dependencies

- `@automaker/types` - Feature type definition

## Used By

- `@automaker/server` - Auto-mode feature execution
- `@automaker/ui` - Board view feature ordering
