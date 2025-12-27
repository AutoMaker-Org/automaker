/**
 * Pipeline Routes Creator
 */

import { Router } from 'express';
import { AutoModeService } from '../../services/auto-mode-service.js';
import {
  configRouter,
  executeStepRouter,
  skipStepRouter,
  resetPipelineRouter,
  validateConfigRouter,
} from './index.js';
import { setAutoModeService as setSkipStepService } from './skip-step.js';
import { setAutoModeService as setExecuteStepService } from './execute-step.js';

export function createPipelineRoutes(autoModeService: AutoModeService): Router {
  const router = Router();

  // Inject the service into routes that need it
  setSkipStepService(autoModeService);
  setExecuteStepService(autoModeService);

  // Register all pipeline sub-routes with injected service
  router.use('/config', configRouter);
  router.use('/execute-step', executeStepRouter);
  router.use('/skip-step', skipStepRouter);
  router.use('/reset-pipeline', resetPipelineRouter);
  router.use('/validate-config', validateConfigRouter);

  return router;
}
