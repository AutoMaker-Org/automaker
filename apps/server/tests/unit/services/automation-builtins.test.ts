import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AutomationStep,
  AutomationStepExecutionContext,
  AutomationStepExecutor,
  AutomationVariableValue,
} from '@automaker/types';
import { registerAutomationBuiltins } from '@/services/automation-builtins.js';
import { simpleQuery } from '@/providers/simple-query-service.js';
import { FeatureLoader } from '@/services/feature-loader.js';

vi.mock('@/providers/simple-query-service.js', () => ({
  simpleQuery: vi.fn(),
}));

const mockFeatureLoader = {
  create: vi.fn(),
  load: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  getImagePath: vi.fn(),
  getImagePaths: vi.fn(),
  ensureDirectory: vi.fn(),
};

class TestRegistry {
  private readonly executors = new Map<string, AutomationStepExecutor>();

  register(executor: AutomationStepExecutor): void {
    this.executors.set(executor.type, executor);
  }

  get(type: string): AutomationStepExecutor | undefined {
    return this.executors.get(type);
  }
}

function createContext(
  overrides: Partial<AutomationStepExecutionContext> & {
    step: AutomationStep;
    input?: unknown;
  }
): AutomationStepExecutionContext {
  const workflowVariables: Record<string, AutomationVariableValue> = {};
  return {
    runId: 'run_test',
    automationId: 'automation_test',
    step: overrides.step,
    input: overrides.input,
    previousOutput: overrides.previousOutput,
    variables: overrides.variables ?? {
      system: {},
      project: {},
      workflow: workflowVariables,
      steps: {},
    },
    setWorkflowVariable:
      overrides.setWorkflowVariable ??
      ((name: string, value: AutomationVariableValue | unknown) => {
        workflowVariables[name] = value as AutomationVariableValue;
      }),
    ...overrides,
  };
}

