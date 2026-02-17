# Codebase Concerns

**Analysis Date:** 2026-01-27

## Tech Debt

**Loose Type Safety in Error Handling:**

- Issue: Multiple uses of `as any` type assertions bypass TypeScript safety, particularly in error context handling and provider responses
- Files: `apps/server/src/providers/claude-provider.ts` (lines 318-322), `apps/server/src/lib/error-handler.ts`, `apps/server/src/routes/settings/routes/update-global.ts`
- Impact: Errors could have unchecked properties; refactoring becomes risky without compiler assistance
- Fix approach: Replace `as any` with proper type guards and discriminated unions; create helper functions for safe property access

**Missing Test Coverage for Critical Services:**

- Issue: Several core services explicitly excluded from test coverage thresholds due to integration complexity
- Files: `apps/server/vitest.config.ts` (line 22), explicitly excluded: `claude-usage-service.ts`, `mcp-test-service.ts`, `cli-provider.ts`, `cursor-provider.ts`
- Impact: Usage tracking, MCP integration, and CLI detection could break undetected; regression detection is limited
- Fix approach: Create integration test fixtures for CLI providers; mock MCP SDK for mcp-test-service tests; add usage tracking unit tests with mocked API calls

**Unused/Stub TODO Item Processing:**

- Issue: TodoWrite tool implementation exists but is partially integrated; tool name constants scattered across codex provider
- Files: `apps/server/src/providers/codex-tool-mapping.ts`, `apps/server/src/providers/codex-provider.ts`
- Impact: Todo list updates may not synchronize properly with all providers; unclear which providers support TodoWrite
- Fix approach: Consolidate tool name constants; add provider capability flags for todo support

**Electron Electron.ts Size and Complexity:**

- Issue: Single 3741-line file handles all Electron IPC, native bindings, and communication
- Files: `apps/ui/src/lib/electron.ts`
- Impact: Difficult to test; hard to isolate bugs; changes require full testing of all features; potential memory overhead from monolithic file
- Fix approach: Split by responsibility (IPC, window management, file operations, debug tools); create separate bridge layers

## Known Bugs

**API Key Management Incomplete for Gemini:**

- Symptoms: Gemini API key verification endpoint not implemented despite other providers having verification
- Files: `apps/ui/src/components/views/settings-view/api-keys/hooks/use-api-key-management.ts` (line 122)
- Trigger: User tries to verify Gemini API key in settings
- Workaround: Key verification skipped for Gemini; settings page still accepts and stores key

**Orphaned Features Detection Vulnerable to False Negatives:**

- Symptoms: Features marked as orphaned when branch matching logic doesn't account for all scenarios
- Files: `apps/server/src/services/auto-mode-service.ts` (lines 5714-5773)
- Trigger: Features that were manually switched branches or rebased
- Workaround: Manual cleanup via feature deletion; branch comparison is basic name matching only

**Terminal Themes Incomplete:**

- Symptoms: Light theme themes (solarizedlight, github) map to same generic lightTheme; no dedicated implementations
- Files: `apps/ui/src/config/terminal-themes.ts` (lines 593-594)
- Trigger: User selects solarizedlight or github terminal theme
- Workaround: Uses generic light theme instead of specific scheme; visual appearance doesn't match expectation

## Security Considerations

**Process Environment Variable Exposure:**

- Risk: Child processes inherit all parent `process.env` including sensitive credentials (API keys, tokens)
- Files: `apps/server/src/providers/cursor-provider.ts` (line 993), `apps/server/src/providers/codex-provider.ts` (line 1099)
- Current mitigation: Dotenv provides isolation at app startup; selective env passing to some providers
- Recommendations: Use explicit allowlists for env vars passed to child processes (only pass REQUIRED_KEYS); audit all spawn calls for env handling; document which providers need which credentials

**Unvalidated Provider Tool Input:**

- Risk: Tool input from CLI providers (Cursor, Copilot, Codex) is partially validated through Record<string, unknown> patterns; execution context could be escaped
- Files: `apps/server/src/providers/codex-provider.ts` (lines 506-543), `apps/server/src/providers/tool-normalization.ts`
- Current mitigation: Status enums validated; tool names checked against allow-lists in some providers
- Recommendations: Implement comprehensive schema validation for all tool inputs before execution; use zod or similar for runtime validation; add security tests for injection patterns

**API Key Storage in Settings Files:**

