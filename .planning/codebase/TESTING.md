# Testing Patterns

**Analysis Date:** 2026-01-27

## Test Framework

**Runner:**

- Vitest 4.0.16 (for unit and integration tests)
- Playwright (for E2E tests)
- Config: `apps/server/vitest.config.ts`, `libs/*/vitest.config.ts`, `apps/ui/playwright.config.ts`

**Assertion Library:**

- Vitest built-in expect assertions
- API: `expect().toBe()`, `expect().toEqual()`, `expect().toHaveLength()`, `expect().toHaveProperty()`

**Run Commands:**

```bash
npm run test                    # E2E tests (Playwright, headless)
npm run test:headed            # E2E tests with browser visible
npm run test:packages          # All shared package unit tests (vitest)
npm run test:server            # Server unit tests (vitest run)
npm run test:server:coverage   # Server tests with coverage report
npm run test:all               # All tests (packages + server)
npm run test:unit              # Vitest run (all projects)
npm run test:unit:watch        # Vitest watch mode
```

## Test File Organization

**Location:**

- Co-located with source: `src/module.ts` has `tests/unit/module.test.ts`
- Server tests: `apps/server/tests/` (separate directory)
- Library tests: `libs/*/tests/` (each package)
- E2E tests: `apps/ui/tests/` (Playwright)

**Naming:**

- Pattern: `{moduleName}.test.ts` for unit tests
- Pattern: `{moduleName}.spec.ts` for specification tests
- Glob pattern: `tests/**/*.test.ts`, `tests/**/*.spec.ts`

**Structure:**

```
apps/server/
├── tests/
│   ├── setup.ts              # Global test setup
│   ├── unit/
│   │   ├── providers/        # Provider tests
│   │   │   ├── claude-provider.test.ts
│   │   │   ├── codex-provider.test.ts
│   │   │   └── base-provider.test.ts
│   │   └── services/
│   └── utils/
│       └── helpers.ts        # Test utilities
└── src/

libs/platform/
├── tests/
│   ├── paths.test.ts
│   ├── security.test.ts
│   ├── subprocess.test.ts
│   └── node-finder.test.ts
└── src/
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FeatureLoader } from '@/services/feature-loader.js';

describe('feature-loader.ts', () => {
  let featureLoader: FeatureLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    featureLoader = new FeatureLoader();
  });

  afterEach(async () => {
    // Cleanup resources
  });

  describe('methodName', () => {
    it('should do specific thing', () => {
      expect(result).toBe(expected);
    });
  });
});
```

**Patterns:**

- Setup pattern: `beforeEach()` initializes test instance, clears mocks
- Teardown pattern: `afterEach()` cleans up temp directories, removes created files
- Assertion pattern: one logical assertion per test (or multiple closely related)
- Test isolation: each test runs with fresh setup

## Mocking

**Framework:**

- Vitest `vi` module: `vi.mock()`, `vi.mocked()`, `vi.clearAllMocks()`
- Mock patterns: module mocking, function spying, return value mocking

**Patterns:**

Module mocking:

```typescript
vi.mock('@anthropic-ai/claude-agent-sdk');
// In test:
vi.mocked(sdk.query).mockReturnValue(
  (async function* () {
    yield { type: 'text', text: 'Response 1' };
  })()
);
```

Async generator mocking (for streaming APIs):

```typescript
const generator = provider.executeQuery({
  prompt: 'Hello',
  model: 'claude-opus-4-5-20251101',
  cwd: '/test',
});
const results = await collectAsyncGenerator(generator);
```

Partial mocking with spies:

```typescript
const provider = new TestProvider();
const spy = vi.spyOn(provider, 'getName');
spy.mockReturnValue('mocked-name');
```

**What to Mock:**

- External APIs (Claude SDK, GitHub SDK, cloud services)
- File system operations (use temp directories instead when possible)
- Network calls
- Process execution
- Time-dependent operations

**What NOT to Mock:**

- Core business logic (test the actual implementation)
- Type definitions
- Internal module dependencies (test integration with real services)
- Standard library functions (fs, path, etc. - use fixtures instead)

## Fixtures and Factories

**Test Data:**

```typescript
// Test helper for collecting async generator results
async function collectAsyncGenerator<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of generator) {
    results.push(item);
  }
  return results;
}

// Temporary directory fixture
beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
  projectPath = path.join(tempDir, 'test-project');
  await fs.mkdir(projectPath, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});
```

**Location:**

- Inline in test files for simple fixtures
- `tests/utils/helpers.ts` for shared test utilities
- Factory functions for complex test objects: `createTestProvider()`, `createMockFeature()`

## Coverage

**Requirements (Server):**

