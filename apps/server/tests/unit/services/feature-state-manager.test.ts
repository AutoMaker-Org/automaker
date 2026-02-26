import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import path from 'path';
import { FeatureStateManager } from '@/services/feature-state-manager.js';
import type { Feature } from '@automaker/types';
import { isPipelineStatus } from '@automaker/types';

const PIPELINE_SUMMARY_SEPARATOR = '\n\n---\n\n';
const PIPELINE_SUMMARY_HEADER_PREFIX = '### ';
import type { EventEmitter } from '@/lib/events.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import * as secureFs from '@/lib/secure-fs.js';
import { atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';
import { getFeatureDir, getFeaturesDir } from '@automaker/platform';
import { getNotificationService } from '@/services/notification-service.js';
import { pipelineService } from '@/services/pipeline-service.js';

/**
 * Helper to normalize paths for cross-platform test compatibility.
 * Uses path.normalize (not path.resolve) to match path.join behavior in production code.
 */
const normalizePath = (p: string): string => path.normalize(p);

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

describe('FeatureStateManager', () => {
  let manager: FeatureStateManager;
  let mockEvents: EventEmitter;
  let mockFeatureLoader: FeatureLoader;

  const mockFeature: Feature = {
    id: 'feature-123',
    name: 'Test Feature',
    title: 'Test Feature Title',
    description: 'A test feature',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEvents = {
      emit: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    };

    mockFeatureLoader = {
      syncFeatureToAppSpec: vi.fn(),
    } as unknown as FeatureLoader;

    manager = new FeatureStateManager(mockEvents, mockFeatureLoader);

    // Default mocks
    (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/feature-123');
    (getFeaturesDir as Mock).mockReturnValue('/project/.automaker/features');
  });

  describe('loadFeature', () => {
    it('should load feature from disk', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({ data: mockFeature, recovered: false });

      const feature = await manager.loadFeature('/project', 'feature-123');

      expect(feature).toEqual(mockFeature);
      expect(getFeatureDir).toHaveBeenCalledWith('/project', 'feature-123');
      expect(readJsonWithRecovery).toHaveBeenCalledWith(
        normalizePath('/project/.automaker/features/feature-123/feature.json'),
        null,
        expect.objectContaining({ autoRestore: true })
      );
    });

    it('should return null if feature does not exist', async () => {
      (readJsonWithRecovery as Mock).mockRejectedValue(new Error('ENOENT'));

      const feature = await manager.loadFeature('/project', 'non-existent');

      expect(feature).toBeNull();
    });

    it('should return null if feature JSON is invalid', async () => {
      // readJsonWithRecovery returns null as the default value when JSON is invalid
      (readJsonWithRecovery as Mock).mockResolvedValue({ data: null, recovered: false });

      const feature = await manager.loadFeature('/project', 'feature-123');

      expect(feature).toBeNull();
    });
  });

  describe('updateFeatureStatus', () => {
    it('should update feature status and persist to disk', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'in_progress');

      expect(atomicWriteJson).toHaveBeenCalled();
      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.status).toBe('in_progress');
      expect(savedFeature.updatedAt).toBeDefined();
    });

    it('should set justFinishedAt when status is waiting_approval', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'waiting_approval');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.justFinishedAt).toBeDefined();
    });

    it('should clear justFinishedAt when status is not waiting_approval', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, justFinishedAt: '2024-01-01T00:00:00Z' },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'in_progress');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.justFinishedAt).toBeUndefined();
    });

    it('should finalize in_progress tasks but keep pending tasks when moving to waiting_approval', async () => {
      const featureWithTasks: Feature = {
        ...mockFeature,
        status: 'in_progress',
        planSpec: {
          status: 'approved',
          version: 1,
          reviewedByUser: true,
          currentTaskId: 'task-2',
          tasksCompleted: 1,
          tasks: [
            { id: 'task-1', title: 'Task 1', status: 'completed', description: 'First task' },
            { id: 'task-2', title: 'Task 2', status: 'in_progress', description: 'Second task' },
            { id: 'task-3', title: 'Task 3', status: 'pending', description: 'Third task' },
          ],
        },
      };

      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: featureWithTasks,
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'waiting_approval');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      // Already completed tasks stay completed
      expect(savedFeature.planSpec?.tasks?.[0].status).toBe('completed');
      // in_progress tasks should be finalized to completed
      expect(savedFeature.planSpec?.tasks?.[1].status).toBe('completed');
      // pending tasks should remain pending (never started)
      expect(savedFeature.planSpec?.tasks?.[2].status).toBe('pending');
      // currentTaskId should be cleared
      expect(savedFeature.planSpec?.currentTaskId).toBeUndefined();
      // tasksCompleted should equal actual completed tasks count
      expect(savedFeature.planSpec?.tasksCompleted).toBe(2);
    });

    it('should finalize tasks when moving to verified status', async () => {
      const featureWithTasks: Feature = {
        ...mockFeature,
        status: 'in_progress',
        planSpec: {
          status: 'approved',
          version: 1,
          reviewedByUser: true,
          currentTaskId: 'task-2',
          tasksCompleted: 1,
          tasks: [
            { id: 'task-1', title: 'Task 1', status: 'completed', description: 'First task' },
            { id: 'task-2', title: 'Task 2', status: 'in_progress', description: 'Second task' },
            { id: 'task-3', title: 'Task 3', status: 'pending', description: 'Third task' },
          ],
        },
      };

      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: featureWithTasks,
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'verified');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      // Already completed tasks stay completed
      expect(savedFeature.planSpec?.tasks?.[0].status).toBe('completed');
      // in_progress tasks should be finalized to completed
      expect(savedFeature.planSpec?.tasks?.[1].status).toBe('completed');
      // pending tasks should remain pending (never started)
      expect(savedFeature.planSpec?.tasks?.[2].status).toBe('pending');
      // currentTaskId should be cleared
      expect(savedFeature.planSpec?.currentTaskId).toBeUndefined();
      // tasksCompleted should equal actual completed tasks count
      expect(savedFeature.planSpec?.tasksCompleted).toBe(2);
      // justFinishedAt should be cleared for verified
      expect(savedFeature.justFinishedAt).toBeUndefined();
    });

    it('should handle waiting_approval without planSpec tasks gracefully', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'waiting_approval');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.status).toBe('waiting_approval');
      expect(savedFeature.justFinishedAt).toBeDefined();
    });

    it('should create notification for waiting_approval status', async () => {
      const mockNotificationService = { createNotification: vi.fn() };
      (getNotificationService as Mock).mockReturnValue(mockNotificationService);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'waiting_approval');

      expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'feature_waiting_approval',
          featureId: 'feature-123',
        })
      );
    });

    it('should create notification for verified status', async () => {
      const mockNotificationService = { createNotification: vi.fn() };
      (getNotificationService as Mock).mockReturnValue(mockNotificationService);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'verified');

      expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'feature_verified',
          featureId: 'feature-123',
        })
      );
    });

    it('should sync to app_spec for completed status', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'completed');

      expect(mockFeatureLoader.syncFeatureToAppSpec).toHaveBeenCalledWith(
        '/project',
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('should sync to app_spec for verified status', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeatureStatus('/project', 'feature-123', 'verified');

      expect(mockFeatureLoader.syncFeatureToAppSpec).toHaveBeenCalled();
    });

    it('should not fail if sync to app_spec fails', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });
      (mockFeatureLoader.syncFeatureToAppSpec as Mock).mockRejectedValue(new Error('Sync failed'));

      // Should not throw
      await expect(
        manager.updateFeatureStatus('/project', 'feature-123', 'completed')
      ).resolves.not.toThrow();
    });

    it('should handle feature not found gracefully', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: null,
        recovered: true,
        source: 'default',
      });

      // Should not throw
      await expect(
        manager.updateFeatureStatus('/project', 'non-existent', 'in_progress')
      ).resolves.not.toThrow();
      expect(atomicWriteJson).not.toHaveBeenCalled();
    });
  });

  describe('markFeatureInterrupted', () => {
    it('should mark feature as interrupted', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'in_progress' },
        recovered: false,
        source: 'main',
      });

      await manager.markFeatureInterrupted('/project', 'feature-123', 'server shutdown');

      expect(atomicWriteJson).toHaveBeenCalled();
      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.status).toBe('interrupted');
    });

    it('should preserve pipeline_* statuses', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step_1' },
        recovered: false,
        source: 'main',
      });

      await manager.markFeatureInterrupted('/project', 'feature-123', 'server shutdown');

      // Should NOT call atomicWriteJson because pipeline status is preserved
      expect(atomicWriteJson).not.toHaveBeenCalled();
      expect(isPipelineStatus('pipeline_step_1')).toBe(true);
    });

    it('should preserve pipeline_complete status', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_complete' },
        recovered: false,
        source: 'main',
      });

      await manager.markFeatureInterrupted('/project', 'feature-123');

      expect(atomicWriteJson).not.toHaveBeenCalled();
    });

    it('should handle feature not found', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: null,
        recovered: true,
        source: 'default',
      });

      // Should not throw
      await expect(
        manager.markFeatureInterrupted('/project', 'non-existent')
      ).resolves.not.toThrow();
    });
  });

  describe('resetStuckFeatures', () => {
    it('should reset in_progress features to ready if has approved plan', async () => {
      const stuckFeature: Feature = {
        ...mockFeature,
        status: 'in_progress',
        planSpec: { status: 'approved', version: 1, reviewedByUser: true },
      };

      (secureFs.readdir as Mock).mockResolvedValue([
        { name: 'feature-123', isDirectory: () => true },
      ]);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: stuckFeature,
        recovered: false,
        source: 'main',
      });

      await manager.resetStuckFeatures('/project');

      expect(atomicWriteJson).toHaveBeenCalled();
      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.status).toBe('ready');
    });

    it('should reset in_progress features to backlog if no approved plan', async () => {
      const stuckFeature: Feature = {
        ...mockFeature,
        status: 'in_progress',
        planSpec: undefined,
      };

      (secureFs.readdir as Mock).mockResolvedValue([
        { name: 'feature-123', isDirectory: () => true },
      ]);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: stuckFeature,
        recovered: false,
        source: 'main',
      });

      await manager.resetStuckFeatures('/project');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.status).toBe('backlog');
    });

    it('should preserve pipeline_* statuses during reset', async () => {
      const pipelineFeature: Feature = {
        ...mockFeature,
        status: 'pipeline_testing',
        planSpec: { status: 'approved', version: 1, reviewedByUser: true },
      };

      (secureFs.readdir as Mock).mockResolvedValue([
        { name: 'feature-123', isDirectory: () => true },
      ]);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: pipelineFeature,
        recovered: false,
        source: 'main',
      });

      await manager.resetStuckFeatures('/project');

      // Status should NOT be changed, but needsUpdate might be true if other things reset
      // In this case, nothing else should be reset, so atomicWriteJson shouldn't be called
      expect(atomicWriteJson).not.toHaveBeenCalled();
    });

    it('should reset generating planSpec status to pending', async () => {
      const stuckFeature: Feature = {
        ...mockFeature,
        status: 'pending',
        planSpec: { status: 'generating', version: 1, reviewedByUser: false },
      };

      (secureFs.readdir as Mock).mockResolvedValue([
        { name: 'feature-123', isDirectory: () => true },
      ]);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: stuckFeature,
        recovered: false,
        source: 'main',
      });

      await manager.resetStuckFeatures('/project');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.planSpec?.status).toBe('pending');
    });

    it('should reset in_progress tasks to pending', async () => {
      const stuckFeature: Feature = {
        ...mockFeature,
        status: 'pending',
        planSpec: {
          status: 'approved',
          version: 1,
          reviewedByUser: true,
          tasks: [
            { id: 'task-1', title: 'Task 1', status: 'completed', description: '' },
            { id: 'task-2', title: 'Task 2', status: 'in_progress', description: '' },
            { id: 'task-3', title: 'Task 3', status: 'pending', description: '' },
          ],
          currentTaskId: 'task-2',
        },
      };

      (secureFs.readdir as Mock).mockResolvedValue([
        { name: 'feature-123', isDirectory: () => true },
      ]);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: stuckFeature,
        recovered: false,
        source: 'main',
      });

      await manager.resetStuckFeatures('/project');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.planSpec?.tasks?.[1].status).toBe('pending');
      expect(savedFeature.planSpec?.currentTaskId).toBeUndefined();
    });

    it('should skip non-directory entries', async () => {
      (secureFs.readdir as Mock).mockResolvedValue([
        { name: 'feature-123', isDirectory: () => true },
        { name: 'some-file.txt', isDirectory: () => false },
      ]);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: mockFeature,
        recovered: false,
        source: 'main',
      });

      await manager.resetStuckFeatures('/project');

      // Should only process the directory
      expect(readJsonWithRecovery).toHaveBeenCalledTimes(1);
    });

    it('should handle features directory not existing', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      (secureFs.readdir as Mock).mockRejectedValue(error);

      // Should not throw
      await expect(manager.resetStuckFeatures('/project')).resolves.not.toThrow();
    });

    it('should not update feature if nothing is stuck', async () => {
      const normalFeature: Feature = {
        ...mockFeature,
        status: 'completed',
        planSpec: { status: 'approved', version: 1, reviewedByUser: true },
      };

      (secureFs.readdir as Mock).mockResolvedValue([
        { name: 'feature-123', isDirectory: () => true },
      ]);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: normalFeature,
        recovered: false,
        source: 'main',
      });

      await manager.resetStuckFeatures('/project');

      expect(atomicWriteJson).not.toHaveBeenCalled();
    });
  });

  describe('updateFeaturePlanSpec', () => {
    it('should update planSpec with partial updates', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeaturePlanSpec('/project', 'feature-123', { status: 'approved' });

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.planSpec?.status).toBe('approved');
    });

    it('should initialize planSpec if not exists', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, planSpec: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeaturePlanSpec('/project', 'feature-123', { status: 'approved' });

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.planSpec).toBeDefined();
      expect(savedFeature.planSpec?.version).toBe(1);
    });

    it('should increment version when content changes', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: {
          ...mockFeature,
          planSpec: {
            status: 'pending',
            version: 2,
            content: 'old content',
            reviewedByUser: false,
          },
        },
        recovered: false,
        source: 'main',
      });

      await manager.updateFeaturePlanSpec('/project', 'feature-123', { content: 'new content' });

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.planSpec?.version).toBe(3);
    });
  });

  describe('saveFeatureSummary', () => {
    it('should save summary and emit event', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'This is the summary');

      // Verify persisted
      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe('This is the summary');

      // Verify event emitted AFTER persistence
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_summary',
        featureId: 'feature-123',
        projectPath: '/project',
        summary: 'This is the summary',
      });
    });

    it('should handle feature not found', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: null,
        recovered: true,
        source: 'default',
      });

      await expect(
        manager.saveFeatureSummary('/project', 'non-existent', 'Summary')
      ).resolves.not.toThrow();
      expect(atomicWriteJson).not.toHaveBeenCalled();
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });

    it('should accumulate summary with step header for pipeline features', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Code Review', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'First step output');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Code Review\n\nFirst step output`
      );
    });

    it('should append subsequent pipeline step summaries with separator', async () => {
      const existingSummary = `${PIPELINE_SUMMARY_HEADER_PREFIX}Code Review\n\nFirst step output`;
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step2', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Second step output');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Code Review\n\nFirst step output${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Testing\n\nSecond step output`
      );
    });

    it('should normalize existing non-phase summary before appending pipeline step summary', async () => {
      const existingSummary = 'Implemented authentication and settings management.';
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Code Review', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Reviewed and approved changes');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Implementation\n\nImplemented authentication and settings management.${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Code Review\n\nReviewed and approved changes`
      );
    });

    it('should use fallback step name when pipeline step not found', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue(null);
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_unknown_step', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Step output');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Unknown Step\n\nStep output`
      );
    });

    it('should overwrite summary for non-pipeline features', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'in_progress', summary: 'Old summary' },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'New summary');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe('New summary');
    });

    it('should emit full accumulated summary for pipeline features', async () => {
      const existingSummary = '### Code Review\n\nFirst step output';
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Refinement', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step2', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Refinement output');

      const expectedSummary =
        '### Code Review\n\nFirst step output\n\n---\n\n### Refinement\n\nRefinement output';
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_summary',
        featureId: 'feature-123',
        projectPath: '/project',
        summary: expectedSummary,
      });
    });

    it('should skip accumulation for pipeline features when summary is empty', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: '' },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Test output');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      // Empty string is falsy, so should start fresh
      expect(savedFeature.summary).toBe('### Testing\n\nTest output');
    });

    it('should skip persistence when incoming summary is only whitespace', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: '### Existing\n\nValue' },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', '   \n\t  ');

      expect(atomicWriteJson).not.toHaveBeenCalled();
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });

    it('should accumulate three pipeline steps in chronological order', async () => {
      // Step 1: Code Review
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Code Review', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Review findings');
      const afterStep1 = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(afterStep1.summary).toBe('### Code Review\n\nReview findings');

      // Step 2: Testing (summary from step 1 exists)
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/feature-123');
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step2', summary: afterStep1.summary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'All tests pass');
      const afterStep2 = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;

      // Step 3: Refinement (summaries from steps 1+2 exist)
      vi.clearAllMocks();
      (getFeatureDir as Mock).mockReturnValue('/project/.automaker/features/feature-123');
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Refinement', id: 'step3' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step3', summary: afterStep2.summary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Code polished');
      const afterStep3 = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;

      // Verify the full accumulated summary has all three steps in order
      expect(afterStep3.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Code Review\n\nReview findings${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Testing\n\nAll tests pass${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Refinement\n\nCode polished`
      );
    });

    it('should replace existing step summary if called again for the same step', async () => {
      const existingSummary = `${PIPELINE_SUMMARY_HEADER_PREFIX}Implementation\n\nInitial code${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Code Review\n\nFirst review attempt`;
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Code Review', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary(
        '/project',
        'feature-123',
        'Second review attempt (success)'
      );

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      // Should REPLACE "First review attempt" with "Second review attempt (success)"
      // and NOT append it as a new section
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Implementation\n\nInitial code${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Code Review\n\nSecond review attempt (success)`
      );
      // Ensure it didn't duplicate the separator or header
      expect(
        savedFeature.summary.match(new RegExp(PIPELINE_SUMMARY_HEADER_PREFIX + 'Code Review', 'g'))
          ?.length
      ).toBe(1);
      expect(
        savedFeature.summary.match(new RegExp(PIPELINE_SUMMARY_SEPARATOR.trim(), 'g'))?.length
      ).toBe(1);
    });

    it('should replace last step summary without trailing separator', async () => {
      // Test case: replacing the last step which has no separator after it
      const existingSummary = `${PIPELINE_SUMMARY_HEADER_PREFIX}Implementation\n\nInitial code${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Testing\n\nFirst test run`;
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step2', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'All tests pass');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Implementation\n\nInitial code${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Testing\n\nAll tests pass`
      );
    });

    it('should replace first step summary with separator after it', async () => {
      // Test case: replacing the first step which has a separator after it
      const existingSummary = `${PIPELINE_SUMMARY_HEADER_PREFIX}Implementation\n\nFirst attempt${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Testing\n\nAll tests pass`;
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Implementation', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Second attempt');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Implementation\n\nSecond attempt${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Testing\n\nAll tests pass`
      );
    });

    it('should not match step header appearing in body text, only at section boundaries', async () => {
      // Test case: body text contains "### Testing" which should NOT be matched
      // Only headers at actual section boundaries should be replaced
      const existingSummary = `${PIPELINE_SUMMARY_HEADER_PREFIX}Implementation\n\nThis step covers the Testing module.\n\n### Testing\n\nThe above is just markdown in body, not a section header.${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Testing\n\nReal test section`;
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step2', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Updated test results');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      // The section replacement should only replace the actual Testing section at the boundary
      // NOT the "### Testing" that appears in the body text
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Implementation\n\nThis step covers the Testing module.\n\n### Testing\n\nThe above is just markdown in body, not a section header.${PIPELINE_SUMMARY_SEPARATOR}${PIPELINE_SUMMARY_HEADER_PREFIX}Testing\n\nUpdated test results`
      );
    });

    it('should handle step name with special regex characters safely', async () => {
      // Test case: step name contains characters that would break regex
      const existingSummary = `${PIPELINE_SUMMARY_HEADER_PREFIX}Code (Review)\n\nFirst attempt`;
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Code (Review)', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Second attempt');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Code (Review)\n\nSecond attempt`
      );
    });

    it('should handle step name with brackets safely', async () => {
      // Test case: step name contains array-like syntax [0]
      const existingSummary = `${PIPELINE_SUMMARY_HEADER_PREFIX}Step [0]\n\nFirst attempt`;
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Step [0]', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: existingSummary },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Second attempt');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Step [0]\n\nSecond attempt`
      );
    });

    it('should handle pipelineService.getStepIdFromStatus throwing an error gracefully', async () => {
      (pipelineService.getStepIdFromStatus as Mock).mockImplementation(() => {
        throw new Error('Config not found');
      });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_my_step', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Step output');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      // Should use fallback: capitalize each word in the status suffix
      expect(savedFeature.summary).toBe(`${PIPELINE_SUMMARY_HEADER_PREFIX}My Step\n\nStep output`);
    });

    it('should handle pipelineService.getStep throwing an error gracefully', async () => {
      (pipelineService.getStep as Mock).mockRejectedValue(new Error('Disk read error'));
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_code_review', summary: undefined },
        recovered: false,
        source: 'main',
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Step output');

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      // Should use fallback: capitalize each word in the status suffix
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Code Review\n\nStep output`
      );
    });

    it('should handle summary content with markdown formatting', async () => {
      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Code Review', id: 'step1' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step1', summary: undefined },
        recovered: false,
        source: 'main',
      });

      const markdownSummary =
        '## Changes Made\n- Fixed **bug** in `parser.ts`\n- Added `validateInput()` function\n\n```typescript\nconst x = 1;\n```';

      await manager.saveFeatureSummary('/project', 'feature-123', markdownSummary);

      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.summary).toBe(
        `${PIPELINE_SUMMARY_HEADER_PREFIX}Code Review\n\n${markdownSummary}`
      );
    });

    it('should persist before emitting event for pipeline summary accumulation', async () => {
      const callOrder: string[] = [];
      const existingSummary = '### Code Review\n\nFirst step output';

      (pipelineService.getStep as Mock).mockResolvedValue({ name: 'Testing', id: 'step2' });
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature, status: 'pipeline_step2', summary: existingSummary },
        recovered: false,
        source: 'main',
      });
      (atomicWriteJson as Mock).mockImplementation(async () => {
        callOrder.push('persist');
      });
      (mockEvents.emit as Mock).mockImplementation(() => {
        callOrder.push('emit');
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Test results');

      expect(callOrder).toEqual(['persist', 'emit']);
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status and emit event', async () => {
      const featureWithTasks: Feature = {
        ...mockFeature,
        planSpec: {
          status: 'approved',
          version: 1,
          reviewedByUser: true,
          tasks: [
            { id: 'task-1', title: 'Task 1', status: 'pending', description: '' },
            { id: 'task-2', title: 'Task 2', status: 'pending', description: '' },
          ],
        },
      };

      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: featureWithTasks,
        recovered: false,
        source: 'main',
      });

      await manager.updateTaskStatus('/project', 'feature-123', 'task-1', 'completed');

      // Verify persisted
      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.planSpec?.tasks?.[0].status).toBe('completed');

      // Verify event emitted
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_task_status',
        featureId: 'feature-123',
        projectPath: '/project',
        taskId: 'task-1',
        status: 'completed',
        tasks: expect.any(Array),
      });
    });

    it('should update task status and summary and emit event', async () => {
      const featureWithTasks: Feature = {
        ...mockFeature,
        planSpec: {
          status: 'approved',
          version: 1,
          reviewedByUser: true,
          tasks: [{ id: 'task-1', title: 'Task 1', status: 'pending', description: '' }],
        },
      };

      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: featureWithTasks,
        recovered: false,
        source: 'main',
      });

      await manager.updateTaskStatus(
        '/project',
        'feature-123',
        'task-1',
        'completed',
        'Task finished successfully'
      );

      // Verify persisted
      const savedFeature = (atomicWriteJson as Mock).mock.calls[0][1] as Feature;
      expect(savedFeature.planSpec?.tasks?.[0].status).toBe('completed');
      expect(savedFeature.planSpec?.tasks?.[0].summary).toBe('Task finished successfully');

      // Verify event emitted
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_task_status',
        featureId: 'feature-123',
        projectPath: '/project',
        taskId: 'task-1',
        status: 'completed',
        summary: 'Task finished successfully',
        tasks: expect.any(Array),
      });
    });

    it('should handle task not found', async () => {
      const featureWithTasks: Feature = {
        ...mockFeature,
        planSpec: {
          status: 'approved',
          version: 1,
          reviewedByUser: true,
          tasks: [{ id: 'task-1', title: 'Task 1', status: 'pending', description: '' }],
        },
      };

      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: featureWithTasks,
        recovered: false,
        source: 'main',
      });

      await manager.updateTaskStatus('/project', 'feature-123', 'non-existent-task', 'completed');

      // Should not persist or emit if task not found
      expect(atomicWriteJson).not.toHaveBeenCalled();
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });

    it('should handle feature without tasks', async () => {
      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });

      await expect(
        manager.updateTaskStatus('/project', 'feature-123', 'task-1', 'completed')
      ).resolves.not.toThrow();
      expect(atomicWriteJson).not.toHaveBeenCalled();
    });
  });

  describe('persist BEFORE emit ordering', () => {
    it('saveFeatureSummary should persist before emitting event', async () => {
      const callOrder: string[] = [];

      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: { ...mockFeature },
        recovered: false,
        source: 'main',
      });
      (atomicWriteJson as Mock).mockImplementation(async () => {
        callOrder.push('persist');
      });
      (mockEvents.emit as Mock).mockImplementation(() => {
        callOrder.push('emit');
      });

      await manager.saveFeatureSummary('/project', 'feature-123', 'Summary');

      expect(callOrder).toEqual(['persist', 'emit']);
    });

    it('updateTaskStatus should persist before emitting event', async () => {
      const callOrder: string[] = [];

      const featureWithTasks: Feature = {
        ...mockFeature,
        planSpec: {
          status: 'approved',
          version: 1,
          reviewedByUser: true,
          tasks: [{ id: 'task-1', title: 'Task 1', status: 'pending', description: '' }],
        },
      };

      (readJsonWithRecovery as Mock).mockResolvedValue({
        data: featureWithTasks,
        recovered: false,
        source: 'main',
      });
      (atomicWriteJson as Mock).mockImplementation(async () => {
        callOrder.push('persist');
      });
      (mockEvents.emit as Mock).mockImplementation(() => {
        callOrder.push('emit');
      });

      await manager.updateTaskStatus('/project', 'feature-123', 'task-1', 'completed');

      expect(callOrder).toEqual(['persist', 'emit']);
    });
  });
});
