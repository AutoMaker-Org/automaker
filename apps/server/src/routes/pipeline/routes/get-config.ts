/**
 * POST /api/pipeline/config - Get pipeline configuration
 *
 * Returns the pipeline configuration for a project.
 *
 * Request body: { projectPath: string }
 * Response: { success: true, config: PipelineConfig }
 */

import type { Request, Response } from 'express';
import type { PipelineService } from '../../../services/pipeline-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createGetConfigHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const config = await pipelineService.getPipelineConfig(projectPath);

      res.json({
        success: true,
        config,
      });
    } catch (error) {
      logError(error, 'Get pipeline config failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
