# @automaker/model-resolver

Claude model resolution and mapping utilities.

## Overview

This package handles Claude model resolution, converting user-friendly aliases to actual Claude model identifiers and providing default model configurations.

## Installation

```bash
npm install @automaker/model-resolver
```

## Exports

### Model Resolution

Convert model aliases to full model identifiers.

```typescript
import { resolveModelString, DEFAULT_MODELS } from '@automaker/model-resolver';
import { CLAUDE_MODEL_MAP } from '@automaker/types';

// Resolve model string
const model = resolveModelString('sonnet');
// Returns: 'claude-sonnet-4-20250514'

const model2 = resolveModelString('haiku');
// Returns: 'claude-haiku-4-5'

const model3 = resolveModelString('opus');
// Returns: 'claude-opus-4-6'

// Use with custom default
const model4 = resolveModelString(undefined, 'claude-sonnet-4-20250514');
// Returns: 'claude-sonnet-4-20250514' (default)

// Direct model ID passthrough
const model5 = resolveModelString('claude-opus-4-6');
// Returns: 'claude-opus-4-6' (unchanged)
```

### Get Effective Model

Get the actual model that will be used.

```typescript
import { getEffectiveModel } from '@automaker/model-resolver';

// Get effective model with fallback chain
const model = getEffectiveModel({
  requestedModel: 'sonnet',
  featureModel: undefined,
  defaultModel: 'claude-sonnet-4-20250514',
});
```

### Model Constants

Access model mappings and defaults.

```typescript
import { DEFAULT_MODELS } from '@automaker/model-resolver';
import { CLAUDE_MODEL_MAP } from '@automaker/types';

// Default models for different contexts
console.log(DEFAULT_MODELS.claude); // 'claude-sonnet-4-20250514'
console.log(DEFAULT_MODELS.autoMode); // 'claude-sonnet-4-20250514'
console.log(DEFAULT_MODELS.chat); // 'claude-sonnet-4-20250514'

// Model alias mappings
console.log(CLAUDE_MODEL_MAP.haiku); // 'claude-haiku-4-5'
console.log(CLAUDE_MODEL_MAP.sonnet); // 'claude-sonnet-4-20250514'
console.log(CLAUDE_MODEL_MAP.opus); // 'claude-opus-4-6'
```

## Usage Example

```typescript
import { resolveModelString, DEFAULT_MODELS } from '@automaker/model-resolver';
import type { Feature } from '@automaker/types';

function prepareFeatureExecution(feature: Feature) {
  // Resolve model from feature or use default
  const model = resolveModelString(feature.model, DEFAULT_MODELS.autoMode);

  console.log(`Executing feature with model: ${model}`);

  return {
    featureId: feature.id,
    model,
    // ... other options
  };
}

// Example usage
const feature: Feature = {
  id: 'auth-feature',
  category: 'backend',
  description: 'Add authentication',
  model: 'opus', // User-friendly alias
};

prepareFeatureExecution(feature);
// Output: Executing feature with model: claude-opus-4-6
```

## Supported Models

### Current Model Aliases

- `haiku` → `claude-haiku-4-5`
- `sonnet` → `claude-sonnet-4-20250514`
- `opus` → `claude-opus-4-6`

### Model Selection Guide

- **Haiku**: Fast responses, simple tasks, lower cost
- **Sonnet**: Balanced performance, most tasks (recommended default)
- **Opus**: Maximum capability, complex reasoning, highest cost

## Dependencies

- `@automaker/types` - Model type definitions and constants

## Used By

- `@automaker/server` - Feature execution, agent chat, enhancement

## Notes

- Model strings that don't match aliases are passed through unchanged
- This allows direct use of specific model versions like `claude-sonnet-4-20250514`
- Always falls back to a sensible default if no model is specified
