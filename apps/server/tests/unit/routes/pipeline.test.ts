import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createGetConfigHandler } from '@/routes/pipeline/routes/get-config.js';
import { createSaveConfigHandler } from '@/routes/pipeline/routes/save-config.js';
import { createAddStepHandler } from '@/routes/pipeline/routes/add-step.js';
import { createUpdateStepHandler } from '@/routes/pipeline/routes/update-step.js';
import { createDeleteStepHandler } from '@/routes/pipeline/routes/delete-step.js';
import { createReorderStepsHandler } from '@/routes/pipeline/routes/reorder-steps.js';
import type { PipelineService } from '@/services/pipeline-service.js';
import type { PipelineConfig, PipelineStep } from '@automaker/types';
import { createMockExpressContext } from '../../utils/mocks.js';

describe('pipeline routes', () => {
  let mockPipelineService: PipelineService;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPipelineService = {
      getPipelineConfig: vi.fn(),
      savePipelineConfig: vi.fn(),
      addStep: vi.fn(),
      updateStep: vi.fn(),
      deleteStep: vi.fn(),
      reorderSteps: vi.fn(),
    } as any;

    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  describe('get-config', () => {
    it('should return pipeline config successfully', async () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [],
      };

      vi.mocked(mockPipelineService.getPipelineConfig).mockResolvedValue(config);
      req.body = { projectPath: '/test/project' };

      const handler = createGetConfigHandler(mockPipelineService);
      await handler(req, res);

      expect(mockPipelineService.getPipelineConfig).toHaveBeenCalledWith('/test/project');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        config,
      });
    });

    it('should return 400 if projectPath is missing', async () => {
      req.body = {};

      const handler = createGetConfigHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
      expect(mockPipelineService.getPipelineConfig).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Read failed');
      vi.mocked(mockPipelineService.getPipelineConfig).mockRejectedValue(error);
      req.body = { projectPath: '/test/project' };

      const handler = createGetConfigHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Read failed',
      });
    });
  });

  describe('save-config', () => {
    it('should save pipeline config successfully', async () => {
      const config: PipelineConfig = {
        version: 1,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            order: 0,
            instructions: 'Instructions',
            colorClass: 'blue',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(mockPipelineService.savePipelineConfig).mockResolvedValue(undefined);
      req.body = { projectPath: '/test/project', config };

      const handler = createSaveConfigHandler(mockPipelineService);
      await handler(req, res);

      expect(mockPipelineService.savePipelineConfig).toHaveBeenCalledWith('/test/project', config);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
      });
    });

    it('should return 400 if projectPath is missing', async () => {
      req.body = { config: { version: 1, steps: [] } };

      const handler = createSaveConfigHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
    });

    it('should return 400 if config is missing', async () => {
      req.body = { projectPath: '/test/project' };

      const handler = createSaveConfigHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'config is required',
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Save failed');
      vi.mocked(mockPipelineService.savePipelineConfig).mockRejectedValue(error);
      req.body = {
        projectPath: '/test/project',
        config: { version: 1, steps: [] },
      };

      const handler = createSaveConfigHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Save failed',
      });
    });
  });

  describe('add-step', () => {
    it('should add step successfully', async () => {
      const stepData = {
        name: 'New Step',
        order: 0,
        instructions: 'Do something',
        colorClass: 'blue',
      };

      const newStep: PipelineStep = {
        ...stepData,
        id: 'step1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockPipelineService.addStep).mockResolvedValue(newStep);
      req.body = { projectPath: '/test/project', step: stepData };

      const handler = createAddStepHandler(mockPipelineService);
      await handler(req, res);

      expect(mockPipelineService.addStep).toHaveBeenCalledWith('/test/project', stepData);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        step: newStep,
      });
    });

    it('should return 400 if projectPath is missing', async () => {
      req.body = { step: { name: 'Step', order: 0, instructions: 'Do', colorClass: 'blue' } };

      const handler = createAddStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
    });

    it('should return 400 if step is missing', async () => {
      req.body = { projectPath: '/test/project' };

      const handler = createAddStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'step is required',
      });
    });

    it('should return 400 if step.name is missing', async () => {
      req.body = {
        projectPath: '/test/project',
        step: { order: 0, instructions: 'Do', colorClass: 'blue' },
      };

      const handler = createAddStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'step.name is required',
      });
    });

    it('should return 400 if step.instructions is missing', async () => {
      req.body = {
        projectPath: '/test/project',
        step: { name: 'Step', order: 0, colorClass: 'blue' },
      };

      const handler = createAddStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'step.instructions is required',
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Add failed');
      vi.mocked(mockPipelineService.addStep).mockRejectedValue(error);
      req.body = {
        projectPath: '/test/project',
        step: { name: 'Step', order: 0, instructions: 'Do', colorClass: 'blue' },
      };

      const handler = createAddStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Add failed',
      });
    });
  });

  describe('update-step', () => {
    it('should update step successfully', async () => {
      const updates = {
        name: 'Updated Name',
        instructions: 'Updated instructions',
      };

      const updatedStep: PipelineStep = {
        id: 'step1',
        name: 'Updated Name',
        order: 0,
        instructions: 'Updated instructions',
        colorClass: 'blue',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      vi.mocked(mockPipelineService.updateStep).mockResolvedValue(updatedStep);
      req.body = { projectPath: '/test/project', stepId: 'step1', updates };

      const handler = createUpdateStepHandler(mockPipelineService);
      await handler(req, res);

      expect(mockPipelineService.updateStep).toHaveBeenCalledWith(
        '/test/project',
        'step1',
        updates
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        step: updatedStep,
      });
    });

    it('should return 400 if projectPath is missing', async () => {
      req.body = { stepId: 'step1', updates: { name: 'New' } };

      const handler = createUpdateStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
    });

    it('should return 400 if stepId is missing', async () => {
      req.body = { projectPath: '/test/project', updates: { name: 'New' } };

      const handler = createUpdateStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'stepId is required',
      });
    });

    it('should return 400 if updates is missing', async () => {
      req.body = { projectPath: '/test/project', stepId: 'step1' };

      const handler = createUpdateStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'updates is required',
      });
    });

    it('should return 400 if updates is empty object', async () => {
      req.body = { projectPath: '/test/project', stepId: 'step1', updates: {} };

      const handler = createUpdateStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'updates is required',
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Update failed');
      vi.mocked(mockPipelineService.updateStep).mockRejectedValue(error);
      req.body = {
        projectPath: '/test/project',
        stepId: 'step1',
        updates: { name: 'New' },
      };

      const handler = createUpdateStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Update failed',
      });
    });
  });

  describe('delete-step', () => {
    it('should delete step successfully', async () => {
      vi.mocked(mockPipelineService.deleteStep).mockResolvedValue(undefined);
      req.body = { projectPath: '/test/project', stepId: 'step1' };

      const handler = createDeleteStepHandler(mockPipelineService);
      await handler(req, res);

      expect(mockPipelineService.deleteStep).toHaveBeenCalledWith('/test/project', 'step1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
      });
    });

    it('should return 400 if projectPath is missing', async () => {
      req.body = { stepId: 'step1' };

      const handler = createDeleteStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
    });

    it('should return 400 if stepId is missing', async () => {
      req.body = { projectPath: '/test/project' };

      const handler = createDeleteStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'stepId is required',
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Delete failed');
      vi.mocked(mockPipelineService.deleteStep).mockRejectedValue(error);
      req.body = { projectPath: '/test/project', stepId: 'step1' };

      const handler = createDeleteStepHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Delete failed',
      });
    });
  });

  describe('reorder-steps', () => {
    it('should reorder steps successfully', async () => {
      vi.mocked(mockPipelineService.reorderSteps).mockResolvedValue(undefined);
      req.body = { projectPath: '/test/project', stepIds: ['step2', 'step1', 'step3'] };

      const handler = createReorderStepsHandler(mockPipelineService);
      await handler(req, res);

      expect(mockPipelineService.reorderSteps).toHaveBeenCalledWith('/test/project', [
        'step2',
        'step1',
        'step3',
      ]);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
      });
    });

    it('should return 400 if projectPath is missing', async () => {
      req.body = { stepIds: ['step1', 'step2'] };

      const handler = createReorderStepsHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
    });

    it('should return 400 if stepIds is missing', async () => {
      req.body = { projectPath: '/test/project' };

      const handler = createReorderStepsHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'stepIds array is required',
      });
    });

    it('should return 400 if stepIds is not an array', async () => {
      req.body = { projectPath: '/test/project', stepIds: 'not-an-array' };

      const handler = createReorderStepsHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'stepIds array is required',
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Reorder failed');
      vi.mocked(mockPipelineService.reorderSteps).mockRejectedValue(error);
      req.body = { projectPath: '/test/project', stepIds: ['step1', 'step2'] };

      const handler = createReorderStepsHandler(mockPipelineService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Reorder failed',
      });
    });
  });
});
