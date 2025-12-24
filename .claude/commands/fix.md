---
name: fix
description: Run typechecking and linting, then spawn parallel agents to fix all issues
---

# Project Code Quality Check

This command runs all linting and typechecking tools for this project, collects errors, groups them by domain, and spawns parallel agents to fix them.

## Step 1: Run Linting and Typechecking

Run the appropriate commands for this monorepo project:

```bash
# Check formatting first
npm run format:check

# Run linting for the UI workspace
npm run lint

# Run typechecking for the UI workspace
npm run typecheck --workspace=apps/ui

# Run linting for the server workspace
npm run lint --workspace=apps/server

# Run typechecking for the server workspace
npm run typecheck --workspace=apps/server
```

## Step 2: Collect and Parse Errors

Parse the output from the linting and typechecking commands. Group errors by domain:

- **Format errors**: Issues from prettier
- **Type errors**: Issues from TypeScript (tsc --noEmit)
- **Lint errors**: Issues from eslint

Create a list of all files with issues and the specific problems in each file.

## Step 3: Spawn Parallel Agents

For each domain that has issues, spawn an agent in parallel using the Task tool:

**IMPORTANT**: Use a SINGLE response with MULTIPLE Task tool calls to run agents in parallel.

Example:

- Spawn a "format-fixer" agent for formatting errors
- Spawn a "type-fixer" agent for type errors
- Spawn a "lint-fixer" agent for lint errors

Each agent should:

1. Receive the list of files and specific errors in their domain
2. Fix all errors in their domain
3. Run the relevant check command to verify fixes
4. Report completion

## Step 4: Verify All Fixes

After all agents complete, run the full check again to ensure all issues are resolved.
