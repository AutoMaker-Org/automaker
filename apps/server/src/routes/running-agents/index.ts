/**
 * Running Agents routes - HTTP API for tracking active agent executions
 */

import { Router } from 'express';
import type { AutoModeServiceCompat } from '../../services/auto-mode/index.js';
import { createIndexHandler } from './routes/index.js';

export function createRunningAgentsRoutes(autoModeService: AutoModeServiceCompat): Router {
  const router = Router();

  router.get('/', createIndexHandler(autoModeService));

  return router;
}
