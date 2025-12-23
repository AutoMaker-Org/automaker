/**
 * E2E Tests: Pipeline API Endpoints
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { createServer } from 'http';
import { app } from '../../index.js';
import type { Server } from 'http';

describe('Pipeline API E2E Tests', () => {
  let server: Server;
  let baseUrl: string;
  let authToken: string;

  beforeAll(async () => {
    // Start test server
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = (server.address() as any)?.port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Mock authentication
    authToken = 'test-token';
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('GET /api/pipeline/config', () => {
    it('should return pipeline configuration', async () => {
      const response = await fetch(`${baseUrl}/api/pipeline/config`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status).toBe(200);
      const config = await response.json();
      expect(config).toHaveProperty('version');
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('steps');
      expect(Array.isArray(config.steps)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await fetch(`${baseUrl}/api/pipeline/config`);
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/pipeline/config', () => {
    it('should update pipeline configuration', async () => {
      const newConfig = {
        version: '1.0',
        enabled: true,
        onFailure: 'continue',
        steps: [
          {
            id: 'test-step',
            type: 'test',
            name: 'Test Step',
            model: 'opus',
            required: false,
            autoTrigger: true,
            config: {
              coverageThreshold: 90,
            },
          },
        ],
      };

      const response = await fetch(`${baseUrl}/api/pipeline/config`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newConfig),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);

      // Verify the config was saved
      const getResponse = await fetch(`${baseUrl}/api/pipeline/config`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const savedConfig = await getResponse.json();
      expect(savedConfig.steps).toHaveLength(1);
      expect(savedConfig.steps[0].id).toBe('test-step');
    });

    it('should validate configuration', async () => {
      const invalidConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'invalid',
            type: 'invalid-type',
            name: 'Invalid Step',
            model: 'opus',
            required: true,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      const response = await fetch(`${baseUrl}/api/pipeline/config`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidConfig),
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toBeDefined();
      expect(error.error).toContain('type must be one of');
    });
  });

  describe('POST /api/pipeline/execute-step', () => {
    let testFeatureId: string;

    beforeAll(async () => {
      // Create a test feature
      const createResponse = await fetch(`${baseUrl}/api/features`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Pipeline Test Feature',
          description: 'Feature for testing pipeline execution',
        }),
      });
      const feature = await createResponse.json();
      testFeatureId = feature.id;
    });

    it('should execute a pipeline step', async () => {
      // Mock AI response
      const mockExecuteModelPrompt = mock(() =>
        Promise.resolve({ content: '[REVIEW_PASSED] Code looks good' })
      );
      // Note: In real tests, you would need to inject this mock properly

      const response = await fetch(`${baseUrl}/api/pipeline/execute-step`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          featureId: testFeatureId,
          stepId: 'review',
        }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('output');
    });

    it('should return 404 for non-existent feature', async () => {
      const response = await fetch(`${baseUrl}/api/pipeline/execute-step`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          featureId: 'non-existent-feature',
          stepId: 'review',
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/pipeline/skip-step', () => {
    it('should skip an optional step', async () => {
      const response = await fetch(`${baseUrl}/api/pipeline/skip-step`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          featureId: 'test-feature-id',
          stepId: 'optional-step',
        }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });

    it('should not skip required steps', async () => {
      const response = await fetch(`${baseUrl}/api/pipeline/skip-step`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          featureId: 'test-feature-id',
          stepId: 'required-step',
        }),
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain('Cannot skip required step');
    });
  });

  describe('POST /api/pipeline/reset-pipeline', () => {
    it('should clear all pipeline results', async () => {
      const response = await fetch(`${baseUrl}/api/pipeline/reset-pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          featureId: 'test-feature-id',
        }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });

    it('should clear specific step results', async () => {
      const response = await fetch(`${baseUrl}/api/pipeline/reset-pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          featureId: 'test-feature-id',
          stepId: 'review',
        }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });
  });

  describe('POST /api/pipeline/validate-config', () => {
    it('should validate valid configuration', async () => {
      const validConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'opus',
            required: true,
            autoTrigger: true,
            config: {},
          },
        ],
      };

      const response = await fetch(`${baseUrl}/api/pipeline/validate-config`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validConfig),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should return validation errors', async () => {
      const invalidConfig = {
        version: '1.0',
        enabled: true,
        steps: [
          {
            id: 'review',
            type: 'review',
            name: 'Code Review',
            model: 'opus',
            required: true,
            autoTrigger: true,
            config: {
              coverageThreshold: 150, // Invalid for review step
            },
          },
        ],
      };

      const response = await fetch(`${baseUrl}/api/pipeline/validate-config`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidConfig),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('WebSocket Events', () => {
    it('should emit pipeline progress events', (done) => {
      const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      ws.onopen = () => {
        // Subscribe to pipeline events
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            channel: 'pipeline',
          })
        );
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data as string);
        if (data.type === 'pipeline_step_progress') {
          expect(data).toHaveProperty('featureId');
          expect(data).toHaveProperty('stepId');
          expect(data).toHaveProperty('message');
          ws.close();
          done();
        }
      };

      // Trigger a pipeline step execution
      setTimeout(() => {
        fetch(`${baseUrl}/api/pipeline/execute-step`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            featureId: 'test-feature',
            stepId: 'review',
          }),
        });
      }, 100);
    });
  });
});
