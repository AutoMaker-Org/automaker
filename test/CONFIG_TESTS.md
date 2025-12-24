# Configuration Tests Documentation

This document describes the comprehensive test suite for the configuration changes made to the DevFlow repository.

## Overview

The test suite validates three key configuration files that were modified in the current branch:
1. `.claude/settings.json` - Claude Code plugin configuration
2. `.gitignore` - Git ignore patterns for Claude Code local settings
3. `README.md` - Documentation for Claude Code Plugin setup

## Test Files

### 1. `test/config/claude-settings.test.ts` (327 lines, ~60 tests)

Comprehensive validation of the Claude Code settings JSON configuration file.

**Test Categories:**

- **JSON Structure Validation** (3 tests)
  - Valid JSON parsing
  - Object structure verification
  - Array type validation

- **Sandbox Configuration** (5 tests)
  - Sandbox object presence and type
  - `enabled` boolean validation
  - `autoAllowBashIfSandboxed` boolean validation
  - Security-critical settings verification

- **Permissions Configuration** (9 tests)
  - Permissions object structure
  - `defaultMode` validation (acceptEdits, rejectEdits, ask)
  - File operation permissions (Read, Write, Edit, Glob, Grep, Bash)
  - Puppeteer MCP permissions validation
  - Permission array uniqueness
  - Permission format validation

- **Extra Known Marketplaces** (6 tests)
  - Marketplace object presence
  - `minimal-claude-marketplace` validation
  - Source structure validation
  - GitHub repository format validation
  - Repository reference accuracy

- **Enabled Plugins** (5 tests)
  - Plugin object presence
  - `minimal-claude@minimal-claude-marketplace` enabled
  - Plugin reference format validation
  - Boolean value type checking

- **Configuration Completeness** (2 tests)
  - Required top-level keys presence
  - No unexpected keys

- **Security Validation** (3 tests)
  - Sandbox enabled for security
  - Write permission patterns validation
  - System directory protection

- **JSON Formatting** (3 tests)
  - 2-space indentation
  - Newline at end of file
  - No trailing whitespace

- **Marketplace and Plugin Consistency** (2 tests)
  - Marketplace references for enabled plugins
  - Plugin existence validation

- **Edge Cases and Error Handling** (3 tests)
  - Empty permissions array handling
  - Permission format validation
  - Marketplace without plugins

- **Plugin Metadata Validation** (2 tests)
  - GitHub repository format validation
  - Invalid character checking

- **Backwards Compatibility** (3 tests)
  - Essential sandbox properties maintained
  - Essential permission properties maintained
  - Future marketplace extensibility

### 2. `test/config/gitignore-validation.test.ts` (308 lines, ~40 tests)

Validation of `.gitignore` patterns for Claude Code local settings.

**Test Categories:**

- **Claude Code Pattern Presence** (5 tests)
  - Comment presence
  - Specific file patterns (settings.local.json)
  - Wildcard patterns (*.local.json)
  - Directory patterns (session-env/)
  - Section structure validation

- **Pattern Formatting** (3 tests)
  - Pattern format correctness
  - Blank line before section
  - No trailing whitespace

- **Pattern Specificity** (3 tests)
  - Specific local settings file
  - Wildcard for local JSON files
  - Directory trailing slash

- **Pattern Interaction** (2 tests)
  - No conflicting patterns
  - All existing sections maintained

- **Git Behavior Validation** (4 tests)
  - settings.local.json ignored
  - Custom *.local.json files ignored
  - session-env/ directory ignored
  - Committed settings.json NOT ignored

- **Security and Privacy** (3 tests)
  - Local user settings protected
  - Session data protected
  - Clear documentation of intent

- **Pattern Coverage** (2 tests)
  - All local configuration scenarios
  - Backward compatibility maintained

- **Gitignore Syntax Validation** (3 tests)
  - Correct wildcard syntax
  - Trailing slash for directories
  - No redundant patterns

- **Documentation Quality** (2 tests)
  - Descriptive comment
  - Explanation of why files are ignored

