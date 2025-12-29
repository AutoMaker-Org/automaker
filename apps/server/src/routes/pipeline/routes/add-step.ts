/**
 * POST /api/pipeline/steps/add - Add a new pipeline step
 *
 * Adds a new step to the pipeline configuration.
 *
 * Request body: { projectPath: string, step: { name, order, instructions, colorClass } }
 * Response: { success: true, step: PipelineStep }
 */

import type { Request, Response } from 'express';
import type { PipelineService } from '../../../services/pipeline-service.js';
import type { PipelineStep } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createAddStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, step } = req.body as {
        projectPath: string;
        step: Omit<PipelineStep, 'id' | 'createdAt' | 'updatedAt'>;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!step) {
        res.status(400).json({ success: false, error: 'step is required' });
        return;
      }

      if (!step.name) {
        res.status(400).json({ success: false, error: 'step.name is required' });
        return;
      }

      if (step.instructions === undefined) {
        res.status(400).json({ success: false, error: 'step.instructions is required' });
        return;
      }

      const newStep = await pipelineService.addStep(projectPath, step);

      res.json({
        success: true,
        step: newStep,
      });
    } catch (error) {
      logError(error, 'Add pipeline step failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
