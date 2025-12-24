# DevFlow Agent Guidelines

This document contains essential workflow guidelines for AI agents working in the DevFlow project.

---

## Beads Task Management

### Overview

Each DevFlow project has its own `.beads/` database for tracking tasks, bugs, and dependencies using the Beads system. Beads provides agents with long-term task memory and dependency awareness.

### Beads Commands Reference

#### Creating Issues

```bash
# Create a new issue
bd create "Fix authentication bug" --type bug --priority 0

# Create a feature
bd create "Add user preferences" --type feature --priority 1

# Create a task with description
bd create "Implement password reset" --type task --priority 1 --description "Add email-based password reset flow"

# Create a subtask (child of another issue)
bd create "Design reset email template" --parent bd-a1b2 --type task --priority 1

# Create with labels
bd create "Fix CSS bug" --type bug --priority 2 --labels frontend,urgent
```

#### Updating Issues

```bash
# Update status
bd update bd-a1b2 --status in_progress
bd update bd-a1b2 --status closed

# Update priority
bd update bd-a1b2 --priority 0  # Make urgent

# Add labels
bd update bd-a1b2 --labels security,backend

# Update multiple fields
bd update bd-a1b2 --status in_progress --priority 1 --labels backend
```

#### Managing Dependencies

```bash
# Add a blocking dependency (bd-b3c4 must complete before bd-a1b2)
bd dep add bd-a1b2 blocks bd-b3c4

# Add a related issue (soft relationship)
bd dep add bd-a1b2 related bd-c3d4

# Add discovered-from link (bd-a1b2 was discovered during work on bd-d5e6)
bd dep add bd-a1b2 discovered-from bd-d5e6

# Remove a dependency
bd dep remove bd-a1b2 bd-b3c4
```

#### Querying Issues

```bash
# List all issues
bd list

# List only open issues
bd list --status open

# Filter by priority
bd list --priority 0  # P0 only

# Filter by type
bd list --type bug

# Search by title
bd list --title-contains "auth"

# Get ready work (issues with no open blockers)
bd ready

# Get ready work with priority filter
bd ready --priority 0,1

# Show issue details
bd show bd-a1b2

# Show dependency tree
bd dep tree bd-a1b2
```

### Agent Workflow Patterns

#### Pattern 1: Starting a New Task

When the user assigns you a new task:

1. **Check existing work first:**

   ```bash
   bd ready  # See what's already ready to work on
   ```

2. **Check if related work exists:**

   ```bash
   bd list --title-contains "task keywords"
   ```

3. **Create issue for the new task:**

   ```bash
   bd create "Task title" --type feature --priority 1 --description "Detailed description"
   # Returns: bd-abc123
   ```

4. **Set to in_progress:**

   ```bash
   bd update bd-abc123 --status in_progress
   ```

5. **Proceed with implementation**

#### Pattern 2: Discovering New Work During Implementation

When you discover additional work while implementing:

```bash
# Current task: bd-abc123

# Create issue for discovered work
NEW_ISSUE=$(bd create "Discovered bug in validation" --type bug --priority 0)
# Returns: bd-def456

# Link it to the task that discovered it
bd dep add bd-def456 discovered-from bd-abc123

# If new issue blocks current task
bd dep add bd-abc123 blocks bd-def456

# Update current task status if needed
bd update bd-abc123 --status open  # Blocked, so back to open
```

#### Pattern 3: Completing a Task

When finishing a task:

```bash
# Mark as completed
bd update bd-abc123 --status closed

# Check what's ready to work on next
bd ready

# Provide summary to user
echo "✅ Completed bd-abc123. Ready to work on: $(bd ready --json | jq -r '.[0].title')"
```

#### Pattern 4: Working Through Dependencies

When a task has blocking dependencies:

```bash
# Check what's blocking your task
bd dep tree bd-abc123

# Work on blockers first (they should appear in bd ready)
bd ready

# Complete each blocker
bd update bd-def456 --status closed

# Now the original task is ready to work on
bd ready | grep bd-abc123
```

#### Pattern 5: Creating Epics and Subtasks

For complex feature work:

```bash
# Create epic
EPIC_ID=$(bd create "User Authentication System" --type epic --priority 1)
# Returns: bd-xyz789

# Create subtasks (automatically assigned as children)
bd create "Design login UI" --parent bd-xyz789 --type task --priority 1
# Returns: bd-xyz789.1

bd create "Implement OAuth" --parent bd-xyz789 --type task --priority 1
# Returns: bd-xyz789.2

bd create "Add password reset" --parent bd-xyz789 --type task --priority 2
# Returns: bd-xyz789.3

# Update epic status when starting work
bd update bd-xyz789 --status in_progress

# Close epic when all subtasks complete
bd update bd-xyz789 --status closed
```

### Session-Ending Protocol

**CRITICAL:** Before completing any session, agents MUST follow this protocol to ensure work is properly tracked:

#### 1. File/Update All Remaining Work