describe('automation-builtins.ts', () => {
  beforeEach(() => {
    vi.mocked(simpleQuery).mockReset();
    vi.mocked(mockFeatureLoader.create).mockReset();
  });

  it('registers all built-in step executors', () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    expect(registry.get('create-feature')).toBeDefined();
    expect(registry.get('manage-feature')).toBeDefined();
    expect(registry.get('run-ai-prompt')).toBeDefined();
    expect(registry.get('run-typescript-code')).toBeDefined();
    expect(registry.get('define-variable')).toBeDefined();
    expect(registry.get('set-variable')).toBeDefined();
    expect(registry.get('call-http-endpoint')).toBeDefined();
    expect(registry.get('run-script-exec')).toBeDefined();
    expect(registry.get('emit-event')).toBeDefined();
    expect(registry.get('if')).toBeDefined();
    expect(registry.get('loop')).toBeDefined();
    expect(registry.get('call-automation')).toBeDefined();
  });

  it('uses simpleQuery in run-ai-prompt and maps output shape', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    vi.mocked(simpleQuery).mockResolvedValue({
      text: 'ai-result',
      structured_output: { rating: 5 },
    });

    const output = await registry.get('run-ai-prompt')!.execute(
      createContext({
        step: {
          id: 'ai_1',
          type: 'run-ai-prompt',
          config: { prompt: 'summarize', model: 'claude-sonnet-4-6' },
        },
      })
    );

    expect(output).toEqual({
      text: 'ai-result',
      structuredOutput: { rating: 5 },
    });
    expect(simpleQuery).toHaveBeenCalledTimes(1);
  });

  it('executes run-typescript-code and exposes workflow/project variables and setVariable', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    const workflow: Record<string, AutomationVariableValue> = { greeting: 'hello' };
    const output = await registry.get('run-typescript-code')!.execute(
      createContext({
        step: {
          id: 'ts_1',
          type: 'run-typescript-code',
          config: {
            code: `
setVariable('fromScript', workflow.greeting + '-world');
return { message: workflow.greeting, path: project.path };
            `,
          },
        },
        input: { ignored: true },
        variables: {
          system: {},
          project: { path: '/tmp/project' },
          workflow,
          steps: {},
        },
        setWorkflowVariable: (name, value) => {
          workflow[name] = value as AutomationVariableValue;
        },
      })
    );

    expect(output).toEqual({ message: 'hello', path: '/tmp/project' });
    expect(workflow.fromScript).toBe('hello-world');
  });

  it('supports define-variable map mode with defineOnly', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    const workflow: Record<string, AutomationVariableValue> = {
      existing: 'keep',
    };

    await registry.get('define-variable')!.execute(
      createContext({
        step: {
          id: 'var_1',
          type: 'define-variable',
          config: {
            defineOnly: true,
            values: {
              existing: 'overwrite-attempt',
              created: 'new-value',
            },
          },
        },
        variables: {
          system: {},
          project: {},
          workflow,
          steps: {},
        },
        setWorkflowVariable: (name, value) => {
          workflow[name] = value as AutomationVariableValue;
        },
      })
    );

    expect(workflow.existing).toBe('keep');
    expect(workflow.created).toBe('new-value');
  });

  it('supports set-variable alias to define-variable', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    const workflow: Record<string, AutomationVariableValue> = {};
    const output = await registry.get('set-variable')!.execute(
      createContext({
        step: {
          id: 'var_2',
          type: 'set-variable',
          config: { name: 'answer', value: 42 },
        },
        variables: {
          system: {},
          project: {},
          workflow,
          steps: {},
        },
        setWorkflowVariable: (name, value) => {
          workflow[name] = value as AutomationVariableValue;
        },
      })
    );

    expect(output).toBe(42);
    expect(workflow.answer).toBe(42);
  });

  it('supports define-variable with string value', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    const workflow: Record<string, AutomationVariableValue> = {};
    const output = await registry.get('define-variable')!.execute(
      createContext({
        step: {
          id: 'var_string',
          type: 'define-variable',
          config: { name: 'myString', value: 'hello-world' },
        },
        variables: {
          system: {},
          project: {},
          workflow,
          steps: {},
        },
        setWorkflowVariable: (name, value) => {
          workflow[name] = value as AutomationVariableValue;
        },
      })
    );

    expect(output).toBe('hello-world');
    expect(workflow.myString).toBe('hello-world');
  });

  it('supports define-variable with object value', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    const workflow: Record<string, AutomationVariableValue> = {};
    const complexValue = { nested: { key: 'value' }, array: [1, 2, 3] };

    const output = await registry.get('define-variable')!.execute(
      createContext({
        step: {
          id: 'var_object',
          type: 'define-variable',
          config: { name: 'myObject', value: complexValue },
        },
        variables: {
          system: {},
          project: {},
          workflow,
          steps: {},
        },
        setWorkflowVariable: (name, value) => {
          workflow[name] = value as AutomationVariableValue;
        },
      })
    );

    expect(output).toEqual(complexValue);
    expect(workflow.myObject).toEqual(complexValue);
  });

  it('supports define-variable with array value', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    const workflow: Record<string, AutomationVariableValue> = {};
    const arrayValue = ['item1', 'item2', 'item3'];

    const output = await registry.get('define-variable')!.execute(
      createContext({
        step: {
          id: 'var_array',
          type: 'define-variable',
          config: { name: 'myArray', value: arrayValue },
        },
        variables: {
          system: {},
          project: {},
          workflow,
          steps: {},
        },
        setWorkflowVariable: (name, value) => {
          workflow[name] = value as AutomationVariableValue;
        },
      })
    );

    expect(output).toEqual(arrayValue);
    expect(workflow.myArray).toEqual(arrayValue);
  });

  it('supports define-variable with bulk values containing variable syntax', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    const workflow: Record<string, AutomationVariableValue> = {};

    await registry.get('define-variable')!.execute(
      createContext({
        step: {
          id: 'var_bulk',
          type: 'define-variable',
          config: {
            values: {
              var1: 'static-value',
              var2: '{{system.projectName}}',
              var3: 42,
            },
          },
        },
        variables: {
          system: { projectName: 'test-project' },
          project: {},
          workflow,
          steps: {},
        },
        setWorkflowVariable: (name, value) => {
          workflow[name] = value as AutomationVariableValue;
        },
      })
    );

    // Note: Variable interpolation happens at runtime engine level, not in the step itself
    // The step just stores the raw values
    expect(workflow.var1).toBe('static-value');
    expect(workflow.var2).toBe('{{system.projectName}}');
    expect(workflow.var3).toBe(42);
  });

  it('supports define-variable with defineOnly preventing overwrite', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    const workflow: Record<string, AutomationVariableValue> = {
      existingVar: 'original-value',
    };

    // First, try to overwrite with defineOnly: true - should NOT overwrite
    await registry.get('define-variable')!.execute(
      createContext({
        step: {
          id: 'var_define_only',
          type: 'define-variable',
          config: {
            name: 'existingVar',
            value: 'new-value',
            defineOnly: true,
          },
        },
        variables: {
          system: {},
          project: {},
          workflow,
          steps: {},
        },
        setWorkflowVariable: (name, value) => {
          workflow[name] = value as AutomationVariableValue;
        },
      })
    );

    // Should keep original value
    expect(workflow.existingVar).toBe('original-value');

    // Now without defineOnly - should overwrite
    await registry.get('define-variable')!.execute(
      createContext({
        step: {
          id: 'var_overwrite',
          type: 'define-variable',
          config: {
            name: 'existingVar',
            value: 'new-value',
          },
        },
        variables: {
          system: {},
          project: {},
          workflow,
          steps: {},
        },
        setWorkflowVariable: (name, value) => {
          workflow[name] = value as AutomationVariableValue;
        },
      })
    );

    expect(workflow.existingVar).toBe('new-value');
  });

  it('throws on unsupported manage-feature action', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    await expect(
      registry.get('manage-feature')!.execute(
        createContext({
          step: {
            id: 'feature_1',
            type: 'manage-feature',
            config: { action: 'pause', featureId: 'f1' },
          },
          projectPath: '/tmp/project',
        }) as AutomationStepExecutionContext
      )
    ).rejects.toThrow('Unsupported manage-feature action: pause');
  });

  it('throws for recursive call-automation execution', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    await expect(
      registry.get('call-automation')!.execute(
        createContext({
          automationId: 'parent-automation',
          step: {
            id: 'call_1',
            type: 'call-automation',
            config: { automationId: 'parent-automation' },
          },
          executeAutomationById: vi.fn(),
        }) as AutomationStepExecutionContext
      )
    ).rejects.toThrow('call-automation cannot recursively call the current automation');
  });

  it('rejects unsupported HTTP methods in call-http-endpoint', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    await expect(
      registry.get('call-http-endpoint')!.execute(
        createContext({
          step: {
            id: 'http_1',
            type: 'call-http-endpoint',
            config: {
              method: 'HEAD',
              url: 'https://example.com',
            },
          },
        })
      )
    ).rejects.toThrow(
      'Unsupported HTTP method "HEAD". Supported methods: GET, POST, PUT, PATCH, DELETE'
    );
  });

  it('resolves templated nested config for flow steps', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    const nestedThenSteps: AutomationStep[] = [
      {
        id: 'nested_then',
        type: 'noop',
      },
    ];
    const nestedLoopSteps: AutomationStep[] = [
      {
        id: 'nested_loop',
        type: 'noop',
      },
    ];

    const executeSteps = vi.fn(async (steps: AutomationStep[]) => steps.length);
    const resolveTemplate = (value: unknown) => {
      if (value === '{{workflow.thenSteps}}') {
        return nestedThenSteps;
      }
      if (value === '{{workflow.loopSteps}}') {
        return nestedLoopSteps;
      }
      if (typeof value !== 'object' || value === null) return value;
      const record = value as Record<string, unknown>;

      return {
        ...record,
        thenSteps:
          record.thenSteps === '{{workflow.thenSteps}}' ? nestedThenSteps : record.thenSteps,
        steps: record.steps === '{{workflow.loopSteps}}' ? nestedLoopSteps : record.steps,
      };
    };

    const ifResult = await registry.get('if')!.execute(
      createContext({
        step: {
          id: 'if_1',
          type: 'if',
          config: { condition: true, thenSteps: '{{workflow.thenSteps}}' },
        },
        resolveTemplate,
        executeSteps,
      })
    );
    const loopResult = await registry.get('loop')!.execute(
      createContext({
        step: {
          id: 'loop_2',
          type: 'loop',
          config: { count: 2, steps: '{{workflow.loopSteps}}' },
        },
        resolveTemplate,
        executeSteps,
      })
    );

    expect(ifResult).toBe(1);
    expect(loopResult).toEqual({
      iterations: 2,
      outputs: [1, 1],
      lastOutput: 1,
    });
  });

  it('validates loop configuration when items and count are both missing', async () => {
    const registry = new TestRegistry();
    registerAutomationBuiltins(registry);

    await expect(
      registry.get('loop')!.execute(
        createContext({
          step: {
            id: 'loop_1',
            type: 'loop',
            config: {
              steps: [{ id: 'nested', type: 'noop' }],
            },
          },
          executeSteps: vi.fn(),
        }) as AutomationStepExecutionContext
      )
    ).rejects.toThrow('loop requires config.items array or config.count number');
  });

  describe('create-feature step', () => {
    it('creates a feature with default settings when make is not specified', async () => {
      const registry = new TestRegistry();
      registerAutomationBuiltins(registry, mockFeatureLoader as unknown as FeatureLoader);

      vi.mocked(mockFeatureLoader.create).mockResolvedValue({
        id: 'test-feature',
        title: 'Test Feature',
        status: 'todo',
      } as any);

      await registry.get('create-feature')!.execute(
        createContext({
          step: {
            id: 'create_1',
            type: 'create-feature',
            config: {
              id: 'test-feature',
              title: 'Test Feature',
              description: 'A test feature',
              category: 'Testing',
            },
          },
          projectPath: '/tmp/test-project',
        }) as AutomationStepExecutionContext
      );

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/tmp/test-project',
        expect.objectContaining({
          id: 'test-feature',
          title: 'Test Feature',
          description: 'A test feature',
          category: 'Testing',
        })
      );
    });

    it('creates a feature with running status when make is true', async () => {
      const registry = new TestRegistry();
      registerAutomationBuiltins(registry, mockFeatureLoader as unknown as FeatureLoader);

      const createdFeature = {
        id: 'test-feature',
        title: 'Test Feature',
        status: 'running',
        startedAt: expect.any(String),
      };
      vi.mocked(mockFeatureLoader.create).mockResolvedValue(createdFeature as any);

      await registry.get('create-feature')!.execute(
        createContext({
          step: {
            id: 'create_2',
            type: 'create-feature',
            config: {
              id: 'test-feature',
              title: 'Test Feature',
              make: true,
            },
          },
          projectPath: '/tmp/test-project',
        }) as AutomationStepExecutionContext
      );

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/tmp/test-project',
        expect.objectContaining({
          id: 'test-feature',
          title: 'Test Feature',
          status: 'running',
          startedAt: expect.any(String),
        })
      );
    });

    it('does not set running status when make is false', async () => {
      const registry = new TestRegistry();
      registerAutomationBuiltins(registry, mockFeatureLoader as unknown as FeatureLoader);

      vi.mocked(mockFeatureLoader.create).mockResolvedValue({
        id: 'test-feature',
        title: 'Test Feature',
        status: 'todo',
      } as any);

      await registry.get('create-feature')!.execute(
        createContext({
          step: {
            id: 'create_3',
            type: 'create-feature',
            config: {
              id: 'test-feature',
              title: 'Test Feature',
              make: false,
            },
          },
          projectPath: '/tmp/test-project',
        }) as AutomationStepExecutionContext
      );

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/tmp/test-project',
        expect.objectContaining({
          id: 'test-feature',
          title: 'Test Feature',
        })
      );
      // Should not have startedAt when make is false
      const callArgs = vi.mocked(mockFeatureLoader.create).mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('startedAt');
    });

    it('respects explicit status config even when make is true', async () => {
      const registry = new TestRegistry();
      registerAutomationBuiltins(registry, mockFeatureLoader as unknown as FeatureLoader);

      vi.mocked(mockFeatureLoader.create).mockResolvedValue({
        id: 'test-feature',
        title: 'Test Feature',
        status: 'in_progress',
      } as any);

      await registry.get('create-feature')!.execute(
        createContext({
          step: {
            id: 'create_4',
            type: 'create-feature',
            config: {
              id: 'test-feature',
              title: 'Test Feature',
              status: 'in_progress',
              make: true,
            },
          },
          projectPath: '/tmp/test-project',
        }) as AutomationStepExecutionContext
      );

      // When both status and make are specified, make takes precedence
      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/tmp/test-project',
        expect.objectContaining({
          id: 'test-feature',
          title: 'Test Feature',
          status: 'running', // make takes precedence
          startedAt: expect.any(String),
        })
      );
    });
  });
});
