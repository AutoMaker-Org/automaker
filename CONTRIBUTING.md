# Contributing to Automaker

Thank you for your interest in contributing to Automaker! We're excited to have you join our community of developers building the future of autonomous AI development.

Automaker is an autonomous AI development studio that provides a Kanban-based workflow where AI agents implement features in isolated git worktrees. Whether you're fixing bugs, adding features, improving documentation, or suggesting ideas, your contributions help make this project better for everyone.

This guide will help you get started with contributing to Automaker. Please take a moment to read through these guidelines to ensure a smooth contribution process.

## Contribution License Agreement

**Important:** By submitting, pushing, or contributing any code, documentation, pull requests, issues, or other materials to the Automaker project, you agree to assign all right, title, and interest in and to your contributions, including all copyrights, patents, and other intellectual property rights, to the Core Contributors of Automaker. This assignment is irrevocable and includes the right to use, modify, distribute, and monetize your contributions in any manner.

**You understand and agree that you will have no right to receive any royalties, compensation, or other financial benefits from any revenue, income, or commercial use generated from your contributed code or any derivative works thereof.** All contributions are made without expectation of payment or financial return.

For complete details on contribution terms and rights assignment, please review [Section 5 (CONTRIBUTIONS AND RIGHTS ASSIGNMENT) of the LICENSE](LICENSE#5-contributions-and-rights-assignment).

## Table of Contents

- [Contributing to Automaker](#contributing-to-automaker)
  - [Table of Contents](#table-of-contents)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Fork and Clone](#fork-and-clone)
    - [Development Setup](#development-setup)
    - [Project Structure](#project-structure)
  - [Pull Request Process](#pull-request-process)
    - [Branch Naming Convention](#branch-naming-convention)
    - [Commit Message Format](#commit-message-format)
    - [Submitting a Pull Request](#submitting-a-pull-request)
      - [1. Prepare Your Changes](#1-prepare-your-changes)
      - [2. Run Pre-submission Checks](#2-run-pre-submission-checks)
      - [3. Push Your Changes](#3-push-your-changes)
      - [4. Open a Pull Request](#4-open-a-pull-request)
      - [PR Requirements Checklist](#pr-requirements-checklist)
    - [Review Process](#review-process)
      - [What to Expect](#what-to-expect)
      - [Review Focus Areas](#review-focus-areas)
      - [Responding to Feedback](#responding-to-feedback)
      - [Approval Criteria](#approval-criteria)
      - [Getting Help](#getting-help)
  - [Code Style Guidelines](#code-style-guidelines)
  - [Testing Requirements](#testing-requirements)
    - [Running Tests](#running-tests)
    - [Test Frameworks](#test-frameworks)
      - [End-to-End Tests (Playwright)](#end-to-end-tests-playwright)
      - [Unit Tests (Vitest)](#unit-tests-vitest)
    - [Writing Tests](#writing-tests)
      - [When to Write Tests](#when-to-write-tests)
    - [CI/CD Pipeline](#cicd-pipeline)
      - [CI Checks](#ci-checks)
      - [CI Testing Environment](#ci-testing-environment)
      - [Viewing CI Results](#viewing-ci-results)
      - [Common CI Failures](#common-ci-failures)
    - [Coverage Requirements](#coverage-requirements)
  - [Issue Reporting](#issue-reporting)
    - [Bug Reports](#bug-reports)
      - [Before Reporting](#before-reporting)
      - [Bug Report Template](#bug-report-template)
    - [Feature Requests](#feature-requests)
      - [Before Requesting](#before-requesting)
      - [Feature Request Template](#feature-request-template)
    - [Security Issues](#security-issues)

---

## Getting Started

### Prerequisites

Before contributing to Automaker, ensure you have the following installed on your system:

- **Node.js 18+** (tested with Node.js 22)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`
- **npm** (comes with Node.js)
  - Verify installation: `npm --version`
- **Git** for version control
  - Verify installation: `git --version`
- **Claude Code CLI** or **Anthropic API Key** (for AI agent functionality)
  - Required to run the AI development features

**Optional but recommended:**

- A code editor with TypeScript support (VS Code recommended)
- GitHub CLI (`gh`) for easier PR management

### Fork and Clone

1. **Fork the repository** on GitHub
   - Navigate to [https://github.com/AutoMaker-Org/automaker](https://github.com/AutoMaker-Org/automaker)
   - Click the "Fork" button in the top-right corner
   - This creates your own copy of the repository

2. **Clone your fork locally**

   ```bash
   git clone https://github.com/YOUR_USERNAME/automaker.git
   cd automaker
   ```

3. **Add the upstream remote** to keep your fork in sync

   ```bash
   git remote add upstream https://github.com/AutoMaker-Org/automaker.git
   ```

4. **Verify remotes**
   ```bash
   git remote -v
   # Should show:
   # origin    https://github.com/YOUR_USERNAME/automaker.git (fetch)
   # origin    https://github.com/YOUR_USERNAME/automaker.git (push)
   # upstream  https://github.com/AutoMaker-Org/automaker.git (fetch)
   # upstream  https://github.com/AutoMaker-Org/automaker.git (push)
   ```

### Development Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Build shared packages** (required before running the app)

   ```bash
   npm run build:packages
   ```

3. **Start the development server**
   ```bash
   npm run dev          # Interactive launcher - choose mode
   npm run dev:web      # Browser mode (web interface)
   npm run dev:electron # Desktop app mode
   ```

**Common development commands:**

| Command                  | Description                      |
| ------------------------ | -------------------------------- |
| `npm run dev`            | Interactive development launcher |
| `npm run dev:web`        | Start in browser mode            |
| `npm run dev:electron`   | Start desktop app                |
| `npm run build`          | Build all packages and apps      |
| `npm run build:packages` | Build shared packages only       |
| `npm run lint`           | Run ESLint checks                |
| `npm run format`         | Format code with Prettier        |
| `npm run format:check`   | Check formatting without changes |
| `npm run test`           | Run E2E tests (Playwright)       |
| `npm run test:server`    | Run server unit tests            |
| `npm run test:packages`  | Run package tests                |
| `npm run test:all`       | Run all tests                    |

### Project Structure

Automaker is organized as an npm workspace monorepo:

```
automaker/
├── apps/
│   ├── ui/              # React + Vite + Electron frontend
│   └── server/          # Express + WebSocket backend
├── libs/
│   ├── @automaker/types/            # Shared TypeScript types
│   ├── @automaker/utils/            # Utility functions
│   ├── @automaker/prompts/          # AI prompt templates
│   ├── @automaker/platform/         # Platform abstractions
│   ├── @automaker/model-resolver/   # AI model resolution
│   ├── @automaker/dependency-resolver/ # Dependency management
│   └── @automaker/git-utils/        # Git operations
├── docs/                # Documentation
└── package.json         # Root package configuration
```

**Key conventions:**

- Always import from `@automaker/*` shared packages, never use relative paths to `libs/`
- Frontend code lives in `apps/ui/`
- Backend code lives in `apps/server/`
- Shared logic should be in the appropriate `libs/` package

---

## Pull Request Process

This section covers everything you need to know about contributing changes through pull requests, from creating your branch to getting your code merged.

### Branch Naming Convention

We use a consistent branch naming pattern to keep our repository organized:

```
<type>/<description>
```

**Branch types:**

| Type       | Purpose                  | Example                           |
| ---------- | ------------------------ | --------------------------------- |
| `feature`  | New functionality        | `feature/add-user-authentication` |
| `fix`      | Bug fixes                | `fix/resolve-memory-leak`         |
| `docs`     | Documentation changes    | `docs/update-contributing-guide`  |
| `refactor` | Code restructuring       | `refactor/simplify-api-handlers`  |
| `test`     | Adding or updating tests | `test/add-utils-unit-tests`       |
| `chore`    | Maintenance tasks        | `chore/update-dependencies`       |

**Guidelines:**

- Use lowercase letters and hyphens (no underscores or spaces)
- Keep descriptions short but descriptive
- Include issue number when applicable: `feature/123-add-login`

```bash
# Create and checkout a new feature branch
git checkout -b feature/add-dark-mode

# Create a fix branch with issue reference
git checkout -b fix/456-resolve-login-error
```

### Commit Message Format

We follow the **Conventional Commits** style for clear, readable commit history:

```
<type>: <description>

[optional body]
```

**Commit types:**

| Type       | Purpose                     |
| ---------- | --------------------------- |
| `feat`     | New feature                 |
| `fix`      | Bug fix                     |
| `docs`     | Documentation only          |
| `style`    | Formatting (no code change) |
| `refactor` | Code restructuring          |
| `test`     | Adding or updating tests    |
| `chore`    | Maintenance tasks           |

**Guidelines:**

- Use **imperative mood** ("Add feature" not "Added feature")
- Keep first line under **72 characters**
- Capitalize the first letter after the type prefix
- No period at the end of the subject line
- Add a blank line before the body for detailed explanations

**Examples:**

```bash
# Simple commit
git commit -m "feat: Add user authentication flow"

# Commit with body for more context
git commit -m "fix: Resolve memory leak in WebSocket handler

The connection cleanup was not being called when clients
disconnected unexpectedly. Added proper cleanup in the
error handler to prevent memory accumulation."

# Documentation update
git commit -m "docs: Update API documentation"

# Refactoring
git commit -m "refactor: Simplify state management logic"
```

### Submitting a Pull Request

Follow these steps to submit your contribution:

#### 1. Prepare Your Changes

Ensure you've synced with the latest upstream changes:

```bash
# Fetch latest changes from upstream
git fetch upstream

# Rebase your branch on main (if needed)
git rebase upstream/main
```

#### 2. Run Pre-submission Checks

Before opening your PR, verify everything passes locally:

```bash
# Run all tests
npm run test:all

# Check formatting
npm run format:check

# Run linter
npm run lint

# Build to verify no compile errors
npm run build
```

#### 3. Push Your Changes

```bash
# Push your branch to your fork
git push origin feature/your-feature-name
```

#### 4. Open a Pull Request

1. Go to your fork on GitHub
2. Click "Compare & pull request" for your branch
3. Ensure the base repository is `AutoMaker-Org/automaker` and base branch is `main`
4. Fill out the PR template completely

#### PR Requirements Checklist

Your PR should include:

- [ ] **Clear title** describing the change (use conventional commit format)
- [ ] **Description** explaining what changed and why
- [ ] **Link to related issue** (if applicable): `Closes #123` or `Fixes #456`
- [ ] **All CI checks passing** (format, lint, build, tests)
- [ ] **No merge conflicts** with main branch
- [ ] **Tests included** for new functionality
- [ ] **Documentation updated** if adding/changing public APIs

**Example PR Description:**

```markdown
## Summary

This PR adds dark mode support to the Automaker UI.

- Implements theme toggle in settings panel
- Adds CSS custom properties for theme colors
- Persists theme preference to localStorage

## Related Issue

Closes #123

## Testing

- [x] Tested toggle functionality in Chrome and Firefox
- [x] Verified theme persists across page reloads
- [x] Checked accessibility contrast ratios

## Screenshots

[Include before/after screenshots for UI changes]
```

### Review Process

All contributions go through code review to maintain quality:

#### What to Expect

1. **CI Checks Run First** - Automated checks (format, lint, build, tests) must pass before review
2. **Maintainer Review** - The project maintainers will review your PR and decide whether to merge it
3. **Feedback & Discussion** - The reviewer may ask questions or request changes
4. **Iteration** - Make requested changes and push updates to the same branch
5. **Approval & Merge** - Once approved and checks pass, your PR will be merged

#### Review Focus Areas

The reviewer checks for:

- **Correctness** - Does the code work as intended?
- **Clean Code** - Does it follow our [code style guidelines](#code-style-guidelines)?
- **Test Coverage** - Are new features properly tested?
- **Documentation** - Are public APIs documented?
- **Breaking Changes** - Are any breaking changes discussed first?

#### Responding to Feedback

- Respond to **all** review comments, even if just to acknowledge
- Ask questions if feedback is unclear
- Push additional commits to address feedback (don't force-push during review)
- Mark conversations as resolved once addressed

#### Approval Criteria

Your PR is ready to merge when:

- ✅ All CI checks pass
- ✅ The maintainer has approved the changes
- ✅ All review comments are addressed
- ✅ No unresolved merge conflicts

#### Getting Help

If your PR seems stuck:

- Comment asking for status update (mention @webdevcody if needed)
- Reach out on [Discord](https://discord.gg/jjem7aEDKU)
- Make sure all checks are passing and you've responded to all feedback

---

## Code Style Guidelines

Automaker uses automated tooling to enforce code style. Run `npm run format` to format code and `npm run lint` to check for issues. Pre-commit hooks automatically format staged files before committing.

---

## Testing Requirements

Testing helps prevent regressions. Automaker uses **Playwright** for end-to-end testing and **Vitest** for unit tests.

### Running Tests

Use these commands to run tests locally:

| Command                        | Description                           |
| ------------------------------ | ------------------------------------- |
| `npm run test`                 | Run E2E tests (Playwright)            |
| `npm run test:server`          | Run server unit tests (Vitest)        |
| `npm run test:packages`        | Run shared package tests              |
| `npm run test:all`             | Run all tests                         |
| `npm run test:server:coverage` | Run server tests with coverage report |

**Before submitting a PR**, always run the full test suite:

```bash
npm run test:all
```

### Test Frameworks

#### End-to-End Tests (Playwright)

E2E tests verify the entire application works correctly from a user's perspective.

- **Framework:** [Playwright](https://playwright.dev/)
- **Location:** `e2e/` directory
- **Test ports:** UI on port 3007, Server on port 3008

**Running E2E tests:**

```bash
# Run all E2E tests
npm run test

# Run with headed browser (useful for debugging)
npx playwright test --headed

# Run a specific test file
npm test --workspace=@automaker/ui -- tests/example.spec.ts
```

**E2E Test Guidelines:**

- Write tests from a user's perspective
- Use descriptive test names that explain the scenario
- Clean up test data after each test
- Use appropriate timeouts for async operations
- Prefer `locator` over direct selectors for resilience

#### Unit Tests (Vitest)

Unit tests verify individual functions and modules work correctly in isolation.

- **Framework:** [Vitest](https://vitest.dev/)
- **Location:** In the `tests/` directory within each package (e.g., `apps/server/tests/`)

**Running unit tests:**

```bash
# Run all server unit tests
npm run test:server

# Run with coverage report
npm run test:server:coverage

# Run package tests
npm run test:packages

# Run in watch mode during development
npx vitest --watch
```

**Unit Test Guidelines:**

- Keep tests small and focused on one behavior
- Use descriptive test names: `it('should return null when user is not found')`
- Follow the AAA pattern: Arrange, Act, Assert
- Mock external dependencies to isolate the unit under test
- Aim for meaningful coverage, not just line coverage

### Writing Tests

#### When to Write Tests

- **New features:** All new features should include tests
- **Bug fixes:** Add a test that reproduces the bug before fixing
- **Refactoring:** Ensure existing tests pass after refactoring
- **Public APIs:** All public APIs must have test coverage

### CI/CD Pipeline

Automaker uses **GitHub Actions** for continuous integration. Every pull request triggers automated checks.

#### CI Checks

The following checks must pass before your PR can be merged:

| Check             | Description                                   |
| ----------------- | --------------------------------------------- |
| **Format**        | Verifies code is formatted with Prettier      |
| **Build**         | Ensures the project compiles without errors   |
| **Package Tests** | Runs tests for shared `@automaker/*` packages |
| **Server Tests**  | Runs server unit tests with coverage          |

#### CI Testing Environment

For CI environments, Automaker supports a mock agent mode:

```bash
# Enable mock agent mode for CI testing
AUTOMAKER_MOCK_AGENT=true npm run test
```

This allows tests to run without requiring a real Claude API connection.

#### Viewing CI Results

1. Go to your PR on GitHub
2. Scroll to the "Checks" section at the bottom
3. Click on any failed check to see detailed logs
4. Fix issues locally and push updates

#### Common CI Failures

| Issue               | Solution                                      |
| ------------------- | --------------------------------------------- |
| Format check failed | Run `npm run format` locally                  |
| Build failed        | Run `npm run build` and fix TypeScript errors |
| Tests failed        | Run `npm run test:all` locally to reproduce   |
| Coverage decreased  | Add tests for new code paths                  |

### Coverage Requirements

While we don't enforce strict coverage percentages, we expect:

- **New features:** Should include comprehensive tests
- **Bug fixes:** Should include a regression test
- **Critical paths:** Must have test coverage (authentication, data persistence, etc.)

To view coverage reports locally:

```bash
npm run test:server:coverage
```

This generates an HTML report you can open in your browser to see which lines are covered.

---

## Issue Reporting

Found a bug or have an idea for a new feature? We'd love to hear from you! This section explains how to report issues effectively.

### Bug Reports

When reporting a bug, please provide as much information as possible to help us understand and reproduce the issue.

#### Before Reporting

1. **Search existing issues** - Check if the bug has already been reported
2. **Try the latest version** - Make sure you're running the latest version of Automaker
3. **Reproduce the issue** - Verify you can consistently reproduce the bug

#### Bug Report Template

When creating a bug report, include:

- **Title:** A clear, descriptive title summarizing the issue
- **Environment:**
  - Operating System and version
  - Node.js version (`node --version`)
  - Automaker version or commit hash
- **Steps to Reproduce:** Numbered list of steps to reproduce the bug
- **Expected Behavior:** What you expected to happen
- **Actual Behavior:** What actually happened
- **Logs/Screenshots:** Any relevant error messages, console output, or screenshots

**Example Bug Report:**

```markdown
## Bug: WebSocket connection drops after 5 minutes of inactivity

### Environment

- OS: Windows 11
- Node.js: 22.11.0
- Automaker: commit abc1234

### Steps to Reproduce

1. Start the application with `npm run dev:web`
2. Open the Kanban board
3. Leave the browser tab open for 5+ minutes without interaction
4. Try to move a card

### Expected Behavior

The card should move to the new column.

### Actual Behavior

The UI shows "Connection lost" and the card doesn't move.

### Logs

[WebSocket] Connection closed: 1006
```

### Feature Requests

We welcome ideas for improving Automaker! Here's how to submit a feature request:

#### Before Requesting

1. **Check existing issues** - Your idea may already be proposed or in development
2. **Consider scope** - Think about whether the feature fits Automaker's mission as an autonomous AI development studio

#### Feature Request Template

A good feature request includes:

- **Title:** A brief, descriptive title
- **Problem Statement:** What problem does this feature solve?
- **Proposed Solution:** How do you envision this working?
- **Alternatives Considered:** What other approaches did you consider?
- **Additional Context:** Mockups, examples, or references that help explain your idea

**Example Feature Request:**

```markdown
## Feature: Dark Mode Support

### Problem Statement

Working late at night, the bright UI causes eye strain and doesn't match
my system's dark theme preference.

### Proposed Solution

Add a theme toggle in the settings panel that allows switching between
light and dark modes. Ideally, it should also detect system preference.

### Alternatives Considered

- Browser extension to force dark mode (doesn't work well with custom styling)
- Custom CSS override (breaks with updates)

### Additional Context

Similar to how VS Code handles themes - a dropdown in settings with
immediate preview.
```

### Security Issues

**Important:** If you discover a security vulnerability, please do NOT open a public issue. Instead:

1. Join our [Discord server](https://discord.gg/jjem7aEDKU) and send a direct message to the user `@webdevcody`
2. Include detailed steps to reproduce
3. Allow time for us to address the issue before public disclosure

We take security seriously and appreciate responsible disclosure.

---

For license and contribution terms, see the [LICENSE](LICENSE) file in the repository root and the [README.md](README.md#license) for more details.

---

Thank you for contributing to Automaker!