```bash
# Create issues for any discovered problems
bd create "TODO: Fix X" --type bug --priority 2
bd create "TODO: Improve Y" --type feature --priority 3

# Update in-progress work status
bd update bd-abc123 --status in_progress
```

#### 2. Run Quality Gates (if code was changed)

```bash
# Type check
npm run typecheck --workspace=apps/ui

# Lint
npm run lint --workspace=apps/ui

# Fix any errors before proceeding
```

#### 3. Sync the Beads Database

```bash
# Ensure all changes are flushed to JSONL
bd sync

# Commit to git
git add .beads/beads.jsonl
git commit -m "Update beads database"

# Push if appropriate
git push
```

#### 4. Verify Clean State

```bash
# Check git status
git status

# Should show: "nothing to commit, working tree clean"
```

#### 5. Provide Next Session Context

Generate a summary for the next agent session:

```bash
# Show what was completed
echo "=== Completed in this session ==="
bd list --status closed --since "2 hours ago" --json | jq -r '.[] | "\(.id): \(.title)"'

# Show what's ready to work on next
echo "=== Ready to work on ==="
bd ready --json | jq -r '.[] | "\(.id): \(.title) (P\(.priority))"'
```

### Best Practices

1. **Always create Beads issues** for substantive work
   - Features, bugs, chores → Create issues
   - Quick fixes (< 5 min) → Can skip, but use judgment
   - Discovered problems → Always create, link with discovered-from

2. **Use dependencies appropriately**
   - `blocks` - Hard blocker (must complete before)
   - `related` - Soft relationship (connected work)
   - `discovered-from` - Discovered during work on another issue
   - `parent` - Hierarchical (epic → feature → task)

3. **Set appropriate priorities**
   - P0 (0) - Critical, blocking release
   - P1 (1) - High priority, important
   - P2 (2) - Medium priority, normal work
   - P3 (3) - Low priority, nice to have
   - P4 (4) - Backlog, defer to later

4. **Keep issues updated**
   - Set status to `in_progress` when starting work
   - Set status to `closed` when complete
   - Add labels for organization (frontend, backend, urgent, etc.)

5. **Check `bd ready` before starting new work**
   - Ensures you're working on unblocked tasks
   - Helps maintain proper dependency flow

6. **Always run session-ending protocol**
   - Prevents lost work
   - Ensures clean git state
   - Provides context for next session

### Example Agent Session

```
User: Fix the login form validation bug

Agent: I'll help fix the login form validation. Let me start by checking existing issues.

$ bd ready
# Output: No ready work

$ bd list --title-contains "login"
# Output: No existing login issues

$ bd create "Fix login form validation" --type bug --priority 1 --description "Login form is not validating email format correctly"
# Output: Created bd-a1b2

$ bd update bd-a1b2 --status in_progress

[Agent investigates the code...]

Agent: I found the validation bug. However, I also discovered that the password field has the same issue.

$ bd create "Fix password field validation" --type bug --priority 1 --description "Password field not validating requirements"
# Output: Created bd-c3d4

$ bd dep add bd-c3d4 discovered-from bd-a1b2
$ bd dep add bd-a1b2 related bd-c3d4

[Agent fixes login validation...]

$ bd update bd-a1b2 --status closed
$ bd update bd-c3d4 --status in_progress

[Agent fixes password validation...]

$ bd update bd-c3d4 --status closed

$ bd ready
# Output: No ready work

$ bd sync
$ git add .beads/beads.jsonl
$ git commit -m "Fix login and password validation bugs"

Agent: I've completed both fixes. The login form now validates email format correctly, and the password field enforces the required complexity rules. Both issues are closed and synced.
```

### Integration with DevFlow Features

Agents can work with both DevFlow Features and Beads Issues:

- **DevFlow Features** - High-level project work tracked in DevFlow's kanban
- **Beads Issues** - Granular task tracking with dependencies

When working on a DevFlow Feature:

1. Create or link to a Beads issue for implementation tracking
2. Use Beads for subtask breakdown and dependency management
3. Update both systems appropriately

### Troubleshooting

#### Beads CLI Not Found

If `bd` commands fail with "command not found":

1. Check if installed: `which bd`
2. If not installed, inform user they need to install Beads
3. Continue with DevFlow's native features (graceful degradation)

#### Database Locked

If you get "database is locked" errors:

1. Wait a few seconds and retry
2. Another agent or process may be writing to the database
3. Use `--json` flag for programmatic operations

#### Dependency Cycles

If you accidentally create circular dependencies:

```bash
# Detect cycles
bd dep cycles

# Break the cycle by removing one dependency
bd dep remove bd-a1b2 bd-b3c4
```

---

## Summary

✅ **Always create Beads issues for substantive work**
✅ **Use dependencies to track blockers and relationships**
✅ **Check `bd ready` before starting new tasks**
✅ **Follow session-ending protocol before completing**
✅ **Keep issue status updated as you work**
✅ **Link discovered work to its source with `discovered-from`**

By following these guidelines, agents maintain comprehensive task history, work efficiently on unblocked tasks, and provide excellent context handoff between sessions.
