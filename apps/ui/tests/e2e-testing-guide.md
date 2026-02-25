# E2E Testing Guide

Best practices and patterns for writing reliable, non-flaky Playwright e2e tests in this codebase.

## Core Principles

1. **No arbitrary timeouts** - Never use `page.waitForTimeout()`. Always wait for specific conditions.
2. **Use data-testid attributes** - Prefer `[data-testid="..."]` selectors over CSS classes or text content.
3. **Clean up after tests** - Use unique temp directories and clean them up in `afterAll`.
4. **Test isolation** - Each test should be independent and not rely on state from other tests.

## Setting Up Test State

### Use Setup Utilities (Recommended)

Use the provided utility functions to set up localStorage state. These utilities hide the internal store structure and version details, making tests more maintainable.

```typescript
import { setupWelcomeView, setupRealProject } from './utils';

// Show welcome view with workspace directory configured
await setupWelcomeView(page, { workspaceDir: TEST_TEMP_DIR });

// Show welcome view with recent projects
await setupWelcomeView(page, {
  workspaceDir: TEST_TEMP_DIR,
  recentProjects: [
    {
      id: 'project-123',
      name: 'My Project',
      path: '/path/to/project',
      lastOpened: new Date().toISOString(),
    },
  ],
});

// Set up a real project on the filesystem
await setupRealProject(page, projectPath, projectName, {
  setAsCurrent: true, // Opens board view (default)
});
```

### Why Use Utilities Instead of Raw localStorage

1. **Version management** - Store versions are centralized in one place
2. **Less brittle** - If store structure changes, update one file instead of every test
3. **Cleaner tests** - Focus on test logic, not setup boilerplate
4. **Type safety** - Utilities provide typed interfaces for test data

### Manual LocalStorage Setup (Advanced)

If you need custom setup not covered by utilities, use `page.addInitScript()`.
Store versions are defined in `tests/utils/project/setup.ts`:

- `APP_STORE`: version 2 (matches `app-store.ts`)
- `SETUP_STORE`: version 0 (matches `setup-store.ts` default)

### Temp Directory Management

Create unique temp directories for test isolation:

```typescript
import { createTempDirPath, cleanupTempDir } from './utils';

const TEST_TEMP_DIR = createTempDirPath('my-test-name');

test.describe('My Tests', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    cleanupTempDir(TEST_TEMP_DIR);
  });
});
```

## Waiting for Elements

### Prefer `toBeVisible()` over `waitForSelector()`

```typescript
// Good - uses Playwright's auto-waiting with expect
await expect(page.locator('[data-testid="welcome-view"]')).toBeVisible({ timeout: 10000 });

// Avoid - manual waiting
await page.waitForSelector('[data-testid="welcome-view"]');
```

### Wait for page load after navigation

**Important:** Use `load` state, NOT `networkidle`. This app has persistent connections (websockets, polling) that prevent the network from ever becoming "idle", causing `networkidle` to timeout.

```typescript
await page.goto('/');
await page.waitForLoadState('load');

// Then wait for specific elements to verify the page is ready
await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });
```

**Why not `networkidle`?**

- `networkidle` requires no network activity for 500ms
- Modern SPAs with real-time features (websockets, polling, SSE) never reach this state
- Using `networkidle` causes 30+ second timeouts and flaky tests
- The `load` state fires when the page finishes loading, which is sufficient
- Always follow up with element visibility checks for reliability

### Use appropriate timeouts

- Quick UI updates: 5000ms (default)
- Page loads/navigation: 10000ms
- Async operations (API calls, file system): 15000ms

```typescript
// Fast UI element
await expect(button).toBeVisible();

// Page load
await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 10000 });

// Async operation completion
await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });
```

## Element Selection

### Use data-testid attributes

```typescript
// Good - stable selector
const button = page.locator('[data-testid="create-new-project"]');

// Avoid - brittle selectors
const button = page.locator('.btn-primary');
const button = page.getByText('Create');
```

### Scope selectors when needed

When text appears in multiple places, scope to a parent:

```typescript
// Bad - might match multiple elements
await expect(page.getByText(projectName)).toBeVisible();

// Good - scoped to specific container
await expect(page.locator('[data-testid="project-selector"]').getByText(projectName)).toBeVisible();
```

### Handle strict mode violations

If a selector matches multiple elements:

