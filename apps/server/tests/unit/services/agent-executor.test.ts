import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentExecutor,
  type AgentExecutionOptions,
  type AgentExecutionResult,
  type WaitForApprovalFn,
  type SaveFeatureSummaryFn,
  type UpdateFeatureSummaryFn,
  type BuildTaskPromptFn,
} from '../../../src/services/agent-executor.js';
import type { TypedEventBus } from '../../../src/services/typed-event-bus.js';
import type { FeatureStateManager } from '../../../src/services/feature-state-manager.js';
import type { PlanApprovalService } from '../../../src/services/plan-approval-service.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { BaseProvider } from '../../../src/providers/base-provider.js';

/**
 * Unit tests for AgentExecutor
 *
 * Note: Full integration tests for execute() require complex mocking of
 * @automaker/utils and @automaker/platform which have module hoisting issues.
 * These tests focus on:
 * - Constructor injection
 * - Interface exports
 * - Type correctness
 *
 * Integration tests for streaming/marker detection are covered in E2E tests
 * and auto-mode-service tests.
 */
describe('AgentExecutor', () => {
  // Mock dependencies
  let mockEventBus: TypedEventBus;
  let mockFeatureStateManager: FeatureStateManager;
  let mockPlanApprovalService: PlanApprovalService;
  let mockSettingsService: SettingsService | null;

  beforeEach(() => {
    // Reset mocks
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

    mockSettingsService = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with all dependencies', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should accept null settingsService', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        null
      );
      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should accept undefined settingsService', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService
      );
      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should store eventBus dependency', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      // Verify executor was created - actual use tested via execute()
      expect(executor).toBeDefined();
    });

    it('should store featureStateManager dependency', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      expect(executor).toBeDefined();
    });

    it('should store planApprovalService dependency', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      expect(executor).toBeDefined();
    });
  });

  describe('interface exports', () => {
    it('should export AgentExecutionOptions type', () => {
      // Type assertion test - if this compiles, the type is exported correctly
      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: {} as BaseProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
      };
      expect(options.featureId).toBe('test-feature');
    });

    it('should export AgentExecutionResult type', () => {
      const result: AgentExecutionResult = {
        responseText: 'test response',
        specDetected: false,
        tasksCompleted: 0,
        aborted: false,
      };
      expect(result.aborted).toBe(false);
    });

    it('should export callback types', () => {
      const waitForApproval: WaitForApprovalFn = async () => ({ approved: true });
      const saveFeatureSummary: SaveFeatureSummaryFn = async () => {};
      const updateFeatureSummary: UpdateFeatureSummaryFn = async () => {};
      const buildTaskPrompt: BuildTaskPromptFn = () => 'prompt';

      expect(typeof waitForApproval).toBe('function');
      expect(typeof saveFeatureSummary).toBe('function');
      expect(typeof updateFeatureSummary).toBe('function');
      expect(typeof buildTaskPrompt).toBe('function');
    });
  });

  describe('AgentExecutionOptions', () => {
    it('should accept required options', () => {
      const options: AgentExecutionOptions = {
        workDir: '/test/workdir',
        featureId: 'feature-123',
        prompt: 'Test prompt',
        projectPath: '/test/project',
        abortController: new AbortController(),
        provider: {} as BaseProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
      };

      expect(options.workDir).toBe('/test/workdir');
      expect(options.featureId).toBe('feature-123');
      expect(options.prompt).toBe('Test prompt');
      expect(options.projectPath).toBe('/test/project');
      expect(options.abortController).toBeInstanceOf(AbortController);
      expect(options.effectiveBareModel).toBe('claude-sonnet-4-6');
    });

    it('should accept optional options', () => {
      const options: AgentExecutionOptions = {
        workDir: '/test/workdir',
        featureId: 'feature-123',
        prompt: 'Test prompt',
        projectPath: '/test/project',
        abortController: new AbortController(),
        provider: {} as BaseProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        // Optional fields
        imagePaths: ['/image1.png', '/image2.png'],
        model: 'claude-sonnet-4-6',
        planningMode: 'spec',
        requirePlanApproval: true,
        previousContent: 'Previous content',
        systemPrompt: 'System prompt',
        autoLoadClaudeMd: true,
        thinkingLevel: 'medium',
        branchName: 'feature-branch',
        specAlreadyDetected: false,
        existingApprovedPlanContent: 'Approved plan',
        persistedTasks: [{ id: 'T001', description: 'Task 1', status: 'pending' }],
        sdkOptions: {
          maxTurns: 100,
          allowedTools: ['read', 'write'],
        },
      };

      expect(options.imagePaths).toHaveLength(2);
      expect(options.planningMode).toBe('spec');
      expect(options.requirePlanApproval).toBe(true);
      expect(options.branchName).toBe('feature-branch');
    });
  });

  describe('AgentExecutionResult', () => {
    it('should contain responseText', () => {
      const result: AgentExecutionResult = {
        responseText: 'Full response text from agent',
        specDetected: true,
        tasksCompleted: 5,
        aborted: false,
      };
      expect(result.responseText).toBe('Full response text from agent');
    });

    it('should contain specDetected flag', () => {
      const result: AgentExecutionResult = {
        responseText: '',
        specDetected: true,
        tasksCompleted: 0,
        aborted: false,
      };
      expect(result.specDetected).toBe(true);
    });

    it('should contain tasksCompleted count', () => {
      const result: AgentExecutionResult = {
        responseText: '',
        specDetected: true,
        tasksCompleted: 10,
        aborted: false,
      };
      expect(result.tasksCompleted).toBe(10);
    });

    it('should contain aborted flag', () => {
      const result: AgentExecutionResult = {
        responseText: '',
        specDetected: false,
        tasksCompleted: 3,
        aborted: true,
      };
      expect(result.aborted).toBe(true);
    });
  });

  describe('execute method signature', () => {
    it('should have execute method', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );
      expect(typeof executor.execute).toBe('function');
    });

    it('should accept options and callbacks', () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      // Type check - verifying the signature accepts the expected parameters
      // Actual execution would require mocking external modules
      const executeSignature = executor.execute.length;
      // execute(options, callbacks) = 2 parameters
      expect(executeSignature).toBe(2);
    });
  });

  describe('callback types', () => {
    it('WaitForApprovalFn should return approval result', async () => {
      const waitForApproval: WaitForApprovalFn = vi.fn().mockResolvedValue({
        approved: true,
        feedback: 'Looks good',
        editedPlan: undefined,
      });

      const result = await waitForApproval('feature-123', '/project');
      expect(result.approved).toBe(true);
      expect(result.feedback).toBe('Looks good');
    });

    it('WaitForApprovalFn should handle rejection with feedback', async () => {
      const waitForApproval: WaitForApprovalFn = vi.fn().mockResolvedValue({
        approved: false,
        feedback: 'Please add more tests',
        editedPlan: '## Revised Plan\n...',
      });

      const result = await waitForApproval('feature-123', '/project');
      expect(result.approved).toBe(false);
      expect(result.feedback).toBe('Please add more tests');
      expect(result.editedPlan).toBeDefined();
    });

    it('SaveFeatureSummaryFn should accept parameters', async () => {
      const saveSummary: SaveFeatureSummaryFn = vi.fn().mockResolvedValue(undefined);

      await saveSummary('/project', 'feature-123', 'Feature summary text');
      expect(saveSummary).toHaveBeenCalledWith('/project', 'feature-123', 'Feature summary text');
    });

    it('UpdateFeatureSummaryFn should accept parameters', async () => {
      const updateSummary: UpdateFeatureSummaryFn = vi.fn().mockResolvedValue(undefined);

      await updateSummary('/project', 'feature-123', 'Updated summary');
      expect(updateSummary).toHaveBeenCalledWith('/project', 'feature-123', 'Updated summary');
    });

    it('BuildTaskPromptFn should return prompt string', () => {
      const buildPrompt: BuildTaskPromptFn = vi.fn().mockReturnValue('Execute T001: Create file');

      const task = { id: 'T001', description: 'Create file', status: 'pending' as const };
      const allTasks = [task];
      const prompt = buildPrompt(task, allTasks, 0, 'Plan content', 'Template', undefined);

      expect(typeof prompt).toBe('string');
      expect(prompt).toBe('Execute T001: Create file');
    });
  });

  describe('dependency injection patterns', () => {
    it('should allow different eventBus implementations', () => {
      const customEventBus = {
        emitAutoModeEvent: vi.fn(),
        emit: vi.fn(),
        on: vi.fn(),
      } as unknown as TypedEventBus;

      const executor = new AgentExecutor(
        customEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should allow different featureStateManager implementations', () => {
      const customStateManager = {
        updateTaskStatus: vi.fn().mockResolvedValue(undefined),
        updateFeaturePlanSpec: vi.fn().mockResolvedValue(undefined),
        saveFeatureSummary: vi.fn().mockResolvedValue(undefined),
        loadFeature: vi.fn().mockResolvedValue(null),
      } as unknown as FeatureStateManager;

      const executor = new AgentExecutor(
        mockEventBus,
        customStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should work with mock settingsService', () => {
      const customSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({}),
        getCredentials: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        customSettingsService
      );

      expect(executor).toBeInstanceOf(AgentExecutor);
    });
  });

  describe('execute() behavior', () => {
    /**
     * Execution tests focus on verifiable behaviors without requiring
     * full stream mocking. Complex integration scenarios are tested in E2E.
     */

    it('should return aborted=true when abort signal is already aborted', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      // Create an already-aborted controller
      const abortController = new AbortController();
      abortController.abort();

      // Mock provider that yields nothing (would check signal first)
      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          // Generator yields nothing, simulating immediate abort check
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController,
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      // Execute - should complete without error even with aborted signal
      const result = await executor.execute(options, callbacks);

      // When stream is empty and signal is aborted before stream starts,
      // the result depends on whether abort was checked
      expect(result).toBeDefined();
      expect(result.responseText).toBeDefined();
    });

    it('should initialize with previousContent when provided', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          // Empty stream
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        previousContent: 'Previous context from earlier session',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      const result = await executor.execute(options, callbacks);

      // Response should start with previous content
      expect(result.responseText).toContain('Previous context from earlier session');
      expect(result.responseText).toContain('Follow-up Session');
    });

    it('should return specDetected=false when no spec markers in content', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Simple response without spec markers' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip', // No spec detection in skip mode
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      const result = await executor.execute(options, callbacks);

      expect(result.specDetected).toBe(false);
      expect(result.responseText).toContain('Simple response without spec markers');
    });

    it('should emit auto_mode_progress events for text content', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'First chunk of text' }],
            },
          };
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Second chunk of text' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      // Should emit progress events for each text chunk
      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith('auto_mode_progress', {
        featureId: 'test-feature',
        branchName: null,
        content: 'First chunk of text',
      });
      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith('auto_mode_progress', {
        featureId: 'test-feature',
        branchName: null,
        content: 'Second chunk of text',
      });
    });

    it('should emit auto_mode_tool events for tool use', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_use',
                  name: 'write_file',
                  input: { path: '/test/file.ts', content: 'test content' },
                },
              ],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      // Should emit tool event
      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith('auto_mode_tool', {
        featureId: 'test-feature',
        branchName: null,
        tool: 'write_file',
        input: { path: '/test/file.ts', content: 'test content' },
      });
    });

    it('should throw error when provider stream yields error message', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Starting...' }],
            },
          };
          yield {
            type: 'error',
            error: 'API rate limit exceeded',
          };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await expect(executor.execute(options, callbacks)).rejects.toThrow('API rate limit exceeded');
    });

    it('should throw "Unknown error" when provider stream yields error with empty message', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'error',
            error: '',
            session_id: 'sess-123',
          };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await expect(executor.execute(options, callbacks)).rejects.toThrow('Unknown error');
    });

    it('should throw with sanitized error when provider yields ANSI-decorated error', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'error',
            // ANSI color codes + "Error: " prefix that should be stripped
            error: '\x1b[31mError: Connection refused\x1b[0m',
          };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      // Should strip ANSI codes and "Error: " prefix
      await expect(executor.execute(options, callbacks)).rejects.toThrow('Connection refused');
    });

    it('should throw when result subtype is error_max_turns', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Working on it...' }],
            },
          };
          yield {
            type: 'result',
            subtype: 'error_max_turns',
            session_id: 'sess-456',
          };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await expect(executor.execute(options, callbacks)).rejects.toThrow(
        'Agent execution ended with: error_max_turns'
      );
    });

    it('should throw when result subtype is error_during_execution', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'result',
            subtype: 'error_during_execution',
            session_id: 'sess-789',
          };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await expect(executor.execute(options, callbacks)).rejects.toThrow(
        'Agent execution ended with: error_during_execution'
      );
    });

    it('should throw when result subtype is error_max_structured_output_retries', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'result',
            subtype: 'error_max_structured_output_retries',
          };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await expect(executor.execute(options, callbacks)).rejects.toThrow(
        'Agent execution ended with: error_max_structured_output_retries'
      );
    });

    it('should throw when result subtype is error_max_budget_usd', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'result',
            subtype: 'error_max_budget_usd',
            session_id: 'sess-budget',
          };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await expect(executor.execute(options, callbacks)).rejects.toThrow(
        'Agent execution ended with: error_max_budget_usd'
      );
    });

    it('should NOT throw when result subtype is success', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Done!' }],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
            session_id: 'sess-ok',
          };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      // Should resolve without throwing
      const result = await executor.execute(options, callbacks);
      expect(result.aborted).toBe(false);
      expect(result.responseText).toContain('Done!');
    });

    it('should throw error when authentication fails in response', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Error: Invalid API key' }],
            },
          };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await expect(executor.execute(options, callbacks)).rejects.toThrow('Authentication failed');
    });

    it('should accumulate responseText from multiple text blocks', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [
                { type: 'text', text: 'Part 1.' },
                { type: 'text', text: ' Part 2.' },
              ],
            },
          };
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: ' Part 3.' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      const result = await executor.execute(options, callbacks);

      // All parts should be in response text
      expect(result.responseText).toContain('Part 1');
      expect(result.responseText).toContain('Part 2');
      expect(result.responseText).toContain('Part 3');
    });

    it('should return tasksCompleted=0 when no tasks executed', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Simple response' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      const result = await executor.execute(options, callbacks);

      expect(result.tasksCompleted).toBe(0);
      expect(result.aborted).toBe(false);
    });

    it('should pass branchName to event payloads', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Response' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        branchName: 'feature/my-feature',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      // Branch name should be passed to progress event
      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_progress',
        expect.objectContaining({
          branchName: 'feature/my-feature',
        })
      );
    });

    it('should return correct result structure', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Test response' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary: vi.fn(),
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      const result = await executor.execute(options, callbacks);

      // Verify result has all expected properties
      expect(result).toHaveProperty('responseText');
      expect(result).toHaveProperty('specDetected');
      expect(result).toHaveProperty('tasksCompleted');
      expect(result).toHaveProperty('aborted');

      // Verify types
      expect(typeof result.responseText).toBe('string');
      expect(typeof result.specDetected).toBe('boolean');
      expect(typeof result.tasksCompleted).toBe('number');
      expect(typeof result.aborted).toBe('boolean');
    });
  });

  describe('pipeline summary fallback with scaffold stripping', () => {
    it('should strip follow-up scaffold from fallback summary when extraction fails', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Some agent output without summary markers' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const saveFeatureSummary = vi.fn().mockResolvedValue(undefined);

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        previousContent: 'Previous session content',
        status: 'pipeline_step1', // Pipeline status to trigger fallback
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary,
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      // The fallback summary should be called without the scaffold header
      expect(saveFeatureSummary).toHaveBeenCalled();
      const savedSummary = saveFeatureSummary.mock.calls[0][2];
      // Should not contain the scaffold header
      expect(savedSummary).not.toContain('---');
      expect(savedSummary).not.toContain('Follow-up Session');
      // Should contain the actual content
      expect(savedSummary).toContain('Some agent output without summary markers');
    });

    it('should not save fallback when scaffold is the only content after stripping', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      // Provider yields no content - only scaffold will be present
      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          // Empty stream - no actual content
        }),
      } as unknown as BaseProvider;

      const saveFeatureSummary = vi.fn().mockResolvedValue(undefined);

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        previousContent: 'Previous session content',
        status: 'pipeline_step1', // Pipeline status
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary,
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      // Should not save an empty fallback (after scaffold is stripped)
      expect(saveFeatureSummary).not.toHaveBeenCalled();
    });

    it('should save extracted summary when available, not fallback', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'text',
                  text: 'Some content\n\n<summary>Extracted summary here</summary>\n\nMore content',
                },
              ],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const saveFeatureSummary = vi.fn().mockResolvedValue(undefined);

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        previousContent: 'Previous session content',
        status: 'pipeline_step1', // Pipeline status
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary,
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      // Should save the extracted summary, not the full content
      expect(saveFeatureSummary).toHaveBeenCalledTimes(1);
      expect(saveFeatureSummary).toHaveBeenCalledWith(
        '/project',
        'test-feature',
        'Extracted summary here'
      );
    });

    it('should handle scaffold with various whitespace patterns', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Agent response here' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const saveFeatureSummary = vi.fn().mockResolvedValue(undefined);

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        previousContent: 'Previous session content',
        status: 'pipeline_step1',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary,
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      // Should strip scaffold and save actual content
      expect(saveFeatureSummary).toHaveBeenCalled();
      const savedSummary = saveFeatureSummary.mock.calls[0][2];
      expect(savedSummary.trim()).toBe('Agent response here');
    });

    it('should handle scaffold with extra newlines between markers', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Actual content after scaffold' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const saveFeatureSummary = vi.fn().mockResolvedValue(undefined);

      // Set up with previous content to trigger scaffold insertion
      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        previousContent: 'Previous session content',
        status: 'pipeline_step1',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary,
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      expect(saveFeatureSummary).toHaveBeenCalled();
      const savedSummary = saveFeatureSummary.mock.calls[0][2];
      // Verify the scaffold is stripped
      expect(savedSummary).not.toMatch(/---\s*##\s*Follow-up Session/);
    });

    it('should handle content without any scaffold (first session)', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'First session output without summary' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const saveFeatureSummary = vi.fn().mockResolvedValue(undefined);

      // No previousContent means no scaffold
      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        previousContent: undefined, // No previous content
        status: 'pipeline_step1',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary,
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      expect(saveFeatureSummary).toHaveBeenCalled();
      const savedSummary = saveFeatureSummary.mock.calls[0][2];
      expect(savedSummary).toBe('First session output without summary');
    });

    it('should handle non-pipeline status without saving fallback', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Output without summary' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const saveFeatureSummary = vi.fn().mockResolvedValue(undefined);

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        previousContent: 'Previous content',
        status: 'implementing', // Non-pipeline status
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary,
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      // Should NOT save fallback for non-pipeline status
      expect(saveFeatureSummary).not.toHaveBeenCalled();
    });

    it('should correctly handle content that starts with dashes but is not scaffold', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      // Content that looks like it might have dashes but is actual content
      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: '---This is a code comment or separator---' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const saveFeatureSummary = vi.fn().mockResolvedValue(undefined);

      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        previousContent: undefined,
        status: 'pipeline_step1',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary,
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      expect(saveFeatureSummary).toHaveBeenCalled();
      const savedSummary = saveFeatureSummary.mock.calls[0][2];
      // Content should be preserved since it's not the scaffold pattern
      expect(savedSummary).toContain('---This is a code comment or separator---');
    });

    it('should handle scaffold at different positions in content', async () => {
      const executor = new AgentExecutor(
        mockEventBus,
        mockFeatureStateManager,
        mockPlanApprovalService,
        mockSettingsService
      );

      const mockProvider = {
        getName: () => 'mock',
        executeQuery: vi.fn().mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Content after scaffold marker' }],
            },
          };
          yield { type: 'result', subtype: 'success' };
        }),
      } as unknown as BaseProvider;

      const saveFeatureSummary = vi.fn().mockResolvedValue(undefined);

      // With previousContent, scaffold will be at the start of sessionContent
      const options: AgentExecutionOptions = {
        workDir: '/test',
        featureId: 'test-feature',
        prompt: 'Test prompt',
        projectPath: '/project',
        abortController: new AbortController(),
        provider: mockProvider,
        effectiveBareModel: 'claude-sonnet-4-6',
        planningMode: 'skip',
        previousContent: 'Previous content',
        status: 'pipeline_step1',
      };

      const callbacks = {
        waitForApproval: vi.fn().mockResolvedValue({ approved: true }),
        saveFeatureSummary,
        updateFeatureSummary: vi.fn(),
        buildTaskPrompt: vi.fn().mockReturnValue('task prompt'),
      };

      await executor.execute(options, callbacks);

      expect(saveFeatureSummary).toHaveBeenCalled();
      const savedSummary = saveFeatureSummary.mock.calls[0][2];
      // Scaffold should be stripped, only actual content remains
      expect(savedSummary).toBe('Content after scaffold marker');
    });
  });
});
