/**
 * POST /api/pipeline/steps/update - Update an existing pipeline step
 *
 * Updates a step in the pipeline configuration.
 *
 * Request body: { projectPath: string, stepId: string, updates: Partial<PipelineStep> }
 * Response: { success: true, step: PipelineStep }
 */

import type { Request, Response } from 'express';
import type { PipelineService } from '../../../services/pipeline-service.js';
import type { PipelineStep } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createUpdateStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, stepId, updates } = req.body as {
        projectPath: string;
        stepId: string;
        updates: Partial<Omit<PipelineStep, 'id' | 'createdAt'>>;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!stepId) {
        res.status(400).json({ success: false, error: 'stepId is required' });
        return;
      }

      if (!updates || Object.keys(updates).length === 0) {
        res.status(400).json({ success: false, error: 'updates is required' });
        return;
      }

      const updatedStep = await pipelineService.updateStep(projectPath, stepId, updates);

      res.json({
        success: true,
        step: updatedStep,
      });
    } catch (error) {
      logError(error, 'Update pipeline step failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
