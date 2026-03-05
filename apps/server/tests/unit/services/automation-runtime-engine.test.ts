import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  AutomationRuntimeEngine,
  AutomationDefinitionStore,
  parseAutomationDefinition,
} from '@/services/automation-runtime-engine.js';
import type { AutomationDefinition } from '@automaker/types';

describe('automation-runtime-engine.ts', () => {
  let rootDir: string;
  let dataDir: string;
  let projectDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-engine-test-'));
    dataDir = path.join(rootDir, 'data');
    projectDir = path.join(rootDir, 'project');

    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.automaker', 'automations'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'automations'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('parses automation definition and infers scope from loader context', () => {
    const raw = {
      version: 1,
      id: 'auto-test',
      name: 'Automation test',
      trigger: { type: 'manual' },
      steps: [{ id: 's1', type: 'noop' }],
    };

    const parsed = parseAutomationDefinition(raw, 'project');

    expect(parsed.scope).toBe('project');
    expect(parsed.enabled).toBe(true);
  });

  it('parses webhook and date trigger definitions', () => {
    const webhook = parseAutomationDefinition(
      {
        version: 1,
        id: 'auto-webhook',
        name: 'Webhook automation',
        trigger: { type: 'webhook', secret: 'token', methods: ['POST'] },
        steps: [{ id: 's1', type: 'noop' }],
      },
      'global'
    );
    const date = parseAutomationDefinition(
      {
        version: 1,
        id: 'auto-date',
        name: 'Date automation',
        trigger: { type: 'date', date: '2026-02-24T00:00:00.000Z', timezone: 'UTC' },
        steps: [{ id: 's1', type: 'noop' }],
      },
      'project'
    );

    expect(webhook.trigger.type).toBe('webhook');
    expect(webhook.trigger.metadata).toEqual({ methods: ['POST'], secret: 'token' });
    expect(date.trigger.type).toBe('date');
    expect(date.trigger.metadata).toEqual({
      date: '2026-02-24T00:00:00.000Z',
      timezone: 'UTC',
    });
  });

  it('loads project automation before global automation when IDs collide', async () => {
    const projectAutomation: AutomationDefinition = {
      version: 1,
      id: 'shared-id',
      name: 'Project automation',
      scope: 'project',
      trigger: { type: 'manual' },
      steps: [{ id: 'p1', type: 'noop', input: 'project' }],
    };

    const globalAutomation: AutomationDefinition = {
      version: 1,
      id: 'shared-id',
      name: 'Global automation',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [{ id: 'g1', type: 'noop', input: 'global' }],
    };

    await fs.writeFile(
      path.join(projectDir, '.automaker', 'automations', 'shared-id.json'),
      JSON.stringify(projectAutomation, null, 2),
      'utf-8'
    );
    await fs.writeFile(
      path.join(dataDir, 'automations', 'shared-id.json'),
      JSON.stringify(globalAutomation, null, 2),
      'utf-8'
    );

    const store = new AutomationDefinitionStore(dataDir);
    const loaded = await store.loadAutomationById('shared-id', { projectPath: projectDir });

    expect(loaded?.name).toBe('Project automation');
    expect(loaded?.scope).toBe('project');
  });

  it('executes steps with input/output piping and variable resolution', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);

    engine.getStepRegistry().register({
      type: 'append',
      execute: (context) => {
        const suffix = String(context.step.config?.suffix ?? '');
        return `${String(context.input)}${suffix}`;
      },
    });

    const definition: AutomationDefinition = {
      version: 1,
      id: 'runtime-pipe',
      name: 'Runtime piping',
      scope: 'project',
      trigger: { type: 'manual' },
      variables: {
        base: 'World',
      },
      steps: [
        {
          id: 'step_1',
          type: 'noop',
          input: 'Hello {{workflow.base}}',
          output: 'greeting',
        },
        {
          id: 'step_2',
          type: 'append',
          input: '{{workflow.greeting}}',
          config: { suffix: '!' },
        },
      ],
    };

    const run = await engine.executeDefinition(definition, { projectPath: projectDir });

    expect(run.status).toBe('completed');
    expect(run.output).toBe('Hello World!');
    expect(run.stepRuns).toHaveLength(2);
    expect(run.variables.workflow.greeting).toBe('Hello World');
    expect(run.variables.steps.step_1.output).toBe('Hello World');
    expect(run.variables.project.path).toBe(projectDir);
  });

  it('tracks step failures and marks run as failed when continueOnError is false', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);

    const definition: AutomationDefinition = {
      version: 1,
      id: 'runtime-fail',
      name: 'Runtime failure',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_fail',
          type: 'fail',
          config: { message: 'boom' },
        },
      ],
    };

    const run = await engine.executeDefinition(definition);

    expect(run.status).toBe('failed');
    expect(run.error?.code).toBe('STEP_FAILURE');
    expect(run.stepRuns[0].status).toBe('failed');
    expect(run.stepRuns[0].error?.message).toBe('boom');
  });

  it('continues execution when continueOnError is true', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);

    const definition: AutomationDefinition = {
      version: 1,
      id: 'runtime-continue',
      name: 'Continue on error',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_fail',
          type: 'fail',
          config: { message: 'non-fatal' },
          continueOnError: true,
        },
        {
          id: 'step_next',
          type: 'noop',
          input: 'still-running',
        },
      ],
    };

    const run = await engine.executeDefinition(definition);

    expect(run.status).toBe('completed');
    expect(run.output).toBe('still-running');
    expect(run.stepRuns[0].status).toBe('failed');
    expect(run.stepRuns[1].status).toBe('completed');
  });

  it('creates, updates, and deletes features through built-in feature steps', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);
    const featureId = 'automation-feature-test';

    const definition: AutomationDefinition = {
      version: 1,
      id: 'feature-ops',
      name: 'Feature operations',
      scope: 'project',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'create_feature',
          type: 'create-feature',
          config: {
            id: featureId,
            title: 'Automation Feature',
            description: 'Created by automation',
          },
        },
        {
          id: 'start_feature',
          type: 'manage-feature',
          config: {
            action: 'start',
            featureId,
          },
        },
        {
          id: 'delete_feature',
          type: 'manage-feature',
          config: {
            action: 'delete',
            featureId,
          },
        },
      ],
    };

    const run = await engine.executeDefinition(definition, { projectPath: projectDir });
    expect(run.status).toBe('completed');
    expect(run.stepRuns).toHaveLength(3);
    expect(run.stepRuns[0].status).toBe('completed');
    expect(run.stepRuns[1].status).toBe('completed');
    expect(run.stepRuns[2].status).toBe('completed');
    expect((run.stepRuns[2].output as { deleted: boolean }).deleted).toBe(true);
  });

  it('supports if and loop built-ins with nested steps', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);

    const definition: AutomationDefinition = {
      version: 1,
      id: 'flow-ops',
      name: 'Flow operations',
      scope: 'project',
      trigger: { type: 'manual' },
      variables: {
        shouldRun: true,
      },
      steps: [
        {
          id: 'conditional',
          type: 'if',
          config: {
            condition: 'workflow.shouldRun === true',
            thenSteps: [
              {
                id: 'set_message',
                type: 'define-variable',
                config: { name: 'message', value: 'hello-loop' },
              },
            ],
            elseSteps: [],
          },
        },
        {
          id: 'iterate',
          type: 'loop',
          config: {
            items: [1, 2, 3],
            steps: [
              {
                id: 'echo_item',
                type: 'noop',
                input: '{{workflow.message}}-{{workflow.loopItem}}',
              },
            ],
          },
        },
      ],
    };

    const run = await engine.executeDefinition(definition, { projectPath: projectDir });
    expect(run.status).toBe('completed');
    const loopOutput = run.stepRuns[1].output as { outputs: string[] };
    expect(loopOutput.outputs).toEqual(['hello-loop-1', 'hello-loop-2', 'hello-loop-3']);
  });

  it('calls another automation via call-automation step', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);

    const child: AutomationDefinition = {
      version: 1,
      id: 'child-automation',
      name: 'Child automation',
      scope: 'project',
      trigger: { type: 'manual' },
      steps: [{ id: 'child_step', type: 'noop', input: 'child-output' }],
    };

    await fs.writeFile(
      path.join(projectDir, '.automaker', 'automations', 'child-automation.json'),
      JSON.stringify(child, null, 2),
      'utf-8'
    );

    const parent: AutomationDefinition = {
      version: 1,
      id: 'parent-automation',
      name: 'Parent automation',
      scope: 'project',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'call_child',
          type: 'call-automation',
          config: {
            automationId: 'child-automation',
            scope: 'project',
          },
          output: 'childRun',
        },
      ],
    };

    const run = await engine.executeDefinition(parent, { projectPath: projectDir });
    expect(run.status).toBe('completed');
    const output = run.output as { output: string };
    expect(output.output).toBe('child-output');
    expect(run.variables.workflow.childRun).toBeDefined();
  });

  it('serializes object outputs as JSON when embedded in string templates', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);

    engine.getStepRegistry().register({
      type: 'return-object',
      execute: () => {
        return { stdout: 'hello world', exitCode: 0 };
      },
    });

    engine.getStepRegistry().register({
      type: 'passthrough',
      execute: (context) => {
        return context.input;
      },
    });

    const definition: AutomationDefinition = {
      version: 1,
      id: 'object-interpolation',
      name: 'Object interpolation test',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'obj_step',
          type: 'return-object',
          output: 'result',
        },
        {
          id: 'use_embedded',
          type: 'passthrough',
          input: 'Output: {{steps.obj_step.output}}',
        },
        {
          id: 'use_full',
          type: 'passthrough',
          input: '{{steps.obj_step.output}}',
        },
        {
          id: 'use_field',
          type: 'passthrough',
          input: 'Stdout: {{steps.obj_step.output.stdout}}',
        },
      ],
    };

    const run = await engine.executeDefinition(definition);

    expect(run.status).toBe('completed');

    // Embedded in string: should JSON.stringify the object, not produce [object Object]
    const embeddedOutput = run.stepRuns[1].output as string;
    expect(embeddedOutput).not.toContain('[object Object]');
    expect(embeddedOutput).toBe('Output: {"stdout":"hello world","exitCode":0}');

    // Full match (entire string is just the variable): should preserve the object
    const fullOutput = run.stepRuns[2].output as { stdout: string; exitCode: number };
    expect(fullOutput).toEqual({ stdout: 'hello world', exitCode: 0 });

    // Accessing a specific field: should return the string value
    const fieldOutput = run.stepRuns[3].output as string;
    expect(fieldOutput).toBe('Stdout: hello world');
  });
});
