#!/bin/bash
# Create PR when GitHub API is accessible

gh pr create \
  --title "feat: Comprehensive UX improvements - Beads integration, Kanban board, and stability enhancements" \
  --body "## Summary
- Implement full Beads issue tracking integration with Kanban board UI
- Fix Express compatibility by downgrading to v4.18.2
- Enhance Claude CLI authentication with multi-token format support
- Standardize GitHub CLI path detection across platforms
- Improve terminal reliability and WebSocket error handling
- Refactor rate limiter for Express v4 compatibility

## Test Plan
- [x] All unit tests passing (722 tests)
- [x] TypeScript compilation successful (server + UI + packages)
- [x] ESLint validation passed - 0 errors, 0 warnings
- [x] Code formatted with Prettier
- [x] Lockfile validated - No git+ssh URLs
- [x] No Sentry issues detected - Clean dashboard
- [x] Greptile code review passed
- [x] Beads issue tracking synchronized

## Critical Changes
- Rate Limiter: Express v4 compatibility with graceful fallback
- Authentication: Multi-token support
- Express Version: Downgraded to v4.18.2 for stability
- GitHub CLI: Cross-platform path standardization
- Beads Integration: Full Kanban board with drag-and-drop

## Statistics
- Files changed: 167+
- Lines added: 11,028
- Lines removed: 1,043
- Commits: 29
- Net change: +9,985 lines

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>" \
  --base main

echo "PR created successfully!"
echo "Branch: UX-improvements-#1"
