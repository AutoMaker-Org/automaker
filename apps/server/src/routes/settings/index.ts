/**
 * Settings routes - HTTP API for persistent file-based settings
 *
 * Provides endpoints for:
 * - Status checking (migration readiness)
 * - Global settings CRUD
 * - Credentials management
 * - Project-specific settings
 * - localStorage to file migration
 *
 * All endpoints use handler factories that receive the SettingsService instance.
 * Mounted at /api/settings in the main server.
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createGetGlobalHandler } from './routes/get-global.js';
import { createUpdateGlobalHandler } from './routes/update-global.js';
import { createGetCredentialsHandler } from './routes/get-credentials.js';
import { createUpdateCredentialsHandler } from './routes/update-credentials.js';
import { createGetProjectHandler } from './routes/get-project.js';
import { createUpdateProjectHandler } from './routes/update-project.js';
import { createMigrateHandler } from './routes/migrate.js';
import { createStatusHandler } from './routes/status.js';
import { createDiscoverAgentsHandler } from './routes/discover-agents.js';

/**
 * Create settings router with all endpoints
 *
 * Registers handlers for all settings-related HTTP endpoints.
 * Each handler is created with the provided SettingsService instance.
 *
 * Endpoints:
 * - GET /status - Check migration status and data availability
 * - GET /global - Get global settings
 * - PUT /global - Update global settings
 * - GET /credentials - Get masked credentials (safe for UI)
 * - PUT /credentials - Update API keys
 * - POST /project - Get project settings (requires projectPath in body)
 * - PUT /project - Update project settings
 * - POST /migrate - Migrate settings from localStorage
 * - POST /agents/discover - Discover filesystem agents from .claude/agents/ (read-only)
 *
 * @param settingsService - Instance of SettingsService for file I/O
 * @returns Express Router configured with all settings endpoints
 */
export function createSettingsRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // Status endpoint (check if migration needed)
  router.get('/status', createStatusHandler(settingsService));

  // Global settings
  router.get('/global', createGetGlobalHandler(settingsService));
  router.put('/global', createUpdateGlobalHandler(settingsService));

  // Credentials (separate for security)
  router.get('/credentials', createGetCredentialsHandler(settingsService));
  router.put('/credentials', createUpdateCredentialsHandler(settingsService));

  // Project settings
  router.post(
    '/project',
    validatePathParams('projectPath'),
    createGetProjectHandler(settingsService)
  );
  router.put(
    '/project',
    validatePathParams('projectPath'),
    createUpdateProjectHandler(settingsService)
  );

  // Migration from localStorage
  router.post('/migrate', createMigrateHandler(settingsService));

  // Filesystem agents discovery (read-only)
  router.post('/agents/discover', createDiscoverAgentsHandler());

  return router;
}
