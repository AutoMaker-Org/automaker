# Code Review Command

Comprehensive code review using multiple deep dive agents to analyze git diff for correctness, security, code quality, and tech stack compliance, followed by automated fixes using deepcode agents.

## Usage

This command analyzes all changes in the git diff and verifies:

1. **Invalid code based on tech stack** (HIGHEST PRIORITY)
2. Security vulnerabilities
3. Code quality issues (dirty code)
4. Implementation correctness

Then automatically fixes any issues found.

### Optional Arguments

- **Target branch**: Optional branch name to compare against (defaults to `main` or `master` if not provided)
  - Example: `@deepreview develop` - compares current branch against `develop`
  - If not provided, automatically detects `main` or `master` as the target branch

## Instructions

### Phase 1: Get Git Diff

1. **Determine the current branch and target branch**

   ```bash
   # Get current branch name
   CURRENT_BRANCH=$(git branch --show-current)
   echo "Current branch: $CURRENT_BRANCH"

   # Get target branch from user argument or detect default
   # If user provided a target branch as argument, use it
   # Otherwise, detect main or master
   TARGET_BRANCH="${1:-}"  # First argument if provided

   if [ -z "$TARGET_BRANCH" ]; then
     # Check if main exists
     if git show-ref --verify --quiet refs/heads/main || git show-ref --verify --quiet refs/remotes/origin/main; then
       TARGET_BRANCH="main"
     # Check if master exists
     elif git show-ref --verify --quiet refs/heads/master || git show-ref --verify --quiet refs/remotes/origin/master; then
       TARGET_BRANCH="master"
     else
       echo "Error: Could not find main or master branch. Please specify target branch."
       exit 1
     fi
   fi

   echo "Target branch: $TARGET_BRANCH"

   # Verify target branch exists
   if ! git show-ref --verify --quiet refs/heads/$TARGET_BRANCH && ! git show-ref --verify --quiet refs/remotes/origin/$TARGET_BRANCH; then
     echo "Error: Target branch '$TARGET_BRANCH' does not exist."
     exit 1
   fi
   ```

   **Note:** The target branch can be provided as an optional argument. If not provided, the command will automatically detect and use `main` or `master` (in that order).

2. **Compare current branch against target branch**

   ```bash
   # Fetch latest changes from remote (optional but recommended)
   git fetch origin

   # Try local branch first, fallback to remote if local doesn't exist
   if git show-ref --verify --quiet refs/heads/$TARGET_BRANCH; then
     TARGET_REF=$TARGET_BRANCH
   elif git show-ref --verify --quiet refs/remotes/origin/$TARGET_BRANCH; then
     TARGET_REF=origin/$TARGET_BRANCH
   else
     echo "Error: Target branch '$TARGET_BRANCH' not found locally or remotely."
     exit 1
   fi

   # Get diff between current branch and target branch
   git diff $TARGET_REF...HEAD
   ```

   **Note:** Use `...` (three dots) to show changes between the common ancestor and HEAD, or `..` (two dots) to show changes between the branches directly. The command uses `$TARGET_BRANCH` variable set in step 1.

3. **Get list of changed files between branches**

   ```bash
   # List files changed between current branch and target branch
   git diff --name-only $TARGET_REF...HEAD

   # Get detailed file status
   git diff --name-status $TARGET_REF...HEAD

   # Show file changes with statistics
   git diff --stat $TARGET_REF...HEAD
   ```

4. **Get the current working directory diff** (uncommitted changes)

   ```bash
   # Uncommitted changes in working directory
   git diff HEAD

   # Staged changes
   git diff --cached

   # All changes (staged + unstaged)
   git diff HEAD
   git diff --cached
   ```

5. **Combine branch comparison with uncommitted changes**

   The review should analyze:
   - **Changes between current branch and target branch** (committed changes)
   - **Uncommitted changes** (if any)

   ```bash
   # Get all changes: branch diff + uncommitted
   git diff $TARGET_REF...HEAD > branch-changes.diff
   git diff HEAD >> branch-changes.diff
   git diff --cached >> branch-changes.diff

   # Or get combined diff (recommended approach)
   git diff $TARGET_REF...HEAD
   git diff HEAD
   git diff --cached
   ```

