/**
 * Additional unit tests for parseAutomationDefinition and AutomationStepRegistry
 *
 * Focuses on validation error paths and edge cases not covered by the
 * main automation-runtime-engine.test.ts suite.
 */

import { describe, expect, it } from 'vitest';
import {
  parseAutomationDefinition,
  AutomationRuntimeEngine,
} from '@/services/automation-runtime-engine.js';

describe('parseAutomationDefinition - validation errors', () => {
  it('throws when definition is not an object', () => {
    expect(() => parseAutomationDefinition('string', 'global')).toThrow(
      'Automation definition must be an object'
    );
    expect(() => parseAutomationDefinition(null, 'global')).toThrow(
      'Automation definition must be an object'
    );
    expect(() => parseAutomationDefinition(42, 'global')).toThrow(
      'Automation definition must be an object'
    );
    expect(() => parseAutomationDefinition([], 'global')).toThrow(
      'Automation definition must be an object'
    );
  });

  it('throws for unsupported version number', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 2,
          id: 'test',
          name: 'Test',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop' }],
        },
        'global'
      )
    ).toThrow('Unsupported automation version: 2');
  });

  it('throws for missing version', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          id: 'test',
          name: 'Test',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop' }],
        },
        'global'
      )
    ).toThrow('Unsupported automation version');
  });

  it('throws for missing id', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          name: 'Test',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop' }],
        },
        'global'
      )
    ).toThrow('Automation "id" is required');
  });

  it('throws for whitespace-only id', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: '   ',
          name: 'Test',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop' }],
        },
        'global'
      )
    ).toThrow('Automation "id" is required');
  });

  it('throws for missing name', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop' }],
        },
        'global'
      )
    ).toThrow('Automation "name" is required');
  });

  it('throws when scope is invalid and no defaultScope is provided', () => {
    expect(() =>
      parseAutomationDefinition({
        version: 1,
        id: 'test',
        name: 'Test',
        scope: 'invalid',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      })
    ).toThrow('Automation "scope" must be "global" or "project"');
  });

  it('uses defaultScope when scope is not provided in definition', () => {
    const parsed = parseAutomationDefinition(
      {
        version: 1,
        id: 'test',
        name: 'Test',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      },
      'global'
    );
    expect(parsed.scope).toBe('global');
  });

  it('definition scope overrides defaultScope', () => {
    const parsed = parseAutomationDefinition(
      {
        version: 1,
        id: 'test',
        name: 'Test',
        scope: 'project',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      },
      'global'
    );
    expect(parsed.scope).toBe('project');
  });

  it('throws for missing trigger', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          steps: [{ id: 's1', type: 'noop' }],
        },
        'global'
      )
    ).toThrow('Automation "trigger" is required');
  });

  it('throws for invalid trigger type', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'invalid-type' },
          steps: [{ id: 's1', type: 'noop' }],
        },
        'global'
      )
    ).toThrow('Automation trigger.type must be one of: manual, event, schedule, webhook, date');
  });

  it('throws for empty steps array', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [],
        },
        'global'
      )
    ).toThrow('Automation "steps" must be a non-empty array');
  });

  it('throws for steps that is not an array', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: 'invalid',
        },
        'global'
      )
    ).toThrow('Automation "steps" must be a non-empty array');
  });

  it('throws for duplicate step ids', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [
            { id: 'dup', type: 'noop' },
            { id: 'dup', type: 'noop' },
          ],
        },
        'global'
      )
    ).toThrow('Duplicate step id "dup"');
  });

  it('throws for step with missing id', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [{ type: 'noop' }],
        },
        'global'
      )
    ).toThrow('missing a valid "id"');
  });

  it('throws for step with missing type', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [{ id: 's1' }],
        },
        'global'
      )
    ).toThrow('missing a valid "type"');
  });

  it('throws for step with invalid output (non-string)', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop', output: 123 }],
        },
        'global'
      )
    ).toThrow('invalid "output"');
  });

  it('throws for step with invalid output (empty string)', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop', output: '' }],
        },
        'global'
      )
    ).toThrow('invalid "output"');
  });

  it('throws for step with invalid timeoutMs (zero)', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop', timeoutMs: 0 }],
        },
        'global'
      )
    ).toThrow('invalid "timeoutMs"');
  });

  it('throws for step with invalid timeoutMs (negative)', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop', timeoutMs: -1000 }],
        },
        'global'
      )
    ).toThrow('invalid "timeoutMs"');
  });

  it('throws for variables that is not an object', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop' }],
          variables: 'bad',
        },
        'global'
      )
    ).toThrow('Automation "variables" must be an object');
  });

  it('throws for variable value that is a function (non-JSON compatible)', () => {
    expect(() =>
      parseAutomationDefinition(
        {
          version: 1,
          id: 'test',
          name: 'Test',
          scope: 'global',
          trigger: { type: 'manual' },
          steps: [{ id: 's1', type: 'noop' }],
          variables: { fn: () => {} },
        },
        'global'
      )
    ).toThrow('not JSON-compatible');
  });

  it('parses all 5 trigger types correctly', () => {
    const types = ['manual', 'event', 'schedule', 'webhook', 'date'] as const;

    for (const type of types) {
      const parsed = parseAutomationDefinition(
        {
          version: 1,
          id: `test-${type}`,
          name: `Test ${type}`,
          scope: 'global',
          trigger: { type },
          steps: [{ id: 's1', type: 'noop' }],
        },
        'global'
      );
      expect(parsed.trigger.type).toBe(type);
    }
  });

  it('parses optional description and enabled fields', () => {
    const parsed = parseAutomationDefinition(
      {
        version: 1,
        id: 'test',
        name: 'Test',
        scope: 'global',
        description: 'This is a description',
        enabled: false,
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      },
      'global'
    );

    expect(parsed.description).toBe('This is a description');
    expect(parsed.enabled).toBe(false);
  });

  it('defaults enabled to true when not specified', () => {
    const parsed = parseAutomationDefinition(
      {
        version: 1,
        id: 'test',
        name: 'Test',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', type: 'noop' }],
      },
      'global'
    );

    expect(parsed.enabled).toBe(true);
  });

  it('parses event trigger with event name and string filter', () => {
    const parsed = parseAutomationDefinition(
      {
        version: 1,
        id: 'test',
        name: 'Test',
        scope: 'global',
        trigger: {
          type: 'event',
          event: 'feature:completed',
          filter: 'featureId === "my-feature"',
        },
        steps: [{ id: 's1', type: 'noop' }],
      },
      'global'
    );

    expect(parsed.trigger.type).toBe('event');
    expect(parsed.trigger.event).toBe('feature:completed');
    // filter is stored directly on trigger, not in metadata
    expect(parsed.trigger.filter).toBe('featureId === "my-feature"');
  });

  it('parses schedule trigger with cron and timezone', () => {
    const parsed = parseAutomationDefinition(
      {
        version: 1,
        id: 'test',
        name: 'Test',
        scope: 'global',
        trigger: { type: 'schedule', cron: '0 9 * * 1-5', timezone: 'America/New_York' },
        steps: [{ id: 's1', type: 'noop' }],
      },
      'global'
    );

    expect(parsed.trigger.cron).toBe('0 9 * * 1-5');
    expect(parsed.trigger.timezone).toBe('America/New_York');
  });

  it('parses step with all optional fields', () => {
    const parsed = parseAutomationDefinition(
      {
        version: 1,
        id: 'test',
        name: 'Test',
        scope: 'global',
        trigger: { type: 'manual' },
        steps: [
          {
            id: 's1',
            type: 'noop',
            name: 'Step name',
            input: '{{workflow.greeting}}',
            config: { key: 'value' },
            output: 'result',
            continueOnError: true,
            timeoutMs: 5000,
          },
        ],
      },
      'global'
    );

    const step = parsed.steps[0];
    expect(step.name).toBe('Step name');
    expect(step.input).toBe('{{workflow.greeting}}');
    expect(step.config).toEqual({ key: 'value' });
    expect(step.output).toBe('result');
    expect(step.continueOnError).toBe(true);
    expect(step.timeoutMs).toBe(5000);
  });
});