- Risk: API keys stored in plaintext in `~/.automaker/settings.json` and `data/settings.json`; file permissions may not be restricted
- Files: `apps/server/src/services/settings-service.ts`, uses `atomicWriteJson` without file permission enforcement
- Current mitigation: Limited by file system permissions; Electron mode has single-user access
- Recommendations: Encrypt sensitive settings fields (apiKeys, tokens); use OS credential stores (Keychain/Credential Manager) for production; add file permission checks on startup

## Performance Bottlenecks

**Synchronous Feature Loading at Startup:**

- Problem: All features loaded synchronously at project load; blocks UI with 1000+ features
- Files: `apps/server/src/services/feature-loader.ts` (line 230 Promise.all, but synchronous enumeration)
- Cause: Feature directory walk and JSON parsing is not paginated or lazy-loaded
- Improvement path: Implement lazy loading with pagination (load first 50, fetch more on scroll); add caching layer with TTL; move to background indexing; add feature count limits with warnings

**Auto-Mode Concurrency at Max Can Exceed Rate Limits:**

- Problem: maxConcurrency = 10 can quickly exhaust Claude API rate limits if all features execute simultaneously
- Files: `apps/server/src/services/auto-mode-service.ts` (line 2931 Promise.all for concurrent agents)
- Cause: No adaptive backoff; no API usage tracking before queuing; hint mentions reducing concurrency but doesn't enforce it
- Improvement path: Integrate with claude-usage-service to check remaining quota before starting features; implement exponential backoff on 429 errors; add per-model rate limit tracking

**Terminal Session Memory Leak Risk:**

- Problem: Terminal sessions accumulate in memory; expired sessions not cleaned up reliably
- Files: `apps/server/src/routes/terminal/common.ts` (line 66 cleanup runs every 5 minutes, but only for tokens)
- Cause: Cleanup interval is arbitrary; session map not bounded; no session lifespan limit
- Improvement path: Implement LRU eviction with max session count; reduce cleanup interval to 1 minute; add memory usage monitoring; auto-close idle sessions after 30 minutes

**Large File Content Loading Without Limits:**

- Problem: File content loaded entirely into memory; `describe-file.ts` truncates at 50KB but loads all content first
- Files: `apps/server/src/routes/context/routes/describe-file.ts` (line 128)
- Cause: Synchronous file read; no streaming; no check before reading large files
- Improvement path: Check file size before reading; stream large files; add file size warnings; implement chunked processing for analysis

## Fragile Areas

**Provider Factory Model Resolution:**

- Files: `apps/server/src/providers/provider-factory.ts`, `apps/server/src/providers/simple-query-service.ts`
- Why fragile: Each provider interprets model strings differently; no central registry; model aliases resolved at multiple layers (model-resolver, provider-specific maps, CLI validation)
- Safe modification: Add integration tests for each model alias per provider; create model capability matrix; centralize model validation before dispatch
- Test coverage: No dedicated tests; relies on E2E; no isolated unit tests for model resolution

**WebSocket Session Authentication:**

- Files: `apps/server/src/lib/auth.ts` (line 40 setInterval), `apps/server/src/index.ts` (token validation per message)
- Why fragile: Session tokens generated and validated at multiple points; no single source of truth; expiration is not atomic
- Safe modification: Add tests for token expiration edge cases; ensure cleanup removes all references; log all auth failures
- Test coverage: Auth middleware tested, but not session lifecycle

**Auto-Mode Feature State Machine:**

- Files: `apps/server/src/services/auto-mode-service.ts` (lines 465-600)
- Why fragile: Multiple states (running, queued, completed, error) managed across different methods; no explicit state transition validation; error recovery is defensive (catches all, logs, continues)
- Safe modification: Create explicit state enum with valid transitions; add invariant checks; unit test state transitions with all error cases
- Test coverage: Gaps in error recovery paths; no tests for concurrent state changes

## Scaling Limits

**Feature Count Scalability:**

- Current capacity: ~1000 features tested; UI performance degrades with pagination required
- Limit: 10K+ features cause >5s load times; memory usage ~100MB for metadata alone
- Scaling path: Implement feature database instead of file-per-feature; add ElasticSearch indexing for search; paginate API responses (50 per page); add feature archiving

**Concurrent Auto-Mode Executions:**

- Current capacity: maxConcurrency = 10 features; limited by Claude API rate limits
- Limit: Rate limit hits at ~4-5 simultaneous features with extended context (100K+ tokens)
- Scaling path: Implement token usage budgeting before feature start; queue features with estimated token cost; add provider-specific rate limit handling

**Terminal Session Count:**

- Current capacity: ~100 active terminal sessions per server
- Limit: Memory grows unbounded; no session count limit enforced
- Scaling path: Add max session count with least-recently-used eviction; implement session federation for distributed setup