6. **Verify branch relationship**

   ```bash
   # Check if current branch is ahead/behind target branch
   git rev-list --left-right --count $TARGET_REF...HEAD

   # Show commit log differences
   git log $TARGET_REF..HEAD --oneline

   # Show summary of branch relationship
   AHEAD=$(git rev-list --left-right --count $TARGET_REF...HEAD | cut -f1)
   BEHIND=$(git rev-list --left-right --count $TARGET_REF...HEAD | cut -f2)
   echo "Branch is $AHEAD commits ahead and $BEHIND commits behind $TARGET_BRANCH"
   ```

7. **Understand the tech stack** (for validation):
   - **Node.js**: >=22.0.0 <23.0.0
   - **TypeScript**: 5.9.3
   - **React**: 19.2.3
   - **Express**: 5.2.1
   - **Electron**: 39.2.7
   - **Vite**: 7.3.0
   - **Vitest**: 4.0.16
   - Check `package.json` files for exact versions

### Phase 2: Deep Dive Analysis (5 Agents)

Launch 5 separate deep dive agents, each with a specific focus area. Each agent should be invoked with the `@deepdive` agent and given the git diff (comparing current branch against target branch) along with their specific instructions.

**Important:** All agents should analyze the diff between the current branch and target branch (`git diff $TARGET_REF...HEAD`), plus any uncommitted changes. This ensures the review covers all changes that will be merged. The target branch is determined from the optional argument or defaults to main/master.

#### Agent 1: Tech Stack Validation (HIGHEST PRIORITY)

**Focus:** Verify code is valid for the tech stack

**Instructions for Agent 1:**

```
Analyze the git diff for invalid code based on the tech stack:

1. **TypeScript/JavaScript Syntax**
   - Check for valid TypeScript syntax (no invalid type annotations, correct import/export syntax)
   - Verify Node.js API usage is compatible with Node.js >=22.0.0 <23.0.0
   - Check for deprecated APIs or features not available in the Node.js version
   - Verify ES module syntax (type: "module" in package.json)

2. **React 19.2.3 Compatibility**
   - Check for deprecated React APIs or patterns
   - Verify hooks usage is correct for React 19
   - Check for invalid JSX syntax
   - Verify component patterns match React 19 conventions

3. **Express 5.2.1 Compatibility**
   - Check for deprecated Express APIs
   - Verify middleware usage is correct for Express 5
   - Check request/response handling patterns

4. **Type Safety**
   - Verify TypeScript types are correctly used
   - Check for `any` types that should be properly typed
   - Verify type imports/exports are correct
   - Check for missing type definitions

5. **Build System Compatibility**
   - Verify Vite-specific code (imports, config) is valid
   - Check Electron-specific APIs are used correctly
   - Verify module resolution paths are correct

6. **Package Dependencies**
   - Check for imports from packages not in package.json
   - Verify version compatibility between dependencies
   - Check for circular dependencies

Provide a detailed report with:
- File paths and line numbers of invalid code
- Specific error description (what's wrong and why)
- Expected vs actual behavior
- Priority level (CRITICAL for build-breaking issues)
```

#### Agent 2: Security Vulnerability Scanner

**Focus:** Security issues and vulnerabilities

**Instructions for Agent 2:**

```
Analyze the git diff for security vulnerabilities:

1. **Injection Vulnerabilities**
   - SQL injection (if applicable)
   - Command injection (exec, spawn, etc.)
   - Path traversal vulnerabilities
   - XSS vulnerabilities in React components

2. **Authentication & Authorization**
   - Missing authentication checks
   - Insecure token handling
   - Authorization bypasses
   - Session management issues

3. **Data Handling**
   - Unsafe deserialization
   - Insecure file operations
   - Missing input validation
   - Sensitive data exposure (secrets, tokens, passwords)

4. **Dependencies**
   - Known vulnerable packages
   - Insecure dependency versions
   - Missing security patches

5. **API Security**
   - Missing CORS configuration
   - Insecure API endpoints
   - Missing rate limiting
   - Insecure WebSocket connections

6. **Electron-Specific**
   - Insecure IPC communication
   - Missing context isolation checks
   - Insecure preload scripts
   - Missing CSP headers

Provide a detailed report with:
- Vulnerability type and severity (CRITICAL, HIGH, MEDIUM, LOW)
- File paths and line numbers
- Attack vector description
- Recommended fix approach
```

