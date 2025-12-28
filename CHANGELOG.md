# Changelog

All notable changes to AutoMaker will be documented in this file.

## [Unreleased] - 2025-01

### Added - Multi-Provider UX Enhancements

This release enhances the multi-provider system with improved user experience for provider management and model equivalence routing.

#### Backend Changes

**Model Resolver System**

- Added `resolveModelWithProviderAvailability()` function for provider-aware model resolution
- `MODEL_EQUIVALENCE` map for cross-provider model fallback:
  - `claude-opus-4.5-...` ↔ `glm-4.7` (Premium tier)
  - `claude-sonnet-4.5-...` ↔ `glm-4.6` (Balanced tier)
  - `claude-haiku-4.5-...` ↔ `glm-4.5-air` (Speed tier)
- `getProviderForModel()` helper function for provider detection
- `EnabledProviders` type for provider availability configuration

**Provider Query Layer**

- `executeProviderQuery()` accepts `enabledProviders` option
- Automatic model substitution when provider is disabled
- Logged fallback behavior for debugging

**Type System**

- `GlobalSettings` includes `enabledProviders: { claude: boolean; zai: boolean }`
- `DEFAULT_GLOBAL_SETTINGS` has both providers enabled by default
- Exported `MODEL_EQUIVALENCE` and `getProviderForModel` from types package

#### Frontend Changes

**Settings UI - Provider Cards**

- Redesigned API Keys section with provider cards
- Each provider card includes:
  - Provider name, icon, and description
  - Enable/disable toggle switch
  - API key input with visibility toggle
  - Test connection button
  - Verification status indicator
- Auto-enable provider when valid API key is saved
- Manual toggle to disable providers without removing API keys

**Setup Wizard - Provider Selection**

- New `ProviderSelectionStep` component for choosing primary provider
- Provider selection cards with feature comparison:
  - Claude: CLI support + API key, multiple models (Haiku, Sonnet, Opus)
  - Zai: API key only, GLM models (GLM-4.7, GLM-4.6v, GLM-4.6, GLM-4.5-Air)
- New `ZaiSetupStep` component for Zai API key configuration
- Updated wizard flow: `welcome → theme → provider_selection → provider_setup → github → complete`
- Dynamic routing based on selected provider

**State Management**

- `app-store` includes `enabledProviders` state with actions:
  - `setEnabledProviders()` - Set provider enable states
  - `toggleProvider()` - Toggle single provider
- `setup-store` includes `selectedProvider` for wizard flow
- Both providers persisted in settings

**New Components**

- `provider-card.tsx` - Reusable provider configuration card
- `provider-selection-step.tsx` - Provider choice in setup wizard
- `zai-setup-step.tsx` - Zai-specific setup step

#### Architecture Updates

- Updated `architecture.md` with:
  - Provider enable/disable UX documentation
  - Model equivalence routing explanation
  - Onboarding wizard flow documentation
  - Provider configuration in state management

### Added - Zai (GLM) Provider Integration

This release adds support for Z.ai's GLM models as an alternative AI provider alongside Claude.

#### Backend Changes

**New Provider Implementation**

- `ZaiProvider` class implementing the `BaseProvider` interface
  - Full support for GLM-4.7, GLM-4.6v, GLM-4.6, and GLM-4.5-Air models
  - Tool calling support (Read, Write, Edit, Glob, Grep, Bash)
  - Vision support via GLM-4.6v with automatic fallback for non-vision models
  - Extended thinking mode support with `reasoning_content` streaming
  - Structured output via JSON response format

**Provider-Agnostic Query Layer**

- `executeProviderQuery()` function for unified AI provider routing
- Automatic model-based provider selection
- Provider-specific API key management
- Structured output handling for non-Claude providers

**Provider Factory Updates**

- GLM model prefix routing (`glm-*` → ZaiProvider)
- Alias support (`glm` → `glm-4.5-air`)
- Provider discovery and status checking

**Service Layer Updates**

- `AgentService`: Provider-agnostic model selection and query execution
- `AutoModeService`: Zai model support for autonomous feature execution
- `SettingsService`: Zai API key storage and migration

**Route Updates**

- All AI routes converted to use `executeProviderQuery()`:
  - `/api/agent` - Agent conversations
  - `/api/app-spec/generate-spec` - Specification generation
  - `/api/app-spec/generate-features` - Feature generation
  - `/api/suggestions` - AI suggestions
  - `/api/enhance-prompt` - Prompt enhancement
  - `/api/context/describe-file` - File description

