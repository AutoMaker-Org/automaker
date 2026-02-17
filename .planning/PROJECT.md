# AutoModeService Refactoring

## What This Is

A comprehensive refactoring of the `auto-mode-service.ts` file (5k+ lines) into smaller, focused services with clear boundaries. This is an architectural cleanup of accumulated technical debt from rapid development, breaking the "god object" anti-pattern into maintainable, debuggable modules.

## Core Value

All existing auto-mode functionality continues working — features execute, pipelines flow, merges complete — while the codebase becomes maintainable.

## Requirements

### Validated

<!-- Existing functionality that must be preserved -->

- ✓ Single feature execution with AI agent — existing
- ✓ Concurrent execution with configurable limits — existing
- ✓ Pipeline orchestration (backlog → in-progress → approval → verified) — existing
- ✓ Git worktree isolation per feature — existing
- ✓ Automatic merging of completed work — existing
- ✓ Custom pipeline support — existing
- ✓ Test runner integration — existing
- ✓ Event streaming to frontend — existing

### Active

<!-- Refactoring goals -->

- [ ] No service file exceeds ~500 lines
- [ ] Each service has single, clear responsibility
- [ ] Service boundaries make debugging obvious
- [ ] Changes to one service don't risk breaking unrelated features
- [ ] Test coverage for critical paths

### Out of Scope

- New auto-mode features — this is cleanup, not enhancement
- UI changes — backend refactor only
- Performance optimization — maintain current performance, don't optimize
- Other service refactoring — focus on auto-mode-service.ts only

## Context

**Current state:** `apps/server/src/services/auto-mode-service.ts` is ~5700 lines handling:

- Worktree management (create, cleanup, track)
- Agent/task execution coordination
- Concurrency control and queue management
- Pipeline state machine (column transitions)
- Merge handling and conflict resolution
- Event emission for real-time updates

**Technical environment:**

- Express 5 backend, TypeScript
- Event-driven architecture via EventEmitter
- WebSocket streaming to React frontend
- Git worktrees via @automaker/git-utils
- Minimal existing test coverage

**Codebase analysis:** See `.planning/codebase/` for full architecture, conventions, and existing patterns.

## Constraints

- **Breaking changes**: Acceptable — other parts of the app can be updated to match new service interfaces
- **Test coverage**: Currently minimal — must add tests during refactoring to catch regressions
- **Incremental approach**: Required — can't do big-bang rewrite with everything critical
- **Existing patterns**: Follow conventions in `.planning/codebase/CONVENTIONS.md`

## Key Decisions

| Decision                  | Rationale                                           | Outcome   |
| ------------------------- | --------------------------------------------------- | --------- |
| Accept breaking changes   | Allows cleaner interfaces, worth the migration cost | — Pending |
| Add tests during refactor | No existing safety net, need to build one           | — Pending |
| Incremental extraction    | Everything is critical, can't break it all at once  | — Pending |

---

_Last updated: 2026-01-27 after initialization_
