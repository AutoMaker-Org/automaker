/**
 * Review Pipeline Step Implementation
 * Performs code quality checks, standards compliance, bug detection, and best practices validation
 */

import type { PipelineStepConfig, PipelineStepResult, Feature } from '@automaker/types';
import type { AutoModeService } from '../services/auto-mode-service.js';

export interface ReviewStepConfig {
  focus: ('quality' | 'standards' | 'bugs' | 'best-practices')[];
  maxIssues: number;
  excludePatterns?: string[];
  includeTests?: boolean;
}

export class ReviewStep {
  private autoModeService: AutoModeService;

  constructor(autoModeService: AutoModeService) {
    this.autoModeService = autoModeService;
  }

  async execute(
    feature: Feature,
    stepConfig: PipelineStepConfig & { config: ReviewStepConfig },
    signal: AbortSignal,
    projectPath?: string
  ): Promise<PipelineStepResult> {
    const { config } = stepConfig;
    const prompt = this.buildReviewPrompt(feature, config);

    try {
      // Get the model to use
      const model = this.autoModeService.getStepModel(feature, stepConfig);

      // Execute the review using the AI model
      const result = await this.autoModeService.executeAIStep({
        feature,
        stepConfig,
        signal,
        prompt,
        projectPath,
        onProgress: (message) => {
          console.log(`[Review Step] ${message}`);
        },
      });

      // Parse and validate the result
      const parsedResult = this.parseReviewResult(result.output);

      return {
        status: result.status,
        output: result.output,
        issues: parsedResult.issues.map((issue: Record<string, unknown>) => ({
          hash: this.generateIssueHash(issue),
          summary: String(issue.description || ''),
          location: issue.file ? `${issue.file}:${issue.line || 0}` : undefined,
          severity: (issue.severity as 'low' | 'medium' | 'high') || 'medium',
        })),
        metadata: {
          suggestions: parsedResult.suggestions,
          metrics: parsedResult.metrics,
        },
      };
    } catch (error) {
      return {
        status: 'failed',
        output: error instanceof Error ? error.message : 'Review step failed',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  private buildReviewPrompt(feature: Feature, config: ReviewStepConfig): string {
    const focusAreas = config.focus
      .map((area) => {
        switch (area) {
          case 'quality':
            return 'code quality (readability, maintainability, complexity)';
          case 'standards':
            return 'coding standards compliance (naming conventions, structure, patterns)';
          case 'bugs':
            return 'potential bugs and error handling issues';
          case 'best-practices':
            return 'best practices and design patterns';
          default:
            return area;
        }
      })
      .join(', ');

    let prompt = `Please review the implemented feature for the following areas: ${focusAreas}.

Feature Details:
- Title: ${feature.title}
- Description: ${feature.description}
- Status: ${feature.status}

`;

    // Add specific focus instructions
    if (config.focus.includes('quality')) {
      prompt += `
Code Quality Review:
- Check for code readability and maintainability
- Identify overly complex code (high cyclomatic complexity)
- Look for code duplication and redundancy
- Verify proper error handling patterns
- Check for appropriate use of data structures and algorithms
`;
    }

    if (config.focus.includes('standards')) {
      prompt += `
Standards Compliance:
- Verify naming conventions (variables, functions, classes, files)
- Check code structure and organization
- Ensure consistent formatting and indentation
- Validate proper use of language features
- Check for adherence to project-specific standards
`;
    }

    if (config.focus.includes('bugs')) {
      prompt += `
Bug Detection:
- Look for null/undefined reference errors
- Check for race conditions and concurrency issues
- Identify potential memory leaks
- Verify proper input validation and sanitization
- Check for off-by-one errors and boundary conditions
- Look for unhandled promise rejections
`;
    }

    if (config.focus.includes('best-practices')) {
      prompt += `
Best Practices:
- Verify SOLID principles adherence
- Check for appropriate design patterns usage
- Ensure proper separation of concerns
- Look for adequate documentation and comments
- Verify proper testing approach
- Check for security best practices
`;
    }

    // Add configuration options
    if (config.excludePatterns && config.excludePatterns.length > 0) {
      prompt += `
Exclude the following files/patterns from review:
${config.excludePatterns.join('\n')}
`;
    }

    if (!config.includeTests) {
      prompt += `
Exclude test files from the review unless they contain production code.
`;
    }

    prompt += `
Please provide your review in the following JSON format:
{
  "summary": "Brief summary of the review",
  "issues": [
    {
      "severity": "high|medium|low",
      "category": "quality|standards|bugs|best-practices",
      "file": "file path",
      "line": line_number,
      "description": "Issue description",
      "suggestion": "How to fix it"
    }
  ],
  "suggestions": [
    {
      "type": "improvement|optimization|refactor",
      "description": "Suggestion description",
      "benefit": "Why this should be implemented"
    }
  ],
  "metrics": {
    "totalIssues": number,
    "criticalIssues": number,
    "codeQualityScore": number (0-100)
  }
}

Limit the issues to the ${config.maxIssues} most important ones.
`;

    return prompt;
  }

  private parseReviewResult(output: string): {
    issues: Array<Record<string, unknown>>;
    suggestions: Array<Record<string, unknown>>;
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
        issues: parsed.issues || [],
        suggestions: parsed.suggestions || [],
        metrics: parsed.metrics || {},
      };
    } catch (error) {
      console.error('[Review Step] Failed to parse result:', error);
      return {
        issues: [],
        suggestions: [],
        metrics: {},
      };
    }
  }

  private generateIssueHash(issue: Record<string, unknown>): string {
    const normalized = [
      String(issue.description || '')
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
}
