# Coding Conventions

**Analysis Date:** 2026-01-27

## Naming Patterns

**Files:**

- PascalCase for class/service files: `auto-mode-service.ts`, `feature-loader.ts`, `claude-provider.ts`
- kebab-case for route/handler directories: `auto-mode/`, `features/`, `event-history/`
- kebab-case for utility files: `secure-fs.ts`, `sdk-options.ts`, `settings-helpers.ts`
- kebab-case for React components: `card.tsx`, `ansi-output.tsx`, `count-up-timer.tsx`
- kebab-case for hooks: `use-board-background-settings.ts`, `use-responsive-kanban.ts`, `use-test-logs.ts`
- kebab-case for store files: `app-store.ts`, `auth-store.ts`, `setup-store.ts`
- Organized by functionality: `routes/features/routes/list.ts`, `routes/features/routes/get.ts`

**Functions:**

- camelCase for all function names: `createEventEmitter()`, `getAutomakerDir()`, `executeQuery()`
- Verb-first for action functions: `buildPrompt()`, `classifyError()`, `loadContextFiles()`, `atomicWriteJson()`
- Prefix with `use` for React hooks: `useBoardBackgroundSettings()`, `useAppStore()`, `useUpdateProjectSettings()`
- Private methods prefixed with underscore: `_deleteOrphanedImages()`, `_migrateImages()`

**Variables:**

- camelCase for constants and variables: `featureId`, `projectPath`, `modelId`, `tempDir`
- UPPER_SNAKE_CASE for global constants/enums: `DEFAULT_MAX_CONCURRENCY`, `DEFAULT_PHASE_MODELS`
- Meaningful naming over abbreviations: `featureDirectory` not `fd`, `featureImages` not `img`
- Prefixes for computed values: `is*` for booleans: `isClaudeModel`, `isContainerized`, `isAutoLoginEnabled`

**Types:**

- PascalCase for interfaces and types: `Feature`, `ExecuteOptions`, `EventEmitter`, `ProviderConfig`
- Type files suffixed with `.d.ts`: `paths.d.ts`, `types.d.ts`
- Organized by domain: `src/store/types/`, `src/lib/`
- Re-export pattern from main package indexes: `export type { Feature };`

## Code Style

**Formatting:**

- Tool: Prettier 3.7.4
- Print width: 100 characters
- Tab width: 2 spaces
- Single quotes for strings
- Semicolons required
- Trailing commas: es5 (trailing in arrays/objects, not in params)
- Arrow functions always include parentheses: `(x) => x * 2`
- Line endings: LF (Unix)
- Bracket spacing: `{ key: value }`

**Linting:**

- Tool: ESLint (flat config in `apps/ui/eslint.config.mjs`)
- TypeScript ESLint plugin for `.ts`/`.tsx` files
- Recommended configs: `@eslint/js`, `@typescript-eslint/recommended`
- Unused variables warning with exception for parameters starting with `_`
- Type assertions are allowed with description when using `@ts-ignore`
- `@typescript-eslint/no-explicit-any` is warn-level (allow with caution)

## Import Organization

**Order:**

1. Node.js standard library: `import fs from 'fs/promises'`, `import path from 'path'`
2. Third-party packages: `import { describe, it } from 'vitest'`, `import { Router } from 'express'`
3. Shared packages (monorepo): `import type { Feature } from '@automaker/types'`, `import { createLogger } from '@automaker/utils'`
4. Local relative imports: `import { FeatureLoader } from './feature-loader.js'`, `import * as secureFs from '../lib/secure-fs.js'`
5. Type imports: separated with `import type { ... } from`

**Path Aliases:**

- `@/` - resolves to `./src` in both UI (`apps/ui/`) and server (`apps/server/`)
- Shared packages prefixed with `@automaker/`:
  - `@automaker/types` - core TypeScript definitions
  - `@automaker/utils` - logging, errors, utilities
  - `@automaker/prompts` - AI prompt templates
  - `@automaker/platform` - path management, security, processes
  - `@automaker/model-resolver` - model alias resolution
  - `@automaker/dependency-resolver` - feature dependency ordering
  - `@automaker/git-utils` - git operations
- Extensions: `.js` extension used in imports for ESM imports

**Import Rules:**

- Always import from shared packages, never from old paths
- No circular dependencies between layers
- Services import from providers and utilities
- Routes import from services
- Shared packages have strict dependency hierarchy (types → utils → platform → git-utils → server/ui)

## Error Handling

**Patterns:**

