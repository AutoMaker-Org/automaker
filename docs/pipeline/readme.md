# Pipeline Configuration Guide

## Overview

The Configurable Pipeline system allows you to define custom verification workflows that run automatically after feature completion. Each pipeline consists of one or more steps that analyze your code, provide feedback, and ensure quality standards.

> **Note**: The pipeline UI is available in Settings → Pipeline, but requires backend integration to save/load configurations. Currently, configurations can be managed manually via the `.automaker/pipeline.json` file.

## Getting Started

### Accessing Pipeline Configuration

The pipeline configuration is located in the main settings panel:

1. Click the **Settings** icon (gear) in the left sidebar
2. In the settings navigation panel, click on **Pipeline** (workflow icon)
3. The pipeline configuration panel will appear on the right

### Creating Your First Pipeline

1. In the Pipeline settings, enable the pipeline system using the toggle switch at the top
2. Click the **Add Step** button to open the step type selector
3. Choose a step type (Review, Security, Performance, Test, or Custom)
4. Configure the step using the configuration panel that appears
5. Add more steps as needed - they will execute in order
6. Use the drag handle (⋮⋮) to reorder steps if needed
7. Click **Save Configuration** to apply your changes

### Manual Configuration (Alternative)

While the UI provides an intuitive interface, you can also edit the pipeline configuration directly:

1. Open your project's `.automaker` directory
2. Edit the `pipeline.json` file with your configuration
3. The changes will be picked up automatically

```bash
# Example: Edit pipeline configuration
vim .automaker/pipeline.json
```

### Pipeline Configuration File

Pipelines are stored in `.automaker/pipeline.json`:

```json
{
  "version": "1.0",
  "enabled": true,
  "onFailure": "stop",
  "steps": [
    {
      "id": "review",
      "type": "review",
      "name": "Code Review",
      "model": "same",
      "required": true,
      "autoTrigger": true,
      "config": {
        "focus": ["quality", "standards", "bugs"],
        "maxIssues": 10,
        "excludePatterns": ["*.test.ts", "*.spec.ts"]
      }
    }
  ]
}
```

## UI Features

### Pipeline Builder Interface

The pipeline builder provides an intuitive interface for managing your pipeline:

- **Step Cards**: Each step is displayed as a card showing its type, name, and status
- **Drag & Drop**: Reorder steps by dragging them using the handle (⋮⋮)
- **Quick Actions**: Each step card has buttons to edit, delete, or duplicate the step
- **Real-time Validation**: See validation errors as you configure steps
- **Preview Mode**: Toggle preview to see how the pipeline will execute

### Step Configuration Panel

When you add or edit a step, a configuration panel appears with:

- **Basic Settings**: Name, description, model selection
- **Step-Specific Options**: Configuration unique to each step type
- **Advanced Options**: Retry logic, memory settings, dependencies
- **Test Button**: Run the step on demand to test your configuration

### Pipeline Management

Additional features in the Pipeline settings:

- **Export/Import**: Save your pipeline configuration to a file or share with team
- **Reset**: Clear all steps and start over
- **Duplicate**: Copy an existing pipeline to create variations
- **History**: View recent changes and revert if needed

## Configuration Options

### Global Settings

- **version**: Schema version (always "1.0")
- **enabled**: Enable/disable the pipeline system
- **onFailure**: What to do when a step fails
  - `"stop"`: Stop execution on first failure
  - `"continue"`: Continue executing non-required steps
  - `"retry"`: Retry failed steps (if retry count > 0)

### Step Configuration

Each step has the following properties:

- **id**: Unique identifier for the step
- **type**: Type of step (review, security, performance, test, custom)
- **name**: Display name for the step
- **model**: AI model to use
  - `"same"`: Use the same model as the feature
  - `"different"`: Use a different model than the feature
  - `"opus"`, `"sonnet"`, `"haiku"`: Use specific model
- **required**: Whether this step must pass
- **autoTrigger**: Whether to run automatically after feature completion
- **maxLoops**: Maximum retry attempts (for custom steps with looping)
- **memoryEnabled**: Enable memory between iterations
- **loopUntilSuccess**: Keep retrying until success (custom steps only)
- **config**: Step-specific configuration

## Step Types

### Review Step

Analyzes code quality, standards compliance, and potential bugs.

```json
{
  "id": "review",
  "type": "review",
  "name": "Code Review",
  "config": {
    "focus": [
      "quality", // Code quality issues
      "standards", // Coding standards
      "bugs", // Potential bugs
      "best-practices" // Best practices
    ],
    "maxIssues": 10, // Maximum issues to report
    "excludePatterns": [
      // Files to exclude
      "*.test.ts",
      "*.spec.ts",
      "node_modules/**"
    ],
    "includeTests": false // Include test files in review
  }
}
```

