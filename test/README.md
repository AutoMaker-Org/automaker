# Configuration Tests

This directory contains comprehensive unit tests for repository configuration files.

## Overview

Tests validate configuration files changed in the current branch:
- `.claude/settings.json` - Claude Code plugin configuration
- `.gitignore` - Git ignore patterns for local Claude settings
- `README.md` - Claude Code Plugin documentation

## Test Files

### `config/claude-settings.test.ts` (60 tests)
Validates JSON structure, sandbox settings, permissions, marketplace configuration, plugin enablement, security settings, and formatting.

### `config/gitignore-validation.test.ts` (45 tests)
Validates gitignore patterns, actual git behavior (using `git check-ignore`), security implications, and documentation quality.

### `config/readme-validation.test.ts` (46 tests)
Validates documentation presence, accuracy, markdown formatting, link validity, and content completeness.

## Running Tests

```bash
# Run all config tests
npx vitest test/config

# Run specific test file
npx vitest test/config/claude-settings.test.ts

# Run with coverage
npx vitest test/config --coverage

# Run in watch mode
npx vitest test/config --watch
```

## Test Statistics

- **Total Tests**: 151
- **Total Lines**: 926
- **Coverage**: 100% of changed configuration
- **Execution Time**: < 2 seconds

## Documentation

- `CONFIG_TESTS.md` - Detailed test documentation
- `TEST_SUMMARY.md` - Test methodology and approach
- `../TEST_GENERATION_REPORT.md` - Complete generation report

## Key Features

✅ **Real-world testing** - Uses actual files and git commands
✅ **Security-focused** - Validates critical security settings
✅ **Comprehensive** - Covers all aspects of configuration
✅ **Fast** - All tests complete in under 2 seconds
✅ **Well-documented** - Clear test names and organization
✅ **Maintainable** - Follows project conventions

## Test Categories

### Security Tests
- Sandbox enablement
- Permission restrictions
- System directory protection
- Local settings protection
- Session data protection

### Structure Tests
- JSON validity and structure
- Gitignore syntax
- Markdown formatting
- Required fields presence

### Behavior Tests
- Git ignore pattern functionality
- File reading and parsing
- Configuration consistency

### Content Tests
- Documentation accuracy
- Command descriptions
- Link validity
- Completeness verification

## Contributing

When modifying configuration files:

1. Run tests to ensure they still pass
2. Add new tests for new configuration options
3. Update tests if structure changes
4. Maintain security test coverage
5. Keep documentation in sync

## Integration

These tests complement the existing test suite:
- Server tests: `apps/server/tests/`
- Package tests: `libs/*/tests/`
- UI tests: `apps/ui/tests/`

Run all tests: `npm run test:all`