#### Agent 3: Code Quality & Clean Code

**Focus:** Dirty code, code smells, and quality issues

**Instructions for Agent 3:**

```
Analyze the git diff for code quality issues:

1. **Code Smells**
   - Long functions/methods (>50 lines)
   - High cyclomatic complexity
   - Duplicate code
   - Dead code
   - Magic numbers/strings

2. **Best Practices**
   - Missing error handling
   - Inconsistent naming conventions
   - Poor separation of concerns
   - Tight coupling
   - Missing comments for complex logic

3. **Performance Issues**
   - Inefficient algorithms
   - Memory leaks (event listeners, subscriptions)
   - Unnecessary re-renders in React
   - Missing memoization where needed
   - Inefficient database queries (if applicable)

4. **Maintainability**
   - Hard-coded values
   - Missing type definitions
   - Inconsistent code style
   - Poor file organization
   - Missing tests for new code

5. **React-Specific**
   - Missing key props in lists
   - Direct state mutations
   - Missing cleanup in useEffect
   - Unnecessary useState/useEffect
   - Prop drilling issues

Provide a detailed report with:
- Issue type and severity
- File paths and line numbers
- Description of the problem
- Impact on maintainability/performance
- Recommended refactoring approach
```

#### Agent 4: Implementation Correctness

**Focus:** Verify code implements requirements correctly

**Instructions for Agent 4:**

```
Analyze the git diff for implementation correctness:

1. **Logic Errors**
   - Incorrect conditional logic
   - Wrong variable usage
   - Off-by-one errors
   - Race conditions
   - Missing null/undefined checks

2. **Functional Requirements**
   - Missing features from requirements
   - Incorrect feature implementation
   - Edge cases not handled
   - Missing validation

3. **Integration Issues**
   - Incorrect API usage
   - Wrong data format handling
   - Missing error handling for external calls
   - Incorrect state management

4. **Type Errors**
   - Type mismatches
   - Missing type guards
   - Incorrect type assertions
   - Unsafe type operations

5. **Testing Gaps**
   - Missing unit tests
   - Missing integration tests
   - Tests don't cover edge cases
   - Tests are incorrect

Provide a detailed report with:
- Issue description
- File paths and line numbers
- Expected vs actual behavior
- Steps to reproduce (if applicable)
- Recommended fix
```

#### Agent 5: Architecture & Design Patterns

**Focus:** Architectural issues and design pattern violations

**Instructions for Agent 5:**

```
Analyze the git diff for architectural and design issues:

1. **Architecture Violations**
   - Violation of project structure patterns
   - Incorrect layer separation
   - Missing abstractions
   - Tight coupling between modules

2. **Design Patterns**
   - Incorrect pattern usage
   - Missing patterns where needed
   - Anti-patterns

3. **Project-Specific Patterns**
   - Check against project documentation (docs/ folder)
   - Verify route organization (server routes)
   - Check provider patterns (server providers)
   - Verify component organization (UI components)

4. **API Design**
   - RESTful API violations
   - Inconsistent response formats
   - Missing error handling
   - Incorrect status codes

5. **State Management**
   - Incorrect state management patterns
   - Missing state normalization
   - Inefficient state updates

Provide a detailed report with:
- Architectural issue description
- File paths and affected areas
- Impact on system design
- Recommended architectural changes
```

### Phase 3: Consolidate Findings

After all 5 deep dive agents complete their analysis:

1. **Collect all findings** from each agent
2. **Prioritize issues**:
   - CRITICAL: Tech stack invalid code (build-breaking)
   - HIGH: Security vulnerabilities, critical logic errors
   - MEDIUM: Code quality issues, architectural problems
   - LOW: Minor code smells, style issues

3. **Group by file** to understand impact per file
4. **Create a master report** summarizing all findings

### Phase 4: Deepcode Fixes (5 Agents)

