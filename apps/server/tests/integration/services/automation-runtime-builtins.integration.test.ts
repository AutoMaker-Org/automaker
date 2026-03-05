import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { AutomationRuntimeEngine } from '@/services/automation-runtime-engine.js';
import { createEventEmitter } from '@/lib/events.js';
import type { AutomationDefinition } from '@automaker/types';
import { TEST_HTTP_PORTS, createRawTestHttpServer } from '../../utils/helpers.js';

function createTestServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return createRawTestHttpServer((req, res) => {
    if (req.url === '/json' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += String(chunk);
      });
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            method: req.method,
            body: body ? JSON.parse(body) : null,
          })
        );
      });
      return;
    }

    if (req.url === '/text' && req.method === 'GET') {
      res.setHeader('content-type', 'text/plain');
      res.end('plain-text-response');
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  }, TEST_HTTP_PORTS.AUTOMATION_RUNTIME_BUILTINS_INTEGRATION);
}

describe('automation-runtime built-ins integration', () => {
  let rootDir: string;
  let dataDir: string;
  let projectDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-runtime-builtins-'));
    dataDir = path.join(rootDir, 'data');
    projectDir = path.join(rootDir, 'project');
    await fs.mkdir(path.join(dataDir, 'automations'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.automaker', 'automations'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('executes call-http-endpoint for JSON and text responses', async () => {
    const testServer = await createTestServer();
    try {
      const engine = new AutomationRuntimeEngine(dataDir);
      const definition: AutomationDefinition = {
        version: 1,
        id: 'http-builtins',
        name: 'HTTP built-ins',
        scope: 'project',
        trigger: { type: 'manual' },
        steps: [
          {
            id: 'post_json',
            type: 'call-http-endpoint',
            config: {
              method: 'POST',
              url: `${testServer.url}/json`,
              allowInternal: true, // Allow localhost for testing
              headers: {
                'content-type': 'application/json',
              },
              body: {
                key: 'value',
              },
            },
            output: 'jsonResult',
          },
          {
            id: 'get_text',
            type: 'call-http-endpoint',
            config: {
              method: 'GET',
              url: `${testServer.url}/text`,
              allowInternal: true, // Allow localhost for testing
            },
          },
        ],
      };

      const run = await engine.executeDefinition(definition, { projectPath: projectDir });
      expect(run.status).toBe('completed');

      expect(run.variables.workflow.jsonResult).toEqual({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: expect.any(Object),
        body: { method: 'POST', body: { key: 'value' } },
      });

      const finalOutput = run.output as { body: string };
      expect(finalOutput.body).toBe('plain-text-response');
    } finally {
      await testServer.close();
    }
  });

  it('emits internal event payloads through the runtime event emitter', async () => {
    const eventEmitter = createEventEmitter();
    const emitted: Array<{ type: string; payload: unknown }> = [];
    const unsubscribe = eventEmitter.subscribe((type, payload) => {
      emitted.push({ type, payload });
    });

    const engine = new AutomationRuntimeEngine(dataDir, undefined, undefined, eventEmitter);
    const definition: AutomationDefinition = {
      version: 1,
      id: 'emit-event-builtins',
      name: 'Emit event built-in',
      scope: 'project',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'emit_1',
          type: 'emit-event',
          config: {
            eventType: 'automation.custom-event',
            payload: { sentBy: 'test' },
          },
        },
      ],
    };

    const run = await engine.executeDefinition(definition, { projectPath: projectDir });
    unsubscribe();

    expect(run.status).toBe('completed');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('auto-mode:event');
    expect(emitted[0].payload).toEqual({
      type: 'automation.custom-event',
      source: 'automation',
      automationId: 'emit-event-builtins',
      runId: run.id,
      stepId: 'emit_1',
      payload: { sentBy: 'test' },
    });
  });

  it('runs script exec and TypeScript built-ins through executeById', async () => {
    const definition: AutomationDefinition = {
      version: 1,
      id: 'script-ts-builtins',
      name: 'Script + TS built-ins',
      scope: 'project',
      trigger: { type: 'manual' },
      variables: {
        greeting: 'hello',
      },
      steps: [
        {
          id: 'run_script',
          type: 'run-script-exec',
          config: {
            command: 'echo script-ok',
          },
          output: 'scriptResult',
        },
        {
          id: 'run_ts',
          type: 'run-typescript-code',
          config: {
            code: `
const text = String(workflow.greeting);
setVariable('seenScriptOutput', steps.run_script.output.stdout.trim());
return text.toUpperCase() + '-' + workflow.seenScriptOutput;
            `,
          },
        },
      ],
    };

    await fs.writeFile(
      path.join(projectDir, '.automaker', 'automations', 'script-ts-builtins.json'),
      JSON.stringify(definition, null, 2),
      'utf-8'
    );

    const engine = new AutomationRuntimeEngine(dataDir);
    const run = await engine.executeById('script-ts-builtins', {
      projectPath: projectDir,
      scope: 'project',
    });

    expect(run.status).toBe('completed');
    const scriptOutput = run.variables.workflow.scriptResult as { stdout: string };
    expect(scriptOutput.stdout).toContain('script-ok');
    expect(run.variables.workflow.seenScriptOutput).toBe('script-ok');
    expect(run.output).toBe('HELLO-script-ok');
  });
});
