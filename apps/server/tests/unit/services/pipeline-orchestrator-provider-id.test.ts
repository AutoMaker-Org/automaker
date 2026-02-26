/**
 * Tests for providerId passthrough in PipelineOrchestrator
 * Verifies that feature.providerId is forwarded to runAgentFn in both
 * executePipeline (step execution) and executeTestStep (test fix) contexts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature, PipelineStep } from '@automaker/types';
import {
  PipelineOrchestrator,
  type PipelineContext,
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
  performMerge: vi.fn().mockResolvedValue({ success: true }),
}));

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
  getUseClaudeCodeSystemPromptSetting: vi.fn().mockResolvedValue(true),
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

describe('PipelineOrchestrator - providerId passthrough', () => {
  let mockEventBus: TypedEventBus;
  let mockFeatureStateManager: FeatureStateManager;
  let mockAgentExecutor: AgentExecutor;
  let mockTestRunnerService: TestRunnerService;
  let mockWorktreeResolver: WorktreeResolver;
  let mockConcurrencyManager: ConcurrencyManager;
  let mockUpdateFeatureStatusFn: UpdateFeatureStatusFn;
  let mockLoadContextFilesFn: vi.Mock;
  let mockBuildFeaturePromptFn: BuildFeaturePromptFn;
  let mockExecuteFeatureFn: ExecuteFeatureFn;
  let mockRunAgentFn: RunAgentFn;
  let orchestrator: PipelineOrchestrator;

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
  ];

  const createFeatureWithProvider = (providerId?: string): Feature => ({
    id: 'feature-1',
    title: 'Test Feature',
    category: 'test',
    description: 'Test description',
    status: 'pipeline_step-1',
    branchName: 'feature/test-1',
    providerId,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockEventBus = {
      emitAutoModeEvent: vi.fn(),
      getUnderlyingEmitter: vi.fn().mockReturnValue({}),
    } as unknown as TypedEventBus;

    mockFeatureStateManager = {
      updateFeatureStatus: vi.fn().mockResolvedValue(undefined),
      loadFeature: vi.fn().mockResolvedValue(createFeatureWithProvider()),
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
      acquire: vi.fn().mockImplementation(({ featureId, isAutoMode }) => ({
        featureId,
        projectPath: '/test/project',
        abortController: new AbortController(),
        branchName: null,
        worktreePath: null,
        isAutoMode: isAutoMode ?? false,
      })),
      release: vi.fn(),
      getRunningFeature: vi.fn().mockReturnValue(undefined),
    } as unknown as ConcurrencyManager;

    mockUpdateFeatureStatusFn = vi.fn().mockResolvedValue(undefined);
    mockLoadContextFilesFn = vi.fn().mockResolvedValue({ contextPrompt: 'test context' });
    mockBuildFeaturePromptFn = vi.fn().mockReturnValue('Feature prompt content');
    mockExecuteFeatureFn = vi.fn().mockResolvedValue(undefined);
    mockRunAgentFn = vi.fn().mockResolvedValue(undefined);

    vi.mocked(secureFs.readFile).mockResolvedValue('Previous context');
    vi.mocked(secureFs.access).mockResolvedValue(undefined);
    vi.mocked(getFeatureDir).mockImplementation(
      (projectPath: string, featureId: string) => `${projectPath}/.automaker/features/${featureId}`
    );
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
      null,
      mockUpdateFeatureStatusFn,
      mockLoadContextFilesFn,
      mockBuildFeaturePromptFn,
      mockExecuteFeatureFn,
      mockRunAgentFn
    );
  });

  describe('executePipeline', () => {
    it('should pass providerId to runAgentFn options when feature has providerId', async () => {
      const feature = createFeatureWithProvider('moonshot-ai');
      const context: PipelineContext = {
        projectPath: '/test/project',
        featureId: 'feature-1',
        feature,
        steps: testSteps,
        workDir: '/test/project',
        worktreePath: null,
        branchName: 'feature/test-1',
        abortController: new AbortController(),
        autoLoadClaudeMd: true,
        testAttempts: 0,
        maxTestAttempts: 5,
      };

      await orchestrator.executePipeline(context);

      expect(mockRunAgentFn).toHaveBeenCalledTimes(1);
      const options = mockRunAgentFn.mock.calls[0][7];
      expect(options).toHaveProperty('providerId', 'moonshot-ai');
    });

    it('should pass undefined providerId when feature has no providerId', async () => {
      const feature = createFeatureWithProvider(undefined);
      const context: PipelineContext = {
        projectPath: '/test/project',
        featureId: 'feature-1',
        feature,
        steps: testSteps,
        workDir: '/test/project',
        worktreePath: null,
        branchName: 'feature/test-1',
        abortController: new AbortController(),
        autoLoadClaudeMd: true,
        testAttempts: 0,
        maxTestAttempts: 5,
      };

      await orchestrator.executePipeline(context);

      expect(mockRunAgentFn).toHaveBeenCalledTimes(1);
      const options = mockRunAgentFn.mock.calls[0][7];
      expect(options).toHaveProperty('providerId', undefined);
    });

    it('should pass status alongside providerId in options', async () => {
      const feature = createFeatureWithProvider('zhipu');
      const context: PipelineContext = {
        projectPath: '/test/project',
        featureId: 'feature-1',
        feature,
        steps: testSteps,
        workDir: '/test/project',
        worktreePath: null,
        branchName: 'feature/test-1',
        abortController: new AbortController(),
        autoLoadClaudeMd: true,
        testAttempts: 0,
        maxTestAttempts: 5,
      };

      await orchestrator.executePipeline(context);

      const options = mockRunAgentFn.mock.calls[0][7];
      expect(options).toHaveProperty('providerId', 'zhipu');
      expect(options).toHaveProperty('status');
    });
  });

  describe('executeTestStep', () => {
    it('should pass providerId in test fix agent options when tests fail', async () => {
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

      const feature = createFeatureWithProvider('custom-provider');
      const context: PipelineContext = {
        projectPath: '/test/project',
        featureId: 'feature-1',
        feature,
        steps: testSteps,
        workDir: '/test/project',
        worktreePath: null,
        branchName: 'feature/test-1',
        abortController: new AbortController(),
        autoLoadClaudeMd: true,
        testAttempts: 0,
        maxTestAttempts: 5,
      };

      await orchestrator.executeTestStep(context, 'npm test');

      // The fix agent should receive providerId
      expect(mockRunAgentFn).toHaveBeenCalledTimes(1);
      const options = mockRunAgentFn.mock.calls[0][7];
      expect(options).toHaveProperty('providerId', 'custom-provider');
    }, 15000);

    it('should pass thinkingLevel in test fix agent options', async () => {
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

      const feature = createFeatureWithProvider('moonshot-ai');
      feature.thinkingLevel = 'high';
      const context: PipelineContext = {
        projectPath: '/test/project',
        featureId: 'feature-1',
        feature,
        steps: testSteps,
        workDir: '/test/project',
        worktreePath: null,
        branchName: 'feature/test-1',
        abortController: new AbortController(),
        autoLoadClaudeMd: true,
        testAttempts: 0,
        maxTestAttempts: 5,
      };

      await orchestrator.executeTestStep(context, 'npm test');

      const options = mockRunAgentFn.mock.calls[0][7];
      expect(options).toHaveProperty('thinkingLevel', 'high');
      expect(options).toHaveProperty('providerId', 'moonshot-ai');
    }, 15000);
  });
});
