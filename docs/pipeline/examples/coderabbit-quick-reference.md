# CodeRabbit Integration Quick Reference

## Overview

AutoMaker's pipeline system integrates with CodeRabbit for automated code reviews. This allows teams to leverage CodeRabbit's powerful analysis engine within AutoMaker's configurable pipeline workflow.

## Configuration Structure

CodeRabbit integration uses custom pipeline steps with the following key properties:

```json
{
  "type": "custom",
  "config": {
    "coderabbitEnabled": true,
    "coderabbitRules": ["bug-risk", "security"],
    "coderabbitCustomRules": ["no-hardcoded-secrets"],
    "coderabbitSeverity": "medium",
    "maxIssues": 20,
    "fallbackToAI": true,
    "includeTests": false
  }
}
```

## API Key Configuration

To use CodeRabbit integration:

1. Open AutoMaker settings
2. Navigate to **API Keys** section
3. Enter your CodeRabbit API key in the **CodeRabbit API Key** field
4. Save your settings

The API key will be automatically used when running CodeRabbit-enabled pipeline steps.

## Standard CodeRabbit Rules

| Rule             | Description                           |
| ---------------- | ------------------------------------- |
| `code-style`     | Code formatting and style consistency |
| `bug-risk`       | Potential bugs and logic errors       |
| `performance`    | Performance issues and optimizations  |
| `security`       | Security vulnerabilities              |
| `best-practices` | Industry best practices               |
| `complexity`     | Code complexity and maintainability   |
| `documentation`  | Documentation quality and coverage    |
| `error-handling` | Error handling patterns               |

## Severity Levels

- **Low**: Minor issues, style problems, documentation gaps
- **Medium**: Bugs, performance issues, security concerns
- **High**: Critical bugs, security vulnerabilities
- **Critical**: Exploitable vulnerabilities, data loss risks

## Custom Rules Examples

### Security Rules

```json
[
  "sql-injection-check",
  "xss-prevention",
  "auth-authorization",
  "data-validation",
  "secure-headers",
  "crypto-implementation"
]
```

### Quality Rules

```json
[
  "no-hardcoded-secrets",
  "proper-error-handling",
  "consistent-naming",
  "type-safety",
  "async-patterns",
  "resource-cleanup"
]
```

### Testing Rules

```json
[
  "test-naming-convention",
  "assertion-quality",
  "mock-usage",
  "edge-case-coverage",
  "integration-tests"
]
```

## Advanced Features

### Memory System

Enable memory to remember feedback across iterations:

```json
{
  "memoryEnabled": true,
  "loopUntilSuccess": true,
  "maxLoops": 3
}
```

### AI Fallback

Automatically fall back to AI review if CodeRabbit is unavailable:

```json
{
  "fallbackToAI": true
}
```

### Step Dependencies

Chain reviews for comprehensive coverage:

```json
{
  "dependencies": ["pre-flight-check", "security-scan"]
}
```

## Best Practices

1. **Start Simple**: Begin with essential rules and add more over time
2. **Use Appropriate Severity**: Don't overwhelm with low-severity issues
3. **Enable Fallback**: Ensure reviews continue even if CodeRabbit fails
4. **Custom Rules**: Add project-specific rules for team standards
5. **Iterative Reviews**: Use memory and loops for critical code paths

## Troubleshooting

### CodeRabbit Not Responding

- Check API key configuration
- Verify network access to `https://api.coderabbit.ai`
- Enable `fallbackToAI` as backup

### Too Many Issues

- Increase `coderabbitSeverity` to filter minor issues
- Reduce `maxIssues` to focus on most important problems
- Add more specific `excludePatterns`

### Performance Issues

- Limit the number of CodeRabbit rules per step
- Use multiple specialized steps instead of one large step
- Consider parallel execution for independent checks

## Example Workflows

### Quick PR Review

```json
{
  "coderabbitRules": ["bug-risk", "code-style"],
  "coderabbitSeverity": "medium",
  "maxIssues": 10
}
```

### Security-Focused Review

```json
{
  "coderabbitRules": ["security"],
  "coderabbitCustomRules": ["owasp-top-10"],
  "coderabbitSeverity": "high"
}
```

### Comprehensive Review

```json
{
  "coderabbitRules": ["bug-risk", "security", "performance", "best-practices"],
  "coderabbitSeverity": "medium",
  "maxIssues": 25,
  "memoryEnabled": true,
  "loopUntilSuccess": true
}
```
