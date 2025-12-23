/**
 * Pipeline Step Skip Routes
 */

import { Router } from 'express';
import { AutoModeService } from '../../services/auto-mode-service.js';
import { validateWorkingDirectory } from '../../lib/sdk-options.js';

const router = Router();

/**
 * POST /api/pipeline/skip-step
 * Skip an optional pipeline step for a feature
 */
router.post('/', async (req, res) => {
  try {
    const { projectPath, featureId, stepId } = req.body;

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
    }

    if (!featureId || typeof featureId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'featureId is required',
      });
    }

    if (!stepId || typeof stepId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'stepId is required',
      });
    }

    // Validate the project path
    validateWorkingDirectory(projectPath);

    // Get the auto mode service instance
    const autoModeService = new AutoModeService({
      emit: (event: string, data: unknown) => {
        // Emit events to connected clients
        console.log(`[Pipeline] Event: ${event}`, data);
      },
    } as any);

    // Skip the step
    await autoModeService.skipPipelineStep(projectPath, featureId, stepId);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('[Pipeline Skip Step] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to skip pipeline step',
    });
  }
});

export default router;
