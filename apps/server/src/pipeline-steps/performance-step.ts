/**
 * Performance Pipeline Step Implementation
 * Analyzes performance characteristics including algorithm complexity, memory usage, and optimization opportunities
 */

import type { PipelineStepConfig, PipelineStepResult, Feature } from '@automaker/types';
import type { AutoModeService } from '../services/auto-mode-service.js';

export interface PerformanceStepConfig {
  metrics: ('complexity' | 'memory' | 'database' | 'network' | 'bundle' | 'rendering')[];
  thresholds: {
    cyclomaticComplexity?: number;
    memoryUsage?: string;
    responseTime?: string;
    bundleSize?: string;
  };
  enableProfiling?: boolean;
}

export class PerformanceStep {
  private autoModeService: AutoModeService;

  constructor(autoModeService: AutoModeService) {
    this.autoModeService = autoModeService;
  }

  async execute(
    feature: Feature,
    stepConfig: PipelineStepConfig & { config: PerformanceStepConfig },
    signal: AbortSignal,
    projectPath?: string
  ): Promise<PipelineStepResult> {
    const { config } = stepConfig;
    const prompt = this.buildPerformancePrompt(feature, config);

    try {
      // Get the model to use
      const model = this.autoModeService.getStepModel(feature, stepConfig);

      // Execute the performance analysis using the AI model
      const result = await this.autoModeService.executeAIStep({
        feature,
        stepConfig,
        signal,
        prompt,
        projectPath,
        onProgress: (message) => {
          console.log(`[Performance Step] ${message}`);
        },
      });

      // Parse and validate the result
      const parsedResult = this.parsePerformanceResult(result.output);

      return {
        status: result.status,
        output: result.output,
        issues: parsedResult.issues.map((issue: Record<string, unknown>) => ({
          hash: this.generateIssueHash(issue),
          summary: String(issue.description || issue.title || ''),
          location: issue.file ? `${issue.file}:${issue.line || 0}` : undefined,
          severity: this.mapSeverity(String(issue.severity || issue.impact || 'medium')),
        })),
        metadata: {
          performanceIssues: parsedResult.issues,
          optimizations: parsedResult.optimizations,
          metrics: parsedResult.metrics,
          performanceScore: parsedResult.performanceScore,
        },
      };
    } catch (error) {
      return {
        status: 'failed',
        output: error instanceof Error ? error.message : 'Performance step failed',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  private buildPerformancePrompt(feature: Feature, config: PerformanceStepConfig): string {
    let prompt = `Perform a comprehensive performance analysis of the implemented feature.

Feature Details:
- Title: ${feature.title}
- Description: ${feature.description}
- Status: ${feature.status}

Performance Analysis Areas:
`;

    // Add specific metrics analysis
    if (config.metrics.includes('complexity')) {
      prompt += `
Algorithm Complexity Analysis:
- Identify time complexity of algorithms (O(n), O(n^2), O(log n), etc.)
- Check for nested loops and recursive calls
- Look for N+1 query problems
- Identify potential infinite loops or recursion
- Analyze sorting and searching algorithms
- Check for inefficient data structure usage
`;
    }

    if (config.metrics.includes('memory')) {
      prompt += `
Memory Usage Analysis:
- Check for memory leaks and unreleased resources
- Identify large object allocations
- Look for memory-intensive operations
- Check for proper cleanup and garbage collection
- Analyze memory patterns in loops
- Identify potential stack overflow risks
`;
    }

    if (config.metrics.includes('database')) {
      prompt += `
Database Performance:
- Analyze SQL queries for optimization opportunities
- Check for missing database indexes
- Look for N+1 query patterns
- Identify full table scans
- Check query result caching opportunities
- Analyze transaction usage and locks
`;
    }

    if (config.metrics.includes('network')) {
      prompt += `
Network Performance:
- Check for unnecessary API calls
- Look for request/response payload optimization
- Identify opportunities for batching requests
- Check for proper HTTP caching headers
- Analyze WebSocket usage efficiency
- Look for CDN optimization opportunities
`;
    }

    if (config.metrics.includes('bundle')) {
      prompt += `
Bundle Size Analysis:
- Check for large dependencies and unused imports
- Look for code splitting opportunities
- Analyze asset optimization (images, fonts)
- Check for minification and compression
- Identify tree shaking opportunities
- Look for lazy loading possibilities
`;
    }

    if (config.metrics.includes('rendering')) {
      prompt += `
Rendering Performance:
- Check for unnecessary re-renders
- Look for virtual list implementation
- Analyze CSS performance impacts
- Check for layout thrashing
- Identify animation performance issues
- Look for DOM optimization opportunities
`;
    }

    // Add thresholds
    if (Object.keys(config.thresholds).length > 0) {
      prompt += `
Performance Thresholds:
`;
      if (config.thresholds.cyclomaticComplexity) {
        prompt += `- Maximum cyclomatic complexity: ${config.thresholds.cyclomaticComplexity}\n`;
      }
      if (config.thresholds.memoryUsage) {
        prompt += `- Memory usage threshold: ${config.thresholds.memoryUsage}\n`;
      }
      if (config.thresholds.responseTime) {
        prompt += `- Response time threshold: ${config.thresholds.responseTime}\n`;
      }
      if (config.thresholds.bundleSize) {
        prompt += `- Bundle size threshold: ${config.thresholds.bundleSize}\n`;
      }
    }

    prompt += `
Please provide your performance analysis in the following JSON format:
{
  "summary": "Brief summary of performance characteristics",
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "complexity|memory|database|network|bundle|rendering",
      "file": "file path",
      "line": line_number,
      "title": "Performance issue title",
      "description": "Detailed description of the issue",
      "impact": "Performance impact explanation",
      "recommendation": "How to optimize",
      "estimatedGain": "Expected performance improvement"
    }
  ],
  "optimizations": [
    {
      "priority": "high|medium|low",
      "type": "algorithm|cache|database|network|code",
      "description": "Optimization opportunity",
      "implementation": "How to implement",
      "effort": "low|medium|high",
      "impact": "Expected impact"
    }
  ],
  "metrics": {
    "cyclomaticComplexity": number,
    "memoryUsageMB": number,
    "databaseQueries": number,
    "networkRequests": number,
    "bundleSizeKB": number
  },
  "performanceScore": number (0-100)
}

Focus on identifying real performance bottlenecks that could impact user experience.
`;

    if (config.enableProfiling) {
      prompt += `
Include recommendations for performance profiling tools and techniques that could be used to gather more detailed metrics.
`;
    }

    return prompt;
  }

  private parsePerformanceResult(output: string): {
    issues: Array<Record<string, unknown>>;
    optimizations: Array<Record<string, unknown>>;
    metrics: Record<string, unknown>;
    performanceScore: number;
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
        optimizations: parsed.optimizations || [],
        metrics: parsed.metrics || {},
        performanceScore: parsed.performanceScore || 0,
      };
    } catch (error) {
      console.error('[Performance Step] Failed to parse result:', error);
      return {
        issues: [],
        optimizations: [],
        metrics: {},
        performanceScore: 0,
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
