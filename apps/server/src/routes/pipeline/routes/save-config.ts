/**
 * POST /api/pipeline/config/save - Save entire pipeline configuration
 *
 * Saves the complete pipeline configuration for a project.
 *
 * Request body: { projectPath: string, config: PipelineConfig }
 * Response: { success: true }
 */

import type { Request, Response } from 'express';
import type { PipelineService } from '../../../services/pipeline-service.js';
import type { PipelineConfig } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createSaveConfigHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, config } = req.body as {
        projectPath: string;
        config: PipelineConfig;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!config) {
        res.status(400).json({ success: false, error: 'config is required' });
        return;
      }

      await pipelineService.savePipelineConfig(projectPath, config);

      res.json({
        success: true,
      });
    } catch (error) {
      logError(error, 'Save pipeline config failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