### Security Step

Performs security analysis and vulnerability scanning.

```json
{
  "id": "security",
  "type": "security",
  "name": "Security Review",
  "config": {
    "checklist": [
      // Security checklist items
      "Input validation and sanitization",
      "Authentication and authorization",
      "Data protection and encryption",
      "Security headers",
      "Dependency vulnerabilities"
    ],
    "minSeverity": "medium", // Minimum severity to report
    "excludeTests": true, // Exclude test files
    "checkDependencies": true // Check for vulnerable dependencies
  }
}
```

### Performance Step

Analyzes performance characteristics and optimization opportunities.

```json
{
  "id": "performance",
  "type": "performance",
  "name": "Performance Review",
  "config": {
    "focus": [
      "algorithms", // Algorithm complexity
      "database", // Database queries
      "memory", // Memory usage
      "network", // Network requests
      "bundle", // Bundle size
      "rendering" // Rendering performance
    ],
    "complexityThreshold": "O(n²)", // Alert if complexity exceeds
    "bundleSizeThreshold": "5MB", // Alert if bundle exceeds
    "memoryThreshold": "100MB" // Alert if memory exceeds
  }
}
```

### Test Step

Analyzes test coverage and quality.

```json
{
  "id": "test",
  "type": "test",
  "name": "Test Coverage",
  "config": {
    "coverageThreshold": 80, // Minimum coverage percentage
    "checkQuality": true, // Check test quality
    "checkAssertions": true, // Verify assertions exist
    "includeIntegration": true, // Include integration tests
    "excludePatterns": [
      // Files to exclude
      "*.config.js",
      "*.d.ts",
      "mocks/**"
    ]
  }
}
```

### Custom Step

Execute custom prompts and validation logic.

```json
{
  "id": "custom-check",
  "type": "custom",
  "name": "Custom Standards Check",
  "config": {
    "prompt": "Analyze this code for compliance with our team's coding standards",
    "successCriteria": [
      "No TODO comments",
      "All functions documented",
      "Error handling implemented"
    ],
    "memoryEnabled": true, // Remember previous feedback
    "loopUntilSuccess": true, // Keep trying until success
    "maxLoops": 3, // Maximum retry attempts
    "coderabbitEnabled": false, // Use CodeRabbit instead of AI
    "variables": {
      // Custom variables for substitution
      "team": "frontend",
      "standard": "ES2022"
    }
  }
}
```

## Variable Substitution

In custom steps, you can use variables that will be replaced with feature data:

- `{{featureId}}`: The feature's unique ID
- `{{title}}`: Feature title
- `{{description}}`: Feature description
- `{{status}}`: Current feature status
- `{{model}}`: AI model used
- `{{custom.*}}`: Any custom property from the feature

Example:

```
"prompt": "Review feature {{title}} ({{featureId}}) for {{team}} standards"
```

## Best Practices

1. **Start Simple**: Begin with a basic review step and add complexity gradually
2. **Use Required Steps**: Mark critical checks as required to ensure they pass
3. **Configure Timeouts**: Set appropriate timeouts for complex analyses
4. **Exclude Tests**: Generally exclude test files from review/security checks
5. **Monitor Performance**: Keep an eye on execution time and token usage
6. **Iterate**: Refine your pipeline based on feedback and results

## Troubleshooting

### Pipeline Not Running

- Check if the pipeline is enabled in configuration
- Verify `autoTrigger` is set to `true` for steps
- Check the Auto Mode service is running
- Review logs for error messages

### Steps Failing Unexpectedly

- Review the step output for specific error messages
- Check if the AI model is available and configured
- Verify the step configuration is valid
- Consider increasing timeouts or retry counts

### Performance Issues

- Reduce the number of concurrent steps
- Optimize prompts to be more concise
- Use exclude patterns to limit analysis scope
- Consider caching results for repeated analyses

### Memory Issues

- Disable memory for steps that don't need it
- Clear old pipeline results regularly
- Use result compression for large outputs
- Monitor storage usage in settings

## Advanced Configuration

### Step Dependencies

While steps execute in order by default, you can configure dependencies:

```json
{
  "id": "security",
  "type": "security",
  "dependencies": ["review"],  // Only run after review passes
  "config": { ... }
}
```

### Conditional Execution

Run steps only under certain conditions:

```json
{
  "id": "performance",
  "type": "performance",
  "condition": {
    "field": "category",
    "value": "Performance"
  },
  "config": { ... }
}
```

### Parallel Execution

Enable parallel execution for independent steps:

```json
{
  "parallel": true,
  "maxConcurrency": 3,
  "steps": [...]
}
```

## API Reference

See the [Pipeline API Documentation](./api-reference.md) for detailed API endpoints and usage examples.
