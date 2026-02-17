/**
 * Unit tests for RecoveryService
 *
 * Tests crash recovery and feature resumption functionality:
 * - Execution state persistence (save/load/clear)
 * - Context detection (agent-output.md exists)
 * - Feature resumption flow (pipeline vs non-pipeline)
 * - Interrupted feature detection and batch resumption
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { RecoveryService, DEFAULT_EXECUTION_STATE } from '@/services/recovery-service.js';
import type { Feature } from '@automaker/types';

/**
 * Helper to normalize paths for cross-platform test compatibility.
 * Uses path.normalize (not path.resolve) to match path.join behavior in production code.
 */
const normalizePath = (p: string): string => path.normalize(p);

// Mock dependencies
vi.mock('@automaker/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  readJsonWithRecovery: vi.fn().mockResolvedValue({ data: null, wasRecovered: false }),
  logRecoveryWarning: vi.fn(),
  DEFAULT_BACKUP_COUNT: 5,
}));

vi.mock('@automaker/platform', () => ({
  getFeatureDir: (projectPath: string, featureId: string) =>
    `${projectPath}/.automaker/features/${featureId}`,
  getFeaturesDir: (projectPath: string) => `${projectPath}/.automaker/features`,
  getExecutionStatePath: (projectPath: string) => `${projectPath}/.automaker/execution-state.json`,
  ensureAutomakerDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/secure-fs.js', () => ({
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/settings-helpers.js', () => ({
  getPromptCustomization: vi.fn().mockResolvedValue({
    taskExecution: {
      resumeFeatureTemplate: 'Resume: {{featurePrompt}}\n\nPrevious context:\n{{previousContext}}',
    },
  }),
}));

