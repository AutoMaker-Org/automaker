/**
 * Pipeline Step Skip Routes
 */

import { Router } from 'express';
import { AutoModeService } from '../../services/auto-mode-service.js';
import { validateWorkingDirectory } from '../../lib/sdk-options.js';

const router = Router();

// Store the service instance
let autoModeServiceInstance: AutoModeService;

export function setAutoModeService(service: AutoModeService) {
  autoModeServiceInstance = service;
}

/**
 * POST /api/pipeline/skip-step
 */
router.post('/skip-step', async (req, res) => {
  try {
    const { projectPath, featureId, stepId } = req.body;

    if (!projectPath || !featureId || !stepId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectPath, featureId, stepId',
      });
    }

    // Validate the project path
    validateWorkingDirectory(projectPath);

    // Use the injected service instance
    await autoModeServiceInstance.skipPipelineStep(projectPath, featureId, stepId);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('[Pipeline Skip Step] Error:', error);
    if (error instanceof Error && error.message.includes('Cannot skip required step')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to skip pipeline step',
    });
  }
});

export default router;
