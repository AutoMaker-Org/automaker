/**
 * Context routes - HTTP API for context file operations
 *
 * Provides endpoints for managing context files including
 * AI-powered image description generation.
 */

import { Router } from 'express';
import { createDescribeImageHandler } from './routes/describe-image.js';
import { createDescribeFileHandler } from './routes/describe-file.js';
import type { SettingsService } from '../../services/settings-service.js';

/**
 * Create the context router
 *
 * @param settingsService - Optional settings service for loading autoLoadClaudeMd setting
 * @returns Express router with context endpoints
 */
export function createContextRoutes(settingsService?: SettingsService): Router {
  const router = Router();

  router.post('/describe-image', createDescribeImageHandler(settingsService));
  router.post('/describe-file', createDescribeFileHandler(settingsService));

  return router;
}