```typescript
// Use .first() if you need the first match
await page.locator('[data-testid="item"]').first().click();

// Or scope to a unique parent
await page.locator('[data-testid="sidebar"]').locator('[data-testid="item"]').click();
```

## Clicking Elements

### Always verify visibility before clicking

```typescript
const button = page.locator('[data-testid="submit"]');
await expect(button).toBeVisible();
await button.click();
```

### Handle dialogs that may close quickly

Some dialogs may appear briefly or auto-close. Don't rely on clicking them:

```typescript
// Instead of trying to close a dialog that might disappear:
// await expect(dialog).toBeVisible();
// await closeButton.click();  // May fail if dialog closes first

// Just verify the end state:
await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });
```

## Filesystem Verification

Verify files were created after async operations:

```typescript
// Wait for UI to confirm operation completed first
await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 15000 });

// Then verify filesystem
const projectPath = path.join(TEST_TEMP_DIR, projectName);
expect(fs.existsSync(projectPath)).toBe(true);

const appSpecPath = path.join(projectPath, '.automaker', 'app_spec.txt');
expect(fs.existsSync(appSpecPath)).toBe(true);

const content = fs.readFileSync(appSpecPath, 'utf-8');
expect(content).toContain(projectName);
```

## Test Structure

### Use descriptive test names

```typescript
test('should create a new blank project from welcome view', async ({ page }) => {
  // ...
});
```

### Group related tests with describe blocks

```typescript
test.describe('Project Creation', () => {
  test('should create a new blank project from welcome view', ...);
  test('should create a project from template', ...);
});
```

### Use serial mode when tests depend on each other

```typescript
test.describe.configure({ mode: 'serial' });
```

## Common Patterns

### Waiting for either of two outcomes

When multiple outcomes are possible (e.g., dialog or direct navigation):

```typescript
// Wait for either the dialog or the board view
await Promise.race([
  initDialog.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
  boardView.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
]);

// Then handle whichever appeared
if (await initDialog.isVisible()) {
  await closeButton.click();
}

await expect(boardView).toBeVisible();
```

### Generating unique test data

```typescript
const projectName = `test-project-${Date.now()}`;
```

## Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- project-creation.spec.ts

# Run with headed browser (see what's happening)
npm run test:headed -- project-creation.spec.ts

# Run multiple times to check for flakiness
npm run test -- project-creation.spec.ts --repeat-each=5
```

## Debugging Failed Tests

1. Check the screenshot in `test-results/`
2. Read the error context markdown file in `test-results/`
3. Run with `--headed` to watch the test
4. Add `await page.pause()` to pause execution at a specific point

## Common Pitfalls

### Timeout on `waitForLoadState('networkidle')`

If tests timeout waiting for network idle, the app likely has persistent connections. Use `load` state instead:

```typescript
// Bad - will timeout with persistent connections
await page.waitForLoadState('networkidle');

// Good - completes when page loads
await page.waitForLoadState('load');
await expect(page.locator('[data-testid="my-element"]')).toBeVisible();
```

### Port conflicts

If you see "Port 3108 is already in use", kill the process:

```bash
lsof -ti:3108 | xargs kill -9
```

## Available Test Utilities

Import from `./utils`:

### State Setup Utilities

- `setupWelcomeView(page, options?)` - Set up empty state showing welcome view
  - `options.workspaceDir` - Pre-configure workspace directory
  - `options.recentProjects` - Add projects to recent list (not current)
- `setupRealProject(page, path, name, options?)` - Set up state with a real filesystem project
  - `options.setAsCurrent` - Open board view (default: true)
  - `options.additionalProjects` - Add more projects to list
- `setupMockProject(page)` - Set up mock project for unit-style tests
- `setupComplete(page)` - Mark setup wizard as complete

### Filesystem Utilities

- `createTempDirPath(prefix)` - Create unique temp directory path
- `cleanupTempDir(path)` - Remove temp directory
- `createTestGitRepo(tempDir)` - Create a git repo for testing

### Waiting Utilities

- `waitForNetworkIdle(page)` - Wait for page to load (uses `load` state, not `networkidle`)
- `waitForElement(page, testId)` - Wait for element by test ID
- `waitForBoardView(page)` - Navigate to board and wait for it to be visible

### Async File Verification

Use `expect().toPass()` for polling filesystem operations:

```typescript
await expect(async () => {
  expect(fs.existsSync(filePath)).toBe(true);
}).toPass({ timeout: 10000 });
```

See `tests/utils/index.ts` for the full list of available utilities.
