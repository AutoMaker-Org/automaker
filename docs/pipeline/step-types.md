# Pipeline Step Type Reference

## Overview

Pipeline steps are the building blocks of your verification workflow. Each step type serves a specific purpose and has unique configuration options.

## Review Step

### Purpose

Analyzes code quality, adherence to standards, and potential bugs.

### Configuration

```typescript
interface ReviewStepConfig {
  focus: Array<'quality' | 'standards' | 'bugs' | 'best-practices'>;
  maxIssues: number;
  excludePatterns: string[];
  includeTests: boolean;
}
```

### Properties

| Property        | Type     | Default                                            | Description                             |
| --------------- | -------- | -------------------------------------------------- | --------------------------------------- |
| focus           | string[] | ['quality', 'standards', 'bugs', 'best-practices'] | Areas to focus on during review         |
| maxIssues       | number   | 10                                                 | Maximum number of issues to report      |
| excludePatterns | string[] | ['*.test.ts', '*.spec.ts']                         | Glob patterns for files to exclude      |
| includeTests    | boolean  | false                                              | Whether to include test files in review |

### Output Format

```json
{
  "status": "passed" | "failed",
  "output": "string",
  "issues": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "summary": "string",
      "location": "file:line",
      "description": "string",
      "suggestion": "string"
    }
  ],
  "metrics": {
    "totalIssues": number,
    "severityBreakdown": Record<string, number>
  }
}
```

### Example

```json
{
  "id": "code-review",
  "type": "review",
  "name": "Code Review",
  "model": "same",
  "required": true,
  "autoTrigger": true,
  "config": {
    "focus": ["quality", "standards"],
    "maxIssues": 5,
    "excludePatterns": ["*.test.ts", "node_modules/**"],
    "includeTests": false
  }
}
```

## Security Step

### Purpose

Performs security analysis, vulnerability scanning, and compliance checks.

### Configuration

```typescript
interface SecurityStepConfig {
  checklist: string[];
  minSeverity: 'low' | 'medium' | 'high' | 'critical';
  excludeTests: boolean;
  checkDependencies: boolean;
}
```

### Properties

| Property          | Type     | Default      | Description                        |
| ----------------- | -------- | ------------ | ---------------------------------- |
| checklist         | string[] | OWASP Top 10 | Security checklist items to verify |
| minSeverity       | string   | 'medium'     | Minimum severity level to report   |
| excludeTests      | boolean  | true         | Whether to exclude test files      |
| checkDependencies | boolean  | true         | Check for vulnerable dependencies  |

### Output Format

```json
{
  "status": "passed" | "failed",
  "output": "string",
  "issues": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "category": "injection" | "auth" | "crypto" | "config" | "dependency",
      "summary": "string",
      "location": "file:line",
      "description": "string",
      "cwe": "CWE-89",
      "owasp": "A03:2021",
      "suggestion": "string"
    }
  ],
  "metrics": {
    "vulnerabilities": number,
    "complianceScore": number
  }
}
```

### Example

```json
{
  "id": "security-scan",
  "type": "security",
  "name": "Security Analysis",
  "model": "opus",
  "required": true,
  "autoTrigger": true,
  "config": {
    "checklist": ["Input validation", "Authentication", "Authorization", "Data encryption"],
    "minSeverity": "medium",
    "excludeTests": true,
    "checkDependencies": true
  }
}
```

## Performance Step

### Purpose

Analyzes performance characteristics, identifies bottlenecks, and suggests optimizations.

### Configuration

```typescript
interface PerformanceStepConfig {
  focus: Array<
    'algorithms' | 'database' | 'memory' | 'network' | 'bundle' | 'rendering' | 'caching'
  >;
  complexityThreshold: string;
  bundleSizeThreshold: string;
  memoryThreshold: string;
}
```

### Properties

| Property            | Type     | Default   | Description                           |
| ------------------- | -------- | --------- | ------------------------------------- |
| focus               | string[] | All areas | Performance areas to analyze          |
| complexityThreshold | string   | 'O(n²)'   | Alert if algorithm complexity exceeds |
| bundleSizeThreshold | string   | '5MB'     | Alert if bundle size exceeds          |
| memoryThreshold     | string   | '100MB'   | Alert if memory usage exceeds         |

### Output Format

```json
{
  "status": "passed" | "failed",
  "output": "string",
  "issues": [
    {
      "severity": "low" | "medium" | "high",
      "category": "algorithms" | "database" | "memory" | "network",
      "summary": "string",
      "location": "file:line",
      "description": "string",
      "impact": "high" | "medium" | "low",
      "suggestion": "string"
    }
  ],
  "metrics": {
    "complexity": "O(n log n)",
    "bundleSize": "2.3MB",
    "memoryUsage": "45MB",
    "dbQueries": 12
  }
}
```

### Example

```json
{
  "id": "perf-check",
  "type": "performance",
  "name": "Performance Review",
  "model": "same",
  "required": false,
  "autoTrigger": true,
  "config": {
    "focus": ["algorithms", "database", "memory"],
    "complexityThreshold": "O(n²)",
    "bundleSizeThreshold": "3MB",
    "memoryThreshold": "50MB"
  }
}
```

## Test Step

### Purpose

Analyzes test coverage, quality, and completeness.

### Configuration

