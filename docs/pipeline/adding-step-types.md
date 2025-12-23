# Adding New Pipeline Step Types

## Overview

The pipeline system is designed to be extensible, allowing you to add custom step types for specialized analysis and validation. This guide walks through creating a new step type from scratch.

## Step Type Architecture

### Base Class

All step types extend the `PipelineStep` base class:

```typescript
import { PipelineStep } from './base-step.js';
import type { PipelineStepConfig, PipelineStepResult, Feature } from '@automaker/types';

export class CustomStepType extends PipelineStep {
  constructor(autoModeService: AutoModeService) {
    super(autoModeService);
  }

  async execute(
    feature: Feature,
    stepConfig: PipelineStepConfig,
    signal: AbortSignal
  ): Promise<PipelineStepResult> {
    // Implementation here
  }

  protected buildPrompt(feature: Feature, stepConfig: PipelineStepConfig): string {
    // Build prompt for AI model
  }

  protected parseResult(output: string, stepConfig: PipelineStepConfig): PipelineStepResult {
    // Parse AI model response
  }
}
```

### Required Methods

1. **execute()**: Main execution method
2. **buildPrompt()**: Generate the AI prompt
3. **parseResult()**: Parse the AI response

## Creating a New Step Type

### Step 1: Define Configuration Interface

Create a type for your step's configuration:

```typescript
// src/pipeline-steps/types/my-step.ts
export interface MyStepConfig {
  targetArea: string;
  threshold: number;
  options: string[];
  customFlag: boolean;
}
```

### Step 2: Implement the Step Class

```typescript
// src/pipeline-steps/my-step.ts
import { PipelineStep } from './base-step.js';
import type { AutoModeService } from '../services/auto-mode-service.js';
import type { PipelineStepConfig, PipelineStepResult, Feature } from '@automaker/types';
import type { MyStepConfig } from './types/my-step.js';

export class MyStep extends PipelineStep {
  constructor(autoModeService: AutoModeService) {
    super(autoModeService);
  }

  async execute(
    feature: Feature,
    stepConfig: PipelineStepConfig,
    signal: AbortSignal
  ): Promise<PipelineStepResult> {
    // Check for abort signal
    if (signal.aborted) {
      return {
        status: 'failed',
        output: 'Step execution was aborted',
        error: 'aborted',
      };
    }

    // Build the prompt
    const prompt = this.buildPrompt(feature, stepConfig);

    // Execute with AI model
    const response = await this.autoModeService.executeModelPrompt(
      prompt,
      this.getModelForStep(feature, stepConfig),
      {
        signal,
        temperature: 0.3,
        maxTokens: 4000,
      }
    );

    // Parse the result
    return this.parseResult(response.content, stepConfig);
  }

  protected buildPrompt(feature: Feature, stepConfig: PipelineStepConfig): string {
    const config = stepConfig.config as MyStepConfig;

    return `
You are performing a custom analysis on the following feature:

Feature: ${feature.title}
Description: ${feature.description}

Analysis Requirements:
- Target Area: ${config.targetArea}
- Threshold: ${config.threshold}
- Options: ${config.options.join(', ')}

Please analyze the code and provide:
1. A summary of findings
2. Any issues found (if any)
3. Recommendations for improvement

Format your response as follows:
${this.getResultFormat()}
    `.trim();
  }

  protected parseResult(output: string, stepConfig: PipelineStepConfig): PipelineStepResult {
    const config = stepConfig.config as MyStepConfig;

    // Check for explicit pass/fail
    if (output.includes('[MYSTEP_PASSED]')) {
      return {
        status: 'passed',
        output,
        metrics: {
          threshold: config.threshold,
          targetArea: config.targetArea,
        },
      };
    }

    if (output.includes('[MYSTEP_FAILED]')) {
      // Extract issues
      const issues = this.extractIssues(output);

      return {
        status: 'failed',
        output,
        issues,
        metrics: {
          threshold: config.threshold,
          targetArea: config.targetArea,
          issuesFound: issues.length,
        },
      };
    }

    // Default to passed if no explicit markers
    return {
      status: 'passed',
      output,
      metrics: {
        threshold: config.threshold,
        targetArea: config.targetArea,
      },
    };
  }

  private extractIssues(output: string): Array<{
    severity: string;
    summary: string;
    description: string;
    suggestion?: string;
  }> {
    const issues: any[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^\d+\.\s+(.+?):\s+(.+)$/);
      if (match) {
        issues.push({
          severity: 'medium',
          summary: match[1],
          description: match[2],
        });
      }
    }

    return issues;
  }

  private getResultFormat(): string {
    return `
