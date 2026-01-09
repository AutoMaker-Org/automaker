#!/bin/bash
# Extract Claude OAuth token from macOS Keychain for use in Docker container
# Usage: ./scripts/get-claude-token.sh
#        or: export CLAUDE_OAUTH_TOKEN=$(./scripts/get-claude-token.sh)

set -e

# Only works on macOS (uses security command for Keychain access)
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "Error: This script only works on macOS." >&2
    echo "On Linux, mount ~/.claude directory directly instead." >&2
    exit 1
fi

# Check if security command exists
if ! command -v security &> /dev/null; then
    echo "Error: 'security' command not found." >&2
    exit 1
fi

# Get the current username
USERNAME=$(whoami)

# Extract credentials from Keychain
CREDS=$(security find-generic-password -s "Claude Code-credentials" -a "$USERNAME" -w 2>/dev/null)

if [ -z "$CREDS" ]; then
    echo "Error: No Claude credentials found in Keychain." >&2
    echo "Make sure you've logged in with 'claude login' first." >&2
    exit 1
fi

# Output the full credentials JSON (contains accessToken and refreshToken)
echo "$CREDS"
