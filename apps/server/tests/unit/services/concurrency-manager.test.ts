import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  ConcurrencyManager,
  type RunningFeature,
  type GetCurrentBranchFn,
} from '@/services/concurrency-manager.js';

describe('ConcurrencyManager', () => {
  let manager: ConcurrencyManager;
  let mockGetCurrentBranch: Mock<GetCurrentBranchFn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: primary branch is 'main'
    mockGetCurrentBranch = vi.fn().mockResolvedValue('main');
    manager = new ConcurrencyManager(mockGetCurrentBranch);
  });

  describe('acquire', () => {
    it('should create new entry with leaseCount: 1 on first acquire', () => {
      const result = manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      expect(result.featureId).toBe('feature-1');
      expect(result.projectPath).toBe('/test/project');
      expect(result.isAutoMode).toBe(true);
      expect(result.leaseCount).toBe(1);
      expect(result.worktreePath).toBeNull();
      expect(result.branchName).toBeNull();
      expect(result.startTime).toBeDefined();
      expect(result.abortController).toBeInstanceOf(AbortController);
    });

    it('should increment leaseCount when allowReuse is true for existing feature', () => {
      // First acquire
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      // Second acquire with allowReuse
      const result = manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        allowReuse: true,
      });

      expect(result.leaseCount).toBe(2);
    });

    it('should throw "already running" when allowReuse is false for existing feature', () => {
      // First acquire
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      // Second acquire without allowReuse
      expect(() =>
        manager.acquire({
          featureId: 'feature-1',
          projectPath: '/test/project',
          isAutoMode: true,
        })
      ).toThrow('already running');
    });

    it('should throw "already running" when allowReuse is explicitly false', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      expect(() =>
        manager.acquire({
          featureId: 'feature-1',
          projectPath: '/test/project',
          isAutoMode: true,
          allowReuse: false,
        })
      ).toThrow('already running');
    });

    it('should use provided abortController', () => {
      const customAbortController = new AbortController();

      const result = manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        abortController: customAbortController,
      });

      expect(result.abortController).toBe(customAbortController);
    });

    it('should return the existing entry when allowReuse is true', () => {
      const first = manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      const second = manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        allowReuse: true,
      });

      // Should be the same object reference
      expect(second).toBe(first);
    });

    it('should allow multiple nested acquire calls with allowReuse', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        allowReuse: true,
      });

      const result = manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        allowReuse: true,
      });

      expect(result.leaseCount).toBe(3);
    });
  });

  describe('release', () => {
    it('should decrement leaseCount on release', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        allowReuse: true,
      });

      manager.release('feature-1');

      const entry = manager.getRunningFeature('feature-1');
      expect(entry?.leaseCount).toBe(1);
    });

    it('should delete entry when leaseCount reaches 0', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.release('feature-1');

      expect(manager.isRunning('feature-1')).toBe(false);
      expect(manager.getRunningFeature('feature-1')).toBeUndefined();
    });

    it('should delete entry immediately when force is true regardless of leaseCount', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        allowReuse: true,
      });

      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        allowReuse: true,
      });

      // leaseCount is 3, but force should still delete
      manager.release('feature-1', { force: true });

      expect(manager.isRunning('feature-1')).toBe(false);
    });

    it('should do nothing when releasing non-existent feature', () => {
      // Should not throw
      manager.release('non-existent-feature');
      manager.release('non-existent-feature', { force: true });
    });

    it('should only delete entry after all leases are released', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        allowReuse: true,
      });

      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
        allowReuse: true,
      });

      // leaseCount is 3
      manager.release('feature-1');
      expect(manager.isRunning('feature-1')).toBe(true);

      manager.release('feature-1');
      expect(manager.isRunning('feature-1')).toBe(true);

      manager.release('feature-1');
      expect(manager.isRunning('feature-1')).toBe(false);
    });
  });

  describe('isRunning', () => {
    it('should return false when feature is not running', () => {
      expect(manager.isRunning('feature-1')).toBe(false);
    });

    it('should return true when feature is running', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      expect(manager.isRunning('feature-1')).toBe(true);
    });

    it('should return false after feature is released', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.release('feature-1');

      expect(manager.isRunning('feature-1')).toBe(false);
    });
  });

  describe('getRunningFeature', () => {
    it('should return undefined for non-existent feature', () => {
      expect(manager.getRunningFeature('feature-1')).toBeUndefined();
    });

    it('should return the RunningFeature entry', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      const entry = manager.getRunningFeature('feature-1');
      expect(entry).toBeDefined();
      expect(entry?.featureId).toBe('feature-1');
      expect(entry?.projectPath).toBe('/test/project');
    });
  });

  describe('getRunningCount (project-level)', () => {
    it('should return 0 when no features are running', () => {
      expect(manager.getRunningCount('/test/project')).toBe(0);
    });

    it('should count features for specific project', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-2',
        projectPath: '/test/project',
        isAutoMode: false,
      });

      expect(manager.getRunningCount('/test/project')).toBe(2);
    });

    it('should only count features for the specified project', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/project-a',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-2',
        projectPath: '/project-b',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-3',
        projectPath: '/project-a',
        isAutoMode: false,
      });

      expect(manager.getRunningCount('/project-a')).toBe(2);
      expect(manager.getRunningCount('/project-b')).toBe(1);
      expect(manager.getRunningCount('/project-c')).toBe(0);
    });
  });

  describe('getRunningCountForWorktree', () => {
    it('should return 0 when no features are running', async () => {
      const count = await manager.getRunningCountForWorktree('/test/project', null);
      expect(count).toBe(0);
    });

    it('should count features with null branchName as main worktree', async () => {
      const entry = manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });
      // entry.branchName is null by default

      const count = await manager.getRunningCountForWorktree('/test/project', null);
      expect(count).toBe(1);
    });

    it('should count features matching primary branch as main worktree', async () => {
      mockGetCurrentBranch.mockResolvedValue('main');

      const entry = manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });
      manager.updateRunningFeature('feature-1', { branchName: 'main' });

      const count = await manager.getRunningCountForWorktree('/test/project', null);
      expect(count).toBe(1);
    });

    it('should count features with exact branch match for feature worktrees', async () => {
      const entry = manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });
      manager.updateRunningFeature('feature-1', { branchName: 'feature-branch' });

      manager.acquire({
        featureId: 'feature-2',
        projectPath: '/test/project',
        isAutoMode: true,
      });
      // feature-2 has null branchName

      const featureBranchCount = await manager.getRunningCountForWorktree(
        '/test/project',
        'feature-branch'
      );
      expect(featureBranchCount).toBe(1);

      const mainWorktreeCount = await manager.getRunningCountForWorktree('/test/project', null);
      expect(mainWorktreeCount).toBe(1);
    });

    it('should respect branch normalization (main is treated as null)', async () => {
      mockGetCurrentBranch.mockResolvedValue('main');

      // Feature with branchName 'main' should count as main worktree
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });
      manager.updateRunningFeature('feature-1', { branchName: 'main' });

      // Feature with branchName null should also count as main worktree
      manager.acquire({
        featureId: 'feature-2',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      const mainCount = await manager.getRunningCountForWorktree('/test/project', null);
      expect(mainCount).toBe(2);
    });

    it('should filter by both projectPath and branchName', async () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/project-a',
        isAutoMode: true,
      });
      manager.updateRunningFeature('feature-1', { branchName: 'feature-x' });

      manager.acquire({
        featureId: 'feature-2',
        projectPath: '/project-b',
        isAutoMode: true,
      });
      manager.updateRunningFeature('feature-2', { branchName: 'feature-x' });

      const countA = await manager.getRunningCountForWorktree('/project-a', 'feature-x');
      const countB = await manager.getRunningCountForWorktree('/project-b', 'feature-x');

      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });
  });

  describe('getAllRunning', () => {
    it('should return empty array when no features are running', () => {
      expect(manager.getAllRunning()).toEqual([]);
    });

    it('should return array with all running features', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/project-a',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-2',
        projectPath: '/project-b',
        isAutoMode: false,
      });

      const running = manager.getAllRunning();
      expect(running).toHaveLength(2);
      expect(running.map((r) => r.featureId)).toContain('feature-1');
      expect(running.map((r) => r.featureId)).toContain('feature-2');
    });

    it('should include feature metadata', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/project-a',
        isAutoMode: true,
      });
      manager.updateRunningFeature('feature-1', { model: 'claude-sonnet-4', provider: 'claude' });

      const running = manager.getAllRunning();
      expect(running[0].model).toBe('claude-sonnet-4');
      expect(running[0].provider).toBe('claude');
    });
  });

  describe('updateRunningFeature', () => {
    it('should update worktreePath and branchName', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.updateRunningFeature('feature-1', {
        worktreePath: '/worktrees/feature-1',
        branchName: 'feature-1-branch',
      });

      const entry = manager.getRunningFeature('feature-1');
      expect(entry?.worktreePath).toBe('/worktrees/feature-1');
      expect(entry?.branchName).toBe('feature-1-branch');
    });

    it('should update model and provider', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.updateRunningFeature('feature-1', {
        model: 'claude-opus-4-5-20251101',
        provider: 'claude',
      });

      const entry = manager.getRunningFeature('feature-1');
      expect(entry?.model).toBe('claude-opus-4-5-20251101');
      expect(entry?.provider).toBe('claude');
    });

    it('should do nothing for non-existent feature', () => {
      // Should not throw
      manager.updateRunningFeature('non-existent', { model: 'test' });
    });

    it('should preserve other properties when updating partial fields', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      const original = manager.getRunningFeature('feature-1');
      const originalStartTime = original?.startTime;

      manager.updateRunningFeature('feature-1', { model: 'claude-sonnet-4' });

      const updated = manager.getRunningFeature('feature-1');
      expect(updated?.startTime).toBe(originalStartTime);
      expect(updated?.projectPath).toBe('/test/project');
      expect(updated?.isAutoMode).toBe(true);
      expect(updated?.model).toBe('claude-sonnet-4');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple features for same project', () => {
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-2',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      manager.acquire({
        featureId: 'feature-3',
        projectPath: '/test/project',
        isAutoMode: false,
      });

      expect(manager.getRunningCount('/test/project')).toBe(3);
      expect(manager.isRunning('feature-1')).toBe(true);
      expect(manager.isRunning('feature-2')).toBe(true);
      expect(manager.isRunning('feature-3')).toBe(true);
    });

    it('should handle features across different worktrees', async () => {
      // Main worktree feature
      manager.acquire({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: true,
      });

      // Worktree A feature
      manager.acquire({
        featureId: 'feature-2',
        projectPath: '/test/project',
        isAutoMode: true,
      });
      manager.updateRunningFeature('feature-2', {
        worktreePath: '/worktrees/a',
        branchName: 'branch-a',
      });

      // Worktree B feature
      manager.acquire({
        featureId: 'feature-3',
        projectPath: '/test/project',
        isAutoMode: true,
      });
      manager.updateRunningFeature('feature-3', {
        worktreePath: '/worktrees/b',
        branchName: 'branch-b',
      });

      expect(await manager.getRunningCountForWorktree('/test/project', null)).toBe(1);
      expect(await manager.getRunningCountForWorktree('/test/project', 'branch-a')).toBe(1);
      expect(await manager.getRunningCountForWorktree('/test/project', 'branch-b')).toBe(1);
      expect(manager.getRunningCount('/test/project')).toBe(3);
    });

    it('should return 0 counts and empty arrays for empty state', () => {
      expect(manager.getRunningCount('/any/project')).toBe(0);
      expect(manager.getAllRunning()).toEqual([]);
      expect(manager.isRunning('any-feature')).toBe(false);
      expect(manager.getRunningFeature('any-feature')).toBeUndefined();
    });
  });
});
