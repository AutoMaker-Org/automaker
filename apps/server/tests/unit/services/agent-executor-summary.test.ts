import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AgentExecutor } from '../../../src/services/agent-executor.js';
import type { TypedEventBus } from '../../../src/services/typed-event-bus.js';
import type { FeatureStateManager } from '../../../src/services/feature-state-manager.js';
import type { PlanApprovalService } from '../../../src/services/plan-approval-service.js';
import type { BaseProvider } from '../../../src/providers/base-provider.js';
import * as secureFs from '../../../src/lib/secure-fs.js';
import { getFeatureDir } from '@automaker/platform';
import { buildPromptWithImages } from '@automaker/utils';

vi.mock('../../../src/lib/secure-fs.js', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
}));

vi.mock('@automaker/platform', () => ({
  getFeatureDir: vi.fn(),
}));

vi.mock('@automaker/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@automaker/utils')>();
  return {
    ...actual,
    buildPromptWithImages: vi.fn(),
    createLogger: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

describe('AgentExecutor Summary Extraction', () => {
  let mockEventBus: TypedEventBus;
  let mockFeatureStateManager: FeatureStateManager;
  let mockPlanApprovalService: PlanApprovalService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEventBus = {
      emitAutoModeEvent: vi.fn(),
    } as unknown as TypedEventBus;

    mockFeatureStateManager = {
      updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      updateFeaturePlanSpec: vi.fn().mockResolvedValue(undefined),
      saveFeatureSummary: vi.fn().mockResolvedValue(undefined),
    } as unknown as FeatureStateManager;

    mockPlanApprovalService = {
      waitForApproval: vi.fn(),
    } as unknown as PlanApprovalService;

    (getFeatureDir as Mock).mockReturnValue('/mock/feature/dir');
    (buildPromptWithImages as Mock).mockResolvedValue({ content: 'mocked prompt' });
  });

  it('should extract summary from new session content only', async () => {
    const executor = new AgentExecutor(
      mockEventBus,
      mockFeatureStateManager,
      mockPlanApprovalService,
      null
    );

    const previousContent = `Some previous work.
<summary>Old summary</summary>`;
    const newWork = `New implementation work.
<summary>New summary</summary>`;

    const mockProvider = {
      getName: () => 'mock',
      executeQuery: vi.fn().mockImplementation(function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: newWork }],
          },
        };
        yield { type: 'result', subtype: 'success' };
      }),
    } as unknown as BaseProvider;

    const options = {
      workDir: '/test',
      featureId: 'test-feature',
      prompt: 'Test prompt',
      projectPath: '/project',
      abortController: new AbortController(),
      provider: mockProvider,
      effectiveBareModel: 'claude-sonnet',
      planningMode: 'skip' as const,
      previousContent,
    };

    const callbacks = {
      waitForApproval: vi.fn(),
      saveFeatureSummary: vi.fn(),
      updateFeatureSummary: vi.fn(),
      buildTaskPrompt: vi.fn(),
    };

    await executor.execute(options, callbacks);

    // Verify it called saveFeatureSummary with the NEW summary
    expect(callbacks.saveFeatureSummary).toHaveBeenCalledWith(
      '/project',
      'test-feature',
      'New summary'
    );

    // Ensure it didn't call it with Old summary
    expect(callbacks.saveFeatureSummary).not.toHaveBeenCalledWith(
      '/project',
      'test-feature',
      'Old summary'
    );
  });

  it('should not save summary if no summary in NEW session content', async () => {
    const executor = new AgentExecutor(
      mockEventBus,
      mockFeatureStateManager,
      mockPlanApprovalService,
      null
    );

    const previousContent = `Some previous work.
<summary>Old summary</summary>`;
    const newWork = `New implementation work without a summary tag.`;

    const mockProvider = {
      getName: () => 'mock',
      executeQuery: vi.fn().mockImplementation(function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: newWork }],
          },
        };
        yield { type: 'result', subtype: 'success' };
      }),
    } as unknown as BaseProvider;

    const options = {
      workDir: '/test',
      featureId: 'test-feature',
      prompt: 'Test prompt',
      projectPath: '/project',
      abortController: new AbortController(),
      provider: mockProvider,
      effectiveBareModel: 'claude-sonnet',
      planningMode: 'skip' as const,
      previousContent,
    };

    const callbacks = {
      waitForApproval: vi.fn(),
      saveFeatureSummary: vi.fn(),
      updateFeatureSummary: vi.fn(),
      buildTaskPrompt: vi.fn(),
    };

    await executor.execute(options, callbacks);

    // Verify it NEVER called saveFeatureSummary because there was no NEW summary
    expect(callbacks.saveFeatureSummary).not.toHaveBeenCalled();
  });

  it('should extract task summary and update task status during streaming', async () => {
    const executor = new AgentExecutor(
      mockEventBus,
      mockFeatureStateManager,
      mockPlanApprovalService,
      null
    );

    const mockProvider = {
      getName: () => 'mock',
      executeQuery: vi.fn().mockImplementation(function* () {
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Working... ' }],
          },
        };
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: '[TASK_COMPLETE] T001: Task finished successfully' }],
          },
        };
        yield { type: 'result', subtype: 'success' };
      }),
    } as unknown as BaseProvider;

    // We trigger executeTasksLoop by providing persistedTasks
    const options = {
      workDir: '/test',
      featureId: 'test-feature',
      prompt: 'Test prompt',
      projectPath: '/project',
      abortController: new AbortController(),
      provider: mockProvider,
      effectiveBareModel: 'claude-sonnet',
      planningMode: 'skip' as const,
      existingApprovedPlanContent: 'Some plan',
      persistedTasks: [{ id: 'T001', description: 'Task 1', status: 'pending' as const }],
    };

    const callbacks = {
      waitForApproval: vi.fn(),
      saveFeatureSummary: vi.fn(),
      updateFeatureSummary: vi.fn(),
      buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
    };

    await executor.execute(options, callbacks);

    // Verify it updated task status with summary
    expect(mockFeatureStateManager.updateTaskStatus).toHaveBeenCalledWith(
      '/project',
      'test-feature',
      'T001',
      'completed',
      'Task finished successfully'
    );
  });

  describe('Pipeline step summary fallback', () => {
    it('should save fallback summary when extraction fails for pipeline step', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        null
      );

      // Content without a summary tag (extraction will fail)
      const newWork = 'Implementation completed without summary tag.';

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: newWork }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet',
        planningMode: 'skip' as const,
        status: 'pipeline_step1' as const, // Pipeline status triggers fallback
      };

      const callbacks = {
        waitForApproval: vi.fn(),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn(),
      };

      await executor.execute(options, callbacks);

      // Verify fallback summary was saved with trimmed content
      expect(callbacks.saveFeatureSummary).toHaveBeenCalledWith(
        '/project',
        'test-feature',
        'Implementation completed without summary tag.'
      );
    });

    it('should not save fallback for non-pipeline status when extraction fails', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        null
      );

      // Content without a summary tag
      const newWork = 'Implementation completed without summary tag.';

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: newWork }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet',
        planningMode: 'skip' as const,
        status: 'in_progress' as const, // Non-pipeline status
      };

      const callbacks = {
        waitForApproval: vi.fn(),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn(),
      };

      await executor.execute(options, callbacks);

      // Verify no fallback was saved for non-pipeline status
      expect(callbacks.saveFeatureSummary).not.toHaveBeenCalled();
    });

    it('should not save empty fallback for pipeline step', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        null
      );

      // Empty/whitespace-only content
      const newWork = '   \n\t  ';

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: newWork }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet',
        planningMode: 'skip' as const,
        status: 'pipeline_step1' as const,
      };

      const callbacks = {
        waitForApproval: vi.fn(),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn(),
      };

      await executor.execute(options, callbacks);

      // Verify no fallback was saved since content was empty/whitespace
      expect(callbacks.saveFeatureSummary).not.toHaveBeenCalled();
    });

    it('should prefer extracted summary over fallback for pipeline step', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        null
      );

      // Content WITH a summary tag
      const newWork = `Implementation details here.
<summary>Proper summary from extraction</summary>`;

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: newWork }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet',
        planningMode: 'skip' as const,
        status: 'pipeline_step1' as const,
      };

      const callbacks = {
        waitForApproval: vi.fn(),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn(),
      };

      await executor.execute(options, callbacks);

      // Verify extracted summary was saved, not the full content
      expect(callbacks.saveFeatureSummary).toHaveBeenCalledWith(
        '/project',
        'test-feature',
        'Proper summary from extraction'
      );
      // Ensure it didn't save the full content as fallback
      expect(callbacks.saveFeatureSummary).not.toHaveBeenCalledWith(
        '/project',
        'test-feature',
        expect.stringContaining('Implementation details here')
      );
    });
  });
});