describe('recovery-service.ts', () => {
  // Import mocked modules for access in tests
  let secureFs: typeof import('@/lib/secure-fs.js');
  let utils: typeof import('@automaker/utils');

  // Mock dependencies
  const mockEventBus = {
    emitAutoModeEvent: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };

  const mockConcurrencyManager = {
    getAllRunning: vi.fn().mockReturnValue([]),
    getRunningFeature: vi.fn().mockReturnValue(null),
    acquire: vi.fn().mockImplementation(({ featureId }) => ({
      featureId,
      abortController: new AbortController(),
      projectPath: '/test/project',
      isAutoMode: false,
      startTime: Date.now(),
      leaseCount: 1,
    })),
    release: vi.fn(),
    getRunningCountForWorktree: vi.fn().mockReturnValue(0),
  };

  const mockSettingsService = null;

  // Callback mocks - initialize empty, set up in beforeEach
  let mockExecuteFeature: ReturnType<typeof vi.fn>;
  let mockLoadFeature: ReturnType<typeof vi.fn>;
  let mockDetectPipelineStatus: ReturnType<typeof vi.fn>;
  let mockResumePipeline: ReturnType<typeof vi.fn>;
  let mockIsFeatureRunning: ReturnType<typeof vi.fn>;
  let mockAcquireRunningFeature: ReturnType<typeof vi.fn>;
  let mockReleaseRunningFeature: ReturnType<typeof vi.fn>;

  let service: RecoveryService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked modules
    secureFs = await import('@/lib/secure-fs.js');
    utils = await import('@automaker/utils');

    // Reset secure-fs mocks to default behavior
    vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
    vi.mocked(secureFs.unlink).mockResolvedValue(undefined);
    vi.mocked(secureFs.readdir).mockResolvedValue([]);

    // Reset all callback mocks with default implementations
    mockExecuteFeature = vi.fn().mockResolvedValue(undefined);
    mockLoadFeature = vi.fn().mockResolvedValue(null);
    mockDetectPipelineStatus = vi.fn().mockResolvedValue({
      isPipeline: false,
      stepId: null,
      stepIndex: -1,
      totalSteps: 0,
      step: null,
      config: null,
    });
    mockResumePipeline = vi.fn().mockResolvedValue(undefined);
    mockIsFeatureRunning = vi.fn().mockReturnValue(false);
    mockAcquireRunningFeature = vi.fn().mockImplementation(({ featureId }) => ({
      featureId,
      abortController: new AbortController(),
    }));
    mockReleaseRunningFeature = vi.fn();

    service = new RecoveryService(
      mockEventBus as any,
      mockConcurrencyManager as any,
      mockSettingsService,
      mockExecuteFeature,
      mockLoadFeature,
      mockDetectPipelineStatus,
      mockResumePipeline,
      mockIsFeatureRunning,
      mockAcquireRunningFeature,
      mockReleaseRunningFeature
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('DEFAULT_EXECUTION_STATE', () => {
    it('has correct default values', () => {
      expect(DEFAULT_EXECUTION_STATE).toEqual({
        version: 1,
        autoLoopWasRunning: false,
        maxConcurrency: expect.any(Number),
        projectPath: '',
        branchName: null,
        runningFeatureIds: [],
        savedAt: '',
      });
    });
  });

  describe('saveExecutionStateForProject', () => {
    it('writes correct JSON to execution state path', async () => {
      mockConcurrencyManager.getAllRunning.mockReturnValue([
        { featureId: 'feature-1', projectPath: '/test/project' },
        { featureId: 'feature-2', projectPath: '/test/project' },
        { featureId: 'feature-3', projectPath: '/other/project' },
      ]);

      await service.saveExecutionStateForProject('/test/project', 'feature-branch', 3);

      expect(secureFs.writeFile).toHaveBeenCalledWith(
        '/test/project/.automaker/execution-state.json',
        expect.any(String),
        'utf-8'
      );

      const writtenContent = JSON.parse(vi.mocked(secureFs.writeFile).mock.calls[0][1] as string);
      expect(writtenContent).toMatchObject({
        version: 1,
        autoLoopWasRunning: true,
        maxConcurrency: 3,
        projectPath: '/test/project',
        branchName: 'feature-branch',
        runningFeatureIds: ['feature-1', 'feature-2'],
      });
      expect(writtenContent.savedAt).toBeDefined();
    });

    it('filters running features by project path', async () => {
      mockConcurrencyManager.getAllRunning.mockReturnValue([
        { featureId: 'feature-1', projectPath: '/project-a' },
        { featureId: 'feature-2', projectPath: '/project-b' },
      ]);

      await service.saveExecutionStateForProject('/project-a', null, 2);

      const writtenContent = JSON.parse(vi.mocked(secureFs.writeFile).mock.calls[0][1] as string);
      expect(writtenContent.runningFeatureIds).toEqual(['feature-1']);
    });

    it('handles null branch name for main worktree', async () => {
      mockConcurrencyManager.getAllRunning.mockReturnValue([]);
      await service.saveExecutionStateForProject('/test/project', null, 1);

      const writtenContent = JSON.parse(vi.mocked(secureFs.writeFile).mock.calls[0][1] as string);
      expect(writtenContent.branchName).toBeNull();
    });
  });

  describe('saveExecutionState (legacy)', () => {
    it('saves execution state with legacy format', async () => {
      mockConcurrencyManager.getAllRunning.mockReturnValue([
        { featureId: 'feature-1', projectPath: '/test' },
      ]);

      await service.saveExecutionState('/test/project', true, 5);

      expect(secureFs.writeFile).toHaveBeenCalled();
      const writtenContent = JSON.parse(vi.mocked(secureFs.writeFile).mock.calls[0][1] as string);
      expect(writtenContent).toMatchObject({
        autoLoopWasRunning: true,
        maxConcurrency: 5,
        branchName: null, // Legacy uses main worktree
      });
    });
  });

  describe('loadExecutionState', () => {
    it('parses JSON correctly when file exists', async () => {
      const mockState = {
        version: 1,
        autoLoopWasRunning: true,
        maxConcurrency: 4,
        projectPath: '/test/project',
        branchName: 'dev',
        runningFeatureIds: ['f1', 'f2'],
        savedAt: '2026-01-27T12:00:00Z',
      };
      vi.mocked(secureFs.readFile).mockResolvedValueOnce(JSON.stringify(mockState));

      const result = await service.loadExecutionState('/test/project');

      expect(result).toEqual(mockState);
    });

    it('returns default state on ENOENT error', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(secureFs.readFile).mockRejectedValueOnce(error);

      const result = await service.loadExecutionState('/test/project');

      expect(result).toEqual(DEFAULT_EXECUTION_STATE);
    });

    it('returns default state on other errors and logs', async () => {
      vi.mocked(secureFs.readFile).mockRejectedValueOnce(new Error('Permission denied'));

      const result = await service.loadExecutionState('/test/project');

      expect(result).toEqual(DEFAULT_EXECUTION_STATE);
    });
  });

  describe('clearExecutionState', () => {
    it('removes execution state file', async () => {
      await service.clearExecutionState('/test/project');

      expect(secureFs.unlink).toHaveBeenCalledWith('/test/project/.automaker/execution-state.json');
    });

    it('does not throw on ENOENT error', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(secureFs.unlink).mockRejectedValueOnce(error);

      await expect(service.clearExecutionState('/test/project')).resolves.not.toThrow();
    });

    it('logs error on other failures', async () => {
      vi.mocked(secureFs.unlink).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(service.clearExecutionState('/test/project')).resolves.not.toThrow();
    });
  });

  describe('contextExists', () => {
    it('returns true when agent-output.md exists', async () => {
      vi.mocked(secureFs.access).mockResolvedValueOnce(undefined);

      const result = await service.contextExists('/test/project', 'feature-1');

      expect(result).toBe(true);
      expect(secureFs.access).toHaveBeenCalledWith(
        normalizePath('/test/project/.automaker/features/feature-1/agent-output.md')
      );
    });

    it('returns false when agent-output.md is missing', async () => {
      vi.mocked(secureFs.access).mockRejectedValueOnce(new Error('ENOENT'));

      const result = await service.contextExists('/test/project', 'feature-1');

      expect(result).toBe(false);
    });
  });

  describe('resumeFeature', () => {
    const mockFeature: Feature = {
      id: 'feature-1',
      title: 'Test Feature',
      description: 'A test feature',
      status: 'in_progress',
    };

    beforeEach(() => {
      mockLoadFeature.mockResolvedValue(mockFeature);
    });

    it('skips if feature already running (idempotent)', async () => {
      mockIsFeatureRunning.mockReturnValueOnce(true);

      await service.resumeFeature('/test/project', 'feature-1');

      expect(mockLoadFeature).not.toHaveBeenCalled();
      expect(mockExecuteFeature).not.toHaveBeenCalled();
    });

    it('detects pipeline status for feature', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      await service.resumeFeature('/test/project', 'feature-1');

      expect(mockDetectPipelineStatus).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        'in_progress'
      );
    });

    it('delegates to resumePipeline for pipeline features', async () => {
      const pipelineInfo = {
        isPipeline: true,
        stepId: 'test',
        stepIndex: 1,
        totalSteps: 3,
        step: {
          id: 'test',
          name: 'Test Step',
          command: 'npm test',
          type: 'test' as const,
          order: 1,
        },
        config: null,
      };
      mockDetectPipelineStatus.mockResolvedValueOnce(pipelineInfo);

      await service.resumeFeature('/test/project', 'feature-1');

      expect(mockResumePipeline).toHaveBeenCalledWith(
        '/test/project',
        mockFeature,
        false,
        pipelineInfo
      );
      expect(mockExecuteFeature).not.toHaveBeenCalled();
    });

    it('calls executeFeature with continuation prompt when context exists', async () => {
      // Reset settings-helpers mock before this test
      const settingsHelpers = await import('@/lib/settings-helpers.js');
      vi.mocked(settingsHelpers.getPromptCustomization).mockResolvedValue({
        taskExecution: {
          resumeFeatureTemplate:
            'Resume: {{featurePrompt}}\n\nPrevious context:\n{{previousContext}}',
          implementationInstructions: '',
          playwrightVerificationInstructions: '',
        },
      } as any);

      vi.mocked(secureFs.access).mockResolvedValueOnce(undefined);
      vi.mocked(secureFs.readFile).mockResolvedValueOnce('Previous agent output content');

      await service.resumeFeature('/test/project', 'feature-1');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_feature_resuming',
        expect.objectContaining({
          featureId: 'feature-1',
          hasContext: true,
        })
      );
      expect(mockExecuteFeature).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        false,
        false,
        undefined,
        expect.objectContaining({
          continuationPrompt: expect.stringContaining('Previous agent output content'),
          _calledInternally: true,
        })
      );
    });

    it('calls executeFeature fresh when no context', async () => {
      vi.mocked(secureFs.access).mockRejectedValueOnce(new Error('ENOENT'));

      await service.resumeFeature('/test/project', 'feature-1');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_feature_resuming',
        expect.objectContaining({
          featureId: 'feature-1',
          hasContext: false,
        })
      );
      expect(mockExecuteFeature).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        false,
        false,
        undefined,
        expect.objectContaining({
          _calledInternally: true,
        })
      );
    });

    it('releases running feature in finally block', async () => {
      mockLoadFeature.mockRejectedValueOnce(new Error('Feature not found'));

      await expect(service.resumeFeature('/test/project', 'feature-1')).rejects.toThrow();

      expect(mockReleaseRunningFeature).toHaveBeenCalledWith('feature-1');
    });

    it('throws error if feature not found', async () => {
      mockLoadFeature.mockResolvedValueOnce(null);

      await expect(service.resumeFeature('/test/project', 'feature-1')).rejects.toThrow(
        'Feature feature-1 not found'
      );
    });

    it('acquires running feature with allowReuse when calledInternally', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      await service.resumeFeature('/test/project', 'feature-1', false, true);

      expect(mockAcquireRunningFeature).toHaveBeenCalledWith({
        featureId: 'feature-1',
        projectPath: '/test/project',
        isAutoMode: false,
        allowReuse: true,
      });
    });
  });

  describe('resumeInterruptedFeatures', () => {
    it('finds features with in_progress status', async () => {
      vi.mocked(secureFs.readdir).mockResolvedValueOnce([
        { name: 'feature-1', isDirectory: () => true } as any,
        { name: 'feature-2', isDirectory: () => true } as any,
      ]);
      vi.mocked(utils.readJsonWithRecovery)
        .mockResolvedValueOnce({
          data: { id: 'feature-1', title: 'Feature 1', status: 'in_progress' },
          wasRecovered: false,
        })
        .mockResolvedValueOnce({
          data: { id: 'feature-2', title: 'Feature 2', status: 'backlog' },
          wasRecovered: false,
        });

      mockLoadFeature.mockResolvedValue({
        id: 'feature-1',
        title: 'Feature 1',
        status: 'in_progress',
        description: 'Test',
      });

      await service.resumeInterruptedFeatures('/test/project');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_resuming_features',
        expect.objectContaining({
          featureIds: ['feature-1'],
        })
      );
    });

    it('finds features with pipeline_* status', async () => {
      vi.mocked(secureFs.readdir).mockResolvedValueOnce([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);
      vi.mocked(utils.readJsonWithRecovery).mockResolvedValueOnce({
        data: { id: 'feature-1', title: 'Feature 1', status: 'pipeline_test' },
        wasRecovered: false,
      });

      mockLoadFeature.mockResolvedValue({
        id: 'feature-1',
        title: 'Feature 1',
        status: 'pipeline_test',
        description: 'Test',
      });

      await service.resumeInterruptedFeatures('/test/project');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_resuming_features',
        expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({ id: 'feature-1', status: 'pipeline_test' }),
          ]),
        })
      );
    });

    it('distinguishes features with/without context', async () => {
      vi.mocked(secureFs.readdir).mockResolvedValueOnce([
        { name: 'feature-with', isDirectory: () => true } as any,
        { name: 'feature-without', isDirectory: () => true } as any,
      ]);
      vi.mocked(utils.readJsonWithRecovery)
        .mockResolvedValueOnce({
          data: { id: 'feature-with', title: 'With Context', status: 'in_progress' },
          wasRecovered: false,
        })
        .mockResolvedValueOnce({
          data: { id: 'feature-without', title: 'Without Context', status: 'in_progress' },
          wasRecovered: false,
        });

      // First feature has context, second doesn't
      vi.mocked(secureFs.access)
        .mockResolvedValueOnce(undefined) // feature-with has context
        .mockRejectedValueOnce(new Error('ENOENT')); // feature-without doesn't

      mockLoadFeature
        .mockResolvedValueOnce({
          id: 'feature-with',
          title: 'With Context',
          status: 'in_progress',
          description: 'Test',
        })
        .mockResolvedValueOnce({
          id: 'feature-without',
          title: 'Without Context',
          status: 'in_progress',
          description: 'Test',
        });

      await service.resumeInterruptedFeatures('/test/project');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_resuming_features',
        expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({ id: 'feature-with', hasContext: true }),
            expect.objectContaining({ id: 'feature-without', hasContext: false }),
          ]),
        })
      );
    });

    it('emits auto_mode_resuming_features event', async () => {
      vi.mocked(secureFs.readdir).mockResolvedValueOnce([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);
      vi.mocked(utils.readJsonWithRecovery).mockResolvedValueOnce({
        data: { id: 'feature-1', title: 'Feature 1', status: 'in_progress' },
        wasRecovered: false,
      });

      mockLoadFeature.mockResolvedValue({
        id: 'feature-1',
        title: 'Feature 1',
        status: 'in_progress',
        description: 'Test',
      });

      await service.resumeInterruptedFeatures('/test/project');

      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_resuming_features',
        expect.objectContaining({
          message: expect.stringContaining('interrupted feature'),
          projectPath: '/test/project',
        })
      );
    });

    it('skips features already running (idempotent)', async () => {
      vi.mocked(secureFs.readdir).mockResolvedValueOnce([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);
      vi.mocked(utils.readJsonWithRecovery).mockResolvedValueOnce({
        data: { id: 'feature-1', title: 'Feature 1', status: 'in_progress' },
        wasRecovered: false,
      });

      mockIsFeatureRunning.mockReturnValue(true);

      await service.resumeInterruptedFeatures('/test/project');

      // Should emit event but not actually resume
      expect(mockEventBus.emitAutoModeEvent).toHaveBeenCalledWith(
        'auto_mode_resuming_features',
        expect.anything()
      );
      // But resumeFeature should exit early due to isFeatureRunning check
      expect(mockLoadFeature).not.toHaveBeenCalled();
    });

    it('handles ENOENT for features directory gracefully', async () => {
      const error = new Error('Directory not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(secureFs.readdir).mockRejectedValueOnce(error);

      await expect(service.resumeInterruptedFeatures('/test/project')).resolves.not.toThrow();
    });

    it('continues with other features when one fails', async () => {
      vi.mocked(secureFs.readdir).mockResolvedValueOnce([
        { name: 'feature-fail', isDirectory: () => true } as any,
        { name: 'feature-success', isDirectory: () => true } as any,
      ]);
      vi.mocked(utils.readJsonWithRecovery)
        .mockResolvedValueOnce({
          data: { id: 'feature-fail', title: 'Fail', status: 'in_progress' },
          wasRecovered: false,
        })
        .mockResolvedValueOnce({
          data: { id: 'feature-success', title: 'Success', status: 'in_progress' },
          wasRecovered: false,
        });

      // First feature throws during resume, second succeeds
      mockLoadFeature.mockRejectedValueOnce(new Error('Resume failed')).mockResolvedValueOnce({
        id: 'feature-success',
        title: 'Success',
        status: 'in_progress',
        description: 'Test',
      });

      await service.resumeInterruptedFeatures('/test/project');

      // Should still attempt to resume the second feature
      expect(mockLoadFeature).toHaveBeenCalledTimes(2);
    });

    it('logs info when no interrupted features found', async () => {
      vi.mocked(secureFs.readdir).mockResolvedValueOnce([
        { name: 'feature-1', isDirectory: () => true } as any,
      ]);
      vi.mocked(utils.readJsonWithRecovery).mockResolvedValueOnce({
        data: { id: 'feature-1', title: 'Feature 1', status: 'completed' },
        wasRecovered: false,
      });

      await service.resumeInterruptedFeatures('/test/project');

      expect(mockEventBus.emitAutoModeEvent).not.toHaveBeenCalledWith(
        'auto_mode_resuming_features',
        expect.anything()
      );
    });
  });
});
