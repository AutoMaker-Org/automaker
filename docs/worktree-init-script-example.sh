#!/bin/bash
# Example worktree init script for Automaker
# Copy this content to Settings > Worktrees > Init Script
# Or save directly as .automaker/worktree-init.sh in your project

echo "=========================================="
echo "  Worktree Init Script Starting..."
echo "=========================================="
echo ""
echo "Current directory: $(pwd)"
echo "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
echo ""

# Install dependencies
echo "[1/1] Installing npm dependencies..."
if [ -f "package.json" ]; then
    if npm install; then
        echo "Dependencies installed successfully!"
    else
        echo "ERROR: npm install failed with exit code $?"
        exit 1
    fi
else
    echo "No package.json found, skipping npm install"
fi
echo ""

echo "=========================================="
echo "  Worktree initialization complete!"
echo "=========================================="
