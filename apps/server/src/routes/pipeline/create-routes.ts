/**
 * Pipeline Routes Creator
 */

import { Router } from 'express';
import {
  configRouter,
  executeStepRouter,
  skipStepRouter,
  resetPipelineRouter,
  validateConfigRouter,
} from './index.js';

export function createPipelineRoutes(): Router {
  const router = Router();

  // Register all pipeline sub-routes
  router.use('/config', configRouter);
  router.use('/execute-step', executeStepRouter);
  router.use('/skip-step', skipStepRouter);
  router.use('/reset-pipeline', resetPipelineRouter);
  router.use('/validate-config', validateConfigRouter);

  return router;
}
