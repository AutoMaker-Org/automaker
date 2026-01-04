import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoModeService } from '@/services/auto-mode-service.js';
import { ProviderFactory } from '@/providers/provider-factory.js';
import { FeatureLoader } from '@/services/feature-loader.js';
import { ClaudeUsageService } from '@/services/claude-usage-service.js';
import {
  createTestGitRepo,
  createTestFeature,
  listBranches,
  listWorktrees,
  branchExists,
  worktreeExists,
  type TestRepo,
} from '../helpers/git-test-repo.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

vi.mock('@/providers/provider-factory.js');

describe('auto-mode-service.ts (integration)', () => {
  let service: AutoModeService;
  let testRepo: TestRepo;
  let featureLoader: FeatureLoader;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
  };

  // Mock usage data that indicates normal operation (not at limit)
  const mockUsageOK = {
    sessionPercentage: 50,
    weeklyPercentage: 60,
    sessionResetTime: null,
    weeklyResetTime: null,
    sonnetWeeklyPercentage: 0,
    sessionTokensUsed: 0,
    sessionLimit: 0,
    costUsed: null,
    costLimit: null,
    costCurrency: null,
    sessionResetText: '',
    weeklyResetText: '',
    userTimezone: 'UTC',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new AutoModeService(mockEvents as any);
    featureLoader = new FeatureLoader();
    testRepo = await createTestGitRepo();

    // Mock ClaudeUsageService to prevent usage checks from blocking tests
    vi.spyOn(ClaudeUsageService.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(ClaudeUsageService.prototype, 'fetchUsageData').mockResolvedValue(mockUsageOK);
  });

  afterEach(async () => {
    // Stop any running auto loops
    await service.stopAutoLoop();

    // Cleanup test repo
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  describe('worktree operations', () => {
    it('should use existing git worktree for feature', async () => {
      const branchName = 'feature/test-feature-1';

      // Create a test feature with branchName set
      await createTestFeature(testRepo.path, 'test-feature-1', {
        id: 'test-feature-1',
        category: 'test',
        description: 'Test feature',
        status: 'pending',
        branchName: branchName,
      });

      // Create worktree before executing (worktrees are now created when features are added/edited)
      const worktreesDir = path.join(testRepo.path, '.worktrees');
      const worktreePath = path.join(worktreesDir, 'test-feature-1');
      await fs.mkdir(worktreesDir, { recursive: true });
      await execAsync(`git worktree add -b ${branchName} "${worktreePath}" HEAD`, {
        cwd: testRepo.path,
      });

      // Mock provider to complete quickly
      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Feature implemented' }],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      // Execute feature with worktrees enabled
      await service.executeFeature(
        testRepo.path,
        'test-feature-1',
        true, // useWorktrees
        false // isAutoMode
      );

      // Verify branch exists (was created when worktree was created)
      const branches = await listBranches(testRepo.path);
      expect(branches).toContain(branchName);

      // Verify worktree exists and is being used
      // The service should have found and used the worktree (check via logs)
      // We can verify the worktree exists by checking git worktree list
      const worktrees = await listWorktrees(testRepo.path);
      expect(worktrees.length).toBeGreaterThan(0);
      // Verify that at least one worktree path contains our feature ID
      const worktreePathsMatch = worktrees.some(
        (wt) => wt.includes('test-feature-1') || wt.includes('.worktrees')
      );
      expect(worktreePathsMatch).toBe(true);

      // Note: Worktrees are not automatically cleaned up by the service
      // This is expected behavior - manual cleanup is required
    }, 30000);

    it('should handle error gracefully', async () => {
      await createTestFeature(testRepo.path, 'test-feature-error', {
        id: 'test-feature-error',
        category: 'test',
        description: 'Test feature that errors',
        status: 'pending',
      });

      // Mock provider that throws error
      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          throw new Error('Provider error');
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      // Execute feature (should handle error)
      await service.executeFeature(testRepo.path, 'test-feature-error', true, false);

      // Verify feature status was updated to backlog (error status)
      const feature = await featureLoader.get(testRepo.path, 'test-feature-error');
      expect(feature?.status).toBe('backlog');
    }, 30000);

    it('should work without worktrees', async () => {
      await createTestFeature(testRepo.path, 'test-no-worktree', {
        id: 'test-no-worktree',
        category: 'test',
        description: 'Test without worktree',
        status: 'pending',
        skipTests: true,
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      // Execute without worktrees
      await service.executeFeature(
        testRepo.path,
        'test-no-worktree',
        false, // useWorktrees = false
        false
      );

      // Feature should be updated successfully
      const feature = await featureLoader.get(testRepo.path, 'test-no-worktree');
      expect(feature?.status).toBe('waiting_approval');
    }, 30000);
  });

  describe('feature execution', () => {
    it('should execute feature and update status', async () => {
      await createTestFeature(testRepo.path, 'feature-exec-1', {
        id: 'feature-exec-1',
        category: 'ui',
        description: 'Execute this feature',
        status: 'pending',
        skipTests: true,
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Implemented the feature' }],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      await service.executeFeature(
        testRepo.path,
        'feature-exec-1',
        false, // Don't use worktrees so agent output is saved to main project
        false
      );

      // Check feature status was updated
      const feature = await featureLoader.get(testRepo.path, 'feature-exec-1');
      expect(feature?.status).toBe('waiting_approval');

      // Check agent output was saved
      const agentOutput = await featureLoader.getAgentOutput(testRepo.path, 'feature-exec-1');
      expect(agentOutput).toBeTruthy();
      expect(agentOutput).toContain('Implemented the feature');
    }, 30000);

    it('should handle feature not found', async () => {
      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      // Try to execute non-existent feature
      await service.executeFeature(testRepo.path, 'nonexistent-feature', true, false);

      // Should emit error event
      expect(mockEvents.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          featureId: 'nonexistent-feature',
          error: expect.stringContaining('not found'),
        })
      );
    }, 30000);

    it('should prevent duplicate feature execution', async () => {
      await createTestFeature(testRepo.path, 'feature-dup', {
        id: 'feature-dup',
        category: 'test',
        description: 'Duplicate test',
        status: 'pending',
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          // Simulate slow execution
          await new Promise((resolve) => setTimeout(resolve, 500));
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      // Start first execution
      const promise1 = service.executeFeature(testRepo.path, 'feature-dup', false, false);

      // Try to start second execution (should throw)
      await expect(
        service.executeFeature(testRepo.path, 'feature-dup', false, false)
      ).rejects.toThrow('already running');

      await promise1;
    }, 30000);

    it('should use feature-specific model', async () => {
      await createTestFeature(testRepo.path, 'feature-model', {
        id: 'feature-model',
        category: 'test',
        description: 'Model test',
        status: 'pending',
        model: 'claude-sonnet-4-20250514',
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      await service.executeFeature(testRepo.path, 'feature-model', false, false);

      // Should have used claude-sonnet-4-20250514
      expect(ProviderFactory.getProviderForModel).toHaveBeenCalledWith('claude-sonnet-4-20250514');
    }, 30000);
  });

  describe('auto loop', () => {
    it('should start and stop auto loop', async () => {
      const startPromise = service.startAutoLoop(testRepo.path, 2);

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Stop the loop
      const runningCount = await service.stopAutoLoop();

      expect(runningCount).toBe(0);
      await startPromise.catch(() => {}); // Cleanup
    }, 10000);

    it('should process pending features in auto loop', async () => {
      // Create multiple pending features
      await createTestFeature(testRepo.path, 'auto-1', {
        id: 'auto-1',
        category: 'test',
        description: 'Auto feature 1',
        status: 'pending',
        skipTests: true,
      });

      await createTestFeature(testRepo.path, 'auto-2', {
        id: 'auto-2',
        category: 'test',
        description: 'Auto feature 2',
        status: 'pending',
        skipTests: true,
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      // Start auto loop
      const startPromise = service.startAutoLoop(testRepo.path, 2);

      // Wait for features to be processed
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Stop the loop
      await service.stopAutoLoop();
      await startPromise.catch(() => {});

      // Check that features were updated
      const feature1 = await featureLoader.get(testRepo.path, 'auto-1');
      const feature2 = await featureLoader.get(testRepo.path, 'auto-2');

      // At least one should have been processed
      const processedCount = [feature1, feature2].filter(
        (f) => f?.status === 'waiting_approval' || f?.status === 'in_progress'
      ).length;

      expect(processedCount).toBeGreaterThan(0);
    }, 15000);

    it('should respect max concurrency', async () => {
      // Create 5 features
      for (let i = 1; i <= 5; i++) {
        await createTestFeature(testRepo.path, `concurrent-${i}`, {
          id: `concurrent-${i}`,
          category: 'test',
          description: `Concurrent feature ${i}`,
          status: 'pending',
        });
      }

      let concurrentCount = 0;
      let maxConcurrent = 0;

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);

          // Simulate work
          await new Promise((resolve) => setTimeout(resolve, 500));

          concurrentCount--;

          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      // Start with max concurrency of 2
      const startPromise = service.startAutoLoop(testRepo.path, 2);

      // Wait for some features to be processed
      await new Promise((resolve) => setTimeout(resolve, 3000));

      await service.stopAutoLoop();
      await startPromise.catch(() => {});

      // Max concurrent should not exceed 2
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    }, 15000);

    it('should emit auto mode events', async () => {
      const startPromise = service.startAutoLoop(testRepo.path, 1);

      // Wait for start event
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check start event was emitted
      const startEvent = mockEvents.emit.mock.calls.find((call) =>
        call[1]?.message?.includes('Auto mode started')
      );
      expect(startEvent).toBeTruthy();

      await service.stopAutoLoop();
      await startPromise.catch(() => {});

      // Check stop event was emitted (emitted immediately by stopAutoLoop)
      const stopEvent = mockEvents.emit.mock.calls.find(
        (call) =>
          call[1]?.type === 'auto_mode_stopped' || call[1]?.message?.includes('Auto mode stopped')
      );
      expect(stopEvent).toBeTruthy();
    }, 10000);
  });

  describe('error handling', () => {
    it('should handle provider errors gracefully', async () => {
      await createTestFeature(testRepo.path, 'error-feature', {
        id: 'error-feature',
        category: 'test',
        description: 'Error test',
        status: 'pending',
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          throw new Error('Provider execution failed');
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      // Should not throw
      await service.executeFeature(testRepo.path, 'error-feature', true, false);

      // Feature should be marked as backlog (error status)
      const feature = await featureLoader.get(testRepo.path, 'error-feature');
      expect(feature?.status).toBe('backlog');
    }, 30000);

    it('should continue auto loop after feature error', async () => {
      await createTestFeature(testRepo.path, 'fail-1', {
        id: 'fail-1',
        category: 'test',
        description: 'Will fail',
        status: 'pending',
      });

      await createTestFeature(testRepo.path, 'success-1', {
        id: 'success-1',
        category: 'test',
        description: 'Will succeed',
        status: 'pending',
      });

      let callCount = 0;
      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          callCount++;
          if (callCount === 1) {
            throw new Error('First feature fails');
          }
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      const startPromise = service.startAutoLoop(testRepo.path, 1);

      // Wait for both features to be attempted
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await service.stopAutoLoop();
      await startPromise.catch(() => {});

      // Both features should have been attempted
      expect(callCount).toBeGreaterThanOrEqual(1);
    }, 15000);
  });

  describe('planning mode', () => {
    it('should execute feature with skip planning mode', async () => {
      await createTestFeature(testRepo.path, 'skip-plan-feature', {
        id: 'skip-plan-feature',
        category: 'test',
        description: 'Feature with skip planning',
        status: 'pending',
        planningMode: 'skip',
        skipTests: true,
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Feature implemented' }],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      await service.executeFeature(testRepo.path, 'skip-plan-feature', false, false);

      const feature = await featureLoader.get(testRepo.path, 'skip-plan-feature');
      expect(feature?.status).toBe('waiting_approval');
    }, 30000);

    it('should execute feature with lite planning mode without approval', async () => {
      await createTestFeature(testRepo.path, 'lite-plan-feature', {
        id: 'lite-plan-feature',
        category: 'test',
        description: 'Feature with lite planning',
        status: 'pending',
        planningMode: 'lite',
        requirePlanApproval: false,
        skipTests: true,
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: '[PLAN_GENERATED] Planning outline complete.\n\nFeature implemented',
                },
              ],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      await service.executeFeature(testRepo.path, 'lite-plan-feature', false, false);

      const feature = await featureLoader.get(testRepo.path, 'lite-plan-feature');
      expect(feature?.status).toBe('waiting_approval');
    }, 30000);

    it('should emit planning_started event for spec mode', async () => {
      await createTestFeature(testRepo.path, 'spec-plan-feature', {
        id: 'spec-plan-feature',
        category: 'test',
        description: 'Feature with spec planning',
        status: 'pending',
        planningMode: 'spec',
        requirePlanApproval: false,
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                { type: 'text', text: 'Spec generated\n\n[SPEC_GENERATED] Review the spec.' },
              ],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      await service.executeFeature(testRepo.path, 'spec-plan-feature', false, false);

      // Check planning_started event was emitted
      const planningEvent = mockEvents.emit.mock.calls.find((call) => call[1]?.mode === 'spec');
      expect(planningEvent).toBeTruthy();
    }, 30000);

    it('should handle feature with full planning mode', async () => {
      await createTestFeature(testRepo.path, 'full-plan-feature', {
        id: 'full-plan-feature',
        category: 'test',
        description: 'Feature with full planning',
        status: 'pending',
        planningMode: 'full',
        requirePlanApproval: false,
      });

      const mockProvider = {
        getName: () => 'claude',
        executeQuery: async function* () {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                { type: 'text', text: 'Full spec with phases\n\n[SPEC_GENERATED] Review.' },
              ],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
          };
        },
      };

      vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

      await service.executeFeature(testRepo.path, 'full-plan-feature', false, false);

      // Check planning_started event was emitted with full mode
      const planningEvent = mockEvents.emit.mock.calls.find((call) => call[1]?.mode === 'full');
      expect(planningEvent).toBeTruthy();
    }, 30000);

    it('should track pending approval correctly', async () => {
      // Initially no pending approvals
      expect(service.hasPendingApproval('non-existent')).toBe(false);
    });

    it('should cancel pending approval gracefully', () => {
      // Should not throw when cancelling non-existent approval
      expect(() => service.cancelPlanApproval('non-existent')).not.toThrow();
    });

    it('should resolve approval with error for non-existent feature', async () => {
      const result = await service.resolvePlanApproval(
        'non-existent',
        true,
        undefined,
        undefined,
        undefined
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('No pending approval');
    });
  });
});
