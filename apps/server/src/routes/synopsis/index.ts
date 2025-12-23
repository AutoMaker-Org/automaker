/**
 * Synopsis routes - HTTP API for generating audio synopses of selected features
 *
 * Provides endpoints for:
 * - Generating text summaries of features using Claude AI
 * - Converting text to speech using ElevenLabs API
 */

import { Router } from 'express';
import { createGenerateHandler } from './routes/generate.js';
import { createTTSHandler } from './routes/tts.js';
import { createVerifyHandler } from './routes/verify.js';

/**
 * Create the synopsis router
 *
 * @returns Express router with synopsis endpoints
 */
export function createSynopsisRoutes(): Router {
  const router = Router();

  // POST /synopsis/generate - Generate a text summary of features
  router.post('/generate', createGenerateHandler());

  // POST /synopsis/tts - Convert text to speech using ElevenLabs
  router.post('/tts', createTTSHandler());

  // POST /synopsis/verify - Verify ElevenLabs API key
  router.post('/verify', createVerifyHandler());

  return router;
}