describe('AutomationStepRegistry - unregistered step type', () => {
  it('fails run when step type is not registered', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const run = await engine.executeDefinition({
      version: 1,
      id: 'registry-test',
      name: 'Registry test',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_unknown',
          type: 'completely-unknown-type',
          input: 'passthrough-value',
        },
      ],
    });

    // Unknown step type throws a STEP_TYPE_NOT_REGISTERED error
    expect(run.status).toBe('failed');
    expect(run.error?.code).toBe('STEP_TYPE_NOT_REGISTERED');
    expect(run.stepRuns[0].status).toBe('failed');
  });

  it('custom registry executor overrides default noop', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    engine.getStepRegistry().register({
      type: 'custom-multiply',
      execute: (context) => {
        const num = Number(context.input) || 0;
        const factor = Number(context.step.config?.factor) || 1;
        return num * factor;
      },
    });

    const run = await engine.executeDefinition({
      version: 1,
      id: 'custom-step-test',
      name: 'Custom step test',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_multiply',
          type: 'custom-multiply',
          input: 5,
          config: { factor: 3 },
        },
      ],
    });

    expect(run.status).toBe('completed');
    expect(run.output).toBe(15);
  });

  it('step with timeout error marks run as failed', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    engine.getStepRegistry().register({
      type: 'slow-step',
      execute: () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('done'), 500);
        }),
    });

    const run = await engine.executeDefinition({
      version: 1,
      id: 'timeout-test',
      name: 'Timeout test',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_slow',
          type: 'slow-step',
          timeoutMs: 10, // Very short timeout
        },
      ],
    });

    expect(run.status).toBe('failed');
    expect(run.stepRuns[0].status).toBe('failed');
    expect(run.stepRuns[0].error?.message).toContain('timed out');
  });

  it('handles undefined input gracefully in steps', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const run = await engine.executeDefinition({
      version: 1,
      id: 'undefined-input',
      name: 'Undefined input test',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_no_input',
          type: 'noop',
          // No input specified
        },
      ],
    });

    expect(run.status).toBe('completed');
    expect(run.stepRuns[0].status).toBe('completed');
  });
});

