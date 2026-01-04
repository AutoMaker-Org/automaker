/**
 * Setup routes - HTTP API for CLI detection, API keys, and platform info
 */

import { Router } from 'express';
import { createClaudeStatusHandler } from './routes/claude-status.js';
import { createInstallClaudeHandler } from './routes/install-claude.js';
import { createAuthClaudeHandler } from './routes/auth-claude.js';
import { createStoreApiKeyHandler } from './routes/store-api-key.js';
import { createDeleteApiKeyHandler } from './routes/delete-api-key.js';
import { createApiKeysHandler } from './routes/api-keys.js';
import { createPlatformHandler } from './routes/platform.js';
import { createVerifyClaudeAuthHandler } from './routes/verify-claude-auth.js';
import { createGhStatusHandler } from './routes/gh-status.js';
import { createCursorStatusHandler } from './routes/cursor-status.js';
import {
  createGetCursorConfigHandler,
  createSetCursorDefaultModelHandler,
  createSetCursorModelsHandler,
  createGetCursorPermissionsHandler,
  createApplyPermissionProfileHandler,
  createSetCustomPermissionsHandler,
  createDeleteProjectPermissionsHandler,
  createGetExampleConfigHandler,
} from './routes/cursor-config.js';

export function createSetupRoutes(): Router {
  const router = Router();

  router.get('/claude-status', createClaudeStatusHandler());
  router.post('/install-claude', createInstallClaudeHandler());
  router.post('/auth-claude', createAuthClaudeHandler());
  router.post('/store-api-key', createStoreApiKeyHandler());
  router.post('/delete-api-key', createDeleteApiKeyHandler());
  router.get('/api-keys', createApiKeysHandler());
  router.get('/platform', createPlatformHandler());
  router.post('/verify-claude-auth', createVerifyClaudeAuthHandler());
  router.get('/gh-status', createGhStatusHandler());

  // Cursor CLI routes
  router.get('/cursor-status', createCursorStatusHandler());
  router.get('/cursor-config', createGetCursorConfigHandler());
  router.post('/cursor-config/default-model', createSetCursorDefaultModelHandler());
  router.post('/cursor-config/models', createSetCursorModelsHandler());

  // Cursor CLI Permissions routes
  router.get('/cursor-permissions', createGetCursorPermissionsHandler());
  router.post('/cursor-permissions/profile', createApplyPermissionProfileHandler());
  router.post('/cursor-permissions/custom', createSetCustomPermissionsHandler());
  router.delete('/cursor-permissions', createDeleteProjectPermissionsHandler());
  router.get('/cursor-permissions/example', createGetExampleConfigHandler());

  return router;
}
