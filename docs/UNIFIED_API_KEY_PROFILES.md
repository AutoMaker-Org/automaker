# Claude Compatible Providers System

This document describes the implementation of Claude Compatible Providers, allowing users to configure alternative API endpoints that expose Claude-compatible models to the application.

## Overview

Claude Compatible Providers allow Automaker to work with third-party API endpoints that implement Claude's API protocol. This enables:

- **Cost savings**: Use providers like z.AI GLM or MiniMax at lower costs
- **Alternative models**: Access models like GLM-4.7 or MiniMax M2.1 through familiar interfaces
- **Flexibility**: Configure per-phase model selection to optimize for speed vs quality
- **Project overrides**: Use different providers for different projects

## Architecture

### Type Definitions

#### ClaudeCompatibleProvider

```typescript
export interface ClaudeCompatibleProvider {
  id: string; // Unique identifier (UUID)
  name: string; // Display name (e.g., "z.AI GLM")
  baseUrl: string; // API endpoint URL
  providerType?: string; // Provider type for icon/grouping (e.g., 'glm', 'minimax', 'openrouter')
  apiKeySource?: ApiKeySource; // 'inline' | 'env' | 'credentials'
  apiKey?: string; // API key (when apiKeySource = 'inline')
  useAuthToken?: boolean; // Use ANTHROPIC_AUTH_TOKEN header
  timeoutMs?: number; // Request timeout in milliseconds
  disableNonessentialTraffic?: boolean; // Minimize non-essential API calls
  enabled?: boolean; // Whether provider is active (default: true)
  models?: ProviderModel[]; // Models exposed by this provider
}
```

#### ProviderModel

```typescript
export interface ProviderModel {
  id: string; // Model ID sent to API (e.g., "GLM-4.7")
  displayName: string; // Display name in UI (e.g., "GLM 4.7")
  mapsToClaudeModel?: ClaudeModelAlias; // Which Claude tier this replaces ('haiku' | 'sonnet' | 'opus')
  capabilities?: {
    supportsVision?: boolean; // Whether model supports image inputs
    supportsThinking?: boolean; // Whether model supports extended thinking
    maxThinkingLevel?: ThinkingLevel; // Maximum thinking level if supported
  };
}
```

#### PhaseModelEntry

Phase model configuration now supports provider models:

```typescript
export interface PhaseModelEntry {
  providerId?: string; // Provider ID (undefined = native Claude)
  model: string; // Model ID or alias
  thinkingLevel?: ThinkingLevel; // 'none' | 'low' | 'medium' | 'high'
}
```

### Provider Templates

Available provider templates in `CLAUDE_PROVIDER_TEMPLATES`:

| Template         | Provider Type | Base URL                             | Description                   |
| ---------------- | ------------- | ------------------------------------ | ----------------------------- |
| Direct Anthropic | anthropic     | `https://api.anthropic.com`          | Standard Anthropic API        |
| OpenRouter       | openrouter    | `https://openrouter.ai/api`          | Access Claude and 300+ models |
| z.AI GLM         | glm           | `https://api.z.ai/api/anthropic`     | GLM models at lower cost      |
| MiniMax          | minimax       | `https://api.minimax.io/anthropic`   | MiniMax M2.1 model            |
| MiniMax (China)  | minimax       | `https://api.minimaxi.com/anthropic` | MiniMax for China region      |

### Model Mappings

Each provider model specifies which Claude model tier it maps to via `mapsToClaudeModel`:

**z.AI GLM:**

- `GLM-4.5-Air` → haiku
- `GLM-4.7` → sonnet, opus

**MiniMax:**

- `MiniMax-M2.1` → haiku, sonnet, opus

**OpenRouter:**

- `anthropic/claude-3.5-haiku` → haiku
- `anthropic/claude-3.5-sonnet` → sonnet
- `anthropic/claude-3-opus` → opus

## Server-Side Implementation

### API Key Resolution

The `buildEnv()` function in `claude-provider.ts` resolves API keys based on `apiKeySource`:

```typescript
function buildEnv(
  providerConfig?: ClaudeCompatibleProvider,
  credentials?: Credentials
): Record<string, string | undefined> {
  if (providerConfig) {
    let apiKey: string | undefined;
    const source = providerConfig.apiKeySource ?? 'inline';

    switch (source) {
      case 'inline':
        apiKey = providerConfig.apiKey;
        break;
      case 'env':
        apiKey = process.env.ANTHROPIC_API_KEY;
        break;
      case 'credentials':
        apiKey = credentials?.apiKeys?.anthropic;
        break;
    }
    // ... build environment with resolved key
  }
}
```

### Provider Lookup

The `getProviderByModelId()` helper resolves provider configuration from model IDs:

```typescript
export async function getProviderByModelId(
  modelId: string,
  settingsService: SettingsService,
  logPrefix?: string
): Promise<{
  provider?: ClaudeCompatibleProvider;
  resolvedModel?: string;
  credentials?: Credentials;
}>;
```

This is used by all routes that call the Claude SDK to:

1. Check if the model ID belongs to a provider
2. Get the provider configuration (baseUrl, auth, etc.)
3. Resolve the `mapsToClaudeModel` for the SDK

### Phase Model Resolution

