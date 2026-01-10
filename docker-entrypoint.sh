#!/bin/sh
set -e

# Ensure Claude CLI config directory exists with correct permissions
if [ ! -d "/home/automaker/.claude" ]; then
    mkdir -p /home/automaker/.claude
fi

# If CLAUDE_OAUTH_CREDENTIALS is set, write it to the credentials file
# This allows passing OAuth tokens from host (especially macOS where they're in Keychain)
if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
    echo "$CLAUDE_OAUTH_CREDENTIALS" > /home/automaker/.claude/.credentials.json
    chmod 600 /home/automaker/.claude/.credentials.json 2>/dev/null || true
fi

# Fix permissions on Claude CLI config directory
# Suppress errors for bind-mounted host directories (macOS can't change ownership)
chown -R automaker:automaker /home/automaker/.claude 2>/dev/null || true
chmod -R 700 /home/automaker/.claude 2>/dev/null || true

# Ensure Cursor CLI config directory exists with correct permissions
# This handles both: mounted volumes (owned by root) and empty directories
if [ ! -d "/home/automaker/.cursor" ]; then
    mkdir -p /home/automaker/.cursor
fi
# Suppress errors for bind-mounted host directories (macOS can't change ownership)
chown -R automaker:automaker /home/automaker/.cursor 2>/dev/null || true
chmod -R 700 /home/automaker/.cursor 2>/dev/null || true

# If CURSOR_AUTH_TOKEN is set, write it to the cursor auth file
# On Linux, cursor-agent uses ~/.config/cursor/auth.json for file-based credential storage
# The env var CURSOR_AUTH_TOKEN is also checked directly by cursor-agent
if [ -n "$CURSOR_AUTH_TOKEN" ]; then
    CURSOR_CONFIG_DIR="/home/automaker/.config/cursor"
    mkdir -p "$CURSOR_CONFIG_DIR"
    # Write auth.json with the access token
    cat > "$CURSOR_CONFIG_DIR/auth.json" << EOF
{
  "accessToken": "$CURSOR_AUTH_TOKEN"
}
EOF
    chmod 600 "$CURSOR_CONFIG_DIR/auth.json" 2>/dev/null || true
    chown -R automaker:automaker /home/automaker/.config 2>/dev/null || true
fi

# Switch to automaker user and execute the command
exec gosu automaker "$@"
