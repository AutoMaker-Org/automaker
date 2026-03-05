/**
 * Automation Routes - API endpoints for automation management
 *
 * Routes:
 * - GET  /api/automation/list - List automations (with scope/projectPath filter)
 * - POST /api/automation - Create a new automation
 * - GET  /api/automation/:automationId - Get automation by ID
 * - PUT  /api/automation/:automationId - Update an automation
 * - PATCH /api/automation/:automationId/enabled - Toggle enabled state
 * - DELETE /api/automation/:automationId - Delete an automation
 * - POST /api/automation/:automationId/duplicate - Duplicate an automation
 * - POST /api/automation/:automationId/trigger - Manually trigger automation
 * - *    /api/automation/webhook/:automationId - Webhook trigger endpoint
 * - POST /api/automation/import - Import automation from JSON
 * - GET  /api/automation/export - Export multiple automations as JSON
 * - GET  /api/automation/:automationId/export - Export a single automation as JSON
 * - GET  /api/automation/scheduled - List scheduled runs
 * - GET  /api/automation/scheduled/upcoming - Get upcoming scheduled runs
 * - GET  /api/automation/scheduled/:scheduledRunId - Get specific scheduled run
 * - DELETE /api/automation/scheduled/:scheduledRunId - Cancel a scheduled run
 * - GET  /api/automation/runs - List automation runs
 * - GET  /api/automation/runs/:runId - Get specific run
 * - GET  /api/automation/variables - List available variables
 * - GET  /api/automation/variables/system - Get system variables
 * - GET  /api/automation/variables/project - Get project variables
 * - POST /api/automation/variables/project - Set project variable
 * - DELETE /api/automation/variables/project/:name - Delete project variable
 */

import { Router } from 'express';
import type { AutomationSchedulerService } from '../../services/automation-scheduler-service.js';
import type { AutomationRuntimeEngine } from '../../services/automation-runtime-engine.js';
import type { AutomationVariableService } from '../../services/automation-variable-service.js';
import { createListRoute } from './routes/list.js';
import { createGetRoute } from './routes/get.js';
import { createManageRoute } from './routes/manage.js';
import { createTriggerRoute } from './routes/trigger.js';
import { createWebhookRoute } from './routes/webhook.js';
import { createScheduleRoute } from './routes/schedule.js';
import { createRunsRoute } from './routes/runs.js';
import { createVariablesRoute } from './routes/variables.js';
import { createGenerateRoute } from './routes/generate.js';

export function createAutomationRoutes(
  scheduler: AutomationSchedulerService,
  engine: AutomationRuntimeEngine,
  variableService: AutomationVariableService
): Router {
  const router = Router();

  const store = engine.getDefinitionStore();

  // Mount routes - order matters for path matching

  // AI generation routes (must come before /:automationId routes)
  router.use('/', createGenerateRoute());

  // Webhook routes first (most specific paths with fixed 'webhook' prefix)
  router.use('/', createWebhookRoute(scheduler));

  // Scheduled runs management
  // Must come before /:automationId routes to avoid 'scheduled' being treated as an ID
  router.use('/', createScheduleRoute(scheduler));

  // Runs management
  // Must come before /:automationId routes to avoid 'runs' being treated as an ID
  router.use('/', createRunsRoute(engine));

  // Variable management
  // Must come before /:automationId routes to avoid 'variables' being treated as an ID
  router.use('/', createVariablesRoute(variableService));

  // Automation management: create, update, enable/disable, delete, import, export, duplicate
  // /export and /import must come before /:automationId routes
  router.use('/', createManageRoute(store, scheduler));

  // List automations (GET /list)
  router.use('/', createListRoute(store));

  // Trigger automation manually (POST /:automationId/trigger)
  // Must come before generic /:automationId route
  router.use('/', createTriggerRoute(scheduler));

  // Get automation by ID (GET /:automationId)
  // Must be last among routes using /:automationId pattern
  router.use('/', createGetRoute(store));

  return router;
}
