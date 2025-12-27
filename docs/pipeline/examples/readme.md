# Pipeline Examples

This directory contains example pipeline configurations that you can import and use as templates for your own projects.

## Available Examples

### 1. **basic-code-review.json**

A simple pipeline focused on code quality and standards compliance. Perfect for small projects or getting started.

### 2. **security-focused.json**

Comprehensive security analysis for production code. Includes vulnerability scanning and security-focused code review.

### 3. **performance-optimized.json**

Focuses on performance analysis and optimization. Great for performance-critical applications.

### 4. **comprehensive-pipeline.json**

A full-featured pipeline with all step types. Suitable for large projects requiring thorough analysis.

### 5. **custom-steps-pipeline.json**

Demonstrates how to use custom steps with shell commands. Shows integration with npm scripts and external tools.

### 6. **test-focused.json**

Emphasizes testing and test coverage. Ideal for projects where test quality is a priority.

### 7. **coderabbit-starter.json**

A simple CodeRabbit-integrated pipeline for teams getting started with automated code reviews. Focuses on essential quality checks.

### 8. **coderabbit-integrated.json**

A comprehensive CodeRabbit-powered pipeline with multiple specialized reviews: style, quality, security, performance, and tests. Includes memory and loop features for iterative improvements.

### 9. **coderabbit-security.json**

Security-focused pipeline that combines AutoMaker's security step with CodeRabbit's advanced security analysis. Perfect for applications requiring thorough security reviews.

### 10. **coderabbit-advanced.json**

Demonstrates advanced CodeRabbit features including iterative reviews with memory, AI fallback, and multi-model approach. Combines AutoMaker's review steps with CodeRabbit for comprehensive coverage.

## How to Use These Examples

1. **Via the UI:**
   - Open Pipeline settings in AutoMaker
   - Click "Import Configuration"
   - Select one of these JSON files

2. **Manually:**
   - Copy the desired configuration to `.automaker/pipeline.json` in your project
   - The changes will be picked up automatically

3. **Programmatically:**
   ```bash
   # Copy an example to your project
   cp basic-code-review.json /path/to/your/project/.automaker/pipeline.json
   ```

## Customizing Examples

Feel free to modify these examples to fit your specific needs:

- Adjust `maxIssues` thresholds
- Change `excludePatterns` to match your project structure
- Add or remove steps as needed
- Modify step configurations

Remember to validate your configuration after making changes.

## CodeRabbit Integration

CodeRabbit examples use custom steps with special configuration options:

### Key CodeRabbit Settings

- **coderabbitEnabled**: Enable CodeRabbit integration (boolean)
- **coderabbitRules**: Array of standard CodeRabbit rules to apply
  - Available rules: `code-style`, `bug-risk`, `performance`, `security`, `best-practices`, `complexity`, `documentation`, `error-handling`
- **coderabbitCustomRules**: Array of custom rule strings
- **coderabbitSeverity**: Minimum severity level (`low`, `medium`, `high`, `critical`)
- **maxIssues**: Maximum number of issues to report (1-100)
- **fallbackToAI**: Fall back to AI review if CodeRabbit fails (boolean)
- **includeTests**: Include test files in the review (boolean)

### Example Custom Rules

```json
"coderabbitCustomRules": [
  "no-hardcoded-secrets",
  "proper-error-handling",
  "consistent-naming",
  "sql-injection-check",
  "xss-prevention"
]
```

### Advanced Features

- **Memory System**: Enable `memoryEnabled` to remember previous feedback across iterations
- **Loop Until Success**: Use `loopUntilSuccess` with `maxLoops` for iterative improvements
- **Dependencies**: Chain reviews together using step dependencies

### Prerequisites

1. CodeRabbit API key configured in AutoMaker settings (Settings > API Keys > CodeRabbit API Key)
2. Git repository with proper remote configuration
3. Network access to CodeRabbit API (https://api.coderabbit.ai)
