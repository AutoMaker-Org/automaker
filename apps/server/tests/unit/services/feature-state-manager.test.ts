import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import path from 'path';
import { FeatureStateManager } from '@/services/feature-state-manager.js';
import type { Feature } from '@automaker/types';
import type { EventEmitter } from '@/lib/events.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import * as secureFs from '@/lib/secure-fs.js';
import { atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';
import { getFeatureDir, getFeaturesDir } from '@automaker/platform';
import { getNotificationService } from '@/services/notification-service.js';

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
      (secureFs.readFile as Mock).mockResolvedValue(
        JSON.stringify({ ...mockFeature, status: 'in_progress' })
      );
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
      (secureFs.readFile as Mock).mockResolvedValue(
        JSON.stringify({ ...mockFeature, status: 'pipeline_step_1' })
      );

      await manager.markFeatureInterrupted('/project', 'feature-123', 'server shutdown');

      // Should NOT call atomicWriteJson because pipeline status is preserved
      expect(atomicWriteJson).not.toHaveBeenCalled();
    });

    it('should preserve pipeline_complete status', async () => {
      (secureFs.readFile as Mock).mockResolvedValue(
        JSON.stringify({ ...mockFeature, status: 'pipeline_complete' })
      );

      await manager.markFeatureInterrupted('/project', 'feature-123');

      expect(atomicWriteJson).not.toHaveBeenCalled();
    });

    it('should handle feature not found', async () => {
      (secureFs.readFile as Mock).mockRejectedValue(new Error('ENOENT'));
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
