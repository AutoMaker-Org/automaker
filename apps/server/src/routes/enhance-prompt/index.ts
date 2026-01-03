/**
 * Enhance prompt routes - HTTP API for AI-powered text enhancement
 *
 * Provides endpoints for enhancing user input text using Claude AI
 * with different enhancement modes (improve, expand, simplify, etc.)
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import { createEnhanceHandler } from './routes/enhance.js';

/**
 * Create the enhance-prompt router
 *
 * @param settingsService - Settings service for loading custom prompts
 * @returns Express router with enhance-prompt endpoints
 */
export function createEnhancePromptRoutes(settingsService?: SettingsService): Router {
  const router = Router();

  router.post('/', createEnhanceHandler(settingsService));

  return router;
}
