import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AutoLoopCoordinator,
  getWorktreeAutoLoopKey,
  type AutoModeConfig,
  type ProjectAutoLoopState,
  type ExecuteFeatureFn,
  type LoadPendingFeaturesFn,
  type LoadAllFeaturesFn,
  type SaveExecutionStateFn,
  type ClearExecutionStateFn,
  type ResetStuckFeaturesFn,
  type IsFeatureFinishedFn,
} from '../../../src/services/auto-loop-coordinator.js';
import type { TypedEventBus } from '../../../src/services/typed-event-bus.js';
import type { ConcurrencyManager } from '../../../src/services/concurrency-manager.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { Feature } from '@automaker/types';

describe('auto-loop-coordinator.ts', () => {
  // Mock dependencies
  let mockEventBus: TypedEventBus;
  let mockConcurrencyManager: ConcurrencyManager;
  let mockSettingsService: SettingsService | null;

  // Callback mocks
  let mockExecuteFeature: ExecuteFeatureFn;
  let mockLoadPendingFeatures: LoadPendingFeaturesFn;
  let mockLoadAllFeatures: LoadAllFeaturesFn;
  let mockSaveExecutionState: SaveExecutionStateFn;
  let mockClearExecutionState: ClearExecutionStateFn;
  let mockResetStuckFeatures: ResetStuckFeaturesFn;
  let mockIsFeatureFinished: IsFeatureFinishedFn;
  let mockIsFeatureRunning: (featureId: string) => boolean;

  let coordinator: AutoLoopCoordinator;

  const testFeature: Feature = {
    id: 'feature-1',
    title: 'Test Feature',
    category: 'test',
    description: 'Test description',
    status: 'ready',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockEventBus = {
      emitAutoModeEvent: vi.fn(),
    } as unknown as TypedEventBus;

    mockConcurrencyManager = {
      getRunningCountForWorktree: vi.fn().mockResolvedValue(0),
      isRunning: vi.fn().mockReturnValue(false),
    } as unknown as ConcurrencyManager;

    mockSettingsService = {
      getGlobalSettings: vi.fn().mockResolvedValue({
        maxConcurrency: 3,
        projects: [{ id: 'proj-1', path: '/test/project' }],
        autoModeByWorktree: {},
      }),
    } as unknown as SettingsService;

    // Callback mocks
    mockExecuteFeature = vi.fn().mockResolvedValue(undefined);
    mockLoadPendingFeatures = vi.fn().mockResolvedValue([]);
    mockLoadAllFeatures = vi.fn().mockResolvedValue([]);
    mockSaveExecutionState = vi.fn().mockResolvedValue(undefined);
    mockClearExecutionState = vi.fn().mockResolvedValue(undefined);
    mockResetStuckFeatures = vi.fn().mockResolvedValue(undefined);
    mockIsFeatureFinished = vi.fn().mockReturnValue(false);
    mockIsFeatureRunning = vi.fn().mockReturnValue(false);

    coordinator = new AutoLoopCoordinator(
      mockEventBus,
      mockConcurrencyManager,
      mockSettingsService,
      mockExecuteFeature,
      mockLoadPendingFeatures,
      mockSaveExecutionState,
      mockClearExecutionState,
      mockResetStuckFeatures,
      mockIsFeatureFinished,
      mockIsFeatureRunning,
      mockLoadAllFeatures
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getWorktreeAutoLoopKey', () => {
    it('returns correct key for main worktree (null branch)', () => {
      const key = getWorktreeAutoLoopKey('/test/project', null);
      expect(key).toBe('/test/project::__main__');
    });

    it('returns correct key for named branch', () => {
      const key = getWorktreeAutoLoopKey('/test/project', 'feature/test-1');
      expect(key).toBe('/test/project::feature/test-1');
    });

    it("normalizes 'main' branch to null", () => {
      const key = getWorktreeAutoLoopKey('/test/project', 'main');
      expect(key).toBe('/test/project::__main__');
    });
  });

  describe('startAutoLoopForProject', () => {
    it('throws if loop already running for project/worktree', async () => {
      // Start the first loop
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      // Try to start another - should throw
      await expect(coordinator.startAutoLoopForProject('/test/project', null, 1)).rejects.toThrow(
        'Auto mode is already running for main worktree in project'
      );
    });

    it('creates ProjectAutoLoopState with correct config', async () => {
      await coordinator.startAutoLoopForProject('/test/project', 'feature-branch', 2);

      const config = coordinator.getAutoLoopConfigForProject('/test/project', 'feature-branch');
      expect(config).toEqual({
        maxConcurrency: 2,
        useWorktrees: true,
        projectPath: '/test/project',
        branchName: 'feature-branch',
      });
    });

    it('emits auto_mode_started event', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 3);

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith('auto_mode_started', {
        message: 'Auto mode started with max 3 concurrent features',
        projectPath: '/test/project',
        branchName: null,
        maxConcurrency: 3,
      });
    });

    it('calls saveExecutionState', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 3);

      expect(mockSaveExecutionState).toHaveBeenCalledWith('/test/project', null, 3);
    });

    it('resets stuck features on start', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      expect(mockResetStuckFeatures).toHaveBeenCalledWith('/test/project');
    });

    it('uses settings maxConcurrency when not provided', async () => {
      const result = await coordinator.startAutoLoopForProject('/test/project', null);

      expect(result).toBe(3); // from mockSettingsService
    });

    it('uses worktree-specific maxConcurrency from settings', async () => {
      vi.mocked(mockSettingsService!.getGlobalSettings).mockResolvedValue({
        maxConcurrency: 5,
        projects: [{ id: 'proj-1', path: '/test/project' }],
        autoModeByWorktree: {
          'proj-1::__main__': { maxConcurrency: 7 },
        },
      });

      const result = await coordinator.startAutoLoopForProject('/test/project', null);

      expect(result).toBe(7);
    });
  });

  describe('stopAutoLoopForProject', () => {
    it('aborts running loop', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      const result = await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(result).toBe(0);
      expect(coordinator.isAutoLoopRunningForProject('/test/project', null)).toBe(false);
    });

    it('emits auto_mode_stopped event', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      vi.mocked(mockEventBus.emitAutoModeEvent).mockClear();

      await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith('auto_mode_stopped', {
        message: 'Auto mode stopped',
        projectPath: '/test/project',
        branchName: null,
      });
    });

    it('calls clearExecutionState', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(mockClearExecutionState).toHaveBeenCalledWith('/test/project', null);
    });

    it('returns 0 when no loop running', async () => {
      const result = await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(result).toBe(0);
      expect(mockClearExecutionState).not.toHaveBeenCalled();
    });
  });

  describe('isAutoLoopRunningForProject', () => {
    it('returns true when running', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      expect(coordinator.isAutoLoopRunningForProject('/test/project', null)).toBe(true);
    });

    it('returns false when not running', () => {
      expect(coordinator.isAutoLoopRunningForProject('/test/project', null)).toBe(false);
    });

    it('returns false for different worktree', async () => {
      await coordinator.startAutoLoopForProject('/test/project', 'branch-a', 1);

      expect(coordinator.isAutoLoopRunningForProject('/test/project', 'branch-b')).toBe(false);
    });
  });

  describe('runAutoLoopForProject', () => {
    it('loads pending features each iteration', async () => {
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([]);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      // Advance time to trigger loop iterations
      await vi.advanceTimersByTimeAsync(11000);

      // Stop the loop to avoid hanging
      await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(mockLoadPendingFeatures).toHaveBeenCalled();
    });

    it('executes features within concurrency limit', async () => {
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([testFeature]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 2);

      // Advance time to trigger loop iteration
      await vi.advanceTimersByTimeAsync(3000);

      // Stop the loop
      await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(mockExecuteFeature).toHaveBeenCalledWith('/test/project', 'feature-1', true, true);
    });

    it('emits idle event when no work remains (running=0, pending=0)', async () => {
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      // Clear the initial event mock calls
      vi.mocked(mockEventBus.emitAutoModeEvent).mockClear();

      // Advance time to trigger loop iteration and idle event
      await vi.advanceTimersByTimeAsync(11000);

      // Stop the loop
      await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith('auto_mode_idle', {
        message: 'No pending features - auto mode idle',
        projectPath: '/test/project',
        branchName: null,
      });
    });

    it('skips already-running features', async () => {
      const feature2: Feature = { ...testFeature, id: 'feature-2' };
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([testFeature, feature2]);
      vi.mocked(mockIsFeatureRunning)
        .mockReturnValueOnce(true) // feature-1 is running
        .mockReturnValueOnce(false); // feature-2 is not running

      await coordinator.startAutoLoopForProject('/test/project', null, 2);

      await vi.advanceTimersByTimeAsync(3000);

      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should execute feature-2, not feature-1
      expect(mockExecuteFeature).toHaveBeenCalledWith('/test/project', 'feature-2', true, true);
    });

    it('stops when aborted', async () => {
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([testFeature]);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      // Stop immediately
      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should not have executed many features
      expect(mockExecuteFeature.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it('waits when at capacity', async () => {
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([testFeature]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(2); // At capacity for maxConcurrency=2

      await coordinator.startAutoLoopForProject('/test/project', null, 2);

      await vi.advanceTimersByTimeAsync(6000);

      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should not have executed features because at capacity
      expect(mockExecuteFeature).not.toHaveBeenCalled();
    });

    it('counts all running features (auto + manual) against concurrency limit', async () => {
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([testFeature]);
      // 2 manual features running — total count is 2
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(2);

      await coordinator.startAutoLoopForProject('/test/project', null, 2);

      await vi.advanceTimersByTimeAsync(6000);

      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should NOT execute because total running count (2) meets the concurrency limit (2)
      expect(mockExecuteFeature).not.toHaveBeenCalled();
      // Verify it was called WITHOUT autoModeOnly (counts all tasks)
      // The coordinator's wrapper passes options through as undefined when not specified
      expect(mockConcurrencyManager.getRunningCountForWorktree).toHaveBeenCalledWith(
        '/test/project',
        null,
        undefined
      );
    });

    it('allows auto dispatch when manual tasks finish and capacity becomes available', async () => {
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([testFeature]);
      // First call: at capacity (2 manual features running)
      // Second call: capacity freed (1 feature running)
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree)
        .mockResolvedValueOnce(2) // at capacity
        .mockResolvedValueOnce(1); // capacity available after manual task completes

      await coordinator.startAutoLoopForProject('/test/project', null, 2);

      // First iteration: at capacity, should wait
      await vi.advanceTimersByTimeAsync(5000);

      // Second iteration: capacity available, should execute
      await vi.advanceTimersByTimeAsync(6000);

      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should execute after capacity freed
      expect(mockExecuteFeature).toHaveBeenCalledWith('/test/project', 'feature-1', true, true);
    });

    it('waits when manually started tasks already fill concurrency limit at auto mode activation', async () => {
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([testFeature]);
      // Manual tasks already fill the limit
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(3);

      await coordinator.startAutoLoopForProject('/test/project', null, 3);

      await vi.advanceTimersByTimeAsync(6000);

      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Auto mode should remain waiting, not dispatch
      expect(mockExecuteFeature).not.toHaveBeenCalled();
    });

    it('resumes dispatching when all running tasks complete simultaneously', async () => {
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([testFeature]);
      // First check: all 3 slots occupied
      // Second check: all tasks completed simultaneously
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree)
        .mockResolvedValueOnce(3) // all slots full
        .mockResolvedValueOnce(0); // all tasks completed at once

      await coordinator.startAutoLoopForProject('/test/project', null, 3);

      // First iteration: at capacity
      await vi.advanceTimersByTimeAsync(5000);
      // Second iteration: all freed
      await vi.advanceTimersByTimeAsync(6000);

      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should execute after all tasks freed capacity
      expect(mockExecuteFeature).toHaveBeenCalledWith('/test/project', 'feature-1', true, true);
    });
  });

  describe('priority-based feature selection', () => {
    it('selects highest priority feature first (lowest number)', async () => {
      const lowPriority: Feature = {
        ...testFeature,
        id: 'feature-low',
        priority: 3,
        title: 'Low Priority',
      };
      const highPriority: Feature = {
        ...testFeature,
        id: 'feature-high',
        priority: 1,
        title: 'High Priority',
      };
      const medPriority: Feature = {
        ...testFeature,
        id: 'feature-med',
        priority: 2,
        title: 'Med Priority',
      };

      // Return features in non-priority order
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([
        lowPriority,
        medPriority,
        highPriority,
      ]);
      vi.mocked(mockLoadAllFeatures).mockResolvedValue([lowPriority, medPriority, highPriority]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      await vi.advanceTimersByTimeAsync(3000);
      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should execute the highest priority feature (priority=1)
      expect(mockExecuteFeature).toHaveBeenCalledWith('/test/project', 'feature-high', true, true);
    });

    it('uses default priority of 2 when not specified', async () => {
      const noPriority: Feature = { ...testFeature, id: 'feature-none', title: 'No Priority' };
      const highPriority: Feature = {
        ...testFeature,
        id: 'feature-high',
        priority: 1,
        title: 'High Priority',
      };

      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([noPriority, highPriority]);
      vi.mocked(mockLoadAllFeatures).mockResolvedValue([noPriority, highPriority]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      await vi.advanceTimersByTimeAsync(3000);
      await coordinator.stopAutoLoopForProject('/test/project', null);

      // High priority (1) should be selected over default priority (2)
      expect(mockExecuteFeature).toHaveBeenCalledWith('/test/project', 'feature-high', true, true);
    });

    it('selects first feature when priorities are equal', async () => {
      const featureA: Feature = {
        ...testFeature,
        id: 'feature-a',
        priority: 2,
        title: 'Feature A',
      };
      const featureB: Feature = {
        ...testFeature,
        id: 'feature-b',
        priority: 2,
        title: 'Feature B',
      };

      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([featureA, featureB]);
      vi.mocked(mockLoadAllFeatures).mockResolvedValue([featureA, featureB]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      await vi.advanceTimersByTimeAsync(3000);
      await coordinator.stopAutoLoopForProject('/test/project', null);

      // When priorities equal, the first feature from the filtered list should be chosen
      expect(mockExecuteFeature).toHaveBeenCalledWith('/test/project', 'feature-a', true, true);
    });
  });

  describe('dependency-aware feature selection', () => {
    it('skips features with unsatisfied dependencies', async () => {
      const depFeature: Feature = {
        ...testFeature,
        id: 'feature-dep',
        status: 'in_progress',
        title: 'Dependency Feature',
      };
      const blockedFeature: Feature = {
        ...testFeature,
        id: 'feature-blocked',
        dependencies: ['feature-dep'],
        priority: 1,
        title: 'Blocked Feature',
      };
      const readyFeature: Feature = {
        ...testFeature,
        id: 'feature-ready',
        priority: 2,
        title: 'Ready Feature',
      };

      // Pending features (backlog/ready status)
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([blockedFeature, readyFeature]);
      // All features (including the in-progress dependency)
      vi.mocked(mockLoadAllFeatures).mockResolvedValue([depFeature, blockedFeature, readyFeature]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      await vi.advanceTimersByTimeAsync(3000);
      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should skip blocked feature (dependency not complete) and execute ready feature
      expect(mockExecuteFeature).toHaveBeenCalledWith('/test/project', 'feature-ready', true, true);
      expect(mockExecuteFeature).not.toHaveBeenCalledWith(
        '/test/project',
        'feature-blocked',
        true,
        true
      );
    });

    it('picks features whose dependencies are completed', async () => {
      const completedDep: Feature = {
        ...testFeature,
        id: 'feature-dep',
        status: 'completed',
        title: 'Completed Dependency',
      };
      const unblockedFeature: Feature = {
        ...testFeature,
        id: 'feature-unblocked',
        dependencies: ['feature-dep'],
        priority: 1,
        title: 'Unblocked Feature',
      };

      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([unblockedFeature]);
      vi.mocked(mockLoadAllFeatures).mockResolvedValue([completedDep, unblockedFeature]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      await vi.advanceTimersByTimeAsync(3000);
      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should execute the unblocked feature since its dependency is completed
      expect(mockExecuteFeature).toHaveBeenCalledWith(
        '/test/project',
        'feature-unblocked',
        true,
        true
      );
    });

    it('picks features whose dependencies are verified', async () => {
      const verifiedDep: Feature = {
        ...testFeature,
        id: 'feature-dep',
        status: 'verified',
        title: 'Verified Dependency',
      };
      const unblockedFeature: Feature = {
        ...testFeature,
        id: 'feature-unblocked',
        dependencies: ['feature-dep'],
        priority: 1,
        title: 'Unblocked Feature',
      };

      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([unblockedFeature]);
      vi.mocked(mockLoadAllFeatures).mockResolvedValue([verifiedDep, unblockedFeature]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      await vi.advanceTimersByTimeAsync(3000);
      await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(mockExecuteFeature).toHaveBeenCalledWith(
        '/test/project',
        'feature-unblocked',
        true,
        true
      );
    });

    it('respects both priority and dependencies together', async () => {
      const completedDep: Feature = {
        ...testFeature,
        id: 'feature-dep',
        status: 'completed',
        title: 'Completed Dep',
      };
      const blockedHighPriority: Feature = {
        ...testFeature,
        id: 'feature-blocked-hp',
        dependencies: ['feature-not-done'],
        priority: 1,
        title: 'Blocked High Priority',
      };
      const unblockedLowPriority: Feature = {
        ...testFeature,
        id: 'feature-unblocked-lp',
        dependencies: ['feature-dep'],
        priority: 3,
        title: 'Unblocked Low Priority',
      };
      const unblockedMedPriority: Feature = {
        ...testFeature,
        id: 'feature-unblocked-mp',
        priority: 2,
        title: 'Unblocked Med Priority',
      };

      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([
        blockedHighPriority,
        unblockedLowPriority,
        unblockedMedPriority,
      ]);
      vi.mocked(mockLoadAllFeatures).mockResolvedValue([
        completedDep,
        blockedHighPriority,
        unblockedLowPriority,
        unblockedMedPriority,
      ]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      await vi.advanceTimersByTimeAsync(3000);
      await coordinator.stopAutoLoopForProject('/test/project', null);

      // Should skip blocked high-priority and pick the unblocked medium-priority
      expect(mockExecuteFeature).toHaveBeenCalledWith(
        '/test/project',
        'feature-unblocked-mp',
        true,
        true
      );
      expect(mockExecuteFeature).not.toHaveBeenCalledWith(
        '/test/project',
        'feature-blocked-hp',
        true,
        true
      );
    });

    it('handles features with no dependencies (always eligible)', async () => {
      const noDeps: Feature = {
        ...testFeature,
        id: 'feature-no-deps',
        priority: 2,
        title: 'No Dependencies',
      };

      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([noDeps]);
      vi.mocked(mockLoadAllFeatures).mockResolvedValue([noDeps]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);

      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      await vi.advanceTimersByTimeAsync(3000);
      await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(mockExecuteFeature).toHaveBeenCalledWith(
        '/test/project',
        'feature-no-deps',
        true,
        true
      );
    });
  });

  describe('failure tracking', () => {
    it('trackFailureAndCheckPauseForProject returns true after threshold', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      // Track 3 failures (threshold)
      const result1 = coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Error 1',
      });
      expect(result1).toBe(false);

      const result2 = coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Error 2',
      });
      expect(result2).toBe(false);

      const result3 = coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Error 3',
      });
      expect(result3).toBe(true); // Should pause after 3

      await coordinator.stopAutoLoopForProject('/test/project', null);
    });

    it('agent errors count as failures', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      const result = coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Agent failed',
      });

      // First error should not pause
      expect(result).toBe(false);

      await coordinator.stopAutoLoopForProject('/test/project', null);
    });

    it('clears failures on success (recordSuccessForProject)', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      // Add 2 failures
      coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Error 1',
      });
      coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Error 2',
      });

      // Record success - should clear failures
      coordinator.recordSuccessForProject('/test/project');

      // Next failure should return false (not hitting threshold)
      const result = coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Error 3',
      });
      expect(result).toBe(false);

      await coordinator.stopAutoLoopForProject('/test/project', null);
    });

    it('signalShouldPauseForProject emits event and stops loop', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      vi.mocked(mockEventBus.emitAutoModeEvent).mockClear();

      coordinator.signalShouldPauseForProject('/test/project', {
        type: 'quota_exhausted',
        message: 'Rate limited',
      });

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_paused_failures',
        expect.objectContaining({
          errorType: 'quota_exhausted',
          projectPath: '/test/project',
        })
      );

      // Loop should be stopped
      expect(coordinator.isAutoLoopRunningForProject('/test/project', null)).toBe(false);
    });

    it('quota/rate limit errors pause immediately', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      const result = coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'quota_exhausted',
        message: 'API quota exceeded',
      });

      expect(result).toBe(true); // Should pause immediately

      await coordinator.stopAutoLoopForProject('/test/project', null);
    });

    it('rate_limit type also pauses immediately', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      const result = coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'rate_limit',
        message: 'Rate limited',
      });

      expect(result).toBe(true);

      await coordinator.stopAutoLoopForProject('/test/project', null);
    });
  });

  describe('multiple projects', () => {
    it('runs concurrent loops for different projects', async () => {
      await coordinator.startAutoLoopForProject('/project-a', null, 1);
      await coordinator.startAutoLoopForProject('/project-b', null, 1);

      expect(coordinator.isAutoLoopRunningForProject('/project-a', null)).toBe(true);
      expect(coordinator.isAutoLoopRunningForProject('/project-b', null)).toBe(true);

      await coordinator.stopAutoLoopForProject('/project-a', null);
      await coordinator.stopAutoLoopForProject('/project-b', null);
    });

    it('runs concurrent loops for different worktrees of same project', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);
      await coordinator.startAutoLoopForProject('/test/project', 'feature-branch', 1);

      expect(coordinator.isAutoLoopRunningForProject('/test/project', null)).toBe(true);
      expect(coordinator.isAutoLoopRunningForProject('/test/project', 'feature-branch')).toBe(true);

      await coordinator.stopAutoLoopForProject('/test/project', null);
      await coordinator.stopAutoLoopForProject('/test/project', 'feature-branch');
    });

    it('stopping one loop does not affect others', async () => {
      await coordinator.startAutoLoopForProject('/project-a', null, 1);
      await coordinator.startAutoLoopForProject('/project-b', null, 1);

      await coordinator.stopAutoLoopForProject('/project-a', null);

      expect(coordinator.isAutoLoopRunningForProject('/project-a', null)).toBe(false);
      expect(coordinator.isAutoLoopRunningForProject('/project-b', null)).toBe(true);

      await coordinator.stopAutoLoopForProject('/project-b', null);
    });
  });

  describe('getAutoLoopConfigForProject', () => {
    it('returns config when loop is running', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 5);

      const config = coordinator.getAutoLoopConfigForProject('/test/project', null);

      expect(config).toEqual({
        maxConcurrency: 5,
        useWorktrees: true,
        projectPath: '/test/project',
        branchName: null,
      });

      await coordinator.stopAutoLoopForProject('/test/project', null);
    });

    it('returns null when no loop running', () => {
      const config = coordinator.getAutoLoopConfigForProject('/test/project', null);

      expect(config).toBeNull();
    });
  });

  describe('getRunningCountForWorktree', () => {
    it('delegates to ConcurrencyManager', async () => {
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(3);

      const count = await coordinator.getRunningCountForWorktree('/test/project', null);

      expect(count).toBe(3);
      expect(mockConcurrencyManager.getRunningCountForWorktree).toHaveBeenCalledWith(
        '/test/project',
        null,
        undefined
      );
    });

    it('passes autoModeOnly option to ConcurrencyManager', async () => {
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(1);

      const count = await coordinator.getRunningCountForWorktree('/test/project', null, {
        autoModeOnly: true,
      });

      expect(count).toBe(1);
      expect(mockConcurrencyManager.getRunningCountForWorktree).toHaveBeenCalledWith(
        '/test/project',
        null,
        { autoModeOnly: true }
      );
    });
  });

  describe('resetFailureTrackingForProject', () => {
    it('clears consecutive failures and paused flag', async () => {
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      // Add failures
      coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Error',
      });
      coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Error',
      });

      // Reset failure tracking
      coordinator.resetFailureTrackingForProject('/test/project');

      // Next 3 failures should be needed to trigger pause again
      const result1 = coordinator.trackFailureAndCheckPauseForProject('/test/project', {
        type: 'agent_error',
        message: 'Error',
      });
      expect(result1).toBe(false);

      await coordinator.stopAutoLoopForProject('/test/project', null);
    });
  });

  describe('edge cases', () => {
    it('handles null settingsService gracefully', async () => {
      const coordWithoutSettings = new AutoLoopCoordinator(
        mockEventBus,
        mockConcurrencyManager,
        null, // No settings service
        mockExecuteFeature,
        mockLoadPendingFeatures,
        mockSaveExecutionState,
        mockClearExecutionState,
        mockResetStuckFeatures,
        mockIsFeatureFinished,
        mockIsFeatureRunning
      );

      // Should use default concurrency
      const result = await coordWithoutSettings.startAutoLoopForProject('/test/project', null);

      expect(result).toBe(1); // DEFAULT_MAX_CONCURRENCY

      await coordWithoutSettings.stopAutoLoopForProject('/test/project', null);
    });

    it('handles resetStuckFeatures error gracefully', async () => {
      vi.mocked(mockResetStuckFeatures).mockRejectedValue(new Error('Reset failed'));

      // Should not throw
      await coordinator.startAutoLoopForProject('/test/project', null, 1);

      expect(mockResetStuckFeatures).toHaveBeenCalled();

      await coordinator.stopAutoLoopForProject('/test/project', null);
    });

    it('trackFailureAndCheckPauseForProject returns false when no loop', () => {
      const result = coordinator.trackFailureAndCheckPauseForProject('/nonexistent', {
        type: 'agent_error',
        message: 'Error',
      });

      expect(result).toBe(false);
    });

    it('signalShouldPauseForProject does nothing when no loop', () => {
      // Should not throw
      coordinator.signalShouldPauseForProject('/nonexistent', {
        type: 'quota_exhausted',
        message: 'Error',
      });

      expect(mockEventBus.emitAutoModeEvent).not.toHaveBeenCalledWith(
        'auto_mode_paused_failures',
        expect.anything()
      );
    });

    it('does not emit stopped event when loop was not running', async () => {
      const result = await coordinator.stopAutoLoopForProject('/test/project', null);

      expect(result).toBe(0);
      expect(mockEventBus.emitAutoModeEvent).not.toHaveBeenCalledWith(
        'auto_mode_stopped',
        expect.anything()
      );
    });

    it('bypasses dependency checks when loadAllFeaturesFn is omitted', async () => {
      // Create a dependency feature that is NOT completed (in_progress)
      const inProgressDep: Feature = {
        ...testFeature,
        id: 'dep-feature',
        status: 'in_progress',
        title: 'In-Progress Dependency',
      };
      // Create a pending feature that depends on the in-progress dep
      const pendingFeatureWithDep: Feature = {
        ...testFeature,
        id: 'feature-with-dep',
        dependencies: ['dep-feature'],
        status: 'ready',
        title: 'Feature With Dependency',
      };

      // loadAllFeaturesFn is NOT provided, so dependency checks are bypassed entirely
      // (the coordinator returns true instead of calling areDependenciesSatisfied)
      const coordWithoutLoadAll = new AutoLoopCoordinator(
        mockEventBus,
        mockConcurrencyManager,
        mockSettingsService,
        mockExecuteFeature,
        mockLoadPendingFeatures,
        mockSaveExecutionState,
        mockClearExecutionState,
        mockResetStuckFeatures,
        mockIsFeatureFinished,
        mockIsFeatureRunning
        // loadAllFeaturesFn omitted
      );

      // pendingFeatures includes the in-progress dep and the pending feature;
      // since loadAllFeaturesFn is absent, dependency checks are bypassed,
      // so pendingFeatureWithDep is eligible even though its dependency is not completed
      vi.mocked(mockLoadPendingFeatures).mockResolvedValue([inProgressDep, pendingFeatureWithDep]);
      vi.mocked(mockConcurrencyManager.getRunningCountForWorktree).mockResolvedValue(0);
      // The in-progress dep is not finished and not running, so both features pass the
      // isFeatureFinished filter; but only pendingFeatureWithDep should be executed
      // because we mark dep-feature as running to prevent it from being picked
      vi.mocked(mockIsFeatureFinished).mockReturnValue(false);
      vi.mocked(mockIsFeatureRunning as ReturnType<typeof vi.fn>).mockImplementation(
        (id: string) => id === 'dep-feature'
      );

      await coordWithoutLoadAll.startAutoLoopForProject('/test/project', null, 1);
      await vi.advanceTimersByTimeAsync(3000);
      await coordWithoutLoadAll.stopAutoLoopForProject('/test/project', null);

      // pendingFeatureWithDep executes despite its dependency not being completed,
      // because dependency checks are bypassed when loadAllFeaturesFn is omitted
      expect(mockExecuteFeature).toHaveBeenCalledWith(
        '/test/project',
        'feature-with-dep',
        true,
        true
      );
      // dep-feature is not executed because it is marked as running
      expect(mockExecuteFeature).not.toHaveBeenCalledWith(
        '/test/project',
        'dep-feature',
        true,
        true
      );
    });
  });
});
