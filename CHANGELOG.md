# Changelog

All notable changes to AutoMaker will be documented in this file.

## [Unreleased] - 2025-01

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

- Streaming not yet implemented for Zai (uses `stream: false`)
- Tool execution uses shell commands (requires security hardening for production use)
- Structured output for non-Claude models uses regex parsing (planned: capability flag)
- Model display naming inconsistent between views ("Opus" vs "GLM-4.7")

### Future Enhancements

- Add streaming support for Zai models
- Implement native structured output capability flag
- Security hardening for tool execution
- E2E tests for Zai integration
- Provider registration map instead of if/else chains
- Visual provider indicators in UI
