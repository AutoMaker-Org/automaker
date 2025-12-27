/**
 * Unit Tests: Pipeline Step Implementations
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ReviewStep } from '../../pipeline-steps/review-step.js';
import { SecurityStep } from '../../pipeline-steps/security-step.js';
import { PerformanceStep } from '../../pipeline-steps/performance-step.js';
import { TestStep } from '../../pipeline-steps/test-step.js';
import { CustomStep } from '../../pipeline-steps/custom-step.js';
import type { PipelineStepConfig, Feature } from '@automaker/types';

// Mock AutoModeService
const mockAutoModeService = {
  executeModelPrompt: mock(() => Promise.resolve({ content: 'Test response' })),
  emit: mock(() => {}),
} as any;

describe('Review Step', () => {
  let reviewStep: ReviewStep;
  let mockFeature: Feature;
  let mockStepConfig: PipelineStepConfig;

  beforeEach(() => {
    reviewStep = new ReviewStep(mockAutoModeService);

    mockFeature = {
      id: 'test-feature',
      title: 'Test Feature',
      description: 'Test description',
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockStepConfig = {
      id: 'review',
      type: 'review',
      name: 'Code Review',
      model: 'opus',
      required: true,
      autoTrigger: true,
      config: {
        focus: ['quality', 'standards'],
        maxIssues: 10,
        excludePatterns: ['*.test.ts'],
      },
    };
  });

  describe('buildReviewPrompt', () => {
    it('should build prompt with all focus areas', () => {
      const prompt = reviewStep['buildReviewPrompt'](mockFeature, mockStepConfig as any);

      expect(prompt).toContain('You are conducting a code review');
      expect(prompt).toContain('Focus Areas: quality, standards');
      expect(prompt).toContain('Exclude Patterns: *.test.ts');
      expect(prompt).toContain('Max Issues: 10');
    });

    it('should include feature context', () => {
      const prompt = reviewStep['buildReviewPrompt'](mockFeature, mockStepConfig as any);

      expect(prompt).toContain('Feature: Test Feature');
      expect(prompt).toContain('Description: Test description');
    });

    it('should handle empty focus areas', () => {
      const config = { ...mockStepConfig.config, focus: [] };
      const stepConfig = { ...mockStepConfig, config };

      const prompt = reviewStep['buildReviewPrompt'](mockFeature, stepConfig as any);

      expect(prompt).toContain('Focus Areas: none');
    });
  });

  describe('parseReviewResult', () => {
    it('should parse passed result', () => {
      const output = '[REVIEW_PASSED] No issues found';
      const result = reviewStep['parseReviewResult'](output);

      expect(result.status).toBe('passed');
      expect(result.output).toBe(output);
    });

    it('should parse failed result with issues', () => {
      const output = `
[REVIEW_FAILED]
1. High severity: Memory leak detected
2. Medium severity: Unused variable
`;
      const result = reviewStep['parseReviewResult'](output);

      expect(result.status).toBe('failed');
      expect(result.issues).toHaveLength(2);
      expect(result.issues![0].severity).toBe('high');
      expect(result.issues![0].summary).toBe('High severity: Memory leak detected');
    });

    it('should handle malformed output', () => {
      const output = 'Invalid output format';
      const result = reviewStep['parseReviewResult'](output);

      expect(result.status).toBe('passed');
      expect(result.output).toBe(output);
    });
  });
});

describe('Security Step', () => {
  let securityStep: SecurityStep;
  let mockFeature: Feature;
  let mockStepConfig: PipelineStepConfig;

  beforeEach(() => {
    securityStep = new SecurityStep(mockAutoModeService);

    mockFeature = {
      id: 'test-feature',
      title: 'Security Test',
      description: 'Test security feature',
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockStepConfig = {
      id: 'security',
      type: 'security',
      name: 'Security Review',
      model: 'opus',
      required: true,
      autoTrigger: true,
      config: {
        checklist: ['Input validation', 'Authentication'],
        minSeverity: 'medium',
        checkDependencies: true,
      },
    };
  });

  describe('buildSecurityPrompt', () => {
    it('should build prompt with security checklist', () => {
      const prompt = securityStep['buildSecurityPrompt'](mockFeature, mockStepConfig as any);

      expect(prompt).toContain('You are conducting a security review');
      expect(prompt).toContain('Security Checklist:');
      expect(prompt).toContain('- Input validation');
      expect(prompt).toContain('- Authentication');
      expect(prompt).toContain('Minimum Severity: medium');
    });

    it('should include OWASP Top 10 by default', () => {
      const config = { ...mockStepConfig.config, checklist: [] };
      const stepConfig = { ...mockStepConfig, config };

      const prompt = securityStep['buildSecurityPrompt'](mockFeature, stepConfig as any);

      expect(prompt).toContain('OWASP Top 10');
    });
  });

  describe('parseSecurityResult', () => {
    it('should parse security vulnerabilities', () => {
      const output = `
[SECURITY_FAILED]
1. Critical: SQL injection vulnerability
2. High: XSS vulnerability
3. Low: Missing security headers
`;
      const result = securityStep['parseSecurityResult'](output);

      expect(result.status).toBe('failed');
      expect(result.issues).toHaveLength(3);
      expect(result.issues![0].severity).toBe('critical');
      expect(result.issues![0].cwe).toBeDefined();
    });

    it('should filter by minimum severity', () => {
      const output = `
[SECURITY_FAILED]
1. Low: Minor security issue
2. High: Major security issue
`;
      const result = securityStep['parseSecurityResult'](output, 'high');

      expect(result.issues).toHaveLength(1);
      expect(result.issues![0].severity).toBe('high');
    });
  });
});

describe('Performance Step', () => {
  let performanceStep: PerformanceStep;
  let mockStepConfig: PipelineStepConfig;

  beforeEach(() => {
    performanceStep = new PerformanceStep(mockAutoModeService);

    mockStepConfig = {
      id: 'performance',
      type: 'performance',
      name: 'Performance Review',
      model: 'opus',
      required: true,
      autoTrigger: true,
      config: {
        focus: ['algorithms', 'database'],
        complexityThreshold: 'O(n²)',
        bundleSizeThreshold: '5MB',
      },
    };
  });

  describe('buildPerformancePrompt', () => {
    it('should build prompt with performance metrics', () => {
      const prompt = performanceStep['buildPerformancePrompt'](
        {} as Feature,
        mockStepConfig as any
      );

      expect(prompt).toContain('You are conducting a performance review');
      expect(prompt).toContain('Focus Areas: algorithms, database');
      expect(prompt).toContain('Complexity Threshold: O(n²)');
      expect(prompt).toContain('Bundle Size Threshold: 5MB');
    });

    it('should include all performance areas by default', () => {
      const config = { ...mockStepConfig.config, focus: [] };
      const stepConfig = { ...mockStepConfig, config };

      const prompt = performanceStep['buildPerformancePrompt']({} as Feature, stepConfig as any);

      expect(prompt).toContain('Algorithm Complexity');
      expect(prompt).toContain('Database Queries');
      expect(prompt).toContain('Memory Usage');
    });
  });

  describe('parsePerformanceResult', () => {
    it('should parse performance issues', () => {
      const output = `
[PERFORMANCE_FAILED]
1. Algorithm: O(n³) complexity detected
2. Database: N+1 query problem
3. Memory: Memory leak in loop
`;
      const result = performanceStep['parsePerformanceResult'](output);

      expect(result.status).toBe('failed');
      expect(result.issues).toHaveLength(3);
      expect(result.issues![0].category).toBe('algorithms');
      expect(result.issues![1].category).toBe('database');
    });

    it('should include performance metrics', () => {
      const output = `
[PERFORMANCE_PASSED]
Bundle size: 2.3MB
Estimated performance impact: Low
`;
      const result = performanceStep['parsePerformanceResult'](output);

      expect(result.status).toBe('passed');
      expect(result.metrics).toBeDefined();
      expect(result.metrics!.bundleSize).toBe('2.3MB');
    });
  });
});

describe('Test Step', () => {
  let testStep: TestStep;
  let mockStepConfig: PipelineStepConfig;

  beforeEach(() => {
    testStep = new TestStep(mockAutoModeService);

    mockStepConfig = {
      id: 'test',
      type: 'test',
      name: 'Test Coverage',
      model: 'opus',
      required: true,
      autoTrigger: true,
      config: {
        coverageThreshold: 80,
        checkQuality: true,
        includeIntegration: true,
      },
    };
  });

  describe('buildTestPrompt', () => {
    it('should build prompt with test requirements', () => {
      const prompt = testStep['buildTestPrompt']({} as Feature, mockStepConfig as any);

      expect(prompt).toContain('You are analyzing test coverage');
      expect(prompt).toContain('Coverage Threshold: 80%');
      expect(prompt).toContain('Check Quality: true');
      expect(prompt).toContain('Include Integration Tests: true');
    });
  });

  describe('parseTestResult', () => {
    it('should parse test coverage results', () => {
      const output = `
[TEST_FAILED]
Coverage: 65% (below threshold)
Missing tests for:
- utils/formatter.ts
- components/Button.tsx
`;
      const result = testStep['parseTestResult'](output);

      expect(result.status).toBe('failed');
      expect(result.issues).toHaveLength(2);
      expect(result.metrics).toBeDefined();
      expect(result.metrics!.coverage).toBe('65%');
    });

    it('should parse test quality issues', () => {
      const output = `
[TEST_FAILED]
Quality Issues:
1. Test has no assertions
2. Test name is not descriptive
`;
      const result = testStep['parseTestResult'](output);

      expect(result.status).toBe('failed');
      expect(result.issues).toHaveLength(2);
      expect(result.issues![0].category).toBe('quality');
    });
  });
});

describe('Custom Step', () => {
  let customStep: CustomStep;
  let mockStepConfig: PipelineStepConfig;

  beforeEach(() => {
    customStep = new CustomStep(mockAutoModeService);

    mockStepConfig = {
      id: 'custom',
      type: 'custom',
      name: 'Custom Check',
      model: 'opus',
      required: true,
      autoTrigger: true,
      config: {
        prompt: 'Check if the code follows our custom standards',
        successCriteria: ['No TODO comments', 'All functions documented'],
        memoryEnabled: true,
        loopUntilSuccess: true,
        maxLoops: 3,
      },
    };
  });

  describe('buildCustomPrompt', () => {
    it('should substitute variables in prompt', () => {
      const feature = {
        id: 'feature-123',
        title: 'My Feature',
        description: 'Does something cool',
      } as Feature;

      const prompt = customStep['buildCustomPrompt'](feature, mockStepConfig as any);

      expect(prompt).toContain('Check if the code follows our custom standards');
      expect(prompt).toContain('{{featureId}}'); // Should be substituted
      expect(prompt).toContain('{{title}}');
      expect(prompt).toContain('{{description}}');
    });

    it('should include success criteria', () => {
      const prompt = customStep['buildCustomPrompt']({} as Feature, mockStepConfig as any);

      expect(prompt).toContain('Success Criteria:');
      expect(prompt).toContain('- No TODO comments');
      expect(prompt).toContain('- All functions documented');
    });
  });

  describe('checkSuccessCriteria', () => {
    it('should check against success criteria', () => {
      const output =
        'The code looks good. No TODO comments found. All functions have documentation.';

      const result = customStep['checkSuccessCriteria'](
        output,
        mockStepConfig.config.successCriteria
      );

      expect(result.passed).toBe(true);
      expect(result.missingCriteria).toHaveLength(0);
    });

    it('should identify missing criteria', () => {
      const output = 'The code has TODO comments that need to be addressed.';

      const result = customStep['checkSuccessCriteria'](
        output,
        mockStepConfig.config.successCriteria
      );

      expect(result.passed).toBe(false);
      expect(result.missingCriteria).toContain('No TODO comments');
    });
  });

  describe('substituteVariables', () => {
    it('should replace feature variables', () => {
      const feature = {
        id: 'feat-001',
        title: 'Test Feature',
        description: 'A test feature',
        status: 'in_progress',
      } as Feature;

      const template = 'Feature {{featureId}}: {{title}} - {{description}} ({{status}})';

      const result = customStep['substituteVariables'](feature, template);

      expect(result).toBe('Feature feat-001: Test Feature - A test feature (in_progress)');
    });
  });
});