**Worktree Disk Usage:**

- Current capacity: 10K worktrees (~20GB with typical repos)
- Limit: `.worktrees` directory grows without cleanup; old worktrees accumulate
- Scaling path: Add worktree TTL (delete if not used for 30 days); implement cleanup job; add quota warnings at 50/80% disk

## Dependencies at Risk

**node-pty Beta Version:**

- Risk: `node-pty@1.1.0-beta41` used for terminal emulation; beta status indicates possible instability
- Impact: Terminal features could break on minor platform changes; no guarantees on bug fixes
- Migration plan: Monitor releases for stable version; pin to specific commit if needed; test extensively on target platforms (macOS, Linux, Windows)

**@anthropic-ai/claude-agent-sdk 0.1.x:**

- Risk: Pre-1.0 version; SDK API may change in future releases; limited version stability guarantees
- Impact: Breaking changes could require significant refactoring; feature additions in SDK may not align with Automaker roadmap
- Migration plan: Pin to specific 0.1.x version; review SDK changelogs before upgrades; maintain SDK compatibility tests; consider fallback implementation for critical paths

**@openai/codex-sdk 0.77.x:**

- Risk: Codex model deprecated by OpenAI; SDK may be archived or unsupported
- Impact: Codex provider could become non-functional; error messages may not be actionable
- Migration plan: Monitor OpenAI roadmap for migration path; implement fallback to Claude for Codex requests; add deprecation warning in UI

**Express 5.2.x RC Stage:**

- Risk: Express 5 is still in release candidate phase (as of Node 22); full stability not guaranteed
- Impact: Minor version updates could include breaking changes; middleware compatibility issues possible
- Migration plan: Maintain compatibility layer for Express 5 API; test with latest major before release; document any version-specific workarounds

## Missing Critical Features

**Persistent Session Storage:**

- Problem: Agent conversation sessions stored only in-memory; restart loses all chat history
- Blocks: Long-running analysis across server restarts; session recovery not possible
- Impact: Users must re-run entire analysis if server restarts; lost productivity

**Rate Limit Awareness:**

- Problem: No tracking of API usage relative to rate limits before executing features
- Blocks: Predictable concurrent feature execution; users frequently hit rate limits unexpectedly
- Impact: Feature execution fails with cryptic rate limit errors; poor user experience

**Feature Dependency Visualization:**

- Problem: Dependency-resolver package exists but no UI to visualize or manage dependencies
- Blocks: Users cannot plan feature order; complex dependencies not visible
- Impact: Features implemented in wrong order; blocking dependencies missed

## Test Coverage Gaps

**CLI Provider Integration:**

- What's not tested: Actual CLI execution paths; environment setup; error recovery from CLI crashes
- Files: `apps/server/src/providers/cli-provider.ts`, `apps/server/src/lib/cli-detection.ts`
- Risk: Changes to CLI handling could break silently; detection logic not validated on target platforms
- Priority: High - affects all CLI-based providers (Cursor, Copilot, Codex)

**Cursor Provider Platform-Specific Paths:**

- What's not tested: Windows/Linux Cursor installation detection; version directory parsing; APPDATA environment variable handling
- Files: `apps/server/src/providers/cursor-provider.ts` (lines 267-498)
- Risk: Platform-specific bugs not caught; Cursor detection fails on non-standard installations
- Priority: High - Cursor is primary provider; platform differences critical

**Event Hook System State Changes:**

- What's not tested: Concurrent hook execution; cleanup on server shutdown; webhook delivery retries
- Files: `apps/server/src/services/event-hook-service.ts` (line 248 Promise.allSettled)
- Risk: Hooks may not execute in expected order; memory not cleaned up; webhooks lost on failure
- Priority: Medium - affects automation workflows

**Error Classification for New Providers:**

- What's not tested: Each provider's unique error patterns mapped to ErrorType enum; new provider errors not classified
- Files: `apps/server/src/lib/error-handler.ts` (lines 58-80), each provider error mapping
- Risk: User sees generic "unknown error" instead of actionable message; categorization regresses with new providers
- Priority: Medium - impacts user experience

**Feature State Corruption Scenarios:**

- What's not tested: Concurrent feature updates; partial writes with power loss; JSON parsing recovery
- Files: `apps/server/src/services/feature-loader.ts`, `@automaker/utils` (atomicWriteJson)
- Risk: Feature data corrupted on concurrent access; recovery incomplete; no validation before use
- Priority: High - data loss risk

---

_Concerns audit: 2026-01-27_
