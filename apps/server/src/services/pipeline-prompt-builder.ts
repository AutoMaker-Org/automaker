/**
 * Pipeline Prompt Builder
 *
 * Generates prompts for different types of pipeline steps
 */

import type {
  PipelineStepConfig,
  ReviewConfig,
  SecurityConfig,
  PerformanceConfig,
  TestConfig,
  CustomConfig,
  AgentModel,
} from '@automaker/types';
import type { Feature } from '@automaker/types';

export class PipelinePromptBuilder {
  /**
   * Build prompt for a specific pipeline step
   */
  async buildPromptForStep(
    feature: Feature,
    stepConfig: PipelineStepConfig,
    memory?: string
  ): Promise<string> {
    switch (stepConfig.type) {
      case 'review':
        return this.buildReviewPrompt(feature, stepConfig.config as ReviewConfig, memory);
      case 'security':
        return this.buildSecurityPrompt(feature, stepConfig.config as SecurityConfig, memory);
      case 'performance':
        return this.buildPerformancePrompt(feature, stepConfig.config as PerformanceConfig, memory);
      case 'test':
        return this.buildTestPrompt(feature, stepConfig.config as TestConfig, memory);
      case 'custom':
        return this.buildCustomPrompt(feature, stepConfig.config as CustomConfig, memory);
      default:
        throw new Error(`Unknown step type: ${stepConfig.type}`);
    }
  }

  /**
   * Build review prompt
   */
  private buildReviewPrompt(feature: Feature, config: ReviewConfig, memory?: string): string {
    const focus = config.focus || ['quality', 'standards', 'bugs'];
    const excludePatterns = config.excludePatterns || [];
    const maxIssues = config.maxIssues || 20;

    let prompt = `## Code Review

You are reviewing a feature implementation for the following areas:
${focus.map((f) => `- ${this.capitalizeFirst(f)}`).join('\n')}

Feature Description: ${feature.description}

`;

    if (excludePatterns.length > 0) {
      prompt += `Exclude files matching: ${excludePatterns.join(', ')}\n\n`;
    }

    if (memory) {
      prompt += `${memory}\n\n`;
    }

    prompt += `## Instructions

Review the implemented code and identify up to ${maxIssues} issues. For each issue:
1. Describe the problem clearly
2. Specify the file and line number
3. Suggest how to fix it
4. Rate severity (low/medium/high)

## Output Format

If no issues found:
[REVIEW_PASSED]
Code review completed successfully. No issues found.

If issues found:
[REVIEW_FAILED]
Issues found:
1. [Issue description] (file:line)
   Severity: [low/medium/high]
   Suggestion: [How to fix]

2. [Additional issue]...
`;

    return prompt;
  }

  /**
   * Build security prompt
   */
  private buildSecurityPrompt(feature: Feature, config: SecurityConfig, memory?: string): string {
    const checklist = config.checklist || [
      'sql-injection',
      'xss',
      'authentication',
      'authorization',
      'data-validation',
      'sensitive-data-exposure',
    ];
    const severity = config.severity || 'medium';

    let prompt = `## Security Review

You are performing a security review of a feature implementation.

Feature Description: ${feature.description}

Security Checklist:
${checklist.map((item) => `- ${this.capitalizeFirst(item.replace(/-/g, ' '))}`).join('\n')}

Minimum severity level: ${severity}

`;

    if (memory) {
      prompt += `${memory}\n\n`;
    }

    prompt += `## Instructions

Analyze the code for security vulnerabilities. Focus on:
- Input validation and sanitization
- Authentication and authorization checks
- SQL injection and XSS vulnerabilities
- Sensitive data handling
- Access control issues

## Output Format

If no security issues found:
[SECURITY_PASSED]
Security review completed. No vulnerabilities found.

If issues found:
[SECURITY_FAILED]
Vulnerabilities found:
1. [Vulnerability type]: [Description] (file:line)
   Severity: [low/medium/high/critical]
   Impact: [Potential impact]
   Fix: [How to fix]

2. [Additional vulnerability]...
`;

    return prompt;
  }