**New Endpoints**

- `GET /api/models/providers` - Provider status and availability
- `GET /api/models/available` - Lists all available models from all providers

#### Frontend Changes

**Model Selection**

- Zai models integrated into model selector with badges (Premium, Vision, Balanced, Speed)
- Model constants with provider metadata
- Display names and model aliases

**Settings & Configuration**

- Zai provider configuration in API providers config
- API key management with live validation
- Authentication status display for Zai
- Feature defaults support for Zai models

**Profiles**

- Provider auto-detection from model selection
- Thinking level support for Zai models
- Model support utilities (`getProviderFromModel`, `modelSupportsThinking`)

**Type System**

- `ModelProvider` type: `'claude' | 'zai'`
- `ZAI_MODEL_MAP` for model alias resolution
- Credentials interface includes `zai` property
- Model display metadata for UI rendering

**Agent View**

- Reasoning content display with collapsible sections
- Brain icon for extended thinking
- User setting `showReasoningByDefault` for default expanded state

#### Library Changes

**Model Resolver (`libs/model-resolver`)**

- Provider-aware model resolution with `providerHint` parameter
- Zai model aliases and display names
- Unified model string resolution

**Types (`libs/types`)**

- `ModelProvider` type definition
- `ZAI_MODEL_MAP` constant
- Model display metadata for GLM models
- Updated settings types for Zai credentials

#### Tests

**New Test Files**

- `zai-provider.test.ts` (560 lines) - Comprehensive unit tests covering:
  - Basic query execution
  - Model selection and configuration
  - Tool calling (all 6 tools)
  - System prompt handling
  - Reasoning content support
  - Vision support and fallback
  - Structured output requests
  - Error handling
  - Installation detection
  - Configuration validation

**Updated Tests**

- `provider-factory.test.ts` - Zai model routing tests

#### Documentation

**Architecture Documentation**

- Comprehensive Zai integration section in `architecture.md`:
  - Provider architecture overview
  - Model information and capabilities table
  - Tool mapping documentation
  - Vision handling explanation
  - Extended thinking mode documentation
  - Security features
  - Configuration guide
  - Extension points for adding new providers

#### Configuration

**Environment Variables**

- `ZAI_API_KEY` - Z.ai API authentication
- `AUTOMAKER_MODEL_*` - Use-specific model selection (supports Zai models)

**Model Selection**
| Variable | Purpose |
|----------|---------|
| `AUTOMAKER_MODEL_SPEC` | Model for spec generation |
| `AUTOMAKER_MODEL_FEATURES` | Model for feature generation |
| `AUTOMAKER_MODEL_SUGGESTIONS` | Model for suggestions |
| `AUTOMAKER_MODEL_CHAT` | Model for chat sessions |
| `AUTOMAKER_MODEL_AUTO` | Model for auto-mode execution |
| `AUTOMAKER_MODEL_DEFAULT` | Default fallback model |

### Breaking Changes

None. The Zai integration is fully additive and maintains backward compatibility with existing Claude-only workflows.

### Migration Guide

**Adding Zai API Key:**

1. Open Settings → API Keys
2. Enter your Z.ai API key (get from https://open.bigmodel.cn/)
3. Click "Test" to validate
4. Save

**Using Zai Models:**

- Select a GLM model from the model selector in any AI feature
- Or set `AUTOMAKER_MODEL_DEFAULT=glm-4.7` environment variable

**Provider-Aware Defaults:**

```typescript
import { resolveModelString } from '@automaker/model-resolver';

// Default to Zai
const model = resolveModelString(undefined, undefined, 'zai');
// Returns: 'glm-4.7'

// Default to Claude
const model = resolveModelString(undefined, undefined, 'claude');
// Returns: 'claude-opus-4.5-20251101'
```

### Known Issues

- ~~Streaming not yet implemented for Zai~~ (streaming support is now implemented)
- Tool execution uses shell commands (requires security hardening for production use)
- Structured output for non-Claude models uses regex parsing (planned: capability flag)
- Model display naming inconsistent between views ("Opus" vs "GLM-4.7")

### Future Enhancements

- ~~Add streaming support for Zai models~~ (implemented)
- Implement native structured output capability flag
- Security hardening for tool execution
- E2E tests for Zai integration
- Provider registration map instead of if/else chains
- Visual provider indicators in UI
