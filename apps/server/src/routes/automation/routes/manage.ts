/**
 * Route: Automation definition management
 *
 * - POST   /api/automation                 Create automation
 * - PUT    /api/automation/:automationId   Update automation
 * - PATCH  /api/automation/:automationId/enabled Toggle enabled state
 * - DELETE /api/automation/:automationId   Delete automation
 * - POST   /api/automation/:automationId/duplicate Duplicate automation
 * - GET    /api/automation/:automationId/export Export one automation
 * - GET    /api/automation/export          Export many automations (JSON array or ZIP)
 * - POST   /api/automation/import          Import automation definitions
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import archiver from 'archiver';
import type { AutomationSchedulerService } from '../../../services/automation-scheduler-service.js';
import type { AutomationDefinitionStore } from '../../../services/automation-runtime-engine.js';
import type { AutomationDefinition, AutomationScope } from '@automaker/types';
import { getProjectPath, getScope, sendRouteError } from '../common.js';

const VALID_AUTOMATION_ID = /^[A-Za-z0-9._-]+$/;
const AUTOMATION_ID_ERROR =
  'automation id may only contain letters, numbers, dot, underscore, and dash';
const REQUIRED_AUTOMATION_ID_ERROR = 'valid automationId is required';
const REQUIRED_BODY_ERROR = 'automation definition body is required';
const PROJECT_PATH_REQUIRED_ERROR = 'projectPath is required when scope is "project"';

/** Maximum number of automations that can be imported in a single batch */
const MAX_IMPORT_BATCH_SIZE = 50;
/** Supported automation schema version */
const SUPPORTED_AUTOMATION_VERSION = 1;

type ScopeContext = {
  scope: AutomationScope;
  projectPath?: string;
};

function getScopeOrDefault(scope?: AutomationScope): AutomationScope {
  return scope === 'project' ? 'project' : 'global';
}

function hasValidAutomationId(automationId: string): boolean {
  return VALID_AUTOMATION_ID.test(automationId);
}

function sanitizeId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function triggerScheduleRefresh(scheduler: AutomationSchedulerService): Promise<void> {
  await scheduler.refreshSchedules();
}

function ensureProjectPathForScope(scope: AutomationScope, projectPath?: string): string | null {
  if (scope !== 'project') return null;
  if (projectPath?.trim()) return null;
  return PROJECT_PATH_REQUIRED_ERROR;
}

function resolveScopeContext(req: Request, res: Response): ScopeContext | null {
  const scope = getScopeOrDefault(getScope(req));
  const projectPath = getProjectPath(req);
  const projectPathError = ensureProjectPathForScope(scope, projectPath);
  if (projectPathError) {
    res.status(400).json({ success: false, error: projectPathError });
    return null;
  }

  return { scope, projectPath };
}

function getValidRouteAutomationId(req: Request, res: Response): string | null {
  const { automationId } = req.params;
  if (!automationId?.trim() || !hasValidAutomationId(automationId)) {
    res.status(400).json({ success: false, error: REQUIRED_AUTOMATION_ID_ERROR });
    return null;
  }
  return automationId;
}

function getRequestedDuplicateId(body: unknown): { duplicateId?: string; error?: string } {
  if (typeof (body as { newId?: unknown })?.newId !== 'string') {
    return {};
  }

  const candidate = sanitizeId((body as { newId: string }).newId);
  if (!candidate) {
    return { error: AUTOMATION_ID_ERROR };
  }

  if (!hasValidAutomationId(candidate)) {
    return { error: AUTOMATION_ID_ERROR };
  }

  return { duplicateId: candidate };
}

function toImportCandidateArray(payload: {
  automations?: unknown[];
  automation?: unknown;
}): unknown[] {
  if (Array.isArray(payload?.automations)) {
    return payload.automations;
  }
  if (payload?.automation) {
    return [payload.automation];
  }
  return [];
}

function getImportAutomationId(candidate: Partial<AutomationDefinition>, index: number): string {
  if (typeof candidate.id === 'string' && candidate.id.trim()) {
    return candidate.id.trim();
  }

  const fallback = typeof candidate.name === 'string' ? sanitizeId(candidate.name) : '';
  return fallback || `automation-import-${Date.now().toString(36)}-${index.toString(36)}`;
}

function validateImportVersion(candidate: Partial<AutomationDefinition>): string | null {
  if (candidate.version === undefined) {
    return 'automation definition missing required "version" field';
  }
  if (candidate.version !== SUPPORTED_AUTOMATION_VERSION) {
    return `unsupported schema version ${String(candidate.version)}, expected ${SUPPORTED_AUTOMATION_VERSION}`;
  }
  return null;
}

