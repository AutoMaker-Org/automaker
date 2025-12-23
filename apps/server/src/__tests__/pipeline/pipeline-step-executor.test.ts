/**
 * Unit Tests: Pipeline Step Executor
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { PipelineStepExecutor } from '../../services/pipeline-step-executor.js';
import { AutoModeService } from '../../services/auto-mode-service.js';
import type { PipelineStepConfig, PipelineStepResult, Feature } from '@automaker/types';

// Mock AutoModeService
const mockAutoModeService = {
  executeModelPrompt: mock(() => Promise.resolve({ content: '[REVIEW_PASSED] No issues found' })),
  emit: mock(() => {}),
} as any;

describe('Pipeline Step Executor', () => {
  let executor: PipelineStepExecutor;
  let mockFeature: Feature;
  let mockStepConfig: PipelineStepConfig;

  beforeEach(() => {
    executor = new PipelineStepExecutor(mockAutoModeService, '/test/project');

    mockFeature = {
      id: 'test-feature-1',
      title: 'Test Feature',
      description: 'A test feature',
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
      maxLoops: 1,
      memoryEnabled: false,
      loopUntilSuccess: false,
      config: {
        focus: ['quality'],
        maxIssues: 10,
      },
    };
  });

  describe('executeStep', () => {
    it('should execute a step successfully', async () => {
      const onProgress = mock(() => {});
      const onStatusChange = mock(() => {});
      const signal = new AbortController().signal;

      const result = await executor.executeStep({
        feature: mockFeature,
        stepConfig: mockStepConfig,
        signal,
        onProgress,
        onStatusChange,
      });

      expect(result.status).toBe('passed');
      expect(result.output).toContain('[REVIEW_PASSED]');
      expect(onProgress).toHaveBeenCalledWith('Starting Code Review...');
      expect(onProgress).toHaveBeenCalledWith('Code Review completed successfully');
      expect(onStatusChange).toHaveBeenCalledWith('in_progress');
      expect(onStatusChange).toHaveBeenCalledWith('passed');
    });

    it('should handle step failure', async () => {
      mockAutoModeService.executeModelPrompt.mockResolvedValueOnce({
        content: '[REVIEW_FAILED] Critical issues found',
      });

      const onProgress = mock(() => {});
      const onStatusChange = mock(() => {});
      const signal = new AbortController().signal;

      const result = await executor.executeStep({
        feature: mockFeature,
        stepConfig: mockStepConfig,
        signal,
        onProgress,
        onStatusChange,
      });

      expect(result.status).toBe('failed');
      expect(onStatusChange).toHaveBeenCalledWith('failed');
    });

    it('should respect abort signal', async () => {
      const abortController = new AbortController();
      const onProgress = mock(() => {});
      const onStatusChange = mock(() => {});

      // Abort before execution
      abortController.abort();

      const result = await executor.executeStep({
        feature: mockFeature,
        stepConfig: mockStepConfig,
        signal: abortController.signal,
        onProgress,
        onStatusChange,
      });

      expect(result.status).toBe('failed');
      expect(result.output).toContain('aborted');
    });

    it('should loop until success when configured', async () => {
      const loopingConfig = {
        ...mockStepConfig,
        loopUntilSuccess: true,
        maxLoops: 3,
      };

      // Fail first attempt, succeed second
      mockAutoModeService.executeModelPrompt
        .mockResolvedValueOnce({ content: '[REVIEW_FAILED] Issues found' })
        .mockResolvedValueOnce({ content: '[REVIEW_PASSED] Fixed issues' });

      const onProgress = mock(() => {});
      const onStatusChange = mock(() => {});
      const signal = new AbortController().signal;

      const result = await executor.executeStep({
        feature: mockFeature,
        stepConfig: loopingConfig,
        signal,
        onProgress,
        onStatusChange,
      });

      expect(result.status).toBe('passed');
      expect(mockAutoModeService.executeModelPrompt).toHaveBeenCalledTimes(2);
    });

    it('should stop after max loops', async () => {
      const loopingConfig = {
        ...mockStepConfig,
        loopUntilSuccess: true,
        maxLoops: 2,
      };

      // Always fail
      mockAutoModeService.executeModelPrompt.mockResolvedValue({
        content: '[REVIEW_FAILED] Issues found',
      });

      const onProgress = mock(() => {});
      const onStatusChange = mock(() => {});
      const signal = new AbortController().signal;

      const result = await executor.executeStep({
        feature: mockFeature,
        stepConfig: loopingConfig,
        signal,
        onProgress,
        onStatusChange,
      });

      expect(result.status).toBe('failed');
      expect(mockAutoModeService.executeModelPrompt).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseStepResult', () => {
    it('should parse passed result', () => {
      const output = '[REVIEW_PASSED] No issues found';
      const result = executor['parseStepResult'](output);

      expect(result.status).toBe('passed');
      expect(result.output).toBe(output);
    });

    it('should parse failed result', () => {
      const output = '[REVIEW_FAILED] Issues found';
      const result = executor['parseStepResult'](output);

      expect(result.status).toBe('failed');
      expect(result.output).toBe(output);
    });

    it('should infer status from content', () => {
      const output = 'No issues found in the code';
      const result = executor['parseStepResult'](output);

      expect(result.status).toBe('passed');
    });

    it('should extract issues from output', () => {
      const output = `
[REVIEW_FAILED]
1. High severity: Memory leak in line 42
2. Medium severity: Unused variable
`;
      const result = executor['parseStepResult'](output);

      expect(result.status).toBe('failed');
      expect(result.issues).toHaveLength(2);
      expect(result.issues![0].severity).toBe('high');
      expect(result.issues![0].summary).toBe('High severity: Memory leak in line 42');
    });
  });

  describe('getModelForStep', () => {
    it('should return same model when configured', () => {
      const feature = { ...mockFeature, model: 'sonnet' };
      const stepConfig = { ...mockStepConfig, model: 'same' };

      const model = executor['getModelForStep'](feature, stepConfig);
      expect(model).toBe('sonnet');
    });

    it('should return different model when configured', () => {
      const feature = { ...mockFeature, model: 'opus' };
      const stepConfig = { ...mockStepConfig, model: 'different' };

      const model = executor['getModelForStep'](feature, stepConfig);
      expect(model).toBe('sonnet');
    });

    it('should return specified model', () => {
      const stepConfig = { ...mockStepConfig, model: 'haiku' };

      const model = executor['getModelForStep'](mockFeature, stepConfig);
      expect(model).toBe('haiku');
    });
  });

  describe('skipStep and clearStepResults', () => {
    it('should skip step and emit event', async () => {
      const emitSpy = mock(() => {});
      executor.emit = emitSpy;

      await executor.skipStep('review-step', 'feature-1');

      expect(emitSpy).toHaveBeenCalledWith('stepSkipped', {
        stepId: 'review-step',
        featureId: 'feature-1',
      });
    });

    it('should clear step results and emit event', async () => {
      const emitSpy = mock(() => {});
      executor.emit = emitSpy;

      await executor.clearStepResults('review-step', 'feature-1');

      expect(emitSpy).toHaveBeenCalledWith('stepResultsCleared', {
        stepId: 'review-step',
        featureId: 'feature-1',
      });
    });
  });
});
