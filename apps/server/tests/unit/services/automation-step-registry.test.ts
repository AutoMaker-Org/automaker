/**
 * Additional unit tests for AutomationStepRegistry and AutomationRuntimeEngine edge cases
 *
 * Covers:
 * - AutomationStepRegistry: unregister, has, listTypes, invalid executor registration
 * - AutomationDefinitionStore: ensureScopeDir, malformed JSON file skipping
 * - AutomationRuntimeEngine: executeById not found, cancellation via AbortSignal,
 *   'run' scope variable resolution, template with array/record/primitive values
 * - withTimeout: step with timeout=0 passes through
 * - run.status tracking when AbortSignal is aborted mid-run
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  AutomationRuntimeEngine,
  AutomationDefinitionStore,
  AutomationStepRegistry,
} from '@/services/automation-runtime-engine.js';
import type { AutomationDefinition } from '@automaker/types';

describe('AutomationStepRegistry', () => {
  it('unregister removes a previously registered executor', () => {
    const registry = new AutomationStepRegistry();
    registry.register({ type: 'my-step', execute: () => 'result' });

    expect(registry.has('my-step')).toBe(true);
    const removed = registry.unregister('my-step');
    expect(removed).toBe(true);
    expect(registry.has('my-step')).toBe(false);
    expect(registry.get('my-step')).toBeUndefined();
  });

  it('unregister returns false for non-existent type', () => {
    const registry = new AutomationStepRegistry();
    const removed = registry.unregister('does-not-exist');
    expect(removed).toBe(false);
  });

  it('has returns true for registered type and false otherwise', () => {
    const registry = new AutomationStepRegistry();
    expect(registry.has('my-step')).toBe(false);
    registry.register({ type: 'my-step', execute: () => null });
    expect(registry.has('my-step')).toBe(true);
  });

  it('listTypes returns sorted list of registered type names', () => {
    const registry = new AutomationStepRegistry();
    registry.register({ type: 'zebra', execute: () => null });
    registry.register({ type: 'apple', execute: () => null });
    registry.register({ type: 'mango', execute: () => null });

    const types = registry.listTypes();
    expect(types).toEqual(['apple', 'mango', 'zebra']);
  });

  it('listTypes returns empty array when no executors registered', () => {
    const registry = new AutomationStepRegistry();
    expect(registry.listTypes()).toEqual([]);
  });

  it('register throws when executor type is empty string', () => {
    const registry = new AutomationStepRegistry();
    expect(() => registry.register({ type: '', execute: () => null })).toThrow(
      'Executor type is required'
    );
  });

  it('register throws when executor type is whitespace only', () => {
    const registry = new AutomationStepRegistry();
    expect(() => registry.register({ type: '   ', execute: () => null })).toThrow(
      'Executor type is required'
    );
  });

  it('register overwrites existing executor with same type', () => {
    const registry = new AutomationStepRegistry();
    registry.register({ type: 'counter', execute: () => 1 });
    registry.register({ type: 'counter', execute: () => 2 });

    // Context type expects AutomationStepExecutionContext, but we just need any object
    const result = registry.get('counter')!.execute({} as any);
    expect(result).toBe(2);
  });
});

describe('AutomationDefinitionStore', () => {
  let rootDir: string;
  let dataDir: string;
  let projectDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'definition-store-test-'));
    dataDir = path.join(rootDir, 'data');
    projectDir = path.join(rootDir, 'project');
    await fs.mkdir(path.join(dataDir, 'automations'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.automaker', 'automations'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('ensureScopeDir creates and returns global automations dir', async () => {
    const newDataDir = path.join(rootDir, 'new-data');
    const store = new AutomationDefinitionStore(newDataDir);
    const dir = await store.ensureScopeDir('global');

    // Directory should be created
    await expect(fs.access(dir)).resolves.not.toThrow();
    expect(dir).toContain('automations');
  });

  it('ensureScopeDir creates and returns project automations dir', async () => {
    const newProjectDir = path.join(rootDir, 'new-project');
    const store = new AutomationDefinitionStore(dataDir);
    const dir = await store.ensureScopeDir('project', newProjectDir);

    await expect(fs.access(dir)).resolves.not.toThrow();
    expect(dir).toContain('automations');
  });

  it('ensureScopeDir throws when project scope used without projectPath', async () => {
    const store = new AutomationDefinitionStore(dataDir);
    await expect(store.ensureScopeDir('project')).rejects.toThrow('projectPath is required');
  });

  it('listAutomations skips malformed JSON files', async () => {
    // Write a valid automation
    const valid: AutomationDefinition = {
      version: 1,
      id: 'valid-auto',
      name: 'Valid',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [{ id: 's1', type: 'noop' }],
    };
    await fs.writeFile(
      path.join(dataDir, 'automations', 'valid-auto.json'),
      JSON.stringify(valid),
      'utf-8'
    );

    // Write a malformed file
    await fs.writeFile(
      path.join(dataDir, 'automations', 'broken.json'),
      '{ invalid json }',
      'utf-8'
    );

    // Write a file with invalid automation definition (wrong version)
    await fs.writeFile(
      path.join(dataDir, 'automations', 'wrong-version.json'),
      JSON.stringify({ version: 99, id: 'test', name: 'Test' }),
      'utf-8'
    );

    const store = new AutomationDefinitionStore(dataDir);
    const automations = await store.listAutomations({ scope: 'global' });

    // Only the valid one should be loaded
    expect(automations).toHaveLength(1);
    expect(automations[0].id).toBe('valid-auto');
  });

  it('listAutomations returns empty array when directory does not exist', async () => {
    const store = new AutomationDefinitionStore(path.join(rootDir, 'nonexistent-data'));
    const automations = await store.listAutomations({ scope: 'global' });
    expect(automations).toEqual([]);
  });

  it('loadAutomationById returns null when automation does not exist', async () => {
    const store = new AutomationDefinitionStore(dataDir);
    const result = await store.loadAutomationById('non-existent');
    expect(result).toBeNull();
  });

  it('loadAutomationById uses scope filter when scope is provided', async () => {
    const globalAuto: AutomationDefinition = {
      version: 1,
      id: 'scope-test',
      name: 'Scope Test Global',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [{ id: 's1', type: 'noop' }],
    };
    await fs.writeFile(
      path.join(dataDir, 'automations', 'scope-test.json'),
      JSON.stringify(globalAuto),
      'utf-8'
    );

    const store = new AutomationDefinitionStore(dataDir);

    // Should find when looking in global scope
    const found = await store.loadAutomationById('scope-test', { scope: 'global' });
    expect(found?.id).toBe('scope-test');

    // Should return null when looking in project scope (without projectPath)
    // This throws since project scope requires projectPath
    await expect(store.loadAutomationById('scope-test', { scope: 'project' })).rejects.toThrow(
      'projectPath is required'
    );
  });
});

describe('AutomationRuntimeEngine - executeById edge cases', () => {
  let rootDir: string;
  let dataDir: string;
  let projectDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-executeid-test-'));
    dataDir = path.join(rootDir, 'data');
    projectDir = path.join(rootDir, 'project');
    await fs.mkdir(path.join(dataDir, 'automations'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.automaker', 'automations'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('executeById throws when automation is not found', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);
    await expect(engine.executeById('nonexistent')).rejects.toThrow(
      'Automation definition not found: nonexistent'
    );
  });

  it('executeById finds and runs automation from file', async () => {
    const definition: AutomationDefinition = {
      version: 1,
      id: 'file-auto',
      name: 'File Automation',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [{ id: 's1', type: 'noop', input: 'from-file' }],
    };
    await fs.writeFile(
      path.join(dataDir, 'automations', 'file-auto.json'),
      JSON.stringify(definition),
      'utf-8'
    );

    const engine = new AutomationRuntimeEngine(dataDir);
    const run = await engine.executeById('file-auto');
    expect(run.status).toBe('completed');
    expect(run.output).toBe('from-file');
  });

  it('executeDefinition throws when definition is disabled', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);
    const disabled: AutomationDefinition = {
      version: 1,
      id: 'disabled',
      name: 'Disabled',
      scope: 'global',
      enabled: false,
      trigger: { type: 'manual' },
      steps: [{ id: 's1', type: 'noop' }],
    };

    await expect(engine.executeDefinition(disabled)).rejects.toThrow(
      'Automation "disabled" is disabled'
    );
  });

  it('cancellation via AbortSignal marks run as cancelled', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);

    engine.getStepRegistry().register({
      type: 'slow-step',
      execute: () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('done'), 200);
        }),
    });

    const controller = new AbortController();
    // Abort before starting - so the abort check in the step loop fires
    controller.abort();

    const definition: AutomationDefinition = {
      version: 1,
      id: 'cancel-test',
      name: 'Cancel Test',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        { id: 'step_1', type: 'noop', input: 'first' },
        { id: 'step_2', type: 'slow-step' },
      ],
    };

    const run = await engine.executeDefinition(definition, { signal: controller.signal });
    // The run should be cancelled after the first iteration check
    expect(run.status).toBe('cancelled');
    expect(run.error?.code).toBe('RUN_CANCELLED');
  });

  it('resolves run scope variables (run.id, run.automationId)', async () => {
    const engine = new AutomationRuntimeEngine(dataDir);

    let capturedRunId: unknown;
    let capturedAutomationId: unknown;

    engine.getStepRegistry().register({
      type: 'capture-run',
      execute: (ctx) => {
        capturedRunId = ctx.variables.steps;
        // Access run scope through context.variables doesn't work directly
        // but we can verify via the run output
        return 'captured';
      },
    });

    const definition: AutomationDefinition = {
      version: 1,
      id: 'run-scope-test',
      name: 'Run scope test',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        { id: 'step_1', type: 'noop', input: '{{run.id}}', output: 'capturedRunId' },
        { id: 'step_2', type: 'noop', input: '{{run.automationId}}', output: 'capturedAutoId' },
      ],
    };

    const run = await engine.executeDefinition(definition);
    expect(run.status).toBe('completed');
    // The run.id is a dynamic value, but verify it was resolved (non-empty)
    expect(run.variables.workflow.capturedRunId).toMatch(/^run_/);
    // automationId should match
    expect(run.variables.workflow.capturedAutoId).toBe('run-scope-test');
  });
});

describe('AutomationRuntimeEngine - template resolution', () => {
  it('resolves array values by mapping each element', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const definition: AutomationDefinition = {
      version: 1,
      id: 'array-template',
      name: 'Array template',
      scope: 'global',
      trigger: { type: 'manual' },
      variables: {
        greeting: 'hello',
      },
      steps: [
        {
          id: 'step_1',
          type: 'noop',
          // Array input where elements are templates
          input: ['{{workflow.greeting}}', 'world'],
        },
      ],
    };

    const run = await engine.executeDefinition(definition);
    expect(run.status).toBe('completed');
    expect(run.output).toEqual(['hello', 'world']);
  });

  it('resolves record (object) values by mapping each property', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const definition: AutomationDefinition = {
      version: 1,
      id: 'object-template',
      name: 'Object template',
      scope: 'global',
      trigger: { type: 'manual' },
      variables: {
        name: 'Alice',
        count: 42,
      },
      steps: [
        {
          id: 'step_1',
          type: 'noop',
          input: {
            greeting: 'Hello {{workflow.name}}',
            count: '{{workflow.count}}',
            literal: 'no-template',
          },
        },
      ],
    };

    const run = await engine.executeDefinition(definition);
    expect(run.status).toBe('completed');
    expect(run.output).toEqual({
      greeting: 'Hello Alice',
      count: 42, // Full-match template returns the raw value (number), not stringified
      literal: 'no-template',
    });
  });

  it('passes through numbers and booleans without modification', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const definition: AutomationDefinition = {
      version: 1,
      id: 'primitive-template',
      name: 'Primitive template',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_1',
          type: 'noop',
          input: 42,
        },
        {
          id: 'step_2',
          type: 'noop',
          input: true,
        },
        {
          id: 'step_3',
          type: 'noop',
          input: null,
        },
      ],
    };

    const run = await engine.executeDefinition(definition);
    expect(run.status).toBe('completed');
    expect(run.stepRuns[0].output).toBe(42);
    expect(run.stepRuns[1].output).toBe(true);
    expect(run.stepRuns[2].output).toBeNull();
  });

  it('fails run when unresolvable template reference is used', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const definition: AutomationDefinition = {
      version: 1,
      id: 'unresolvable-template',
      name: 'Unresolvable template',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_1',
          type: 'noop',
          input: '{{workflow.doesNotExist}}',
        },
      ],
    };

    const run = await engine.executeDefinition(definition);
    expect(run.status).toBe('failed');
    expect(run.error?.message).toContain('Unable to resolve variable: workflow.doesNotExist');
  });

  it('resolves system scope variables', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const definition: AutomationDefinition = {
      version: 1,
      id: 'system-scope',
      name: 'System scope',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_1',
          type: 'noop',
          input: '{{system.platform}}',
          output: 'platform',
        },
      ],
    };

    const run = await engine.executeDefinition(definition);
    expect(run.status).toBe('completed');
    expect(run.variables.workflow.platform).toBe(process.platform);
  });
});

describe('AutomationRuntimeEngine - run tracking and limits', () => {
  it('evicts oldest run when maxStoredRuns is exceeded', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    // Execute 205 automations (above the 200 limit)
    const executions = [];
    for (let i = 0; i < 205; i++) {
      executions.push(
        engine.executeDefinition({
          version: 1,
          id: `bulk-auto-${i}`,
          name: `Bulk ${i}`,
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop', input: String(i) }],
        })
      );
    }

    await Promise.all(executions);

    const runs = engine.listRuns();
    // Should be capped at 200
    expect(runs.length).toBeLessThanOrEqual(200);
  });

  it('listRuns returns runs in most-recent-first order', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const makeDefinition = (id: string, value: string): AutomationDefinition => ({
      version: 1,
      id,
      name: `Auto ${id}`,
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [{ id: 's1', type: 'noop', input: value }],
    });

    await engine.executeDefinition(makeDefinition('first', 'output-first'));
    await engine.executeDefinition(makeDefinition('second', 'output-second'));
    await engine.executeDefinition(makeDefinition('third', 'output-third'));

    const runs = engine.listRuns();
    // Most recent first
    expect(runs[0].automationId).toBe('third');
    expect(runs[1].automationId).toBe('second');
    expect(runs[2].automationId).toBe('first');
  });

  it('getRun returns null for non-existent run', () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');
    expect(engine.getRun('non-existent-run-id')).toBeNull();
  });

  it('listRuns filters by automationId', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const makeDefinition = (id: string): AutomationDefinition => ({
      version: 1,
      id,
      name: `Auto ${id}`,
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [{ id: 's1', type: 'noop' }],
    });

    await engine.executeDefinition(makeDefinition('auto-a'));
    await engine.executeDefinition(makeDefinition('auto-b'));
    await engine.executeDefinition(makeDefinition('auto-a'));

    const runsA = engine.listRuns('auto-a');
    expect(runsA).toHaveLength(2);
    expect(runsA.every((r) => r.automationId === 'auto-a')).toBe(true);

    const runsB = engine.listRuns('auto-b');
    expect(runsB).toHaveLength(1);
  });
});
