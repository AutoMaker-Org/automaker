/**
 * POST /api/pipeline/steps/reorder - Reorder pipeline steps
 *
 * Reorders the steps in the pipeline configuration.
 *
 * Request body: { projectPath: string, stepIds: string[] }
 * Response: { success: true }
 */

import type { Request, Response } from 'express';
import type { PipelineService } from '../../../services/pipeline-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createReorderStepsHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, stepIds } = req.body as {
        projectPath: string;
        stepIds: string[];
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!stepIds || !Array.isArray(stepIds)) {
        res.status(400).json({ success: false, error: 'stepIds array is required' });
        return;
      }

      await pipelineService.reorderSteps(projectPath, stepIds);

      res.json({
        success: true,
      });
    } catch (error) {
      logError(error, 'Reorder pipeline steps failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
