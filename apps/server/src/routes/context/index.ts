/**
 * Context routes - HTTP API for context file operations
 *
 * Provides endpoints for managing context files including
 * AI-powered image description generation.
 */

import { Router } from 'express';
import { createDescribeImageHandler } from './routes/describe-image.js';
import { createDescribeFileHandler } from './routes/describe-file.js';

/**
 * Create the context router
 *
 * @returns Express router with context endpoints
 */
export function createContextRoutes(): Router {
  const router = Router();

  router.post('/describe-image', createDescribeImageHandler());
  router.post('/describe-file', createDescribeFileHandler());

  return router;
}
