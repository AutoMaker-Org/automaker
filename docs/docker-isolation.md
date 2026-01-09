# Docker Isolation Guide

This guide covers running Automaker in a fully isolated Docker container. For background on why isolation matters, see the [Security Disclaimer](../DISCLAIMER.md).

## Quick Start

1. **Set your API key** (create a `.env` file in the project root):

   ```bash
   # Linux/Mac
   echo "ANTHROPIC_API_KEY=your-api-key-here" > .env

   # Windows PowerShell
   Set-Content -Path .env -Value "ANTHROPIC_API_KEY=your-api-key-here" -Encoding UTF8
   ```

2. **Build and run**:

   ```bash
   docker-compose up -d
   ```

3. **Access Automaker** at `http://localhost:3007`

4. **Stop**:

   ```bash
   docker-compose down
   ```

## How Isolation Works

The default `docker-compose.yml` configuration:

- Uses only Docker-managed volumes (no host filesystem access)
- Server runs as a non-root user
- Has no privileged access to your system

Projects created in the UI are stored inside the container at `/projects` and persist across restarts via Docker volumes.

## Mounting a Specific Project

If you need to work on a host project, create `docker-compose.project.yml`:

```yaml
services:
  server:
    volumes:
      - ./my-project:/projects/my-project:ro # :ro = read-only
```

Then run:

```bash
docker-compose -f docker-compose.yml -f docker-compose.project.yml up -d
```

**Tip**: Use `:ro` (read-only) when possible for extra safety.

## CLI Authentication (macOS)

On macOS, OAuth tokens are stored in Keychain (Claude) and SQLite (Cursor). Use these scripts to extract and pass them to the container:

### Claude CLI

```bash
# Extract and add to .env
echo "CLAUDE_OAUTH_CREDENTIALS=$(./scripts/get-claude-token.sh)" >> .env
```

### Cursor CLI

```bash
# Extract and add to .env (extracts from macOS Keychain)
echo "CURSOR_AUTH_TOKEN=$(./scripts/get-cursor-token.sh)" >> .env
```

**Note**: The cursor-agent CLI stores its OAuth tokens separately from the Cursor IDE:

- **macOS**: Tokens are stored in Keychain (service: `cursor-access-token`)
- **Linux**: Tokens are stored in `~/.config/cursor/auth.json` (not `~/.cursor`)

### Apply to container

```bash
# Restart with new credentials
docker-compose down && docker-compose up -d
```

**Note**: Tokens expire periodically. If you get authentication errors, re-run the extraction scripts.

## CLI Authentication (Linux/Windows)

On Linux/Windows, cursor-agent stores credentials in files, so you can either:

**Option 1: Extract tokens to environment variables (recommended)**

```bash
# Linux: Extract tokens to .env
echo "CURSOR_AUTH_TOKEN=$(jq -r '.accessToken' ~/.config/cursor/auth.json)" >> .env
```

**Option 2: Bind mount credential directories directly**

```yaml
# In docker-compose.override.yml
volumes:
  - ~/.claude:/home/automaker/.claude
  - ~/.config/cursor:/home/automaker/.config/cursor
```

## Troubleshooting

| Problem               | Solution                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container won't start | Check `.env` has `ANTHROPIC_API_KEY` set. Run `docker-compose logs` for errors.                                                                   |
| Can't access web UI   | Verify container is running with `docker ps \| grep automaker`                                                                                    |
| Need a fresh start    | Run `docker-compose down && docker volume rm automaker-data && docker-compose up -d --build`                                                      |
| Cursor auth fails     | Re-extract token with `./scripts/get-cursor-token.sh` - tokens expire periodically. Make sure you've run `cursor-agent login` on your host first. |