The `getPhaseModelWithOverrides()` helper gets effective phase model config:

```typescript
export async function getPhaseModelWithOverrides(
  phaseKey: PhaseModelKey,
  settingsService: SettingsService,
  projectPath?: string,
  logPrefix?: string
): Promise<{
  model: string;
  thinkingLevel?: ThinkingLevel;
  providerId?: string;
  providerConfig?: ClaudeCompatibleProvider;
  credentials?: Credentials;
}>;
```

This handles:

1. Project-level overrides (if projectPath provided)
2. Global phase model settings
3. Default fallback models

## UI Implementation

### Model Selection Dropdowns

Phase model selectors (`PhaseModelSelector`) display:

1. **Claude Models** - Native Claude models (Haiku, Sonnet, Opus)
2. **Provider Sections** - Each enabled provider as a separate group:
   - Section header: `{provider.name} (via Claude)`
   - Models with their mapped Claude tiers: "Maps to Haiku, Sonnet, Opus"
   - Thinking level submenu for models that support it

### Provider Icons

Icons are determined by `providerType`:

- `glm` → Z logo
- `minimax` → MiniMax logo
- `openrouter` → OpenRouter logo
- Generic → OpenRouter as fallback

### Bulk Replace

The "Bulk Replace" feature allows switching all phase models to a provider at once:

1. Select a provider from the dropdown
2. Preview shows which models will be assigned:
   - haiku phases → provider's haiku-mapped model
   - sonnet phases → provider's sonnet-mapped model
   - opus phases → provider's opus-mapped model
3. Apply replaces all phase model configurations

The Bulk Replace button only appears when at least one provider is enabled.

## Project-Level Overrides

Projects can override global phase model settings via `phaseModelOverrides`:

```typescript
interface Project {
  // ...
  phaseModelOverrides?: PhaseModelConfig; // Per-phase overrides
}
```

### Storage

Project overrides are stored in `.automaker/settings.json`:

```json
{
  "phaseModelOverrides": {
    "enhancementModel": {
      "providerId": "provider-uuid",
      "model": "GLM-4.5-Air",
      "thinkingLevel": "none"
    }
  }
}
```

### Resolution Priority

1. Project override for specific phase (if set)
2. Global phase model setting
3. Default model for phase

## Migration

### v5 → v6 Migration

The system migrated from `claudeApiProfiles` to `claudeCompatibleProviders`:

```typescript
// Old: modelMappings object
{
  modelMappings: {
    haiku: 'GLM-4.5-Air',
    sonnet: 'GLM-4.7',
    opus: 'GLM-4.7'
  }
}

// New: models array with mapsToClaudeModel
{
  models: [
    { id: 'GLM-4.5-Air', displayName: 'GLM 4.5 Air', mapsToClaudeModel: 'haiku' },
    { id: 'GLM-4.7', displayName: 'GLM 4.7', mapsToClaudeModel: 'sonnet' },
    { id: 'GLM-4.7', displayName: 'GLM 4.7', mapsToClaudeModel: 'opus' },
  ]
}
```

The migration is automatic and preserves existing provider configurations.

## Files Changed

### Types

| File                         | Changes                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `libs/types/src/settings.ts` | `ClaudeCompatibleProvider`, `ProviderModel`, `PhaseModelEntry` types |
| `libs/types/src/provider.ts` | `ExecuteOptions.claudeCompatibleProvider` field                      |
| `libs/types/src/index.ts`    | Exports for new types                                                |

### Server

| File                                           | Changes                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| `apps/server/src/providers/claude-provider.ts` | Provider config handling, buildEnv updates               |
| `apps/server/src/lib/settings-helpers.ts`      | `getProviderByModelId()`, `getPhaseModelWithOverrides()` |
| `apps/server/src/services/settings-service.ts` | v5→v6 migration                                          |
| `apps/server/src/routes/**/*.ts`               | Provider lookup for all SDK calls                        |

### UI

| File                                               | Changes                                   |
| -------------------------------------------------- | ----------------------------------------- |
| `apps/ui/src/.../phase-model-selector.tsx`         | Provider model rendering, thinking levels |
| `apps/ui/src/.../bulk-replace-dialog.tsx`          | Bulk replace feature                      |
| `apps/ui/src/.../api-profiles-section.tsx`         | Provider management UI                    |
| `apps/ui/src/components/ui/provider-icon.tsx`      | Provider-specific icons                   |
| `apps/ui/src/hooks/use-project-settings-loader.ts` | Load phaseModelOverrides                  |

## Testing

```bash
# Build and run
npm run build:packages
npm run dev:web

# Run server tests
npm run test:server
```

### Test Cases

1. **Provider setup**: Add z.AI GLM provider with inline API key
2. **Model selection**: Select GLM-4.7 for a phase, verify it appears in dropdown
3. **Thinking levels**: Select thinking level for provider model
4. **Bulk replace**: Switch all phases to a provider at once
5. **Project override**: Set per-project model override, verify it persists
6. **Provider deletion**: Delete all providers, verify empty state persists

## Future Enhancements

Potential improvements:

1. **Provider validation**: Test API connection before saving
2. **Usage tracking**: Show which phases use which provider
3. **Cost estimation**: Display estimated costs per provider
4. **Model capabilities**: Auto-detect supported features from provider