- Lines: 60%
- Functions: 75%
- Branches: 55%
- Statements: 60%
- Config: `apps/server/vitest.config.ts` with thresholds

**Excluded from Coverage:**

- Route handlers: tested via integration/E2E tests
- Type re-exports
- Middleware: tested via integration tests
- Prompt templates
- MCP integration: awaits MCP SDK integration tests
- Provider CLI integrations: awaits integration tests

**View Coverage:**

```bash
npm run test:server:coverage   # Generate coverage report
# Opens HTML report in: apps/server/coverage/index.html
```

**Coverage Tools:**

- Provider: v8
- Reporters: text, json, html, lcov
- File inclusion: `src/**/*.ts`
- File exclusion: `src/**/*.d.ts`, specific service files in thresholds

## Test Types

**Unit Tests:**

- Scope: Individual functions and methods
- Approach: Test inputs → outputs with mocked dependencies
- Location: `apps/server/tests/unit/`
- Examples:
  - Provider executeQuery() with mocked SDK
  - Path construction functions with assertions
  - Error classification with different error types
  - Config validation with various inputs

**Integration Tests:**

- Scope: Multiple modules working together
- Approach: Test actual service calls with real file system or temp directories
- Pattern: Setup data → call method → verify results
- Example: Feature loader reading/writing feature.json files
- Example: Auto-mode service coordinating with multiple services

**E2E Tests:**

- Framework: Playwright
- Scope: Full user workflows from UI
- Location: `apps/ui/tests/`
- Config: `apps/ui/playwright.config.ts`
- Setup:
  - Backend server with mock agent enabled
  - Frontend Vite dev server
  - Sequential execution (workers: 1) to avoid auth conflicts
  - Screenshots/traces on failure
- Auth: Global setup authentication in `tests/global-setup.ts`
- Fixtures: `tests/e2e-fixtures/` for test project data

## Common Patterns

**Async Testing:**

```typescript
it('should execute async operation', async () => {
  const result = await featureLoader.loadFeature(projectPath, featureId);
  expect(result).toBeDefined();
  expect(result.id).toBe(featureId);
});

// For streams/generators:
const generator = provider.executeQuery({ prompt, model, cwd });
const results = await collectAsyncGenerator(generator);
expect(results).toHaveLength(2);
```

**Error Testing:**

```typescript
it('should throw error when feature not found', async () => {
  await expect(featureLoader.getFeature(projectPath, 'nonexistent')).rejects.toThrow('not found');
});

// Testing error classification:
const errorInfo = classifyError(new Error('ENOENT'));
expect(errorInfo.category).toBe('FileSystem');
```

**Fixture Setup:**

```typescript
it('should create feature with images', async () => {
  // Setup: create temp feature directory
  const featureDir = path.join(projectPath, '.automaker', 'features', featureId);
  await fs.mkdir(featureDir, { recursive: true });

  // Act: perform operation
  const result = await featureLoader.updateFeature(projectPath, {
    id: featureId,
    imagePaths: ['/temp/image.png'],
  });

  // Assert: verify file operations
  const migratedPath = path.join(featureDir, 'images', 'image.png');
  expect(fs.existsSync(migratedPath)).toBe(true);
});
```

**Mock Reset Pattern:**

```typescript
// In vitest.config.ts:
mockReset: true,          // Reset all mocks before each test
restoreMocks: true,       // Restore original implementations
clearMocks: true,         // Clear mock call history

// In test:
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});
```

## Test Configuration

**Vitest Config Patterns:**

Server config (`apps/server/vitest.config.ts`):

- Environment: node
- Globals: true (describe/it without imports)
- Setup files: `./tests/setup.ts`
- Alias resolution: resolves `@automaker/*` to source files for mocking

Library config:

- Simpler setup: just environment and globals
- Coverage with high thresholds (90%+ lines)

**Global Setup:**

```typescript
// tests/setup.ts
import { vi, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = '/tmp/test-data';

beforeEach(() => {
  vi.clearAllMocks();
});
```

## Testing Best Practices

**Isolation:**

- Each test is independent (no state sharing)
- Cleanup temp files in afterEach
- Reset mocks and environment variables in beforeEach

**Clarity:**

- Descriptive test names: "should do X when Y condition"
- One logical assertion per test
- Clear arrange-act-assert structure

**Speed:**

- Mock external services
- Use in-memory temp directories
- Avoid real network calls
- Sequential E2E tests to prevent conflicts

**Maintainability:**

- Use beforeEach/afterEach for common setup
- Extract test helpers to `tests/utils/`
- Keep test data simple and local
- Mock consistently across tests

---

_Testing analysis: 2026-01-27_
