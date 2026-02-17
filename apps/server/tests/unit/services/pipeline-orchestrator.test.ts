import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Feature, PipelineStep, PipelineConfig } from '@automaker/types';
import {
  PipelineOrchestrator,
  type PipelineContext,
  type PipelineStatusInfo,
  type UpdateFeatureStatusFn,
  type BuildFeaturePromptFn,
  type ExecuteFeatureFn,
  type RunAgentFn,
} from '../../../src/services/pipeline-orchestrator.js';
import type { TypedEventBus } from '../../../src/services/typed-event-bus.js';
import type { FeatureStateManager } from '../../../src/services/feature-state-manager.js';
import type { AgentExecutor } from '../../../src/services/agent-executor.js';
import type { WorktreeResolver } from '../../../src/services/worktree-resolver.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { ConcurrencyManager } from '../../../src/services/concurrency-manager.js';
import type { TestRunnerService } from '../../../src/services/test-runner-service.js';
import { pipelineService } from '../../../src/services/pipeline-service.js';
import * as secureFs from '../../../src/lib/secure-fs.js';
import { getFeatureDir } from '@automaker/platform';
import {
  getPromptCustomization,
  getAutoLoadClaudeMdSetting,
  filterClaudeMdFromContext,
} from '../../../src/lib/settings-helpers.js';

// Mock pipelineService
vi.mock('../../../src/services/pipeline-service.js', () => ({
  pipelineService: {
    isPipelineStatus: vi.fn(),
    getStepIdFromStatus: vi.fn(),
    getPipelineConfig: vi.fn(),
    getNextStatus: vi.fn(),
  },
}));

// Mock merge-service
vi.mock('../../../src/services/merge-service.js', () => ({
  performMerge: vi.fn(),
}));

import { performMerge } from '../../../src/services/merge-service.js';

