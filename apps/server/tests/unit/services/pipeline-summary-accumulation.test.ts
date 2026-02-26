/**
 * Integration tests for pipeline summary accumulation across multiple steps.
 *
 * These tests verify the end-to-end behavior where:
 * 1. Each pipeline step produces a summary via agent-executor → callbacks.saveFeatureSummary()
 * 2. FeatureStateManager.saveFeatureSummary() accumulates summaries with step headers
 * 3. The emitted auto_mode_summary event contains the full accumulated summary
 * 4. The UI can use feature.summary (accumulated) instead of extractSummary() (last-only)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { FeatureStateManager } from '@/services/feature-state-manager.js';
import type { Feature } from '@automaker/types';
import type { EventEmitter } from '@/lib/events.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import { atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';
import { getFeatureDir } from '@automaker/platform';
import { pipelineService } from '@/services/pipeline-service.js';

// Mock dependencies
vi.mock('@/lib/secure-fs.js', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock('@automaker/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@automaker/utils')>();
  return {
    ...actual,
    atomicWriteJson: vi.fn(),
    readJsonWithRecovery: vi.fn(),
    logRecoveryWarning: vi.fn(),
  };
});

vi.mock('@automaker/platform', () => ({
  getFeatureDir: vi.fn(),
  getFeaturesDir: vi.fn(),
}));

vi.mock('@/services/notification-service.js', () => ({
  getNotificationService: vi.fn(() => ({
    createNotification: vi.fn(),
  })),
}));

vi.mock('@/services/pipeline-service.js', () => ({
  pipelineService: {
    getStepIdFromStatus: vi.fn((status: string) => {
      if (status.startsWith('pipeline_')) return status.replace('pipeline_', '');
      return null;
    }),
    getStep: vi.fn(),
  },
}));

describe('Pipeline Summary Accumulation (Integration)', () => {
  let manager: FeatureStateManager;
  let mockEvents: EventEmitter;

  const baseFeature: Feature = {
    id: 'pipeline-feature-1',
    name: 'Pipeline Feature',
    title: 'Pipeline Feature Title',
    description: 'A feature going through pipeline steps',
    status: 'pipeline_step1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEvents = {
      emit: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    };

    const mockFeatureLoader = {
      syncFeatureToAppSpec: vi.fn(),
    } as unknown as FeatureLoader;

    manager = new FeatureStateManager(mockEvents, mockFeatureLoader);

    (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/pipeline-feature-1');
  });

  describe('multi-step pipeline summary accumulation', () => {
    it('should accumulate summaries across three pipeline steps in chronological order', async () => {
      // --- Step 1: Implementation ---
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Implementation', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary(
        '/project',
        'pipeline-feature-1',
        '## Changes\n- Added auth module\n- Created user service'
      );

      const step1Feature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(step1Feature.summary).toBe(
        '### Implementation\n\n## Changes\n- Added auth module\n- Created user service'
      );

      // --- Step 2: Code Review ---
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/pipeline-feature-1');
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Code Review', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step2', summary: step1Feature.summary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary(
        '/project',
        'pipeline-feature-1',
        '## Review Findings\n- Style issues fixed\n- Added error handling'
      );

      const step2Feature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;

      // --- Step 3: Testing ---
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/pipeline-feature-1');
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step3' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step3', summary: step2Feature.summary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary(
        '/project',
        'pipeline-feature-1',
        '## Test Results\n- 42 tests pass\n- 98% coverage'
      );

      const finalFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;

      // Verify the full accumulated summary has all three steps separated by ---
      const expectedSummary = [
        '### Implementation',
        '',
        '## Changes',
        '- Added auth module',
        '- Created user service',
        '',
        '---',
        '',
        '### Code Review',
        '',
        '## Review Findings',
        '- Style issues fixed',
        '- Added error handling',
        '',
        '---',
        '',
        '### Testing',
        '',
        '## Test Results',
        '- 42 tests pass',
        '- 98% coverage',
      ].join('\n');

      expect(finalFeature.summary).toBe(expectedSummary);
    });

    it('should emit the full accumulated summary in auto_mode_summary event', async () => {
      // Step 1
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Implementation', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Step 1 output');

      // Verify the event was emitted with correct data
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_summary',
        featureId: 'pipeline-feature-1',
        projectPath: '/project',
        summary: '### Implementation\n\nStep 1 output',
      });

      // Step 2 (with accumulated summary from step 1)
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/pipeline-feature-1');
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: {
          ...baseFeature,
          status: 'pipeline_step2',
          summary: '### Implementation\n\nStep 1 output',
        },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Step 2 output');

      // The event should contain the FULL accumulated summary, not just step 2
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_summary',
        featureId: 'pipeline-feature-1',
        projectPath: '/project',
        summary: '### Implementation\n\nStep 1 output\n\n---\n\n### Testing\n\nStep 2 output',
      });
    });
  });

  describe('edge cases in pipeline accumulation', () => {
    it('should normalize a legacy implementation summary before appending pipeline output', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Code Review', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: {
          ...baseFeature,
          status: 'pipeline_step2',
          summary: 'Implemented authentication and settings updates.',
        },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Reviewed and approved');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        '### Implementation\n\nImplemented authentication and settings updates.\n\n---\n\n### Code Review\n\nReviewed and approved'
      );
    });

    it('should skip persistence when a pipeline step summary is empty', async () => {
      const existingSummary = '### Step 1\n\nFirst step output';
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Step 2', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step2', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      // Empty summary should be ignored to avoid persisting blank sections.
      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', '');

      expect(atomicWriteJson).not.toHaveBeenCalled();
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });

    it('should handle pipeline step name lookup failure with fallback', async () => {
      (pipelineService.getStepIdFromStatus as Mock).mockImplementation(() => {
        throw new Error('Pipeline config not loaded');
      });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_code_review', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Review output');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      // Fallback: capitalize words from status suffix
      expect(savedFeature.summary).toBe('### Code Review\n\nReview output');
    });

    it('should handle summary with special markdown characters in pipeline mode', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Implementation', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      const markdownSummary = [
        '## Changes Made',
        '- Fixed **critical bug** in `parser.ts`',
        '- Added `validateInput()` function',
        '',
        '```typescript',
        'const x = 1;',
        '```',
        '',
        '| Column | Value |',
        '|--------|-------|',
        '| Tests  | Pass  |',
      ].join('\n');

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', markdownSummary);

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(`### Implementation\n\n${markdownSummary}`);
      // Verify markdown is preserved
      expect(savedFeature.summary).toContain('```typescript');
      expect(savedFeature.summary).toContain('| Column | Value |');
    });

    it('should correctly handle rapid sequential pipeline steps without data loss', async () => {
      // Simulate 5 rapid pipeline steps
      const stepConfigs = [
        { name: 'Planning', status: 'pipeline_step1', content: 'Plan created' },
        { name: 'Implementation', status: 'pipeline_step2', content: 'Code written' },
        { name: 'Code Review', status: 'pipeline_step3', content: 'Review complete' },
        { name: 'Testing', status: 'pipeline_step4', content: 'All tests pass' },
        { name: 'Refinement', status: 'pipeline_step5', content: 'Code polished' },
      ];

      let currentSummary: string | undefined = undefined;

      for (const step of stepConfigs) {
        vi.clearAllMocks();
        (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/pipeline-feature-1');
        (pipelineService.getStep as Mock).mockResolvedValue({
          name: step.name,
          id: step.status.replace('pipeline_', ''),
        });
        (readJsonWithRecovery as Mock).mockResolvedValue({
          data: { ...baseFeature, status: step.status, summary: currentSummary },
          recovered: false,
          source: 'main',
        });

        await manager.saveFeatureSummary('/project', 'pipeline-feature-1', step.content);

        currentSummary = ((atomicWriteJson as Mock).mock.calls[0][1] as Feature).summary;
      }

      // Final summary should contain all 5 steps
      expect(currentSummary).toContain('### Planning');
      expect(currentSummary).toContain('Plan created');
      expect(currentSummary).toContain('### Implementation');
      expect(currentSummary).toContain('Code written');
      expect(currentSummary).toContain('### Code Review');
      expect(currentSummary).toContain('Review complete');
      expect(currentSummary).toContain('### Testing');
      expect(currentSummary).toContain('All tests pass');
      expect(currentSummary).toContain('### Refinement');
      expect(currentSummary).toContain('Code polished');

      // Verify there are exactly 4 separators (between 5 steps)
      const separatorCount = (currentSummary!.match(/\n\n---\n\n/g) || []).length;
      expect(separatorCount).toBe(4);
    });
  });

  describe('UI summary display logic', () => {
    it('should emit accumulated summary that UI can display directly (no extractSummary needed)', async () => {
      // This test verifies the UI can use feature.summary directly
      // without needing to call extractSummary() which only returns the last entry
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Implementation', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'First step');

      const step1Summary = ((atomicWriteJson as Mock).mock.calls[0][1] as Feature).summary;

      // Step 2
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/pipeline-feature-1');
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step2', summary: step1Summary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Second step');

      const emittedEvent = (mockEvents.emit as Mock).mock.calls[0][1];
      const accumulatedSummary = emittedEvent.summary;

      // The accumulated summary should contain BOTH steps
      expect(accumulatedSummary).toContain('### Implementation');
      expect(accumulatedSummary).toContain('First step');
      expect(accumulatedSummary).toContain('### Testing');
      expect(accumulatedSummary).toContain('Second step');
    });

    it('should handle single-step pipeline (no accumulation needed)', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Implementation', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Single step output');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe('### Implementation\n\nSingle step output');

      // No separator should be present for single step
      expect(savedFeature.summary).not.toContain('---');
    });

    it('should preserve chronological order of summaries', async () => {
      // Step 1
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Alpha', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });
      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'First');

      const step1Summary = ((atomicWriteJson as Mock).mock.calls[0][1] as Feature).summary;

      // Step 2
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/pipeline-feature-1');
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Beta', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step2', summary: step1Summary },
        recovered: false,
        source: 'main',
      });
      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Second');

      const finalSummary = ((atomicWriteJson as Mock).mock.calls[0][1] as Feature).summary;

      // Verify order: Alpha should come before Beta
      const alphaIndex = finalSummary!.indexOf('### Alpha');
      const betaIndex = finalSummary!.indexOf('### Beta');
      expect(alphaIndex).toBeLessThan(betaIndex);
    });
  });

  describe('non-pipeline features', () => {
    it('should overwrite summary for non-pipeline features', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: {
          ...baseFeature,
          status: 'in_progress', // Non-pipeline status
          summary: 'Old summary',
        },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'New summary');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe('New summary');
    });

    it('should not add step headers for non-pipeline features', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: {
          ...baseFeature,
          status: 'in_progress', // Non-pipeline status
          summary: undefined,
        },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Simple summary');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe('Simple summary');
      expect(savedFeature.summary).not.toContain('###');
    });
  });

  describe('summary content edge cases', () => {
    it('should handle summary with unicode characters', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      const unicodeSummary = 'Test results: ✅ 42 passed, ❌ 0 failed, 🎉 100% coverage';
      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', unicodeSummary);

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toContain('✅');
      expect(savedFeature.summary).toContain('❌');
      expect(savedFeature.summary).toContain('🎉');
    });

    it('should handle very long summary content', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Implementation', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      // Generate a very long summary (10KB+)
      const longContent = 'This is a line of content.\n'.repeat(500);
      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', longContent);

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary!.length).toBeGreaterThan(10000);
    });

    it('should handle summary with markdown tables', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      const tableSummary = `
## Test Results

| Test Suite | Passed | Failed | Skipped |
|------------|--------|--------|---------|
| Unit       | 42     | 0      | 2       |
| Integration| 15     | 0      | 0       |
| E2E        | 8      | 1      | 0       |
`;
      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', tableSummary);

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toContain('| Test Suite |');
      expect(savedFeature.summary).toContain('| Unit       | 42     |');
    });

    it('should handle summary with nested markdown headers', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Implementation', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      const nestedSummary = `
## Main Changes
### Backend
- Added API endpoints
### Frontend
- Created components
#### Deep nesting
- Minor fix
`;
      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', nestedSummary);

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toContain('### Backend');
      expect(savedFeature.summary).toContain('### Frontend');
      expect(savedFeature.summary).toContain('#### Deep nesting');
    });
  });

  describe('persistence and event ordering', () => {
    it('should persist summary BEFORE emitting event', async () => {
      const callOrder: string[] = [];

      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });
      (atomicWriteJson as Mock).mockImplementation(async () => {
        callOrder.push('persist');
      });
      (mockEvents.emit as Mock).mockImplementation(() => {
        callOrder.push('emit');
      });

      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Summary');

      expect(callOrder).toEqual(['persist', 'emit']);
    });

    it('should not emit event if persistence fails (error is caught silently)', async () => {
      // Note: saveFeatureSummary catches errors internally and logs them
      // It does NOT re-throw, so the method completes successfully even on error
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...baseFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });
      (atomicWriteJson as Mock).mockRejectedValue(new Error('Disk full'));

      // Method completes without throwing (error is logged internally)
      await manager.saveFeatureSummary('/project', 'pipeline-feature-1', 'Summary');

      // Event should NOT be emitted since persistence failed
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });
  });
});
