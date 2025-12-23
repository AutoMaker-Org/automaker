/**
 * Pipeline Step Execution Routes
 */

import { Router } from 'express';
import { AutoModeService } from '../../services/auto-mode-service.js';
import { validateWorkingDirectory } from '../../lib/sdk-options.js';
import { PipelineStepExecutor } from '../../services/pipeline-step-executor.js';
import { FeatureLoader } from '../../services/feature-loader.js';

const router = Router();

/**
 * POST /api/pipeline/execute-step
 * Manually execute a pipeline step for a feature
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

    // Load the feature using FeatureLoader
    const featureLoader = new FeatureLoader();
    const feature = await featureLoader.get(projectPath, featureId);
    if (!feature) {
      return res.status(404).json({
        success: false,
        error: 'Feature not found',
      });
    }

    // Get the auto mode service instance
    // Note: In a real implementation, you'd get this from a service registry
    const autoModeService = new AutoModeService({
      emit: (event: string, data: unknown) => {
        // Emit events to connected clients
        console.log(`[Pipeline] Event: ${event}`, data);
      },
    } as any);

    // Load pipeline configuration
    const configService = new (
      await import('../../services/pipeline-config-service.js')
    ).PipelineConfigService(projectPath);
    const pipelineConfig = await configService.loadPipelineConfig();

    if (!pipelineConfig?.enabled) {
      return res.status(400).json({
        success: false,
        error: 'Pipeline is not enabled for this project',
      });
    }

    // Find the step configuration
    const stepConfig = pipelineConfig.steps.find((s) => s.id === stepId);
    if (!stepConfig) {
      return res.status(404).json({
        success: false,
        error: 'Pipeline step not found',
      });
    }

    // Create step executor and execute
    const executor = new PipelineStepExecutor(autoModeService, projectPath);
    const result = await executor.executeStep({
      feature,
      stepConfig,
      signal: AbortSignal.timeout(300000), // 5 minute timeout
      projectPath,
      onProgress: (message) => {
        console.log(`[Pipeline] Step ${stepId} progress:`, message);
      },
      onStatusChange: (status) => {
        console.log(`[Pipeline] Step ${stepId} status:`, status);
      },
    });

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('[Pipeline Execute Step] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute pipeline step',
    });
  }
});

export default router;
