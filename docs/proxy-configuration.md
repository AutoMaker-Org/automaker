# Proxy Configuration

AutoMaker supports custom API endpoints and model mapping via environment variables. This enables integration with API proxies like LiteLLM, OpenRouter, or custom endpoints.

## Environment Variables

### Base URL

| Variable             | Description                |
| -------------------- | -------------------------- |
| `ANTHROPIC_BASE_URL` | Custom API endpoint URL    |
| `ANTHROPIC_API_KEY`  | API key for authentication |

### Model Mapping

| Variable                  | Description                 |
| ------------------------- | --------------------------- |
| `ANTHROPIC_MODEL_HAIKU`   | Override the `haiku` alias  |
| `ANTHROPIC_MODEL_SONNET`  | Override the `sonnet` alias |
| `ANTHROPIC_MODEL_OPUS`    | Override the `opus` alias   |
| `ANTHROPIC_MODEL_DEFAULT` | Override the fallback model |

## Configuration Examples

### LiteLLM Proxy

```bash
ANTHROPIC_BASE_URL=http://localhost:4000
ANTHROPIC_API_KEY=your-litellm-key

ANTHROPIC_MODEL_HAIKU=litellm/claude-haiku
ANTHROPIC_MODEL_SONNET=litellm/claude-sonnet
ANTHROPIC_MODEL_OPUS=litellm/claude-opus
ANTHROPIC_MODEL_DEFAULT=litellm/claude-sonnet
```

### OpenRouter

```bash
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
ANTHROPIC_API_KEY=your-openrouter-key

ANTHROPIC_MODEL_HAIKU=anthropic/claude-3-haiku
ANTHROPIC_MODEL_SONNET=anthropic/claude-3.5-sonnet
ANTHROPIC_MODEL_OPUS=anthropic/claude-3-opus
ANTHROPIC_MODEL_DEFAULT=anthropic/claude-3.5-sonnet
```

### Custom Proxy (ProxyPal Example)

```bash
ANTHROPIC_BASE_URL=http://localhost:8317/v1
ANTHROPIC_API_KEY=proxypal-local

ANTHROPIC_MODEL_SONNET=gemini-claude-sonnet-4-5
ANTHROPIC_MODEL_OPUS=gemini-claude-opus-4-5-thinking
ANTHROPIC_MODEL_DEFAULT=gemini-claude-sonnet-4-5
```

## How It Works

### Resolution Priority

1. **Known aliases** (`haiku`, `sonnet`, `opus`) check for env var override first
2. **Full model IDs** (e.g., `claude-sonnet-4-20250514`) pass through unchanged
3. **Unknown aliases** fall back to `ANTHROPIC_MODEL_DEFAULT` or system default

### Resolution Flow

```
User specifies: "sonnet"
     ↓
Check: ANTHROPIC_MODEL_SONNET env var set?
     ↓
YES → Use env var value (e.g., "litellm/claude-sonnet")
NO  → Use hardcoded mapping (e.g., "claude-sonnet-4-5-20250929")
     ↓
API receives: final model string
```

### Default Model Override

When no model is specified or an unknown alias is used:

```
User specifies: undefined or "unknown-alias"
     ↓
Check: ANTHROPIC_MODEL_DEFAULT env var set?
     ↓
YES → Use env var value
NO  → Use system default (claude-opus-4-5-20251101)
```

## Provider Configuration

You can also set the base URL programmatically via `ProviderConfig`:

```typescript
import { ClaudeProvider } from '@automaker/server';

const provider = new ClaudeProvider({
  baseUrl: 'http://localhost:4000',
  apiKey: 'your-api-key',
});
```

Priority: `config.baseUrl` > `ANTHROPIC_BASE_URL` env var

## Limitations

- Only known aliases (`haiku`, `sonnet`, `opus`) support env var overrides
- Cannot add new aliases via environment variables
- Full model IDs are not overridable (passed through as-is)
- Cursor models are not affected by these overrides

## Troubleshooting

### Verify Your Proxy

```bash
curl -s http://localhost:8317/v1/models \
  -H "Authorization: Bearer your-api-key"
```

### Check Model Resolution

Enable debug logging to see model resolution:

```bash
# Model resolver logs to console
# Look for "[ModelResolver]" prefixed messages
```

### Common Issues

| Issue                 | Solution                                             |
| --------------------- | ---------------------------------------------------- |
| Model not found       | Verify model ID matches proxy's available models     |
| Authentication failed | Check `ANTHROPIC_API_KEY` matches proxy requirements |
| Connection refused    | Verify `ANTHROPIC_BASE_URL` is accessible            |