- Use `try-catch` blocks for async operations: wraps feature execution, file operations, git commands
- Throw `new Error(message)` with descriptive messages: `throw new Error('already running')`, `throw new Error('Feature ${featureId} not found')`
- Classify errors with `classifyError()` from `@automaker/utils` for categorization
- Log errors with context using `createLogger()`: includes error classification
- Return error info objects: `{ valid: false, errors: [...], warnings: [...] }`
- Validation returns structured result: `{ valid, errors, warnings }` from provider `validateConfig()`

**Error Types:**

- Authentication errors: distinguish from validation/runtime errors
- Path validation errors: caught by middleware in Express routes
- File system errors: logged and recovery attempted with backups
- SDK/API errors: classified and wrapped with context
- Abort/cancellation errors: handled without stack traces (graceful shutdown)

**Error Messages:**

- Descriptive and actionable: not vague error codes
- Include context when helpful: file paths, feature IDs, model names
- User-friendly messages via `getUserFriendlyErrorMessage()` for client display

## Logging

**Framework:**

- Built-in `createLogger()` from `@automaker/utils`
- Each module creates logger: `const logger = createLogger('ModuleName')`
- Logger functions: `info()`, `warn()`, `error()`, `debug()`

**Patterns:**

- Log operation start and completion for significant operations
- Log warnings for non-critical issues: file deletion failures, missing optional configs
- Log errors with full error object: `logger.error('operation failed', error)`
- Use module name as logger context: `createLogger('AutoMode')`, `createLogger('HttpClient')`
- Avoid logging sensitive data (API keys, passwords)
- No console.log in production code - use logger

**What to Log:**

- Feature execution start/completion
- Error classification and recovery attempts
- File operations (create, delete, migrate)
- API calls and responses (in debug mode)
- Async operation start/end
- Warnings for deprecated patterns

## Comments

**When to Comment:**

- Complex algorithms or business logic: explain the "why" not the "what"
- Integration points: explain how modules communicate
- Workarounds: explain the constraint that made the workaround necessary
- Non-obvious performance implications
- Edge cases and their handling

**JSDoc/TSDoc:**

- Used for public functions and classes
- Document parameters with `@param`
- Document return types with `@returns`
- Document exceptions with `@throws`
- Used for service classes: `/**\n * Module description\n * Manages: ...\n */`
- Not required for simple getters/setters

**Example JSDoc Pattern:**

```typescript
/**
 * Delete images that were removed from a feature
 */
private async deleteOrphanedImages(
  projectPath: string,
  oldPaths: Array<string>,
  newPaths: Array<string>
): Promise<void> {
  // Implementation
}
```

## Function Design

**Size:**

- Keep functions under 100 lines when possible
- Large services split into multiple related methods
- Private helper methods extracted for complex logic

**Parameters:**

- Use destructuring for object parameters with multiple properties
- Document parameter types with TypeScript types
- Optional parameters marked with `?`
- Use `Record<string, unknown>` for flexible object parameters

**Return Values:**

- Explicit return types required for all public functions
- Return structured objects for multiple values
- Use `Promise<T>` for async functions
- Async generators use `AsyncGenerator<T>` for streaming responses
- Never implicitly return `undefined` (explicit return or throw)

## Module Design

**Exports:**

- Default export for class instantiation: `export default class FeatureLoader {}`
- Named exports for functions: `export function createEventEmitter() {}`
- Type exports separated: `export type { Feature };`
- Barrel files (index.ts) re-export from module

**Barrel Files:**

- Used in routes: `routes/features/index.ts` creates router and exports
- Used in stores: `store/index.ts` exports all store hooks
- Pattern: group related exports for easier importing

**Service Classes:**

- Instantiated once and dependency injected
- Public methods for API surface
- Private methods prefixed with `_`
- No static methods - prefer instances or functions
- Constructor takes dependencies: `constructor(config?: ProviderConfig)`

**Provider Pattern:**

- Abstract base class: `BaseProvider` with abstract methods
- Concrete implementations: `ClaudeProvider`, `CodexProvider`, `CursorProvider`
- Common interface: `executeQuery()`, `detectInstallation()`, `validateConfig()`
- Factory for instantiation: `ProviderFactory.create()`

## TypeScript Specific

**Strict Mode:** Always enabled globally

- `strict: true` in all tsconfigs
- No implicit `any` - declare types explicitly
- No optional chaining on base types without narrowing

**Type Definitions:**

- Interface for shapes: `interface Feature { ... }`
- Type for unions/aliases: `type ModelAlias = 'haiku' | 'sonnet' | 'opus'`
- Type guards for narrowing: `if (typeof x === 'string') { ... }`
- Generic types for reusable patterns: `EventCallback<T>`

**React Specific (UI):**

- Functional components only
- React 19 with hooks
- Type props interface: `interface CardProps extends React.ComponentProps<'div'> { ... }`
- Zustand stores for state management
- Custom hooks for shared logic

---

_Convention analysis: 2026-01-27_