  /**
   * Build performance prompt
   */
  private buildPerformancePrompt(
    feature: Feature,
    config: PerformanceConfig,
    memory?: string
  ): string {
    const metrics = config.metrics || ['complexity', 'memory', 'cpu'];
    const thresholds = config.thresholds || {};

    let prompt = `## Performance Review

You are analyzing the performance of a feature implementation.

Feature Description: ${feature.description}

Performance Metrics to Check:
${metrics.map((m) => `- ${this.capitalizeFirst(m)}`).join('\n')}

`;

    if (Object.keys(thresholds).length > 0) {
      prompt += `Thresholds:\n${Object.entries(thresholds)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')}\n\n`;
    }

    if (memory) {
      prompt += `${memory}\n\n`;
    }

    prompt += `## Instructions

Analyze the code for performance issues:
- Algorithm complexity and efficiency
- Memory usage patterns
- Database query optimization
- Network request efficiency
- Bundle size impact

## Output Format

If no performance issues found:
[PERFORMANCE_PASSED]
Performance review completed. No issues found.

If issues found:
[PERFORMANCE_FAILED]
Performance issues found:
1. [Issue type]: [Description] (file:line)
   Impact: [High/Medium/Low]
   Recommendation: [How to optimize]

2. [Additional issue]...
`;

    return prompt;
  }

  /**
   * Build test prompt
   */
  private buildTestPrompt(feature: Feature, config: TestConfig, memory?: string): string {
    const coverageThreshold = config.coverageThreshold || 80;
    const checkQuality = config.checkQuality !== false;
    const checkAssertions = config.checkAssertions !== false;

    let prompt = `## Test Review

You are reviewing the test coverage and quality for a feature implementation.

Feature Description: ${feature.description}
Required Coverage: ${coverageThreshold}%

`;

    if (memory) {
      prompt += `${memory}\n\n`;
    }

    prompt += `## Instructions

Review the test suite for:
- Code coverage (target: ${coverageThreshold}%)
- Test quality and clarity
- Assertion completeness
- Edge case coverage
- Integration test coverage

${checkQuality ? '- Test naming and structure' : ''}
${checkAssertions ? '- Assertion quality and completeness' : ''}

## Output Format

If tests are adequate:
[TEST_PASSED]
Test review completed. Coverage meets requirements.

If issues found:
[TEST_FAILED]
Test issues found:
1. [Issue type]: [Description]
   Location: [file or general]
   Fix: [How to improve]

2. [Additional issue]...
`;

    return prompt;
  }

  /**
   * Build custom prompt
   */
  private buildCustomPrompt(feature: Feature, config: CustomConfig, memory?: string): string {
    let prompt = config.prompt || '';

    // Replace template variables
    prompt = prompt.replace(/\{\{feature\.description\}\}/g, feature.description);
    prompt = prompt.replace(/\{\{feature\.id\}\}/g, feature.id);
    prompt = prompt.replace(/\{\{feature\.category\}\}/g, feature.category);
    prompt = prompt.replace(/\{\{feature\.title\}\}/g, feature.title || 'Untitled');

    if (memory) {
      prompt += `\n\n${memory}`;
    }

    // Add success criteria if specified
    if (config.successCriteria) {
      prompt += `\n\n## Success Criteria\n${config.successCriteria}`;
    }

    return prompt;
  }

  /**
   * Build memory context for iterative steps
   */
  buildMemoryContext(
    iteration: number,
    previousIssues: Array<{ summary: string; location?: string }>
  ): string {
    if (iteration === 0 || previousIssues.length === 0) {
      return '';
    }

    return `## Previous Feedback (Iteration ${iteration})
Please review these previous comments and DO NOT repeat them:
${previousIssues
  .map(
    (issue) =>
      `- ${issue.summary}${issue.location ? ` (${issue.location})` : ''} (already addressed)`
  )
  .join('\n')}

Focus on NEW issues only.`;
  }

  /**
   * Capitalize first letter of each word
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