[MYSTEP_PASSED] if no issues found
[MYSTEP_FAILED] if issues found

For issues, list as:
1. Issue Title: Description
2. Issue Title: Description
    `.trim();
  }
}
```

### Step 3: Register the Step Type

Update the pipeline step executor to include your new step:

```typescript
// src/services/pipeline-step-executor.ts
import { MyStep } from '../pipeline-steps/my-step.js';

export class PipelineStepExecutor extends EventEmitter {
  private myStep: MyStep;

  constructor(autoModeService: AutoModeService) {
    super();
    // ... other initialization
    this.myStep = new MyStep(autoModeService);
  }

  async executeStep(context: StepExecutionContext): Promise<PipelineStepResult> {
    const { feature, stepConfig, signal, onProgress, onStatusChange } = context;

    // ... existing code

    switch (stepConfig.type) {
      // ... existing cases
      case 'my-step':
        result = await this.myStep.execute(feature, stepConfig as any, signal);
        break;
      default:
        throw new Error(`Unknown step type: ${stepConfig.type}`);
    }

    // ... rest of method
  }
}
```

### Step 4: Update Type Definitions

Add your step type to the type definitions:

```typescript
// src/types/pipeline.ts
export type PipelineStepType =
  | 'review'
  | 'security'
  | 'performance'
  | 'test'
  | 'custom'
  | 'my-step'; // Add your type
```

### Step 5: Add Validation Schema

Update the configuration validation:

```typescript
// src/services/pipeline-config-service.ts
private validateStepConfig(step: any, index: number): string[] {
  const errors: string[] = [];

  // ... existing validation

  if (step.type === 'my-step') {
    if (!step.config?.targetArea) {
      errors.push(`step ${index}: my-step requires targetArea`);
    }
    if (typeof step.config?.threshold !== 'number') {
      errors.push(`step ${index}: my-step threshold must be a number`);
    }
  }

  return errors;
}
```

## Advanced Features

### Memory System

Enable memory for your step to remember previous feedback:

```typescript
export class MyStep extends PipelineStep {
  private memory: PipelineMemory;

  constructor(autoModeService: AutoModeService) {
    super(autoModeService);
    this.memory = new PipelineMemory();
  }

  async execute(feature: Feature, stepConfig: PipelineStepConfig, signal: AbortSignal) {
    const config = stepConfig.config as MyStepConfig;

    // Load previous feedback if memory is enabled
    let memoryContext = '';
    if (config.memoryEnabled) {
      const previousFeedback = await this.memory.loadMemory(stepConfig.id, feature.id);
      if (previousFeedback) {
        memoryContext = `\n\nPrevious Feedback:\n${previousFeedback.output}\n\nPlease address these issues in your analysis.`;
      }
    }

    // Include memory in prompt
    const prompt = this.buildPrompt(feature, stepConfig) + memoryContext;

    // ... execute and parse result

    // Save to memory if enabled
    if (config.memoryEnabled && result.status === 'failed') {
      await this.memory.saveMemory(stepConfig.id, feature.id, result, config.persistAcrossFeatures);
    }

    return result;
  }
}
```

### Loop Until Success

Implement retry logic for custom steps:

```typescript
async execute(feature: Feature, stepConfig: PipelineStepConfig, signal: AbortSignal) {
  const config = stepConfig.config as MyStepConfig;
  let result: PipelineStepResult;
  let iterations = 0;

  do {
    iterations++;

    // Build prompt with iteration context
    const prompt = this.buildPrompt(feature, stepConfig, iterations);

    // Execute
    const response = await this.autoModeService.executeModelPrompt(prompt, model, options);
    result = this.parseResult(response.content, stepConfig);

    // Check if we should continue
    if (result.status === 'passed' || !config.loopUntilSuccess) {
      break;
    }

    // Check max loops
    if (iterations >= config.maxLoops) {
      result.output += `\n\nMax iterations (${config.maxLoops}) reached.`;
      break;
    }

    // Add feedback to next iteration
    if (config.memoryEnabled) {
      await this.memory.saveMemory(stepConfig.id, feature.id, {
        output: result.output,
        iteration: iterations,
      });
    }

  } while (!signal.aborted);

  result.iteration = iterations;
  return result;
}
```

### External Tool Integration

Integrate with external tools like CodeRabbit:

```typescript
async execute(feature: Feature, stepConfig: PipelineStepConfig, signal: AbortSignal) {
  const config = stepConfig.config as MyStepConfig;

  // Check for external tool integration
  if (config.coderabbitEnabled) {
    return this.executeWithCodeRabbit(feature, stepConfig, signal);
  }

  // Default AI execution
  return this.executeWithAI(feature, stepConfig, signal);
}

private async executeWithCodeRabbit(
  feature: Feature,
  stepConfig: PipelineStepConfig,
  signal: AbortSignal
): Promise<PipelineStepResult> {
  const codeRabbit = new CodeRabbitIntegration({
    apiKey: process.env.CODERABBIT_API_KEY,
  });

  return await codeRabbit.reviewCode({
    projectPath: feature.projectPath,
    featureId: feature.id,
    rules: stepConfig.config.rules,
  });
}
```

## Testing Your Step

### Unit Tests

```typescript
// src/__tests__/pipeline/my-step.test.ts
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { MyStep } from '../../pipeline-steps/my-step.js';

describe('My Step', () => {
  let myStep: MyStep;
  let mockAutoModeService: any;

  beforeEach(() => {
    mockAutoModeService = {
      executeModelPrompt: mock(() => Promise.resolve({ content: '[MYSTEP_PASSED]' })),
    };
    myStep = new MyStep(mockAutoModeService);
  });

  it('should execute successfully', async () => {
    const feature = { id: 'test', title: 'Test' };
    const stepConfig = {
      id: 'my-step',
      type: 'my-step',
      config: { targetArea: 'test', threshold: 10 },
    };

    const result = await myStep.execute(feature, stepConfig, new AbortController().signal);

    expect(result.status).toBe('passed');
    expect(mockAutoModeService.executeModelPrompt).toHaveBeenCalled();
  });

  it('should parse failed results', () => {
    const output = '[MYSTEP_FAILED]\n1. Issue 1: Description';
    const stepConfig = { config: { targetArea: 'test' } };

    const result = myStep['parseResult'](output, stepConfig);

    expect(result.status).toBe('failed');
    expect(result.issues).toHaveLength(1);
  });
});
```

### Integration Tests

```typescript
// src/__tests__/pipeline/my-step-integration.test.ts
describe('My Step Integration', () => {
  it('should work in pipeline execution', async () => {
    const pipelineConfig = {
      steps: [
        {
          id: 'my-step',
          type: 'my-step',
          config: { targetArea: 'test', threshold: 5 },
        },
      ],
    };

    // Execute pipeline and verify results
    const result = await executePipeline(feature, pipelineConfig);
    expect(result.steps['my-step'].status).toBeDefined();
  });
});
```

## Best Practices

1. **Clear Naming**: Use descriptive names for your step type and configuration
2. **Type Safety**: Define clear TypeScript interfaces for configuration
3. **Error Handling**: Handle all error cases gracefully
4. **Documentation**: Document all configuration options
5. **Testing**: Write comprehensive unit and integration tests
6. **Performance**: Consider token usage and execution time
7. **Extensibility**: Design for future enhancements

## Example: Compliance Step

Here's a complete example of a compliance checking step:

```typescript
// src/pipeline-steps/compliance-step.ts
export class ComplianceStep extends PipelineStep {
  async execute(feature: Feature, stepConfig: PipelineStepConfig, signal: AbortSignal) {
    const config = stepConfig.config as ComplianceConfig;

    const prompt = `
Review this feature for compliance with ${config.standard}.

Compliance Requirements:
${config.requirements.map((req) => `- ${req}`).join('\n')}

Check List:
${config.checklist.map((item) => `[ ] ${item}`).join('\n')}

${this.getComplianceFormat()}
    `;

    const response = await this.autoModeService.executeModelPrompt(prompt, model, options);
    return this.parseComplianceResult(response.content, config);
  }

  private parseComplianceResult(output: string, config: ComplianceConfig) {
    const passed = output.includes('[COMPLIANCE_PASSED]');
    const checklist = this.parseChecklist(output);

    return {
      status: passed ? 'passed' : 'failed',
      output,
      metrics: {
        standard: config.standard,
        complianceScore: (checklist.passed / checklist.total) * 100,
        itemsChecked: checklist.total,
        itemsPassed: checklist.passed,
      },
    };
  }
}

interface ComplianceConfig {
  standard: string;
  requirements: string[];
  checklist: string[];
  evidenceRequired: boolean;
}
```
