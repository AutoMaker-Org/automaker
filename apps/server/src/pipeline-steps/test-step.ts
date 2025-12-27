/**
 * Test Pipeline Step Implementation
 * Analyzes test coverage, quality, and identifies missing test cases
 */

import type { PipelineStepConfig, PipelineStepResult, Feature } from '@automaker/types';
import type { AutoModeService } from '../services/auto-mode-service.js';

export interface TestStepConfig {
  coverageThreshold: number;
  checkQuality: boolean;
  checkAssertions: boolean;
  includeIntegration: boolean;
  excludePatterns?: string[];
}

export class TestStep {
  private autoModeService: AutoModeService;

  constructor(autoModeService: AutoModeService) {
    this.autoModeService = autoModeService;
  }

  async execute(
    feature: Feature,
    stepConfig: PipelineStepConfig & { config: TestStepConfig },
    signal: AbortSignal,
    projectPath?: string
  ): Promise<PipelineStepResult> {
    const { config } = stepConfig;
    const prompt = this.buildTestPrompt(feature, config);

    try {
      // Execute the test analysis using the AI model
      const result = await this.autoModeService.executeAIStep({
        feature,
        stepConfig,
        signal,
        prompt,
        projectPath,
        onProgress: (message) => {
          console.log(`[Test Step] ${message}`);
        },
      });

      // Parse and validate the result
      const parsedResult = this.parseTestResult(result.output);

      // Check if coverage threshold is met
      const coverage = Number(parsedResult.metrics.coverage) || 0;
      const coverageMet = coverage >= config.coverageThreshold;

      return {
        status: coverageMet ? 'passed' : 'failed',
        output: result.output,
        issues: parsedResult.issues.map((issue: Record<string, unknown>) => ({
          hash: this.generateIssueHash(issue),
          summary: String(issue.description || issue.title || ''),
          location: issue.file ? `${issue.file}:${issue.line || 0}` : undefined,
          severity: this.mapSeverity(String(issue.severity || 'medium')),
        })),
        metadata: {
          coverage: parsedResult.coverage,
          missingTests: parsedResult.missingTests,
          testIssues: parsedResult.issues,
          metrics: parsedResult.metrics,
        },
      };
    } catch (error) {
      return {
        status: 'failed',
        output: error instanceof Error ? error.message : 'Test step failed',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  private buildTestPrompt(feature: Feature, config: TestStepConfig): string {
    let prompt = `Perform a comprehensive test analysis of the implemented feature.

Feature Details:
- Title: ${feature.title}
- Description: ${feature.description}
- Status: ${feature.status}

Test Analysis Requirements:
- Minimum coverage threshold: ${config.coverageThreshold}%
- Check test quality: ${config.checkQuality}
- Verify assertions: ${config.checkAssertions}
- Include integration tests: ${config.includeIntegration}
`;

    if (config.excludePatterns && config.excludePatterns.length > 0) {
      prompt += `
Exclude the following files/patterns from coverage analysis:
${config.excludePatterns.join('\n')}
`;
    }

    prompt += `
Please analyze the codebase and provide your test analysis in the following JSON format:
{
  "summary": "Brief summary of test coverage and quality",
  "coverage": {
    "overall": number (percentage),
    "statements": number,
    "branches": number,
    "functions": number,
    "lines": number,
    "uncoveredFiles": [
      {
        "file": "file path",
        "uncoveredLines": [line_numbers],
        "coveragePercentage": number
      }
    ]
  },
  "missingTests": [
    {
      "file": "file path",
      "function": "function name",
      "type": "unit|integration|e2e",
      "priority": "high|medium|low",
      "description": "What test is missing",
      "example": "Example test code snippet"
    }
  ],
  "issues": [
    {
      "severity": "high|medium|low",
      "category": "coverage|quality|assertion|structure",
      "file": "test file path",
      "line": line_number,
      "description": "Issue description",
      "recommendation": "How to fix"
    }
  ],
  "metrics": {
    "totalTests": number,
    "unitTests": number,
    "integrationTests": number,
    "e2eTests": number,
    "coverage": number,
    "testQualityScore": number (0-100),
    "assertionCount": number,
    "mockUsage": number
  },
  "recommendations": [
    {
      "type": "coverage|quality|structure|tools",
      "description": "Recommendation description",
      "implementation": "How to implement"
    }
  ]
}
`;

    if (config.checkQuality) {
      prompt += `
Test Quality Checks:
- Verify descriptive test names that explain what is being tested
- Check for proper setup and teardown
- Look for test isolation and independence
- Verify meaningful assertions with clear messages
- Check for edge case testing
- Look for proper mocking and stubbing
- Verify test organization and structure
`;
    }

    if (config.checkAssertions) {
      prompt += `
Assertion Verification:
- Check for sufficient assertions in each test
- Verify assertions test the right behavior
- Look for assertion message clarity
- Check for positive and negative test cases
- Verify boundary condition testing
- Look for error handling verification
`;
    }

    if (config.includeIntegration) {
      prompt += `
Integration Test Analysis:
- Check for API endpoint testing
- Verify database interaction testing
- Look for external service integration tests
- Check for workflow testing
- Verify end-to-end scenarios
`;
    }

    prompt += `
Focus on identifying critical gaps in test coverage that could lead to production issues.
Prioritize missing tests for core business logic and error handling scenarios.
`;

    return prompt;
  }

  private parseTestResult(output: string): {
    coverage: Record<string, unknown>;
    missingTests: Array<Record<string, unknown>>;
    issues: Array<Record<string, unknown>>;
    metrics: Record<string, unknown>;
  } {
    try {
      // Try to extract JSON from the output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in output');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        coverage: parsed.coverage || {},
        missingTests: parsed.missingTests || [],
        issues: parsed.issues || [],
        metrics: parsed.metrics || {},
      };
    } catch (error) {
      console.error('[Test Step] Failed to parse result:', error);
      return {
        coverage: {},
        missingTests: [],
        issues: [],
        metrics: {},
      };
    }
  }

  private generateIssueHash(issue: Record<string, unknown>): string {
    const normalized = [
      String(issue.description || issue.title || '')
        .toLowerCase()
        .trim(),
      String(issue.file || '').toLowerCase(),
      String(issue.line || 0),
      String(issue.category || '').toLowerCase(),
    ].join('|');

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private mapSeverity(severity: string): 'low' | 'medium' | 'high' {
    switch (severity.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      default:
        return 'low';
    }
  }
}