export function createManageRoute(
  store: AutomationDefinitionStore,
  scheduler: AutomationSchedulerService
): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const definition = req.body as AutomationDefinition | undefined;
      if (!definition || typeof definition !== 'object') {
        res.status(400).json({ success: false, error: REQUIRED_BODY_ERROR });
        return;
      }

      const context = resolveScopeContext(req, res);
      if (!context) {
        return;
      }
      const { scope, projectPath } = context;

      if (!definition.id?.trim()) {
        const fallback = definition.name?.trim() ? sanitizeId(definition.name) : '';
        definition.id = fallback || `automation-${Date.now().toString(36)}`;
      }

      if (!hasValidAutomationId(definition.id)) {
        res.status(400).json({
          success: false,
          error: AUTOMATION_ID_ERROR,
        });
        return;
      }

      const saved = await store.saveAutomation(
        {
          ...definition,
          scope,
        },
        { scope, projectPath, overwrite: false }
      );
      await triggerScheduleRefresh(scheduler);

      res.status(201).json({ success: true, automation: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.put('/:automationId', async (req, res) => {
    try {
      const automationId = getValidRouteAutomationId(req, res);
      if (!automationId) {
        return;
      }

      const definition = req.body as AutomationDefinition | undefined;
      if (!definition || typeof definition !== 'object') {
        res.status(400).json({ success: false, error: REQUIRED_BODY_ERROR });
        return;
      }

      const context = resolveScopeContext(req, res);
      if (!context) {
        return;
      }
      const { scope, projectPath } = context;

      const existing = await store.loadAutomationById(automationId, { scope, projectPath });
      if (!existing) {
        res.status(404).json({ success: false, error: 'Automation not found' });
        return;
      }

      const saved = await store.saveAutomation(
        {
          ...definition,
          id: automationId,
          scope,
          createdAt: existing.createdAt,
        },
        { scope, projectPath, overwrite: true }
      );
      await triggerScheduleRefresh(scheduler);

      res.json({ success: true, automation: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.patch('/:automationId/enabled', async (req, res) => {
    try {
      const automationId = getValidRouteAutomationId(req, res);
      if (!automationId) {
        return;
      }

      const context = resolveScopeContext(req, res);
      if (!context) {
        return;
      }
      const { scope, projectPath } = context;

      if (typeof req.body?.enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'enabled boolean is required' });
        return;
      }

      const existing = await store.loadAutomationById(automationId, { scope, projectPath });
      if (!existing) {
        res.status(404).json({ success: false, error: 'Automation not found' });
        return;
      }

      const saved = await store.saveAutomation(
        {
          ...existing,
          enabled: req.body.enabled as boolean,
        },
        { scope, projectPath, overwrite: true }
      );
      await triggerScheduleRefresh(scheduler);

      res.json({ success: true, automation: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.delete('/:automationId', async (req, res) => {
    try {
      const automationId = getValidRouteAutomationId(req, res);
      if (!automationId) {
        return;
      }

      const context = resolveScopeContext(req, res);
      if (!context) {
        return;
      }
      const { scope, projectPath } = context;

      const deleted = await store.deleteAutomation(automationId, { scope, projectPath });
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Automation not found' });
        return;
      }

      await triggerScheduleRefresh(scheduler);
      res.json({ success: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.post('/:automationId/duplicate', async (req, res) => {
    try {
      const automationId = getValidRouteAutomationId(req, res);
      if (!automationId) {
        return;
      }

      const context = resolveScopeContext(req, res);
      if (!context) {
        return;
      }
      const { scope, projectPath } = context;

      const existing = await store.loadAutomationById(automationId, { scope, projectPath });
      if (!existing) {
        res.status(404).json({ success: false, error: 'Automation not found' });
        return;
      }

      const { duplicateId: requestedId, error: requestedIdError } = getRequestedDuplicateId(
        req.body
      );
      if (requestedIdError) {
        res.status(400).json({ success: false, error: requestedIdError });
        return;
      }

      const baseId = requestedId || `${automationId}-copy`;
      let nextId = baseId;
      let suffix = 2;
      while (await store.loadAutomationById(nextId, { scope, projectPath })) {
        nextId = `${baseId}-${suffix}`;
        suffix += 1;
      }

      const duplicated = await store.saveAutomation(
        {
          ...existing,
          id: nextId,
          name:
            typeof req.body?.name === 'string' && req.body.name.trim()
              ? req.body.name
              : `${existing.name} (Copy)`,
          createdAt: undefined,
          updatedAt: undefined,
        },
        { scope, projectPath, overwrite: false }
      );

      await triggerScheduleRefresh(scheduler);
      res.status(201).json({ success: true, automation: duplicated });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.get('/:automationId/export', async (req, res) => {
    try {
      const automationId = getValidRouteAutomationId(req, res);
      if (!automationId) {
        return;
      }

      const context = resolveScopeContext(req, res);
      if (!context) {
        return;
      }
      const { scope, projectPath } = context;

      const automation = await store.loadAutomationById(automationId, { scope, projectPath });
      if (!automation) {
        res.status(404).json({ success: false, error: 'Automation not found' });
        return;
      }

      res.json({ success: true, automation });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.get('/export', async (req, res) => {
    try {
      const context = resolveScopeContext(req, res);
      if (!context) {
        return;
      }
      const { scope, projectPath } = context;

      const automationIds =
        typeof req.query.automationIds === 'string'
          ? req.query.automationIds
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
          : [];
      const invalidAutomationId = automationIds.find((id) => !hasValidAutomationId(id));
      if (invalidAutomationId) {
        res.status(400).json({
          success: false,
          error: `Invalid automation id in automationIds: ${invalidAutomationId}`,
        });
        return;
      }

      let automations: AutomationDefinition[];
      if (automationIds.length === 0) {
        automations = await store.listAutomations({ scope, projectPath });
      } else {
        const results = await Promise.all(
          automationIds.map((id) => store.loadAutomationById(id, { scope, projectPath }))
        );
        automations = results.filter((item): item is AutomationDefinition => Boolean(item));
      }

      // Check if ZIP format is requested
      const format = req.query.format === 'zip' ? 'zip' : 'json';
      if (format === 'zip') {
        // Handle empty automations case gracefully
        if (automations.length === 0) {
          res.status(400).json({
            success: false,
            error: 'No automations to export',
          });
          return;
        }

        // Export as ZIP file
        const projectDirName = projectPath ? `-${projectPath.split('/').pop()}` : '';
        const zipFileName = `automations-${scope}${projectDirName}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

        const archive = archiver('zip', { zlib: { level: 9 } });

        // Track whether headers have been flushed to avoid writing error JSON after ZIP data.
        // archiver errors after pipe() has started must be handled by destroying the stream.
        let headersFlushed = false;
        res.on('pipe', () => {
          headersFlushed = true;
        });

        archive.on('error', (err) => {
          if (headersFlushed) {
            // Headers already sent — the only safe option is to destroy the stream
            res.destroy(err);
          } else {
            sendRouteError(res, err);
          }
        });

        archive.pipe(res);

        // Add each automation as a separate JSON file
        for (const automation of automations) {
          const fileName = `${automation.id}.json`;
          const content = JSON.stringify(automation, null, 2);
          archive.append(content, { name: fileName });
        }

        // Add a manifest file with metadata
        const manifest = {
          version: 1,
          exportedAt: new Date().toISOString(),
          scope,
          projectPath: projectPath || null,
          automationCount: automations.length,
          automationIds: automations.map((a) => a.id),
        };
        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

        await archive.finalize();
      } else {
        // Default: export as JSON array
        res.json({ success: true, automations });
      }
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  router.post('/import', async (req, res) => {
    try {
      const context = resolveScopeContext(req, res);
      if (!context) {
        return;
      }
      const { scope, projectPath } = context;

      const payload = req.body as {
        automations?: unknown[];
        automation?: unknown;
        overwrite?: boolean;
      };
      const candidates = toImportCandidateArray(payload);

      if (candidates.length === 0) {
        res.status(400).json({ success: false, error: 'automation or automations is required' });
        return;
      }

      if (candidates.length > MAX_IMPORT_BATCH_SIZE) {
        res.status(400).json({
          success: false,
          error: `Import batch too large: maximum ${MAX_IMPORT_BATCH_SIZE} automations per request`,
        });
        return;
      }

      const overwrite = Boolean(payload?.overwrite);
      const imported: AutomationDefinition[] = [];
      const failures: Array<{ id?: string; error: string }> = [];

      for (const [index, candidate] of candidates.entries()) {
        try {
          if (!candidate || typeof candidate !== 'object') {
            throw new Error('automation must be an object');
          }

          const candidateDefinition = candidate as Partial<AutomationDefinition>;

          // Validate schema version before processing
          const versionError = validateImportVersion(candidateDefinition);
          if (versionError) {
            throw new Error(versionError);
          }

          const importId = getImportAutomationId(candidateDefinition, index);
          if (!hasValidAutomationId(importId)) {
            throw new Error(AUTOMATION_ID_ERROR);
          }

          const importedDefinition = await store.saveAutomation(
            {
              ...(candidateDefinition as AutomationDefinition),
              id: importId,
              scope,
            },
            { scope, projectPath, overwrite }
          );
          imported.push(importedDefinition);
        } catch (error) {
          const id =
            typeof (candidate as { id?: unknown })?.id === 'string'
              ? ((candidate as { id: string }).id ?? undefined)
              : undefined;
          failures.push({
            id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (imported.length > 0) {
        await triggerScheduleRefresh(scheduler);
      }

      res.json({
        success: failures.length === 0,
        imported,
        failures,
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  return router;
}
