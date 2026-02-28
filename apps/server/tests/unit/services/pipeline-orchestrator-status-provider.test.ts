/**
 * Tests for status + providerId coexistence in PipelineOrchestrator options.
 *
 * During rebase onto upstream/v1.0.0rc, a merge conflict arose where
 * upstream added `status: currentStatus` and the incoming branch added
 * `providerId: feature.providerId`. The conflict resolution kept BOTH fields.
 *
 * This test validates that both fields coexist correctly in the options
 * object passed to runAgentFn in both executePipeline and executeTestStep.
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
import type { ConcurrencyManager } from '../../../src/services/concurrency-manager.js';
import type { TestRunnerService } from '../../../src/services/test-runner-service.js';
import * as secureFs from '../../../src/lib/secure-fs.js';
import { getFeatureDir } from '@automaker/platform';
import {
  getPromptCustomization,
  getAutoLoadClaudeMdSetting,
  filterClaudeMdFromContext,
} from '../../../src/lib/settings-helpers.js';

vi.mock('../../../src/services/pipeline-service.js', () => ({
  pipelineService: {
    isPipelineStatus: vi.fn(),
    getStepIdFromStatus: vi.fn(),
    getPipelineConfig: vi.fn(),
    getNextStatus: vi.fn(),
  },
}));

vi.mock('../../../src/services/merge-service.js', () => ({
  performMerge: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../../src/lib/secure-fs.js', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

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

vi.mock('../../../src/lib/sdk-options.js', () => ({
  validateWorkingDirectory: vi.fn(),
}));

vi.mock('@automaker/platform', () => ({
  getFeatureDir: vi
    .fn()
    .mockImplementation(
      (projectPath: string, featureId: string) => `${projectPath}/.automaker/features/${featureId}`
    ),
}));

vi.mock('@automaker/model-resolver', () => ({
  resolveModelString: vi.fn().mockReturnValue('claude-sonnet-4'),
  DEFAULT_MODELS: { claude: 'claude-sonnet-4' },
}));

describe('PipelineOrchestrator - status and providerId coexistence', () => {
  let mockRunAgentFn: RunAgentFn;
  let orchestrator: PipelineOrchestrator;

  const testSteps: PipelineStep[] = [
    {
      id: 'implement',
      name: 'Implement Feature',
      order: 1,
      instructions: 'Implement the feature',
      colorClass: 'blue',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const createFeature = (overrides: Partial<Feature> = {}): Feature => ({
    id: 'feature-1',
    title: 'Test Feature',
    category: 'test',
    description: 'Test description',
    status: 'pipeline_implement',
    branchName: 'feature/test-1',
    providerId: 'moonshot-ai',
    thinkingLevel: 'medium',
    reasoningEffort: 'high',
    ...overrides,
  });

  const createContext = (feature: Feature): PipelineContext => ({
    projectPath: '/test/project',
    featureId: feature.id,
    feature,
    steps: testSteps,
    workDir: '/test/project',
    worktreePath: null,
    branchName: feature.branchName ?? 'main',
    abortController: new AbortController(),
    autoLoadClaudeMd: true,
    testAttempts: 0,
    maxTestAttempts: 5,
  });

  beforeEach(() => {
    vi.clearAllMocks();
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

    const mockEventBus = {
      emitAutoModeEvent: vi.fn(),
      getUnderlyingEmitter: vi.fn().mockReturnValue({}),
    } as unknown as TypedEventBus;

    const mockFeatureStateManager = {
      updateFeatureStatus: vi.fn().mockResolvedValue(undefined),
      loadFeature: vi.fn().mockResolvedValue(createFeature()),
    } as unknown as FeatureStateManager;

    const mockTestRunnerService = {
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

    orchestrator = new PipelineOrchestrator(
      mockEventBus,
      mockFeatureStateManager,
      {} as AgentExecutor,
      mockTestRunnerService,
      {
        findWorktreeForBranch: vi.fn().mockResolvedValue('/test/worktree'),
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
      } as unknown as WorktreeResolver,
      {
        acquire: vi.fn().mockImplementation(({ featureId }) => ({
          featureId,
          projectPath: '/test/project',
          abortController: new AbortController(),
          branchName: null,
          worktreePath: null,
          isAutoMode: false,
        })),
        release: vi.fn(),
        getRunningFeature: vi.fn().mockReturnValue(undefined),
      } as unknown as ConcurrencyManager,
      null,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue({ contextPrompt: 'test context' }),
      vi.fn().mockReturnValue('Feature prompt content'),
      vi.fn().mockResolvedValue(undefined),
      mockRunAgentFn
    );
  });

  describe('executePipeline - options object', () => {
    it('should pass both status and providerId in options', async () => {
      const feature = createFeature({ providerId: 'moonshot-ai' });
      const context = createContext(feature);

      await orchestrator.executePipeline(context);

      expect(mockRunAgentFn).toHaveBeenCalledTimes(1);
      const options = mockRunAgentFn.mock.calls[0][7];
      expect(options).toHaveProperty('status', 'pipeline_implement');
      expect(options).toHaveProperty('providerId', 'moonshot-ai');
    });

    it('should pass status even when providerId is undefined', async () => {
      const feature = createFeature({ providerId: undefined });
      const context = createContext(feature);

      await orchestrator.executePipeline(context);

      const options = mockRunAgentFn.mock.calls[0][7];
      expect(options).toHaveProperty('status', 'pipeline_implement');
      expect(options).toHaveProperty('providerId', undefined);
    });

    it('should pass thinkingLevel and reasoningEffort alongside status and providerId', async () => {
      const feature = createFeature({
        providerId: 'zhipu',
        thinkingLevel: 'high',
        reasoningEffort: 'medium',
      });
      const context = createContext(feature);

      await orchestrator.executePipeline(context);

      const options = mockRunAgentFn.mock.calls[0][7];
      expect(options).toHaveProperty('status', 'pipeline_implement');
      expect(options).toHaveProperty('providerId', 'zhipu');
      expect(options).toHaveProperty('thinkingLevel', 'high');
      expect(options).toHaveProperty('reasoningEffort', 'medium');
    });
  });

  describe('executeTestStep - options object', () => {
    it('should pass both status and providerId in test fix agent options', async () => {
      const feature = createFeature({
        status: 'running',
        providerId: 'custom-provider',
      });
      const context = createContext(feature);

      const mockTestRunner = orchestrator['testRunnerService'] as any;
      vi.mocked(mockTestRunner.getSession)
        .mockReturnValueOnce({
          status: 'failed',
          exitCode: 1,
          startedAt: new Date(),
          finishedAt: new Date(),
        })
        .mockReturnValueOnce({
          status: 'passed',
          exitCode: 0,
          startedAt: new Date(),
          finishedAt: new Date(),
        });

      await orchestrator.executeTestStep(context, 'npm test');

      expect(mockRunAgentFn).toHaveBeenCalledTimes(1);
      const options = mockRunAgentFn.mock.calls[0][7];
      expect(options).toHaveProperty('status', 'running');
      expect(options).toHaveProperty('providerId', 'custom-provider');
    }, 15000);

    it('should pass feature.status (not currentStatus) in test fix context', async () => {
      const feature = createFeature({
        status: 'pipeline_test',
        providerId: 'moonshot-ai',
      });
      const context = createContext(feature);

      const mockTestRunner = orchestrator['testRunnerService'] as any;
      vi.mocked(mockTestRunner.getSession)
        .mockReturnValueOnce({
          status: 'failed',
          exitCode: 1,
          startedAt: new Date(),
          finishedAt: new Date(),
        })
        .mockReturnValueOnce({
          status: 'passed',
          exitCode: 0,
          startedAt: new Date(),
          finishedAt: new Date(),
        });

      await orchestrator.executeTestStep(context, 'npm test');

      const options = mockRunAgentFn.mock.calls[0][7];
      // In test fix context, status should come from context.feature.status
      expect(options).toHaveProperty('status', 'pipeline_test');
      expect(options).toHaveProperty('providerId', 'moonshot-ai');
    }, 15000);
  });
});
