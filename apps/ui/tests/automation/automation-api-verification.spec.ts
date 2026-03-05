/**
 * Automation API Verification Test (TEMPORARY - DELETE AFTER VERIFICATION)
 *
 * Verifies the automation management API endpoints:
 * - GET  /api/automation/list - List automations
 * - POST /api/automation      - Create automation
 * - GET  /api/automation/:id  - Get automation by ID
 * - PUT  /api/automation/:id  - Update automation
 * - PATCH /api/automation/:id/enabled - Toggle enabled state
 * - DELETE /api/automation/:id - Delete automation
 * - POST /api/automation/:id/duplicate - Duplicate automation
 * - GET  /api/automation/:id/export - Export single automation
 * - GET  /api/automation/export - Export all automations
 * - POST /api/automation/import - Import automations
 * - GET  /api/automation/scheduled/upcoming - Get upcoming runs
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot, setupProjectWithFixture } from '../utils';

const WORKSPACE_ROOT = getWorkspaceRoot();
const TEST_TEMP_DIR = path.join(WORKSPACE_ROOT, 'test', 'temp', 'automation-api-test');

function makeAutomation(id: string, name = 'Test Automation') {
  return {
    version: 1,
    id,
    name,
    enabled: true,
    scope: 'global',
    trigger: { type: 'manual' },
    steps: [{ id: 's1', type: 'noop' }],
  };
}

test.describe('Automation API Management', () => {
  let projectPath: string;
  const projectName = `automation-api-test-${Date.now()}`;

  test.beforeAll(async () => {
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }

    projectPath = path.join(TEST_TEMP_DIR, projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
    );

    const automakerDir = path.join(projectPath, '.automaker');
    fs.mkdirSync(automakerDir, { recursive: true });
  });

  test.afterAll(async () => {
    if (fs.existsSync(TEST_TEMP_DIR)) {
      try {
        fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  test.describe('Automation CRUD API', () => {
    test.use({ storageState: '.auth/admin.json' });

    test.beforeEach(async ({ page }) => {
      await setupProjectWithFixture(page, projectPath);
    });

    test('lists automations (global scope)', async ({ request }) => {
      const response = await request.get('/api/automation/list?scope=global');
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('automations');
      expect(Array.isArray(data.automations)).toBe(true);
    });

    test('creates, gets, updates, and deletes an automation', async ({ request }) => {
      const automationId = `verify-crud-${Date.now()}`;

      const createResponse = await request.post('/api/automation?scope=global', {
        data: makeAutomation(automationId, 'CRUD Test Automation'),
      });
      expect(createResponse.status()).toBe(201);
      const createData = await createResponse.json();
      expect(createData.success).toBe(true);
      expect(createData.automation.id).toBe(automationId);
      expect(createData.automation.name).toBe('CRUD Test Automation');
      expect(createData.automation.createdAt).toBeDefined();

      const getResponse = await request.get(`/api/automation/${automationId}?scope=global`);
      expect(getResponse.ok()).toBeTruthy();
      const getData = await getResponse.json();
      expect(getData.automation.id).toBe(automationId);

      const updateResponse = await request.put(`/api/automation/${automationId}?scope=global`, {
        data: {
          ...makeAutomation(automationId),
          name: 'Updated Name',
          description: 'Updated desc',
        },
      });
      expect(updateResponse.ok()).toBeTruthy();
      const updateData = await updateResponse.json();
      expect(updateData.automation.name).toBe('Updated Name');

      const deleteResponse = await request.delete(`/api/automation/${automationId}?scope=global`);
      expect(deleteResponse.ok()).toBeTruthy();
      expect((await deleteResponse.json()).success).toBe(true);

      const verifyResponse = await request.get(`/api/automation/${automationId}?scope=global`);
      expect(verifyResponse.status()).toBe(404);
    });

    test('toggles automation enabled state', async ({ request }) => {
      const automationId = `verify-toggle-${Date.now()}`;

      await request.post('/api/automation?scope=global', {
        data: makeAutomation(automationId),
      });

      const disableResponse = await request.patch(
        `/api/automation/${automationId}/enabled?scope=global`,
        { data: { enabled: false } }
      );
      expect(disableResponse.ok()).toBeTruthy();
      expect((await disableResponse.json()).automation.enabled).toBe(false);

      const enableResponse = await request.patch(
        `/api/automation/${automationId}/enabled?scope=global`,
        { data: { enabled: true } }
      );
      expect(enableResponse.ok()).toBeTruthy();
      expect((await enableResponse.json()).automation.enabled).toBe(true);

      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('duplicates an automation', async ({ request }) => {
      const automationId = `verify-dup-${Date.now()}`;

      await request.post('/api/automation?scope=global', {
        data: makeAutomation(automationId, 'Original Name'),
      });

      const duplicateResponse = await request.post(
        `/api/automation/${automationId}/duplicate?scope=global`,
        { data: {} }
      );
      expect(duplicateResponse.status()).toBe(201);
      const duplicateData = await duplicateResponse.json();
      expect(duplicateData.automation.id).toBe(`${automationId}-copy`);
      expect(duplicateData.automation.name).toBe('Original Name (Copy)');

      await request.delete(`/api/automation/${automationId}?scope=global`);
      await request.delete(`/api/automation/${automationId}-copy?scope=global`);
    });

    test('exports and imports automations', async ({ request }) => {
      const automationId = `verify-export-${Date.now()}`;

      await request.post('/api/automation?scope=global', {
        data: makeAutomation(automationId, 'Export Test'),
      });

      const exportSingleResponse = await request.get(
        `/api/automation/${automationId}/export?scope=global`
      );
      expect(exportSingleResponse.ok()).toBeTruthy();
      const exportSingleData = await exportSingleResponse.json();
      expect(exportSingleData.automation.id).toBe(automationId);

      const exportAllResponse = await request.get('/api/automation/export?scope=global');
      expect(exportAllResponse.ok()).toBeTruthy();
      const exportAllData = await exportAllResponse.json();
      expect(Array.isArray(exportAllData.automations)).toBe(true);

      await request.delete(`/api/automation/${automationId}?scope=global`);

      const importResponse = await request.post('/api/automation/import?scope=global', {
        data: { automation: exportSingleData.automation, overwrite: false },
      });
      expect(importResponse.ok()).toBeTruthy();
      const importData = await importResponse.json();
      expect(importData.imported.length).toBe(1);
      expect(importData.failures.length).toBe(0);

      await request.delete(`/api/automation/${automationId}?scope=global`);
    });

    test('returns 404 for non-existent automation', async ({ request }) => {
      const response = await request.get('/api/automation/non-existent-automation?scope=global');
      expect(response.status()).toBe(404);
    });

    test('gets upcoming scheduled runs', async ({ request }) => {
      const response = await request.get('/api/automation/scheduled/upcoming');
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.scheduledRuns)).toBe(true);
      for (const run of data.scheduledRuns) {
        expect(run.status).toBe('scheduled');
      }
    });
  });
});
