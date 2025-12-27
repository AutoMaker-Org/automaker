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
// Cursor CLI routes
import { createCursorStatusHandler } from './routes/cursor-status.js';
import { createInstallCursorHandler } from './routes/install-cursor.js';
import { createVerifyCursorAuthHandler } from './routes/verify-cursor-auth.js';
import { createOpenCodeStatusHandler } from './routes/opencode-status.js';
import { createCodexStatusHandler } from './routes/codex-status.js';
// Default provider routes
import {
  createGetDefaultProviderHandler,
  createSetDefaultProviderHandler,
} from './routes/default-provider.js';
// Test provider route
import { createTestProviderHandler } from './routes/test-provider.js';

export function createSetupRoutes(): Router {
  const router = Router();

  // Claude CLI routes
  router.get('/claude-status', createClaudeStatusHandler());
  router.post('/install-claude', createInstallClaudeHandler());
  router.post('/auth-claude', createAuthClaudeHandler());
  router.post('/verify-claude-auth', createVerifyClaudeAuthHandler());

  // Cursor CLI routes
  router.get('/cursor-status', createCursorStatusHandler());
  router.post('/install-cursor', createInstallCursorHandler());
  router.post('/verify-cursor-auth', createVerifyCursorAuthHandler());

  // OpenCode CLI routes
  router.get('/opencode-status', createOpenCodeStatusHandler());
  // Codex CLI routes
  router.get('/codex-status', createCodexStatusHandler());

  // Default provider routes
  router.get('/default-provider', createGetDefaultProviderHandler());
  router.post('/default-provider', createSetDefaultProviderHandler());

  // Test provider route
  router.post('/test-provider', createTestProviderHandler());

  // Common routes
  router.post('/store-api-key', createStoreApiKeyHandler());
  router.post('/delete-api-key', createDeleteApiKeyHandler());
  router.get('/api-keys', createApiKeysHandler());
  router.get('/platform', createPlatformHandler());
  router.get('/gh-status', createGhStatusHandler());

  return router;
}