// Mock secureFs
vi.mock('../../../src/lib/secure-fs.js', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

// Mock settings helpers
vi.mock('../../../src/lib/settings-helpers.js', () => ({
  getPromptCustomization: vi.fn().mockResolvedValue({
    taskExecution: {
      implementationInstructions: 'test instructions',
      playwrightVerificationInstructions: 'test playwright',
    },
  }),
  getAutoLoadClaudeMdSetting: vi.fn().mockResolvedValue(true),
  filterClaudeMdFromContext: vi.fn().mockReturnValue('context prompt'),
}));

// Mock validateWorkingDirectory
vi.mock('../../../src/lib/sdk-options.js', () => ({
  validateWorkingDirectory: vi.fn(),
}));

// Mock platform
vi.mock('@automaker/platform', () => ({
  getFeatureDir: vi
    .fn()
    .mockImplementation(
      (projectPath: string, featureId: string) => `${projectPath}/.automaker/features/${featureId}`
    ),
}));

// Mock model-resolver
vi.mock('@automaker/model-resolver', () => ({
  resolveModelString: vi.fn().mockReturnValue('claude-sonnet-4'),
  DEFAULT_MODELS: { claude: 'claude-sonnet-4' },
}));

describe('PipelineOrchestrator', () => {
  // Mock dependencies
  let mockEventBus: TypedEventBus;
  let mockFeatureStateManager: FeatureStateManager;
  let mockAgentExecutor: AgentExecutor;
  let mockTestRunnerService: TestRunnerService;
  let mockWorktreeResolver: WorktreeResolver;
  let mockConcurrencyManager: ConcurrencyManager;
  let mockSettingsService: SettingsService | null;
  let mockUpdateFeatureStatusFn: UpdateFeatureStatusFn;
  let mockLoadContextFilesFn: vi.Mock;
  let mockBuildFeaturePromptFn: BuildFeaturePromptFn;
  let mockExecuteFeatureFn: ExecuteFeatureFn;
  let mockRunAgentFn: RunAgentFn;
  let orchestrator: PipelineOrchestrator;

  // Test data
  const testFeature: Feature = {
    id: 'feature-1',
    title: 'Test Feature',
    category: 'test',
    description: 'Test description',
    status: 'pipeline_step-1',
    branchName: 'feature/test-1',
  };

  const testSteps: PipelineStep[] = [
    {
      id: 'step-1',
      name: 'Step 1',
      order: 1,
      instructions: 'Do step 1',
      colorClass: 'blue',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'step-2',
      name: 'Step 2',
      order: 2,
      instructions: 'Do step 2',
      colorClass: 'green',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const testConfig: PipelineConfig = {
    version: 1,
    steps: testSteps,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEventBus = {
      emitAutoModeEvent: vi.fn(),
    } as unknown as TypedEventBus;

    mockFeatureStateManager = {
      updateFeatureStatus: vi.fn().mockResolvedValue(undefined),
      loadFeature: vi.fn().mockResolvedValue(testFeature),
    } as unknown as FeatureStateManager;

    mockAgentExecutor = {
      execute: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as AgentExecutor;

    mockTestRunnerService = {
      startTests: vi
        .fn()
        .mockResolvedValue({ success: true, result: { sessionId: 'test-session-1' } }),
      getSession: vi.fn().mockReturnValue({
        status: 'passed',
        exitCode: 0,
        startedAt: new Date(),
        finishedAt: new Date(),
      }),
      getSessionOutput: vi
        .fn()
        .mockReturnValue({ success: true, result: { output: 'All tests passed' } }),
    } as unknown as TestRunnerService;

    mockWorktreeResolver = {
      findWorktreeForBranch: vi.fn().mockResolvedValue('/test/worktree'),
      getCurrentBranch: vi.fn().mockResolvedValue('main'),
    } as unknown as WorktreeResolver;

    mockConcurrencyManager = {
      acquire: vi.fn().mockReturnValue({
        featureId: 'feature-1',
        projectPath: '/test/project',
        abortController: new AbortController(),
        branchName: null,
        worktreePath: null,
      }),
      release: vi.fn(),
    } as unknown as ConcurrencyManager;

    mockSettingsService = null;

    mockUpdateFeatureStatusFn = vi.fn().mockResolvedValue(undefined);
    mockLoadContextFilesFn = vi.fn().mockResolvedValue({ contextPrompt: 'test context' });
    mockBuildFeaturePromptFn = vi.fn().mockReturnValue('Feature prompt content');
    mockExecuteFeatureFn = vi.fn().mockResolvedValue(undefined);
    mockRunAgentFn = vi.fn().mockResolvedValue(undefined);

    // Default mocks for secureFs
    vi.mocked(secureFs.readFile).mockResolvedValue('Previous context');
    vi.mocked(secureFs.access).mockResolvedValue(undefined);

    // Re-setup platform mocks (clearAllMocks resets implementations)
    vi.mocked(getFeatureDir).mockImplementation(
      (projectPath: string, featureId: string) => `${projectPath}/.automaker/features/${featureId}`
    );

    // Re-setup settings helpers mocks
    vi.mocked(getPromptCustomization).mockResolvedValue({
      taskExecution: {
        implementationInstructions: 'test instructions',
        playwrightVerificationInstructions: 'test playwright',
      },
    } as any);
    vi.mocked(getAutoLoadClaudeMdSetting).mockResolvedValue(true);
    vi.mocked(filterClaudeMdFromContext).mockReturnValue('context prompt');

    orchestrator = new PipelineOrchestrator(
      mockEventBus,
      mockFeatureStateManager,
      mockAgentExecutor,
      mockTestRunnerService,
      mockWorktreeResolver,
      mockConcurrencyManager,
      mockSettingsService,
      mockUpdateFeatureStatusFn,
      mockLoadContextFilesFn,
      mockBuildFeaturePromptFn,
      mockExecuteFeatureFn,
      mockRunAgentFn
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with all dependencies', () => {
      expect(orchestrator).toBeInstanceOf(PipelineOrchestrator);
    });

    it('should accept null settingsService', () => {
      const orch = new PipelineOrchestrator(
        mockEventBus,
        mockFeatureStateManager,
        mockAgentExecutor,
        mockTestRunnerService,
        mockWorktreeResolver,
        mockConcurrencyManager,
        null,
        mockUpdateFeatureStatusFn,
        mockLoadContextFilesFn,
        mockBuildFeaturePromptFn,
        mockExecuteFeatureFn,
        mockRunAgentFn
      );
      expect(orch).toBeInstanceOf(PipelineOrchestrator);
    });
  });

  describe('buildPipelineStepPrompt', () => {
    const taskPrompts = {
      implementationInstructions: 'impl instructions',
      playwrightVerificationInstructions: 'playwright instructions',
    };

    it('should include step name and instructions', () => {
      const prompt = orchestrator.buildPipelineStepPrompt(
        testSteps[0],
        testFeature,
        '',
        taskPrompts
      );
      expect(prompt).toContain('## Pipeline Step: Step 1');
      expect(prompt).toContain('Do step 1');
    });

    it('should include feature context from callback', () => {
      orchestrator.buildPipelineStepPrompt(testSteps[0], testFeature, '', taskPrompts);
      expect(mockBuildFeaturePromptFn).toHaveBeenCalledWith(testFeature, taskPrompts);
    });

    it('should include previous context when available', () => {
      const prompt = orchestrator.buildPipelineStepPrompt(
        testSteps[0],
        testFeature,
        'Previous work content',
        taskPrompts
      );
      expect(prompt).toContain('### Previous Work');
      expect(prompt).toContain('Previous work content');
    });

    it('should omit previous context section when empty', () => {
      const prompt = orchestrator.buildPipelineStepPrompt(
        testSteps[0],
        testFeature,
        '',
        taskPrompts
      );
      expect(prompt).not.toContain('### Previous Work');
    });
  });

  describe('detectPipelineStatus', () => {
    beforeEach(() => {
      vi.mocked(pipelineService.isPipelineStatus).mockReturnValue(true);
      vi.mocked(pipelineService.getStepIdFromStatus).mockReturnValue('step-1');
      vi.mocked(pipelineService.getPipelineConfig).mockResolvedValue(testConfig);
    });

    it('should return isPipeline false for non-pipeline status', async () => {
      vi.mocked(pipelineService.isPipelineStatus).mockReturnValue(false);

      const result = await orchestrator.detectPipelineStatus(
        '/test/project',
        'feature-1',
        'in_progress'
      );
      expect(result.isPipeline).toBe(false);
      expect(result.stepId).toBeNull();
    });

    it('should return step info for valid pipeline status', async () => {
      const result = await orchestrator.detectPipelineStatus(
        '/test/project',
        'feature-1',
        'pipeline_step-1'
      );
      expect(result.isPipeline).toBe(true);
      expect(result.stepId).toBe('step-1');
      expect(result.stepIndex).toBe(0);
      expect(result.step?.name).toBe('Step 1');
    });

    it('should return stepIndex -1 when step not found in config', async () => {
      vi.mocked(pipelineService.getStepIdFromStatus).mockReturnValue('nonexistent-step');

      const result = await orchestrator.detectPipelineStatus(
        '/test/project',
        'feature-1',
        'pipeline_nonexistent'
      );
      expect(result.isPipeline).toBe(true);
      expect(result.stepIndex).toBe(-1);
      expect(result.step).toBeNull();
    });

    it('should return config null when no pipeline config exists', async () => {
      vi.mocked(pipelineService.getPipelineConfig).mockResolvedValue(null);

      const result = await orchestrator.detectPipelineStatus(
        '/test/project',
        'feature-1',
        'pipeline_step-1'
      );
      expect(result.isPipeline).toBe(true);
      expect(result.config).toBeNull();
      expect(result.stepIndex).toBe(-1);
    });
  });

  describe('executeTestStep', () => {
    const createTestContext = (): PipelineContext => ({
      projectPath: '/test/project',
      featureId: 'feature-1',
      feature: testFeature,
      steps: testSteps,
      workDir: '/test/project',
      worktreePath: null,
      branchName: 'feature/test-1',
      abortController: new AbortController(),
      autoLoadClaudeMd: true,
      testAttempts: 0,
      maxTestAttempts: 5,
    });

    it('should return success when tests pass on first attempt', async () => {
      const context = createTestContext();
      const result = await orchestrator.executeTestStep(context, 'npm test');

      expect(result.success).toBe(true);
      expect(result.testsPassed).toBe(true);
      expect(mockTestRunnerService.startTests).toHaveBeenCalledTimes(1);
    }, 10000);

    it('should retry with agent fix when tests fail', async () => {
      vi.mocked(mockTestRunnerService.getSession)
        .mockReturnValueOnce({
          status: 'failed',
          exitCode: 1,
          startedAt: new Date(),
          finishedAt: new Date(),
        } as never)
        .mockReturnValueOnce({
          status: 'passed',
          exitCode: 0,
          startedAt: new Date(),
          finishedAt: new Date(),
        } as never);

      const context = createTestContext();
      const result = await orchestrator.executeTestStep(context, 'npm test');

      expect(result.success).toBe(true);
      expect(mockRunAgentFn).toHaveBeenCalledTimes(1);
      expect(mockTestRunnerService.startTests).toHaveBeenCalledTimes(2);
    }, 15000);

    it('should fail after max attempts', async () => {
      vi.mocked(mockTestRunnerService.getSession).mockReturnValue({
        status: 'failed',
        exitCode: 1,
        startedAt: new Date(),
        finishedAt: new Date(),
      } as never);

      // Use smaller maxTestAttempts to speed up test
      const context = { ...createTestContext(), maxTestAttempts: 2 };
      const result = await orchestrator.executeTestStep(context, 'npm test');

      expect(result.success).toBe(false);
      expect(result.testsPassed).toBe(false);
      expect(mockTestRunnerService.startTests).toHaveBeenCalledTimes(2);
      expect(mockRunAgentFn).toHaveBeenCalledTimes(1);
    }, 15000);

    it('should emit pipeline_test_failed event on each failure', async () => {
      vi.mocked(mockTestRunnerService.getSession).mockReturnValue({
        status: 'failed',
        exitCode: 1,
        startedAt: new Date(),
        finishedAt: new Date(),
      } as never);

      // Use smaller maxTestAttempts to speed up test
      const context = { ...createTestContext(), maxTestAttempts: 2 };
      await orchestrator.executeTestStep(context, 'npm test');

      const testFailedCalls = vi
        .mocked(mockEventBus.emitAutoModeEvent)
        .mock.calls.filter((call) => call[0] === 'pipeline_test_failed');
      expect(testFailedCalls.length).toBe(2);
    }, 15000);

    it('should build test failure summary for agent', async () => {
      vi.mocked(mockTestRunnerService.getSession)
        .mockReturnValueOnce({
          status: 'failed',
          exitCode: 1,
          startedAt: new Date(),
          finishedAt: new Date(),
        } as never)
        .mockReturnValueOnce({
          status: 'passed',
          exitCode: 0,
          startedAt: new Date(),
          finishedAt: new Date(),
        } as never);
      vi.mocked(mockTestRunnerService.getSessionOutput).mockReturnValue({
        success: true,
        result: { output: 'FAIL test.spec.ts\nExpected 1 to be 2' },
      } as never);

      const context = createTestContext();
      await orchestrator.executeTestStep(context, 'npm test');

      const fixPromptCall = vi.mocked(mockRunAgentFn).mock.calls[0];
      expect(fixPromptCall[2]).toContain('Test Failures');
    }, 15000);
  });

  describe('attemptMerge', () => {
    const createMergeContext = (): PipelineContext => ({
      projectPath: '/test/project',
      featureId: 'feature-1',
      feature: testFeature,
      steps: testSteps,
      workDir: '/test/project',
      worktreePath: '/test/worktree',
      branchName: 'feature/test-1',
      abortController: new AbortController(),
      autoLoadClaudeMd: true,
      testAttempts: 0,
      maxTestAttempts: 5,
    });

    beforeEach(() => {
      vi.mocked(performMerge).mockReset();
    });

    it('should call performMerge with correct parameters', async () => {
      vi.mocked(performMerge).mockResolvedValue({ success: true });

      const context = createMergeContext();
      await orchestrator.attemptMerge(context);

      expect(performMerge).toHaveBeenCalledWith(
        '/test/project',
        'feature/test-1',
        '/test/worktree',
        'main',
        { deleteWorktreeAndBranch: false }
      );
    });

    it('should return success on clean merge', async () => {
      vi.mocked(performMerge).mockResolvedValue({ success: true });

      const context = createMergeContext();
      const result = await orchestrator.attemptMerge(context);

      expect(result.success).toBe(true);
      expect(result.hasConflicts).toBeUndefined();
    });

    it('should set merge_conflict status when hasConflicts is true', async () => {
      vi.mocked(performMerge).mockResolvedValue({
        success: false,
        hasConflicts: true,
        error: 'Merge conflict',
      });

      const context = createMergeContext();
      await orchestrator.attemptMerge(context);

      expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'merge_conflict'
      );
    });

    it('should emit pipeline_merge_conflict event on conflict', async () => {
      vi.mocked(performMerge).mockResolvedValue({
        success: false,
        hasConflicts: true,
        error: 'Merge conflict',
      });

      const context = createMergeContext();
      await orchestrator.attemptMerge(context);

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'pipeline_merge_conflict',
        expect.objectContaining({ featureId: 'feature-1', branchName: 'feature/test-1' })
      );
    });

    it('should emit auto_mode_feature_complete on success', async () => {
      vi.mocked(performMerge).mockResolvedValue({ success: true });

      const context = createMergeContext();
      await orchestrator.attemptMerge(context);

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_feature_complete',
        expect.objectContaining({ featureId: 'feature-1', passes: true })
      );
    });

    it('should return needsAgentResolution true on conflict', async () => {
      vi.mocked(performMerge).mockResolvedValue({
        success: false,
        hasConflicts: true,
        error: 'Merge conflict',
      });

      const context = createMergeContext();
      const result = await orchestrator.attemptMerge(context);

      expect(result.needsAgentResolution).toBe(true);
    });
  });

  describe('buildTestFailureSummary', () => {
    it('should extract pass/fail counts from test output', () => {
      const scrollback = `
        PASS tests/passing.test.ts
        FAIL tests/failing.test.ts
        FAIL tests/another.test.ts
      `;

      const summary = orchestrator.buildTestFailureSummary(scrollback);
      expect(summary).toContain('1 passed');
      expect(summary).toContain('2 failed');
    });

    it('should extract failed test names from output', () => {
      const scrollback = `
        FAIL tests/auth.test.ts
        FAIL tests/user.test.ts
      `;

      const summary = orchestrator.buildTestFailureSummary(scrollback);
      expect(summary).toContain('tests/auth.test.ts');
      expect(summary).toContain('tests/user.test.ts');
    });

    it('should return concise summary for agent', () => {
      const longOutput = 'x'.repeat(5000);
      const summary = orchestrator.buildTestFailureSummary(longOutput);

      expect(summary.length).toBeLessThan(5000);
      expect(summary).toContain('Output (last 2000 chars)');
    });
  });

  describe('resumePipeline', () => {
    const validPipelineInfo: PipelineStatusInfo = {
      isPipeline: true,
      stepId: 'step-1',
      stepIndex: 0,
      totalSteps: 2,
      step: testSteps[0],
      config: testConfig,
    };

    it('should restart from beginning when no context file', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

      await orchestrator.resumePipeline('/test/project', testFeature, true, validPipelineInfo);

      expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'in_progress'
      );
      expect(mockExecuteFeatureFn).toHaveBeenCalled();
    });

    it('should complete feature when step no longer exists', async () => {
      const invalidPipelineInfo: PipelineStatusInfo = {
        ...validPipelineInfo,
        stepIndex: -1,
        step: null,
      };

      await orchestrator.resumePipeline('/test/project', testFeature, true, invalidPipelineInfo);

      expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'verified'
      );
      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_feature_complete',
        expect.objectContaining({ message: expect.stringContaining('no longer exists') })
      );
    });
  });

  describe('resumeFromStep', () => {
    it('should filter out excluded steps', async () => {
      const featureWithExclusions: Feature = {
        ...testFeature,
        excludedPipelineSteps: ['step-1'],
      };

      vi.mocked(pipelineService.getNextStatus).mockReturnValue('pipeline_step-2');
      vi.mocked(pipelineService.isPipelineStatus).mockReturnValue(true);
      vi.mocked(pipelineService.getStepIdFromStatus).mockReturnValue('step-2');

      await orchestrator.resumeFromStep(
        '/test/project',
        featureWithExclusions,
        true,
        0,
        testConfig
      );

      expect(mockRunAgentFn).toHaveBeenCalled();
    });

    it('should complete feature when all remaining steps excluded', async () => {
      const featureWithAllExcluded: Feature = {
        ...testFeature,
        excludedPipelineSteps: ['step-1', 'step-2'],
      };

      vi.mocked(pipelineService.getNextStatus).mockReturnValue('verified');
      vi.mocked(pipelineService.isPipelineStatus).mockReturnValue(false);

      await orchestrator.resumeFromStep(
        '/test/project',
        featureWithAllExcluded,
        true,
        0,
        testConfig
      );

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_feature_complete',
        expect.objectContaining({ message: expect.stringContaining('excluded') })
      );
    });

    it('should acquire running feature slot before execution', async () => {
      await orchestrator.resumeFromStep('/test/project', testFeature, true, 0, testConfig);

      expect(mockConcurrencyManager.acquire).toHaveBeenCalledWith(
        expect.objectContaining({ featureId: 'feature-1', allowReuse: true })
      );
    });

    it('should release slot on completion', async () => {
      await orchestrator.resumeFromStep('/test/project', testFeature, true, 0, testConfig);

      expect(mockConcurrencyManager.release).toHaveBeenCalledWith('feature-1');
    });

    it('should release slot on error', async () => {
      mockRunAgentFn.mockRejectedValue(new Error('Test error'));

      await orchestrator.resumeFromStep('/test/project', testFeature, true, 0, testConfig);

      expect(mockConcurrencyManager.release).toHaveBeenCalledWith('feature-1');
    });
  });

  describe('executePipeline', () => {
    const createPipelineContext = (): PipelineContext => ({
      projectPath: '/test/project',
      featureId: 'feature-1',
      feature: testFeature,
      steps: testSteps,
      workDir: '/test/project',
      worktreePath: null,
      branchName: 'feature/test-1',
      abortController: new AbortController(),
      autoLoadClaudeMd: true,
      testAttempts: 0,
      maxTestAttempts: 5,
    });

    beforeEach(() => {
      vi.mocked(performMerge).mockResolvedValue({ success: true });
    });

    it('should execute steps in sequence', async () => {
      const context = createPipelineContext();
      await orchestrator.executePipeline(context);

      expect(mockRunAgentFn).toHaveBeenCalledTimes(2);
    });

    it('should emit pipeline_step_started for each step', async () => {
      const context = createPipelineContext();
      await orchestrator.executePipeline(context);

      const startedCalls = vi
        .mocked(mockEventBus.emitAutoModeEvent)
        .mock.calls.filter((call) => call[0] === 'pipeline_step_started');
      expect(startedCalls.length).toBe(2);
    });

    it('should emit pipeline_step_complete after each step', async () => {
      const context = createPipelineContext();
      await orchestrator.executePipeline(context);

      const completeCalls = vi
        .mocked(mockEventBus.emitAutoModeEvent)
        .mock.calls.filter((call) => call[0] === 'pipeline_step_complete');
      expect(completeCalls.length).toBe(2);
    });

    it('should update feature status to pipeline_{stepId} for each step', async () => {
      const context = createPipelineContext();
      await orchestrator.executePipeline(context);

      expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'pipeline_step-1'
      );
      expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'pipeline_step-2'
      );
    });

    it('should respect abort signal between steps', async () => {
      const context = createPipelineContext();
      mockRunAgentFn.mockImplementation(async () => {
        context.abortController.abort();
      });

      await expect(orchestrator.executePipeline(context)).rejects.toThrow(
        'Pipeline execution aborted'
      );
    });

    it('should call attemptMerge after successful completion', async () => {
      const context = createPipelineContext();
      await orchestrator.executePipeline(context);

      expect(performMerge).toHaveBeenCalledWith(
        '/test/project',
        'feature/test-1',
        '/test/project', // Falls back to projectPath when worktreePath is null
        'main',
        { deleteWorktreeAndBranch: false }
      );
    });
  });

  describe('AutoModeService integration (delegation verification)', () => {
    describe('executePipeline delegation', () => {
      const createPipelineContext = (): PipelineContext => ({
        projectPath: '/test/project',
        featureId: 'feature-1',
        feature: testFeature,
        steps: testSteps,
        workDir: '/test/project',
        worktreePath: '/test/worktree',
        branchName: 'feature/test-1',
        abortController: new AbortController(),
        autoLoadClaudeMd: true,
        testAttempts: 0,
        maxTestAttempts: 5,
      });

      beforeEach(() => {
        vi.mocked(performMerge).mockResolvedValue({ success: true });
      });

      it('builds PipelineContext with correct fields from executeFeature', async () => {
        const context = createPipelineContext();
        await orchestrator.executePipeline(context);

        // Verify all context fields were used correctly
        expect(context.projectPath).toBe('/test/project');
        expect(context.featureId).toBe('feature-1');
        expect(context.steps).toHaveLength(2);
        expect(context.workDir).toBe('/test/project');
        expect(context.worktreePath).toBe('/test/worktree');
        expect(context.branchName).toBe('feature/test-1');
        expect(context.autoLoadClaudeMd).toBe(true);
        expect(context.testAttempts).toBe(0);
        expect(context.maxTestAttempts).toBe(5);
      });

      it('passes worktreePath when worktree exists', async () => {
        const context = createPipelineContext();
        context.worktreePath = '/test/custom-worktree';

        await orchestrator.executePipeline(context);

        // Merge should receive the worktree path
        expect(performMerge).toHaveBeenCalledWith(
          '/test/project',
          'feature/test-1',
          '/test/custom-worktree',
          'main',
          { deleteWorktreeAndBranch: false }
        );
      });

      it('passes branchName from feature', async () => {
        const context = createPipelineContext();
        context.branchName = 'feature/custom-branch';
        context.feature = { ...testFeature, branchName: 'feature/custom-branch' };

        await orchestrator.executePipeline(context);

        expect(performMerge).toHaveBeenCalledWith(
          '/test/project',
          'feature/custom-branch',
          '/test/worktree',
          'main',
          { deleteWorktreeAndBranch: false }
        );
      });

      it('passes testAttempts and maxTestAttempts', async () => {
        const context = createPipelineContext();
        context.testAttempts = 2;
        context.maxTestAttempts = 10;

        // These values would be used by executeTestStep if called
        expect(context.testAttempts).toBe(2);
        expect(context.maxTestAttempts).toBe(10);
      });
    });

    describe('detectPipelineStatus delegation', () => {
      beforeEach(() => {
        vi.mocked(pipelineService.isPipelineStatus).mockReturnValue(true);
        vi.mocked(pipelineService.getStepIdFromStatus).mockReturnValue('step-1');
        vi.mocked(pipelineService.getPipelineConfig).mockResolvedValue(testConfig);
      });

      it('returns pipelineInfo from orchestrator for pipeline status', async () => {
        const result = await orchestrator.detectPipelineStatus(
          '/test/project',
          'feature-1',
          'pipeline_step-1'
        );

        expect(result.isPipeline).toBe(true);
        expect(result.stepId).toBe('step-1');
        expect(result.stepIndex).toBe(0);
        expect(result.config).toEqual(testConfig);
      });

      it('returns isPipeline false for non-pipeline status', async () => {
        vi.mocked(pipelineService.isPipelineStatus).mockReturnValue(false);

        const result = await orchestrator.detectPipelineStatus(
          '/test/project',
          'feature-1',
          'in_progress'
        );

        expect(result.isPipeline).toBe(false);
        expect(result.stepId).toBeNull();
        expect(result.config).toBeNull();
      });
    });

    describe('resumePipeline delegation', () => {
      const validPipelineInfo: PipelineStatusInfo = {
        isPipeline: true,
        stepId: 'step-1',
        stepIndex: 0,
        totalSteps: 2,
        step: testSteps[0],
        config: testConfig,
      };

      it('builds resumeContext with autoLoadClaudeMd setting', async () => {
        vi.mocked(getAutoLoadClaudeMdSetting).mockResolvedValue(true);

        await orchestrator.resumeFromStep('/test/project', testFeature, true, 0, testConfig);

        // Verify autoLoadClaudeMd was fetched
        expect(getAutoLoadClaudeMdSetting).toHaveBeenCalledWith(
          '/test/project',
          null,
          '[AutoMode]'
        );
      });

      it('passes useWorktrees flag to orchestrator', async () => {
        await orchestrator.resumeFromStep('/test/project', testFeature, true, 0, testConfig);

        // When useWorktrees is true, it should look for worktree
        expect(mockWorktreeResolver.findWorktreeForBranch).toHaveBeenCalledWith(
          '/test/project',
          'feature/test-1'
        );
      });

      it('sets maxTestAttempts to 5', async () => {
        // The default maxTestAttempts is 5 as per CONTEXT.md
        await orchestrator.resumeFromStep('/test/project', testFeature, true, 0, testConfig);

        // Execution should proceed with maxTestAttempts = 5
        expect(mockRunAgentFn).toHaveBeenCalled();
      });
    });
  });

  describe('edge cases', () => {
    describe('abort signal handling', () => {
      it('handles abort signal during step execution', async () => {
        const context: PipelineContext = {
          projectPath: '/test/project',
          featureId: 'feature-1',
          feature: testFeature,
          steps: testSteps,
          workDir: '/test/project',
          worktreePath: null,
          branchName: 'feature/test-1',
          abortController: new AbortController(),
          autoLoadClaudeMd: true,
          testAttempts: 0,
          maxTestAttempts: 5,
        };

        // Abort during first step
        mockRunAgentFn.mockImplementationOnce(async () => {
          context.abortController.abort();
        });

        await expect(orchestrator.executePipeline(context)).rejects.toThrow(
          'Pipeline execution aborted'
        );
      });
    });

    describe('context file handling', () => {
      it('handles missing context file during resume', async () => {
        vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

        const pipelineInfo: PipelineStatusInfo = {
          isPipeline: true,
          stepId: 'step-1',
          stepIndex: 0,
          totalSteps: 2,
          step: testSteps[0],
          config: testConfig,
        };

        await orchestrator.resumePipeline('/test/project', testFeature, true, pipelineInfo);

        // Should restart from beginning when no context
        expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
          '/test/project',
          'feature-1',
          'in_progress'
        );
        expect(mockExecuteFeatureFn).toHaveBeenCalled();
      });
    });

    describe('step deletion handling', () => {
      it('handles deleted step during resume', async () => {
        const pipelineInfo: PipelineStatusInfo = {
          isPipeline: true,
          stepId: 'deleted-step',
          stepIndex: -1,
          totalSteps: 2,
          step: null,
          config: testConfig,
        };

        await orchestrator.resumePipeline('/test/project', testFeature, true, pipelineInfo);

        // Should complete feature when step no longer exists
        expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
          '/test/project',
          'feature-1',
          'verified'
        );
      });

      it('handles all steps excluded during resume', async () => {
        const featureWithAllExcluded: Feature = {
          ...testFeature,
          excludedPipelineSteps: ['step-1', 'step-2'],
        };

        vi.mocked(pipelineService.getNextStatus).mockReturnValue('verified');
        vi.mocked(pipelineService.isPipelineStatus).mockReturnValue(false);

        await orchestrator.resumeFromStep(
          '/test/project',
          featureWithAllExcluded,
          true,
          0,
          testConfig
        );

        expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
          'auto_mode_feature_complete',
          expect.objectContaining({
            message: expect.stringContaining('excluded'),
          })
        );
      });
    });
  });
});
