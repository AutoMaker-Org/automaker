# Proxy Configuration

AutoMaker supports custom API endpoints via environment variables. This enables integration with API proxies for credential injection, request logging, or routing through corporate infrastructure.

## Environment Variables

### Base URL

| Variable             | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `ANTHROPIC_BASE_URL` | Custom API endpoint URL (proxy receives plaintext HTTP) |
| `ANTHROPIC_API_KEY`  | API key for authentication                              |

> ⚠️ **Important**: Do NOT include `/v1` in `ANTHROPIC_BASE_URL`. The Claude Agent SDK automatically appends `/v1` to the base URL. Including it will result in a double path (`/v1/v1`) and cause connection failures with "Claude Code process exited with code 1".
>
> ```bash
> # ✅ Correct
> ANTHROPIC_BASE_URL=http://localhost:8080
>
> # ❌ Wrong - will fail with exit code 1
> ANTHROPIC_BASE_URL=http://localhost:8080/v1
> ```

### Model Mapping

| Variable                  | Description                 |
| ------------------------- | --------------------------- |
| `ANTHROPIC_MODEL_HAIKU`   | Override the `haiku` alias  |
| `ANTHROPIC_MODEL_SONNET`  | Override the `sonnet` alias |
| `ANTHROPIC_MODEL_OPUS`    | Override the `opus` alias   |
| `ANTHROPIC_MODEL_DEFAULT` | Override the fallback model |

## How It Works

Claude Code and the Agent SDK support `ANTHROPIC_BASE_URL` for routing sampling requests through a proxy. Your proxy receives **plaintext HTTP requests**, can inspect and modify them (including injecting credentials), then forwards to the real Anthropic API.

```
Your Application
     ↓
AutoMaker Server
     ↓
Claude Agent SDK (passes ANTHROPIC_BASE_URL in env)
     ↓
Claude Code CLI
     ↓
HTTP Request → Your Proxy (ANTHROPIC_BASE_URL)
     ↓
Anthropic API
```

## Configuration Examples

### Credential-Injecting Proxy

```bash
# Proxy that adds API key automatically
export ANTHROPIC_BASE_URL=http://localhost:8080
# ANTHROPIC_API_KEY can be omitted if proxy injects it
```

### LiteLLM Proxy

```bash
export ANTHROPIC_BASE_URL=http://localhost:4000
export ANTHROPIC_API_KEY=your-litellm-key

# Model mapping (if your proxy uses different model names)
export ANTHROPIC_MODEL_HAIKU=litellm/claude-haiku
export ANTHROPIC_MODEL_SONNET=litellm/claude-sonnet
export ANTHROPIC_MODEL_OPUS=litellm/claude-opus
```

### Corporate Proxy with Logging

```bash
# Route through corporate proxy for audit logging
export ANTHROPIC_BASE_URL=https://ai-proxy.internal.company.com/anthropic
export ANTHROPIC_API_KEY=internal-service-key
```

## Supported Cloud Providers

The Claude Agent SDK also supports these third-party cloud providers natively:

| Provider          | Environment Variable        | Documentation                                                           |
| ----------------- | --------------------------- | ----------------------------------------------------------------------- |
| Amazon Bedrock    | `CLAUDE_CODE_USE_BEDROCK=1` | [Bedrock Setup](https://docs.anthropic.com/en/docs/claude-code/bedrock) |
| Google Vertex AI  | `CLAUDE_CODE_USE_VERTEX=1`  | [Vertex Setup](https://docs.anthropic.com/en/docs/claude-code/vertex)   |
| Microsoft Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` | [Foundry Setup](https://docs.anthropic.com/en/docs/claude-code/foundry) |

### Example: Amazon Bedrock

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Model Resolution

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

- Model mapping only applies to known aliases (`haiku`, `sonnet`, `opus`)
- Full model IDs are passed through unchanged
- Your proxy must forward requests to the Anthropic API (or be API-compatible)
- Extended thinking and other Claude-specific features require Anthropic API compatibility

## Troubleshooting

### Verify Your Proxy

```bash
# Test proxy connectivity
curl -s http://localhost:8080/v1/messages \
  -H "Authorization: Bearer test" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-sonnet-4-5", "max_tokens": 10, "messages": [{"role": "user", "content": "Hi"}]}'
```

### Check Environment Variables

```bash
# Verify env vars are set
echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_API_KEY
```

### Common Issues

| Issue                 | Solution                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| Double `/v1` in URL   | Do NOT include `/v1` in `ANTHROPIC_BASE_URL` - the SDK appends it automatically |
| Connection refused    | Verify `ANTHROPIC_BASE_URL` is accessible                                       |
| Authentication failed | Check `ANTHROPIC_API_KEY` or proxy credentials                                  |
| Model not found       | Verify model ID matches Anthropic's supported models                            |
| Timeout errors        | Check proxy latency and timeout settings                                        |

### Debug Logging

Model resolution logs are prefixed with `[ModelResolver]`:

```
[ModelResolver] Env override for alias "sonnet": "custom-model-name"
```
