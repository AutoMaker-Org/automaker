/**
 * Pipeline Reset Routes
 */

import { Router } from 'express';
import { AutoModeService } from '../../services/auto-mode-service.js';
import { validateWorkingDirectory } from '../../lib/sdk-options.js';
import { FeatureLoader } from '../../services/feature-loader.js';

const router = Router();

/**
 * POST /api/pipeline/reset-pipeline
 * Clear pipeline results for a feature or specific step
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

    // stepId is optional - if not provided, clear all steps
    if (stepId && typeof stepId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'stepId must be a string if provided',
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

    if (stepId) {
      // Clear specific step
      await autoModeService.clearPipelineStepResults(projectPath, featureId, stepId);
    } else {
      // Clear all pipeline steps for the feature
      const featureLoader = new FeatureLoader();
      const feature = await featureLoader.get(projectPath, featureId);
      if (feature && feature.pipelineSteps) {
        for (const pipelineStepId of Object.keys(feature.pipelineSteps)) {
          await autoModeService.clearPipelineStepResults(projectPath, featureId, pipelineStepId);
        }
      }
    }

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('[Pipeline Reset] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset pipeline',
    });
  }
});

export default router;