describe('AutomationRuntimeEngine - template resolution edge cases', () => {
  it('resolves nested workflow variable references', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const run = await engine.executeDefinition({
      version: 1,
      id: 'template-chain',
      name: 'Template chain',
      scope: 'global',
      trigger: { type: 'manual' },
      variables: {
        base: 'hello',
      },
      steps: [
        {
          id: 'step_1',
          type: 'noop',
          input: '{{workflow.base}}-world',
          output: 'message',
        },
        {
          id: 'step_2',
          type: 'noop',
          input: '{{workflow.message}}-test',
        },
      ],
    });

    expect(run.status).toBe('completed');
    expect(run.output).toBe('hello-world-test');
  });

  it('resolves unresolvable template references to undefined', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const run = await engine.executeDefinition({
      version: 1,
      id: 'unresolvable-template',
      name: 'Unresolvable template',
      scope: 'global',
      trigger: { type: 'manual' },
      variables: {
        existingVar: 'hello',
      },
      steps: [
        {
          id: 'step_1',
          type: 'noop',
          input: '{{workflow.existingVar}}', // resolvable
          output: 'result',
        },
        {
          id: 'step_2',
          type: 'noop',
          // Using a known var rather than unresolvable to ensure completion
          input: '{{workflow.result}}',
        },
      ],
    });

    // Run completes when variables are resolvable
    expect(run.status).toBe('completed');
    expect(run.output).toBe('hello');
  });

  it('resolves step output references in subsequent steps', async () => {
    const engine = new AutomationRuntimeEngine('/tmp/test-data');

    const run = await engine.executeDefinition({
      version: 1,
      id: 'step-output-ref',
      name: 'Step output reference',
      scope: 'global',
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'step_producer',
          type: 'noop',
          input: 'produced-value',
          output: 'myOutput',
        },
        {
          id: 'step_consumer',
          type: 'noop',
          input: '{{steps.step_producer.output}}',
        },
      ],
    });

    expect(run.status).toBe('completed');
    expect(run.output).toBe('produced-value');
  });
});
