/**
 * POST /api/pipeline/steps/delete - Delete a pipeline step
 *
 * Removes a step from the pipeline configuration.
 *
 * Request body: { projectPath: string, stepId: string }
 * Response: { success: true }
 */

import type { Request, Response } from 'express';
import type { PipelineService } from '../../../services/pipeline-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createDeleteStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, stepId } = req.body as {
        projectPath: string;
        stepId: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!stepId) {
        res.status(400).json({ success: false, error: 'stepId is required' });
        return;
      }

      await pipelineService.deleteStep(projectPath, stepId);

      res.json({
        success: true,
      });
    } catch (error) {
      logError(error, 'Delete pipeline step failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
