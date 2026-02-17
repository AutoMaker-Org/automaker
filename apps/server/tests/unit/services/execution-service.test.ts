import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import type { Feature } from '@automaker/types';

/**
 * Helper to normalize paths for cross-platform test compatibility.
 */
const normalizePath = (p: string): string => path.resolve(p);
import {
  ExecutionService,
  type RunAgentFn,
  type ExecutePipelineFn,
  type UpdateFeatureStatusFn,
  type LoadFeatureFn,
  type GetPlanningPromptPrefixFn,
  type SaveFeatureSummaryFn,
  type RecordLearningsFn,
  type ContextExistsFn,
  type ResumeFeatureFn,
  type TrackFailureFn,
  type SignalPauseFn,
  type RecordSuccessFn,
} from '../../../src/services/execution-service.js';
import type { TypedEventBus } from '../../../src/services/typed-event-bus.js';
import type {
  ConcurrencyManager,
  RunningFeature,
} from '../../../src/services/concurrency-manager.js';
import type { WorktreeResolver } from '../../../src/services/worktree-resolver.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import { pipelineService } from '../../../src/services/pipeline-service.js';
import * as secureFs from '../../../src/lib/secure-fs.js';
import { getFeatureDir } from '@automaker/platform';
import {
  getPromptCustomization,
  getAutoLoadClaudeMdSetting,
  filterClaudeMdFromContext,
} from '../../../src/lib/settings-helpers.js';
import { extractSummary } from '../../../src/services/spec-parser.js';
import { resolveModelString } from '@automaker/model-resolver';

// Mock pipelineService
vi.mock('../../../src/services/pipeline-service.js', () => ({
  pipelineService: {
    getPipelineConfig: vi.fn(),
    isPipelineStatus: vi.fn(),
    getStepIdFromStatus: vi.fn(),
  },
}));

// Mock secureFs
vi.mock('../../../src/lib/secure-fs.js', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

// Mock settings helpers
vi.mock('../../../src/lib/settings-helpers.js', () => ({
  getPromptCustomization: vi.fn().mockResolvedValue({
    taskExecution: {
      implementationInstructions: 'test instructions',
      playwrightVerificationInstructions: 'test playwright',
      continuationAfterApprovalTemplate:
        '{{userFeedback}}\n\nApproved plan:\n{{approvedPlan}}\n\nProceed.',
    },
  }),
  getAutoLoadClaudeMdSetting: vi.fn().mockResolvedValue(true),
  filterClaudeMdFromContext: vi.fn().mockReturnValue('context prompt'),
}));

// Mock sdk-options
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

// Mock provider-factory
vi.mock('../../../src/providers/provider-factory.js', () => ({
  ProviderFactory: {
    getProviderNameForModel: vi.fn().mockReturnValue('anthropic'),
  },
}));

// Mock spec-parser
vi.mock('../../../src/services/spec-parser.js', () => ({
  extractSummary: vi.fn().mockReturnValue('Test summary'),
}));

// Mock @automaker/utils
vi.mock('@automaker/utils', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  classifyError: vi.fn((error: unknown) => {
    const err = error as Error | null;
    if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
      return { isAbort: true, type: 'abort', message: 'Aborted' };
    }
    return { isAbort: false, type: 'unknown', message: err?.message || 'Unknown error' };
  }),
  loadContextFiles: vi.fn(),
  recordMemoryUsage: vi.fn().mockResolvedValue(undefined),
}));

