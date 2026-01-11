/**
 * Auto Mode routes - HTTP API for autonomous feature implementation
 *
 * Uses the AutoModeService for real feature execution with Claude Agent SDK
 */

import { Router } from 'express';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createStopFeatureHandler } from './routes/stop-feature.js';
import { createStatusHandler } from './routes/status.js';
import { createRunFeatureHandler } from './routes/run-feature.js';
import { createVerifyFeatureHandler } from './routes/verify-feature.js';
import { createResumeFeatureHandler } from './routes/resume-feature.js';
import { createContextExistsHandler } from './routes/context-exists.js';
import { createAnalyzeProjectHandler } from './routes/analyze-project.js';
import { createFollowUpFeatureHandler } from './routes/follow-up-feature.js';
import { createCommitFeatureHandler } from './routes/commit-feature.js';
import { createApprovePlanHandler } from './routes/approve-plan.js';
import { createResumeInterruptedHandler } from './routes/resume-interrupted.js';

export function createAutoModeRoutes(autoModeService: AutoModeService): Router {
  const router = Router();

  router.post('/stop-feature', createStopFeatureHandler(autoModeService));
  router.post('/status', validatePathParams('projectPath?'), createStatusHandler(autoModeService));
  router.post(
    '/run-feature',
    validatePathParams('projectPath'),
    createRunFeatureHandler(autoModeService)
  );
  router.post(
    '/verify-feature',
    validatePathParams('projectPath'),
    createVerifyFeatureHandler(autoModeService)
  );
  router.post(
    '/resume-feature',
    validatePathParams('projectPath'),
    createResumeFeatureHandler(autoModeService)
  );
  router.post(
    '/context-exists',
    validatePathParams('projectPath'),
    createContextExistsHandler(autoModeService)
  );
  router.post(
    '/analyze-project',
    validatePathParams('projectPath'),
    createAnalyzeProjectHandler(autoModeService)
  );
  router.post(
    '/follow-up-feature',
    validatePathParams('projectPath', 'imagePaths[]'),
    createFollowUpFeatureHandler(autoModeService)
  );
  router.post(
    '/commit-feature',
    validatePathParams('projectPath', 'worktreePath?'),
    createCommitFeatureHandler(autoModeService)
  );
  router.post(
    '/approve-plan',
    validatePathParams('projectPath'),
    createApprovePlanHandler(autoModeService)
  );
  router.post(
    '/resume-interrupted',
    validatePathParams('projectPath'),
    createResumeInterruptedHandler(autoModeService)
  );

  return router;
}
