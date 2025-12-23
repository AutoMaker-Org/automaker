/**
 * Pipeline Routes Index
 */

import configRouter from './config.js';
import executeStepRouter from './execute-step.js';
import skipStepRouter from './skip-step.js';
import resetPipelineRouter from './reset-pipeline.js';
import validateConfigRouter from './validate-config.js';

export {
  configRouter,
  executeStepRouter,
  skipStepRouter,
  resetPipelineRouter,
  validateConfigRouter,
};