describe('execution-service.ts', () => {
  // Mock dependencies
  let mockEventBus: TypedEventBus;
  let mockConcurrencyManager: ConcurrencyManager;
  let mockWorktreeResolver: WorktreeResolver;
  let mockSettingsService: SettingsService | null;

  // Callback mocks
  let mockRunAgentFn: RunAgentFn;
  let mockExecutePipelineFn: ExecutePipelineFn;
  let mockUpdateFeatureStatusFn: UpdateFeatureStatusFn;
  let mockLoadFeatureFn: LoadFeatureFn;
  let mockGetPlanningPromptPrefixFn: GetPlanningPromptPrefixFn;
  let mockSaveFeatureSummaryFn: SaveFeatureSummaryFn;
  let mockRecordLearningsFn: RecordLearningsFn;
  let mockContextExistsFn: ContextExistsFn;
  let mockResumeFeatureFn: ResumeFeatureFn;
  let mockTrackFailureFn: TrackFailureFn;
  let mockSignalPauseFn: SignalPauseFn;
  let mockRecordSuccessFn: RecordSuccessFn;
  let mockSaveExecutionStateFn: vi.Mock;
  let mockLoadContextFilesFn: vi.Mock;

  let service: ExecutionService;

  // Test data
  const testFeature: Feature = {
    id: 'feature-1',
    title: 'Test Feature',
    category: 'test',
    description: 'Test description',
    status: 'backlog',
    branchName: 'feature/test-1',
  };

  const createRunningFeature = (featureId: string): RunningFeature => ({
    featureId,
    projectPath: '/test/project',
    worktreePath: null,
    branchName: null,
    abortController: new AbortController(),
    isAutoMode: false,
    startTime: Date.now(),
    leaseCount: 1,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockEventBus = {
      emitAutoModeEvent: vi.fn(),
    } as unknown as TypedEventBus;

    mockConcurrencyManager = {
      acquire: vi.fn().mockImplementation(({ featureId }) => createRunningFeature(featureId)),
      release: vi.fn(),
      getRunningFeature: vi.fn(),
      isRunning: vi.fn(),
    } as unknown as ConcurrencyManager;

    mockWorktreeResolver = {
      findWorktreeForBranch: vi.fn().mockResolvedValue('/test/worktree'),
    } as unknown as WorktreeResolver;

    mockSettingsService = null;

    mockRunAgentFn = vi.fn().mockResolvedValue(undefined);
    mockExecutePipelineFn = vi.fn().mockResolvedValue(undefined);
    mockUpdateFeatureStatusFn = vi.fn().mockResolvedValue(undefined);
    mockLoadFeatureFn = vi.fn().mockResolvedValue(testFeature);
    mockGetPlanningPromptPrefixFn = vi.fn().mockResolvedValue('');
    mockSaveFeatureSummaryFn = vi.fn().mockResolvedValue(undefined);
    mockRecordLearningsFn = vi.fn().mockResolvedValue(undefined);
    mockContextExistsFn = vi.fn().mockResolvedValue(false);
    mockResumeFeatureFn = vi.fn().mockResolvedValue(undefined);
    mockTrackFailureFn = vi.fn().mockReturnValue(false);
    mockSignalPauseFn = vi.fn();
    mockRecordSuccessFn = vi.fn();
    mockSaveExecutionStateFn = vi.fn().mockResolvedValue(undefined);
    mockLoadContextFilesFn = vi.fn().mockResolvedValue({
      formattedPrompt: 'test context',
      memoryFiles: [],
    });

    // Default mocks for secureFs
    vi.mocked(secureFs.readFile).mockResolvedValue('Agent output content');
    vi.mocked(secureFs.access).mockResolvedValue(undefined);

    // Re-setup platform mocks
    vi.mocked(getFeatureDir).mockImplementation(
      (projectPath: string, featureId: string) => `${projectPath}/.automaker/features/${featureId}`
    );

    // Default pipeline config (no steps)
    vi.mocked(pipelineService.getPipelineConfig).mockResolvedValue({ version: 1, steps: [] });

    // Re-setup settings helpers mocks (vi.clearAllMocks clears implementations)
    vi.mocked(getPromptCustomization).mockResolvedValue({
      taskExecution: {
        implementationInstructions: 'test instructions',
        playwrightVerificationInstructions: 'test playwright',
        continuationAfterApprovalTemplate:
          '{{userFeedback}}\n\nApproved plan:\n{{approvedPlan}}\n\nProceed.',
      },
    } as Awaited<ReturnType<typeof getPromptCustomization>>);
    vi.mocked(getAutoLoadClaudeMdSetting).mockResolvedValue(true);
    vi.mocked(filterClaudeMdFromContext).mockReturnValue('context prompt');

    // Re-setup spec-parser mock
    vi.mocked(extractSummary).mockReturnValue('Test summary');

    // Re-setup model-resolver mock
    vi.mocked(resolveModelString).mockReturnValue('claude-sonnet-4');

    service = new ExecutionService(
      mockEventBus,
      mockConcurrencyManager,
      mockWorktreeResolver,
      mockSettingsService,
      mockRunAgentFn,
      mockExecutePipelineFn,
      mockUpdateFeatureStatusFn,
      mockLoadFeatureFn,
      mockGetPlanningPromptPrefixFn,
      mockSaveFeatureSummaryFn,
      mockRecordLearningsFn,
      mockContextExistsFn,
      mockResumeFeatureFn,
      mockTrackFailureFn,
      mockSignalPauseFn,
      mockRecordSuccessFn,
      mockSaveExecutionStateFn,
      mockLoadContextFilesFn
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates service with all dependencies', () => {
      expect(service).toBeInstanceOf(ExecutionService);
    });

    it('accepts null settingsService', () => {
      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        null,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );
      expect(svc).toBeInstanceOf(ExecutionService);
    });
  });

  describe('buildFeaturePrompt', () => {
    const taskPrompts = {
      implementationInstructions: 'impl instructions',
      playwrightVerificationInstructions: 'playwright instructions',
    };

    it('includes feature title and description', () => {
      const prompt = service.buildFeaturePrompt(testFeature, taskPrompts);
      expect(prompt).toContain('**Feature ID:** feature-1');
      expect(prompt).toContain('Test description');
    });

    it('includes specification when present', () => {
      const featureWithSpec: Feature = {
        ...testFeature,
        spec: 'Detailed specification here',
      };
      const prompt = service.buildFeaturePrompt(featureWithSpec, taskPrompts);
      expect(prompt).toContain('**Specification:**');
      expect(prompt).toContain('Detailed specification here');
    });

    it('includes acceptance criteria from task prompts', () => {
      const prompt = service.buildFeaturePrompt(testFeature, taskPrompts);
      expect(prompt).toContain('impl instructions');
    });

    it('adds playwright instructions when skipTests is false', () => {
      const featureWithTests: Feature = { ...testFeature, skipTests: false };
      const prompt = service.buildFeaturePrompt(featureWithTests, taskPrompts);
      expect(prompt).toContain('playwright instructions');
    });

    it('omits playwright instructions when skipTests is true', () => {
      const featureWithoutTests: Feature = { ...testFeature, skipTests: true };
      const prompt = service.buildFeaturePrompt(featureWithoutTests, taskPrompts);
      expect(prompt).not.toContain('playwright instructions');
    });

    it('includes images note when imagePaths present', () => {
      const featureWithImages: Feature = {
        ...testFeature,
        imagePaths: ['/path/to/image.png', { path: '/path/to/image2.jpg', mimeType: 'image/jpeg' }],
      };
      const prompt = service.buildFeaturePrompt(featureWithImages, taskPrompts);
      expect(prompt).toContain('Context Images Attached:');
      expect(prompt).toContain('2 image(s)');
    });

    it('extracts title from first line of description', () => {
      const featureWithLongDesc: Feature = {
        ...testFeature,
        description: 'First line title\nRest of description',
      };
      const prompt = service.buildFeaturePrompt(featureWithLongDesc, taskPrompts);
      expect(prompt).toContain('**Title:** First line title');
    });

    it('truncates long titles to 60 characters', () => {
      const longDescription = 'A'.repeat(100);
      const featureWithLongTitle: Feature = {
        ...testFeature,
        description: longDescription,
      };
      const prompt = service.buildFeaturePrompt(featureWithLongTitle, taskPrompts);
      expect(prompt).toContain('**Title:** ' + 'A'.repeat(57) + '...');
    });
  });

  describe('executeFeature', () => {
    it('throws if feature not found', async () => {
      mockLoadFeatureFn = vi.fn().mockResolvedValue(null);
      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'nonexistent');

      // Error event should be emitted
      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_error',
        expect.objectContaining({ featureId: 'nonexistent' })
      );
    });

    it('acquires running feature slot', async () => {
      await service.executeFeature('/test/project', 'feature-1');

      expect(mockConcurrencyManager.acquire).toHaveBeenCalledWith(
        expect.objectContaining({
          featureId: 'feature-1',
          projectPath: '/test/project',
        })
      );
    });

    it('updates status to in_progress before starting', async () => {
      await service.executeFeature('/test/project', 'feature-1');

      expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'in_progress'
      );
    });

    it('emits feature_start event after status update', async () => {
      await service.executeFeature('/test/project', 'feature-1');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_feature_start',
        expect.objectContaining({
          featureId: 'feature-1',
          projectPath: '/test/project',
        })
      );

      // Verify order: status update happens before event
      const statusCallIndex = mockUpdateFeatureStatusFn.mock.invocationCallOrder[0];
      const eventCallIndex = mockEventBus.emitAutoModeEvent.mock.invocationCallOrder[0];
      expect(statusCallIndex).toBeLessThan(eventCallIndex);
    });

    it('runs agent with correct prompt', async () => {
      await service.executeFeature('/test/project', 'feature-1');

      expect(mockRunAgentFn).toHaveBeenCalled();
      const callArgs = mockRunAgentFn.mock.calls[0];
      expect(callArgs[0]).toMatch(/test.*project/); // workDir contains project
      expect(callArgs[1]).toBe('feature-1');
      expect(callArgs[2]).toContain('Feature Implementation Task');
      expect(callArgs[3]).toBeInstanceOf(AbortController);
      expect(callArgs[4]).toBe('/test/project');
      // Model (index 6) should be resolved
      expect(callArgs[6]).toBe('claude-sonnet-4');
    });

    it('executes pipeline after agent completes', async () => {
      const pipelineSteps = [{ id: 'step-1', name: 'Step 1', order: 1, instructions: 'Do step 1' }];
      vi.mocked(pipelineService.getPipelineConfig).mockResolvedValue({
        version: 1,
        steps: pipelineSteps as any,
      });

      await service.executeFeature('/test/project', 'feature-1');

      // Agent runs first
      expect(mockRunAgentFn).toHaveBeenCalled();
      // Then pipeline executes
      expect(mockExecutePipelineFn).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/test/project',
          featureId: 'feature-1',
          steps: pipelineSteps,
        })
      );
    });

    it('updates status to verified on completion', async () => {
      await service.executeFeature('/test/project', 'feature-1');

      expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'verified'
      );
    });

    it('updates status to waiting_approval when skipTests is true', async () => {
      mockLoadFeatureFn = vi.fn().mockResolvedValue({ ...testFeature, skipTests: true });
      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'waiting_approval'
      );
    });

    it('records success on completion', async () => {
      await service.executeFeature('/test/project', 'feature-1');

      expect(mockRecordSuccessFn).toHaveBeenCalled();
    });

    it('releases running feature in finally block', async () => {
      await service.executeFeature('/test/project', 'feature-1');

      expect(mockConcurrencyManager.release).toHaveBeenCalledWith('feature-1', undefined);
    });

    it('redirects to resumeFeature when context exists', async () => {
      mockContextExistsFn = vi.fn().mockResolvedValue(true);
      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1', true);

      expect(mockResumeFeatureFn).toHaveBeenCalledWith('/test/project', 'feature-1', true, true);
      // Should not run agent
      expect(mockRunAgentFn).not.toHaveBeenCalled();
    });

    it('emits feature_complete event on success', async () => {
      await service.executeFeature('/test/project', 'feature-1');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_feature_complete',
        expect.objectContaining({
          featureId: 'feature-1',
          passes: true,
        })
      );
    });
  });

  describe('executeFeature - approved plan handling', () => {
    it('builds continuation prompt for approved plan', async () => {
      const featureWithApprovedPlan: Feature = {
        ...testFeature,
        planSpec: { status: 'approved', content: 'The approved plan content' },
      };
      mockLoadFeatureFn = vi.fn().mockResolvedValue(featureWithApprovedPlan);

      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      // Agent should be called with continuation prompt
      expect(mockRunAgentFn).toHaveBeenCalled();
      const callArgs = mockRunAgentFn.mock.calls[0];
      expect(callArgs[1]).toBe('feature-1');
      expect(callArgs[2]).toContain('The approved plan content');
    });

    it('recursively calls executeFeature with continuation', async () => {
      const featureWithApprovedPlan: Feature = {
        ...testFeature,
        planSpec: { status: 'approved', content: 'Plan' },
      };
      mockLoadFeatureFn = vi.fn().mockResolvedValue(featureWithApprovedPlan);

      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      // acquire should be called twice - once for initial, once for recursive
      expect(mockConcurrencyManager.acquire).toHaveBeenCalledTimes(2);
      // Second call should have allowReuse: true
      expect(mockConcurrencyManager.acquire).toHaveBeenLastCalledWith(
        expect.objectContaining({ allowReuse: true })
      );
    });

    it('skips contextExists check when continuation prompt provided', async () => {
      // Feature has context AND approved plan, but continuation prompt is provided
      const featureWithApprovedPlan: Feature = {
        ...testFeature,
        planSpec: { status: 'approved', content: 'Plan' },
      };
      mockLoadFeatureFn = vi.fn().mockResolvedValue(featureWithApprovedPlan);
      mockContextExistsFn = vi.fn().mockResolvedValue(true);

      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      // resumeFeature should NOT be called even though context exists
      // because we're going through approved plan flow
      expect(mockResumeFeatureFn).not.toHaveBeenCalled();
    });
  });

  describe('executeFeature - error handling', () => {
    it('classifies and emits error event', async () => {
      const testError = new Error('Test error');
      mockRunAgentFn = vi.fn().mockRejectedValue(testError);
      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_error',
        expect.objectContaining({
          featureId: 'feature-1',
          error: 'Test error',
        })
      );
    });

    it('updates status to backlog on error', async () => {
      const testError = new Error('Test error');
      mockRunAgentFn = vi.fn().mockRejectedValue(testError);
      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      expect(mockUpdateFeatureStatusFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'backlog'
      );
    });

    it('tracks failure and checks pause', async () => {
      const testError = new Error('Rate limit error');
      mockRunAgentFn = vi.fn().mockRejectedValue(testError);
      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      expect(mockTrackFailureFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Rate limit error',
        })
      );
    });

    it('signals pause when threshold reached', async () => {
      const testError = new Error('Quota exceeded');
      mockRunAgentFn = vi.fn().mockRejectedValue(testError);
      mockTrackFailureFn = vi.fn().mockReturnValue(true); // threshold reached

      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      expect(mockSignalPauseFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Quota exceeded',
        })
      );
    });

    it('handles abort signal without error event', async () => {
      const abortError = new Error('abort');
      abortError.name = 'AbortError';
      mockRunAgentFn = vi.fn().mockRejectedValue(abortError);

      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      // Should emit feature_complete with stopped by user
      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_feature_complete',
        expect.objectContaining({
          featureId: 'feature-1',
          passes: false,
          message: 'Feature stopped by user',
        })
      );

      // Should NOT emit error event
      const errorCalls = vi
        .mocked(mockEventBus.emitAutoModeEvent)
        .mock.calls.filter((call) => call[0] === 'auto_mode_error');
      expect(errorCalls.length).toBe(0);
    });

    it('releases running feature even on error', async () => {
      const testError = new Error('Test error');
      mockRunAgentFn = vi.fn().mockRejectedValue(testError);
      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      expect(mockConcurrencyManager.release).toHaveBeenCalledWith('feature-1', undefined);
    });
  });

  describe('stopFeature', () => {
    it('returns false if feature not running', async () => {
      vi.mocked(mockConcurrencyManager.getRunningFeature).mockReturnValue(undefined);

      const result = await service.stopFeature('feature-1');

      expect(result).toBe(false);
    });

    it('aborts running feature', async () => {
      const runningFeature = createRunningFeature('feature-1');
      const abortSpy = vi.spyOn(runningFeature.abortController, 'abort');
      vi.mocked(mockConcurrencyManager.getRunningFeature).mockReturnValue(runningFeature);

      const result = await service.stopFeature('feature-1');

      expect(result).toBe(true);
      expect(abortSpy).toHaveBeenCalled();
    });

    it('releases running feature with force', async () => {
      const runningFeature = createRunningFeature('feature-1');
      vi.mocked(mockConcurrencyManager.getRunningFeature).mockReturnValue(runningFeature);

      await service.stopFeature('feature-1');

      expect(mockConcurrencyManager.release).toHaveBeenCalledWith('feature-1', { force: true });
    });
  });

  describe('worktree resolution', () => {
    it('uses worktree when useWorktrees is true and branch exists', async () => {
      await service.executeFeature('/test/project', 'feature-1', true);

      expect(mockWorktreeResolver.findWorktreeForBranch).toHaveBeenCalledWith(
        '/test/project',
        'feature/test-1'
      );
    });

    it('falls back to project path when worktree not found', async () => {
      vi.mocked(mockWorktreeResolver.findWorktreeForBranch).mockResolvedValue(null);

      await service.executeFeature('/test/project', 'feature-1', true);

      // Should still run agent, just with project path
      expect(mockRunAgentFn).toHaveBeenCalled();
      const callArgs = mockRunAgentFn.mock.calls[0];
      // First argument is workDir - should be normalized path to /test/project
      expect(callArgs[0]).toBe(normalizePath('/test/project'));
    });

    it('skips worktree resolution when useWorktrees is false', async () => {
      await service.executeFeature('/test/project', 'feature-1', false);

      expect(mockWorktreeResolver.findWorktreeForBranch).not.toHaveBeenCalled();
    });
  });

  describe('auto-mode integration', () => {
    it('saves execution state when isAutoMode is true', async () => {
      await service.executeFeature('/test/project', 'feature-1', false, true);

      expect(mockSaveExecutionStateFn).toHaveBeenCalledWith('/test/project');
    });

    it('saves execution state after completion in auto-mode', async () => {
      await service.executeFeature('/test/project', 'feature-1', false, true);

      // Should be called twice: once at start, once at end
      expect(mockSaveExecutionStateFn).toHaveBeenCalledTimes(2);
    });

    it('does not save execution state when isAutoMode is false', async () => {
      await service.executeFeature('/test/project', 'feature-1', false, false);

      expect(mockSaveExecutionStateFn).not.toHaveBeenCalled();
    });
  });

  describe('planning mode', () => {
    it('calls getPlanningPromptPrefix for features', async () => {
      await service.executeFeature('/test/project', 'feature-1');

      expect(mockGetPlanningPromptPrefixFn).toHaveBeenCalledWith(testFeature);
    });

    it('emits planning_started event when planning mode is not skip', async () => {
      const featureWithPlanning: Feature = {
        ...testFeature,
        planningMode: 'lite',
      };
      mockLoadFeatureFn = vi.fn().mockResolvedValue(featureWithPlanning);
      const svc = new ExecutionService(
        mockEventBus,
        mockConcurrencyManager,
        mockWorktreeResolver,
        mockSettingsService,
        mockRunAgentFn,
        mockExecutePipelineFn,
        mockUpdateFeatureStatusFn,
        mockLoadFeatureFn,
        mockGetPlanningPromptPrefixFn,
        mockSaveFeatureSummaryFn,
        mockRecordLearningsFn,
        mockContextExistsFn,
        mockResumeFeatureFn,
        mockTrackFailureFn,
        mockSignalPauseFn,
        mockRecordSuccessFn,
        mockSaveExecutionStateFn,
        mockLoadContextFilesFn
      );

      await svc.executeFeature('/test/project', 'feature-1');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'planning_started',
        expect.objectContaining({
          featureId: 'feature-1',
          mode: 'lite',
        })
      );
    });
  });

  describe('summary extraction', () => {
    it('extracts and saves summary from agent output', async () => {
      vi.mocked(secureFs.readFile).mockResolvedValue('Agent output with summary');

      await service.executeFeature('/test/project', 'feature-1');

      expect(mockSaveFeatureSummaryFn).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'Test summary'
      );
    });

    it('records learnings from agent output', async () => {
      vi.mocked(secureFs.readFile).mockResolvedValue('Agent output');

      await service.executeFeature('/test/project', 'feature-1');

      expect(mockRecordLearningsFn).toHaveBeenCalledWith(
        '/test/project',
        testFeature,
        'Agent output'
      );
    });

    it('handles missing agent output gracefully', async () => {
      vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await service.executeFeature('/test/project', 'feature-1');

      // Feature should still complete successfully
      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_feature_complete',
        expect.objectContaining({ passes: true })
      );
    });
  });
});
