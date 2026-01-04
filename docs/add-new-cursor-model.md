# Adding New Cursor Models to AutoMaker

This guide explains how to add new Cursor CLI models to AutoMaker. The process involves updating a single file with automatic propagation to the UI.

## Overview

Cursor models are defined in `libs/types/src/cursor-models.ts`. This file contains:

- `CursorModelId` - Union type of all valid model IDs
- `CursorModelConfig` - Interface for model metadata
- `CURSOR_MODEL_MAP` - Record mapping model IDs to their configs

The UI automatically reads from `CURSOR_MODEL_MAP`, so adding a model there makes it available everywhere.

---

## Step-by-Step Guide

### Step 1: Add the Model ID to the Type

Open `libs/types/src/cursor-models.ts` and add your model ID to the `CursorModelId` union type:

```typescript
export type CursorModelId =
  | 'auto'
  | 'claude-sonnet-4'
  | 'claude-sonnet-4-thinking'
  | 'composer-1'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gemini-2.5-pro'
  | 'o3-mini'
  | 'your-new-model'; // <-- Add your model here
```

### Step 2: Add the Model Config to the Map

In the same file, add an entry to `CURSOR_MODEL_MAP`:

```typescript
export const CURSOR_MODEL_MAP: Record<CursorModelId, CursorModelConfig> = {
  // ... existing models ...

  'your-new-model': {
    id: 'your-new-model',
    label: 'Your New Model', // Display name in UI
    description: 'Description of the model capabilities',
    hasThinking: false, // true if model has built-in reasoning
    supportsVision: false, // true if model supports image inputs (currently all false)
  },
};
```

### Step 3: Rebuild the Types Package

After making changes, rebuild the types package:

```bash
npm run build -w @automaker/types
```

### Step 4: Verify the Changes

The new model will automatically appear in:

- **Add Feature Dialog** > Model tab > Cursor CLI section
- **Edit Feature Dialog** > Model tab > Cursor CLI section
- **AI Profiles** > Create/Edit Profile > Cursor provider > Model selection
- **Settings** > Cursor tab > Model configuration

---

## Model Config Fields

| Field            | Type      | Description                                                     |
| ---------------- | --------- | --------------------------------------------------------------- |
| `id`             | `string`  | Must match the key in the map and the CLI model ID              |
| `label`          | `string`  | Human-readable name shown in UI                                 |
| `description`    | `string`  | Tooltip/help text explaining the model                          |
| `hasThinking`    | `boolean` | Set `true` if model has built-in extended thinking              |
| `supportsVision` | `boolean` | Set `true` if model supports image inputs (all false currently) |

---

## How It Works

### Automatic UI Integration

The UI components read from `CURSOR_MODEL_MAP` at runtime:

1. **model-constants.ts** imports `CURSOR_MODEL_MAP` and creates `CURSOR_MODELS` array
2. **ModelSelector** component renders Cursor models from this array
3. **ProfileForm** component uses the map for Cursor model selection

### Provider Routing

When a feature uses a Cursor model:

1. The model string is stored as `cursor-{modelId}` (e.g., `cursor-composer-1`)
2. `ProviderFactory.getProviderNameForModel()` detects the `cursor-` prefix
3. `CursorProvider` is used for execution
4. The model ID (without prefix) is passed to the Cursor CLI

---

## Example: Adding a Hypothetical Model

Let's add a hypothetical "cursor-turbo" model:

```typescript
// In libs/types/src/cursor-models.ts

// Step 1: Add to type
export type CursorModelId =
  | 'auto'
  | 'claude-sonnet-4'
  // ... other models ...
  | 'cursor-turbo'; // New model

// Step 2: Add to map
export const CURSOR_MODEL_MAP: Record<CursorModelId, CursorModelConfig> = {
  // ... existing entries ...

  'cursor-turbo': {
    id: 'cursor-turbo',
    label: 'Cursor Turbo',
    description: 'Optimized for speed with good quality balance',
    hasThinking: false,
    supportsVision: false,
  },
};
```

After rebuilding, "Cursor Turbo" will appear in all model selection UIs.

---

## Checklist

- [ ] Added model ID to `CursorModelId` type
- [ ] Added config entry to `CURSOR_MODEL_MAP`
- [ ] Rebuilt types package (`npm run build -w @automaker/types`)
- [ ] Verified model appears in Add Feature dialog
- [ ] Verified model appears in AI Profiles form
- [ ] Tested execution with new model (if Cursor CLI supports it)

---

## Notes

- The model ID must exactly match what Cursor CLI expects
- Check Cursor's documentation for available models: https://cursor.com/docs
- Models with `hasThinking: true` display a "Thinking" badge in the UI
- Currently all models have `supportsVision: false` as Cursor CLI doesn't pass images to models