Launch 5 deepcode agents to fix the issues found. Each agent should be invoked with the `@deepcode` agent.

#### Deepcode Agent 1: Fix Tech Stack Invalid Code

**Priority:** CRITICAL - Fix first

**Instructions:**

```
Fix all invalid code based on tech stack issues identified by Agent 1.

Focus on:
1. Fixing TypeScript syntax errors
2. Updating deprecated Node.js APIs
3. Fixing React 19 compatibility issues
4. Correcting Express 5 API usage
5. Fixing type errors
6. Resolving build-breaking issues

After fixes, verify:
- Code compiles without errors
- TypeScript types are correct
- No deprecated API usage
```

#### Deepcode Agent 2: Fix Security Vulnerabilities

**Priority:** HIGH

**Instructions:**

```
Fix all security vulnerabilities identified by Agent 2.

Focus on:
1. Adding input validation
2. Fixing injection vulnerabilities
3. Securing authentication/authorization
4. Fixing insecure data handling
5. Updating vulnerable dependencies
6. Securing Electron IPC

After fixes, verify:
- Security vulnerabilities are addressed
- No sensitive data exposure
- Proper authentication/authorization
```

#### Deepcode Agent 3: Refactor Dirty Code

**Priority:** MEDIUM

**Instructions:**

```
Refactor code quality issues identified by Agent 3.

Focus on:
1. Extracting long functions
2. Reducing complexity
3. Removing duplicate code
4. Adding error handling
5. Improving React component structure
6. Adding missing comments

After fixes, verify:
- Code follows best practices
- No code smells remain
- Performance optimizations applied
```

#### Deepcode Agent 4: Fix Implementation Errors

**Priority:** HIGH

**Instructions:**

```
Fix implementation correctness issues identified by Agent 4.

Focus on:
1. Fixing logic errors
2. Adding missing features
3. Handling edge cases
4. Fixing type errors
5. Adding missing tests

After fixes, verify:
- Logic is correct
- Edge cases handled
- Tests pass
```

#### Deepcode Agent 5: Fix Architectural Issues

**Priority:** MEDIUM

**Instructions:**

```
Fix architectural issues identified by Agent 5.

Focus on:
1. Correcting architecture violations
2. Applying proper design patterns
3. Fixing API design issues
4. Improving state management
5. Following project patterns

After fixes, verify:
- Architecture is sound
- Patterns are correctly applied
- Code follows project structure
```

### Phase 5: Verification

After all fixes are complete:

1. **Run TypeScript compilation check**

   ```bash
   npm run build:packages
   ```

2. **Run linting**

   ```bash
   npm run lint
   ```

3. **Run tests** (if applicable)

   ```bash
   npm run test:server
   npm run test
   ```

4. **Verify git diff** shows only intended changes

   ```bash
   git diff HEAD
   ```

5. **Create summary report**:
   - Issues found by each agent
   - Issues fixed by each agent
   - Remaining issues (if any)
   - Verification results

## Workflow Summary

1. ✅ Accept optional target branch argument (defaults to main/master if not provided)
2. ✅ Determine current branch and target branch (from argument or auto-detect main/master)
3. ✅ Get git diff comparing current branch against target branch (`git diff $TARGET_REF...HEAD`)
4. ✅ Include uncommitted changes in analysis (`git diff HEAD`, `git diff --cached`)
5. ✅ Launch 5 deep dive agents (parallel analysis) with branch diff
6. ✅ Consolidate findings and prioritize
7. ✅ Launch 5 deepcode agents (sequential fixes, priority order)
8. ✅ Verify fixes with build/lint/test
9. ✅ Report summary

## Notes

- **Tech stack validation is HIGHEST PRIORITY** - invalid code must be fixed first
- **Target branch argument**: The command accepts an optional target branch name as the first argument. If not provided, it automatically detects and uses `main` or `master` (in that order)
- Each deep dive agent should work independently and provide comprehensive analysis
- Deepcode agents should fix issues in priority order
- All fixes should maintain existing functionality
- If an agent finds no issues in their domain, they should report "No issues found"
- If fixes introduce new issues, they should be caught in verification phase
- The target branch is validated to ensure it exists (locally or remotely) before proceeding with the review