### 3. `test/config/readme-validation.test.ts` (291 lines, ~50 tests)

Validation of README.md documentation for Claude Code Plugin.

**Test Categories:**

- **Section Presence** (3 tests)
  - Section header existence
  - Plugin name mention
  - Proper placement before "How to Run"

- **Plugin Information** (3 tests)
  - GitHub repository link
  - Markdown link syntax
  - Plugin purpose description

- **Available Commands Documentation** (5 tests)
  - Commands list presence
  - /setup-code-quality command
  - /setup-claude-md command
  - /setup-commits command
  - Consistent command formatting

- **Installation Information** (3 tests)
  - Automatic installation mention
  - Claude command requirement
  - Repository context

- **Markdown Formatting** (4 tests)
  - Proper heading level (###)
  - Bold formatting for "Available Commands"
  - Unordered list for commands
  - Inline code formatting

- **Link Validation** (2 tests)
  - Valid GitHub URL format
  - No broken markdown links

- **Content Accuracy** (2 tests)
  - Accurate command descriptions
  - Code quality theme

- **Section Structure** (2 tests)
  - Proper section flow
  - Blank lines around section

- **Integration with Existing Content** (3 tests)
  - Quick Start section maintained
  - How to Run section maintained
  - Logical positioning

- **User Guidance** (3 tests)
  - Clear automatic installation
  - Plugin activation explanation
  - Concise and actionable content

- **Completeness** (2 tests)
  - All three commands covered
  - Context for each command

## Running the Tests

### Run All Configuration Tests
```bash
# From repository root
npx vitest test/config
```

### Run Specific Test File
```bash
# Claude settings tests
npx vitest test/config/claude-settings.test.ts

# Gitignore tests
npx vitest test/config/gitignore-validation.test.ts

# README tests
npx vitest test/config/readme-validation.test.ts
```

### Run with Coverage
```bash
npx vitest test/config --coverage
```

### Run in Watch Mode
```bash
npx vitest test/config --watch
```

## Test Philosophy

These tests follow several key principles:

1. **Comprehensive Coverage**: Each configuration file is tested exhaustively, covering happy paths, edge cases, and error conditions.

2. **Real-World Validation**: Tests validate actual file content, not mocks, ensuring they catch real issues.

3. **Git Integration**: Gitignore tests actually test git behavior using `git check-ignore` to ensure patterns work correctly.

4. **Security Focus**: Multiple tests verify security-critical settings like sandbox enablement and permission restrictions.

5. **Documentation Quality**: Tests ensure documentation is accurate, complete, and properly formatted.

6. **Format Validation**: Tests verify JSON formatting, markdown syntax, and file structure.

7. **Backward Compatibility**: Tests ensure existing functionality is maintained while new features are added.

## Expected Test Results

All tests should pass when run against the current branch. If any tests fail, it indicates:

- Configuration file structure has changed
- Required settings are missing
- Security settings have been weakened
- Documentation is incomplete or incorrect
- Git ignore patterns are not working as expected

## Dependencies

The tests use:
- **Vitest**: Testing framework
- **Node.js fs/promises**: File system operations
- **child_process**: Git command execution
- **path**: Path manipulation

No additional test dependencies are required.

## Future Enhancements

Potential improvements to the test suite:

1. **Schema Validation**: Add JSON schema validation for settings.json
2. **Link Checking**: Validate all external links in README
3. **Performance Tests**: Ensure git ignore patterns are efficient
4. **Integration Tests**: Test Claude plugin actually loads and works
5. **Snapshot Tests**: Track configuration changes over time

## Contributing

When modifying configuration files, ensure:

1. All existing tests pass
2. New features have corresponding tests
3. Security-critical settings are validated
4. Documentation is updated and tested
5. Backward compatibility is maintained

## Related Documentation

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [minimal-claude Plugin](https://github.com/KenKaiii/minimal-claude)
- [Vitest Documentation](https://vitest.dev/)
- [Git Ignore Documentation](https://git-scm.com/docs/gitignore)