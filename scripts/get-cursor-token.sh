#!/bin/bash
# Extract Cursor CLI OAuth token from host machine for use in Docker container
#
# IMPORTANT: This extracts the cursor-agent CLI OAuth token, NOT the Cursor IDE token.
# cursor-agent stores tokens in macOS Keychain (not SQLite like the IDE).
#
# Usage: ./scripts/get-cursor-token.sh
#        or: export CURSOR_AUTH_TOKEN=$(./scripts/get-cursor-token.sh)
#
# For Docker: echo "CURSOR_AUTH_TOKEN=$(./scripts/get-cursor-token.sh)" >> .env

set -e

# Determine platform and extract token accordingly
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS: cursor-agent stores OAuth tokens in Keychain
    # Service: cursor-access-token, Account: cursor-user

    if ! command -v security &> /dev/null; then
        echo "Error: 'security' command not found." >&2
        exit 1
    fi

    # Extract access token from Keychain
    TOKEN=$(security find-generic-password -a "cursor-user" -s "cursor-access-token" -w 2>/dev/null)

    if [ -z "$TOKEN" ]; then
        echo "Error: No Cursor CLI token found in Keychain." >&2
        echo "Make sure you've logged in with 'cursor-agent login' first." >&2
        exit 1
    fi

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux: cursor-agent stores OAuth tokens in a JSON file
    # Default location: ~/.config/cursor/auth.json
    # Or: $XDG_CONFIG_HOME/cursor/auth.json

    if [ -n "$XDG_CONFIG_HOME" ]; then
        AUTH_FILE="$XDG_CONFIG_HOME/cursor/auth.json"
    else
        AUTH_FILE="$HOME/.config/cursor/auth.json"
    fi

    if [ ! -f "$AUTH_FILE" ]; then
        echo "Error: Cursor auth file not found at: $AUTH_FILE" >&2
        echo "Make sure you've logged in with 'cursor-agent login' first." >&2
        exit 1
    fi

    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required but not installed." >&2
        echo "Install it with: apt install jq" >&2
        exit 1
    fi

    TOKEN=$(jq -r '.accessToken // empty' "$AUTH_FILE" 2>/dev/null)

    if [ -z "$TOKEN" ]; then
        echo "Error: No access token found in $AUTH_FILE" >&2
        exit 1
    fi
else
    echo "Error: Unsupported platform: $OSTYPE" >&2
    exit 1
fi

# Output the token
echo "$TOKEN"
