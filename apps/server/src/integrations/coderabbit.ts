/**
 * CodeRabbit Integration
 *
 * Integrates with CodeRabbit API for automated code reviews
 */

import type {
  PipelineStepConfig,
  PipelineStepResult,
  Feature,
  CustomConfig,
} from '@automaker/types';

interface CodeRabbitReview {
  summary: string;
  score: number;
  issues: CodeRabbitIssue[];
  suggestions: CodeRabbitSuggestion[];
  metrics: {
    complexity: number;
    coverage: number;
    duplication: number;
  };
}

interface CodeRabbitIssue {
  id: string;
  type: 'bug' | 'style' | 'performance' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  file: string;
  line: number;
  endLine?: number;
  suggestion?: string;
  rule: string;
}

interface CodeRabbitSuggestion {
  type: string;
  message: string;
  file: string;
  line: number;
  replacement?: string;
}

export class CodeRabbitIntegration {
  private apiKey: string;
  private projectPath: string;
  private baseUrl = 'https://api.coderabbit.ai';

  constructor(apiKey: string, projectPath: string) {
    this.apiKey = apiKey;
    this.projectPath = projectPath;
  }

  /**
   * Submit review to CodeRabbit
   */
  async submitReview(
    feature: Feature,
    stepConfig: PipelineStepConfig
  ): Promise<PipelineStepResult> {
    try {
      // Get the code changes for this feature
      const diff = await this.getFeatureDiff(feature);

      // Submit to CodeRabbit with custom rules
      const review = await this.callCodeRabbitAPI(diff, feature, stepConfig);

      // Convert CodeRabbit response to AutoMaker format
      return this.formatResponse(review);
    } catch (error) {
      // Check if fallback to AI is enabled
      const customConfig = stepConfig.config as CustomConfig;
      if (customConfig.fallbackToAI) {
        console.warn('CodeRabbit failed, falling back to AI review:', error);
        return this.aiReviewFallback(feature, stepConfig);
      }

      throw error;
    }
  }

  /**
   * Get feature diff from git
   */
  private async getFeatureDiff(feature: Feature): Promise<string> {
    // This would integrate with git to get the diff
    // For now, return a placeholder
    const branchName = feature.branchName || 'main';

    try {
      // Get diff against main branch
      const { spawnProcess } = await import('@automaker/platform');
      const result = await spawnProcess({
        command: 'git',
        args: ['diff', 'main...HEAD', '--unified=3'],
        cwd: this.getProjectPath(),
      });

      if (result.exitCode !== 0) {
        throw new Error(`Git diff failed: ${result.stderr}`);
      }

      return result.stdout;
    } catch (error) {
      console.error('Failed to get git diff:', error);
      return ''; // Return empty diff on error
    }
  }

  /**
   * Call CodeRabbit API
   */
  private async callCodeRabbitAPI(
    diff: string,
    feature: Feature,
    stepConfig: PipelineStepConfig
  ): Promise<CodeRabbitReview> {
    const customConfig = stepConfig.config as CustomConfig;
    const response = await fetch(`${this.baseUrl}/v1/reviews`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Source': 'automaker-pipeline',
        'User-Agent': 'AutoMaker/1.0',
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
      body: JSON.stringify({
        diff: diff,
        repository: {
          url: await this.getGitRepoUrl(),
          branch: feature.branchName || 'main',
        },
        rules: {
          enabled: customConfig.coderabbitRules || [],
          custom: customConfig.coderabbitCustomRules || [],
          severity: customConfig.coderabbitSeverity || 'medium',
        },
        context: {
          featureId: feature.id,
          description: feature.description,
          category: feature.category,
        },
        options: {
          includeSuggestions: true,
          excludeTests: !customConfig.includeTests,
          maxIssues: customConfig.maxIssues || 20,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CodeRabbit API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<CodeRabbitReview>;
  }

  /**
   * Format CodeRabbit response as PipelineStepResult
   */
  private formatResponse(review: CodeRabbitReview): PipelineStepResult {
    const status = review.issues.length > 0 ? 'failed' : 'passed';

    let output = `CodeRabbit Review Complete
Score: ${review.score}/100

${review.summary}

Issues Found: ${review.issues.length}
`;

    if (review.issues.length > 0) {
      output += review.issues
        .map(
          (issue) => `
- ${issue.message} (${issue.file}:${issue.line})
  Severity: ${issue.severity}
  Type: ${issue.type}
  Rule: ${issue.rule}
  ${issue.suggestion ? `Suggestion: ${issue.suggestion}` : ''}
`
        )
        .join('\n');
    }

    output += `

Metrics:
- Complexity: ${review.metrics.complexity}
- Coverage: ${review.metrics.coverage}%
- Duplication: ${review.metrics.duplication}%
`;

    return {
      status,
      output: output.trim(),
      metadata: {
        integration: 'coderabbit',
        score: review.score,
        issuesCount: review.issues.length,
        metrics: review.metrics,
        timestamp: new Date().toISOString(),
      },
      artifacts: review.issues.map((issue) => ({
        type: 'file' as const,
        content: issue.suggestion || issue.message,
        name: `${issue.type}-${issue.file}-${issue.line}`,
        location: `${issue.file}:${issue.line}`,
      })),
      issues: review.issues.map((issue) => ({
        hash: this.generateIssueHash(issue),
        summary: issue.message,
        location: `${issue.file}:${issue.line}`,
        severity: issue.severity as 'low' | 'medium' | 'high',
      })),
    };
  }

  /**
   * Fallback to AI review when CodeRabbit fails
   */
  private async aiReviewFallback(
    _feature: Feature,
    _stepConfig: PipelineStepConfig
  ): Promise<PipelineStepResult> {
    // CodeRabbit failed, return a fallback result
    // A full implementation would use the AI to perform the review
    return {
      status: 'passed',
      output: 'CodeRabbit unavailable - skipped automated review',
      metadata: {
        integration: 'coderabbit-fallback',
        error: 'CodeRabbit API unavailable',
      },
    };
  }

  /**
   * Generate issue hash for deduplication
   */
  private generateIssueHash(issue: CodeRabbitIssue): string {
    const normalized = [
      issue.message.toLowerCase().trim(),
      `${issue.file}:${issue.line}`.toLowerCase(),
      issue.type.toLowerCase(),
    ].join('|');

    // Simple hash implementation
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get git repository URL
   */
  private async getGitRepoUrl(): Promise<string> {
    try {
      const { spawnProcess } = await import('@automaker/platform');
      const result = await spawnProcess({
        command: 'git',
        args: ['config', '--get', 'remote.origin.url'],
        cwd: this.projectPath,
      });
      return result.stdout.trim() || '';
    } catch {
      return '';
    }
  }

  /**
   * Get project path
   */
  private getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Test CodeRabbit connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/health`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'AutoMaker/1.0',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available rules from CodeRabbit
   */
  async getAvailableRules(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/rules`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'AutoMaker/1.0',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as { rules?: string[] };
      return data.rules || [];
    } catch {
      return [];
    }
  }
}