```typescript
interface TestStepConfig {
  coverageThreshold: number;
  checkQuality: boolean;
  checkAssertions: boolean;
  includeIntegration: boolean;
  excludePatterns: string[];
}
```

### Properties

| Property           | Type     | Default                   | Description                         |
| ------------------ | -------- | ------------------------- | ----------------------------------- |
| coverageThreshold  | number   | 80                        | Minimum coverage percentage (0-100) |
| checkQuality       | boolean  | true                      | Check test quality metrics          |
| checkAssertions    | boolean  | true                      | Verify assertions exist             |
| includeIntegration | boolean  | true                      | Include integration tests           |
| excludePatterns    | string[] | ['*.config.js', '*.d.ts'] | Files to exclude from analysis      |

### Output Format

```json
{
  "status": "passed" | "failed",
  "output": "string",
  "issues": [
    {
      "severity": "low" | "medium" | "high",
      "category": "coverage" | "quality" | "assertions",
      "summary": "string",
      "location": "file",
      "description": "string",
      "suggestion": "string"
    }
  ],
  "metrics": {
    "coverage": "85%",
    "testCount": 42,
    "assertionCount": 156,
    "integrationTests": 8
  }
}
```

### Example

```json
{
  "id": "test-coverage",
  "type": "test",
  "name": "Test Analysis",
  "model": "same",
  "required": true,
  "autoTrigger": true,
  "config": {
    "coverageThreshold": 85,
    "checkQuality": true,
    "checkAssertions": true,
    "includeIntegration": true,
    "excludePatterns": ["*.config.js", "mocks/**"]
  }
}
```

## Custom Step

### Purpose

Execute user-defined prompts with custom validation logic.

### Configuration

```typescript
interface CustomStepConfig {
  prompt: string;
  successCriteria: string[];
  memoryEnabled: boolean;
  loopUntilSuccess: boolean;
  maxLoops: number;
  coderabbitEnabled: boolean;
  variables: Record<string, string>;
}
```

### Properties

| Property          | Type     | Default | Description                        |
| ----------------- | -------- | ------- | ---------------------------------- |
| prompt            | string   | -       | Custom prompt to execute           |
| successCriteria   | string[] | []      | Criteria for successful completion |
| memoryEnabled     | boolean  | false   | Remember previous feedback         |
| loopUntilSuccess  | boolean  | false   | Keep retrying until success        |
| maxLoops          | number   | 3       | Maximum retry attempts             |
| coderabbitEnabled | boolean  | false   | Use CodeRabbit instead of AI       |
| variables         | object   | {}      | Custom variables for substitution  |

### Output Format

```json
{
  "status": "passed" | "failed",
  "output": "string",
  "issues": [
    {
      "severity": "low" | "medium" | "high",
      "summary": "string",
      "description": "string",
      "suggestion": "string"
    }
  ],
  "customData": {
    "criteriaMet": string[],
    "criteriaMissing": string[],
    "iteration": number,
    "memory": any
  }
}
```

### Example

```json
{
  "id": "custom-standards",
  "type": "custom",
  "name": "Team Standards Check",
  "model": "opus",
  "required": false,
  "autoTrigger": true,
  "config": {
    "prompt": "Review this code for compliance with {{team}} standards. Check for: {{requirements}}",
    "successCriteria": [
      "No TODO comments",
      "All functions documented",
      "Error handling implemented"
    ],
    "memoryEnabled": true,
    "loopUntilSuccess": true,
    "maxLoops: 3,
    "variables": {
      "team": "frontend",
      "requirements": "documentation, error handling, no TODOs"
    }
  }
}
```

## Step Result Schema

All step types return a standardized result:

```typescript
interface PipelineStepResult {
  status: 'passed' | 'failed' | 'skipped' | 'error';
  output: string;
  issues?: PipelineIssue[];
  metrics?: Record<string, any>;
  error?: string;
  executionTime?: number;
  iteration?: number;
}
```

### Common Fields

| Field         | Type   | Description                           |
| ------------- | ------ | ------------------------------------- |
| status        | string | Final status of the step              |
| output        | string | Raw output from the step execution    |
| issues        | array  | List of issues found (if any)         |
| metrics       | object | Step-specific metrics                 |
| error         | string | Error message (if failed)             |
| executionTime | number | Time taken in milliseconds            |
| iteration     | number | Current iteration (for looping steps) |

## Step Status Flow

```
pending → in_progress → passed/failed/skipped
    ↑           ↓
    └─── retry ←─┘
```

- **pending**: Step is queued but not started
- **in_progress**: Step is currently executing
- **passed**: Step completed successfully
- **failed**: Step failed (may retry if configured)
- **skipped**: Step was skipped (optional only)
- **error**: Step encountered an error

## Best Practices

1. **Choose the Right Step Type**
   - Use Review for general code quality
   - Use Security for vulnerability analysis
   - Use Performance for optimization opportunities
   - Use Test for coverage analysis
   - Use Custom for team-specific checks

2. **Configure Appropriately**
   - Set reasonable issue limits to avoid noise
   - Exclude test files from non-test steps
   - Use severity thresholds to focus on important issues

3. **Handle Failures Gracefully**
   - Mark critical checks as required
   - Use retry logic for flaky checks
   - Provide clear success criteria

4. **Optimize Performance**
   - Limit analysis scope with patterns
   - Use appropriate models for each step
   - Monitor token usage and execution time
