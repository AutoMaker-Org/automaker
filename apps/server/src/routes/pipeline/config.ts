/**
 * Pipeline Configuration Routes
 */

import { Router } from 'express';
import { PipelineConfigService } from '../../services/pipeline-config-service.js';
import { validateWorkingDirectory } from '../../lib/sdk-options.js';

const router = Router();

/**
 * GET /api/pipeline/config
 * Get pipeline configuration for a project
 */
router.get('/', async (req, res) => {
  try {
    const { projectPath } = req.query;

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
    }

    // Validate the project path
    validateWorkingDirectory(projectPath);

    const configService = new PipelineConfigService(projectPath);
    const config = await configService.loadPipelineConfig();

    res.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('[Pipeline Config GET] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load pipeline configuration',
    });
  }
});

/**
 * POST /api/pipeline/config
 * Update pipeline configuration for a project
 */
router.post('/', async (req, res) => {
  try {
    console.log('[Pipeline Config POST] Request body:', req.body);
    const { projectPath, config } = req.body;

    if (!projectPath || typeof projectPath !== 'string') {
      console.log('[Pipeline Config POST] Invalid projectPath:', projectPath, typeof projectPath);
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
    }

    if (!config) {
      console.log('[Pipeline Config POST] Missing config');
      return res.status(400).json({
        success: false,
        error: 'config is required',
      });
    }

    // Validate the project path
    validateWorkingDirectory(projectPath);

    const configService = new PipelineConfigService(projectPath);

    // Validate the configuration
    console.log('[Pipeline Config POST] Validating config...');
    const isValid = configService.validateConfig(config);
    console.log('[Pipeline Config POST] Validation result:', isValid);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pipeline configuration',
      });
    }

    // Save the configuration
    await configService.savePipelineConfig(config);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('[Pipeline Config POST] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save pipeline configuration',
    });
  }
});

export default router;
