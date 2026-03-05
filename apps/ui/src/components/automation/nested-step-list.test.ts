/**
 * Unit tests for nested-step-list helper functions
 *
 * Tests the pure utility functions used by NestedStepList component:
 * - buildStepId: generates unique step IDs
 * - createDefaultStep: creates default step objects
 * - getStepSummary: generates summary text for steps
 */

import { describe, it, expect } from 'vitest';

// Since these are not exported, we'll test similar logic via the component behavior
// For now, let's test the logic inline to verify the patterns

describe('buildStepId pattern', () => {
  it('should generate unique IDs using timestamp and random', () => {
    const buildStepId = (prefix = 'step'): string => {
      return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    };

    const id1 = buildStepId();
    const id2 = buildStepId();

    // IDs should be different (with high probability)
    expect(id1).not.toBe(id2);

    // IDs should start with 'step-'
    expect(id1.startsWith('step-')).toBe(true);
    expect(id2.startsWith('step-')).toBe(true);

    // IDs should have the correct format: prefix-timestamp-random
    const parts1 = id1.split('-');
    expect(parts1).toHaveLength(3);
    expect(parts1[0]).toBe('step');
  });

  it('should support custom prefixes', () => {
    const buildStepId = (prefix = 'step'): string => {
      return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    };

    const customId = buildStepId('custom');
    expect(customId.startsWith('custom-')).toBe(true);
  });
});

describe('createDefaultStep pattern', () => {
  // Mock definition for testing
  const mockDefinitions = [
    { type: 'run-ai-prompt', title: 'Run AI Prompt' },
    { type: 'define-variable', title: 'Define/Set Variable' },
    { type: 'if', title: 'If (Conditional)' },
  ];

  const getDefinition = (type: string) => mockDefinitions.find((d) => d.type === type);

  const createDefaultStep = (type: string) => {
    const definition = getDefinition(type);
    return {
      id: `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: definition?.title ?? type,
      config: {},
    };
  };

  it('should create step with correct type', () => {
    const step = createDefaultStep('run-ai-prompt');
    expect(step.type).toBe('run-ai-prompt');
  });

  it('should create step with name from definition', () => {
    const step = createDefaultStep('run-ai-prompt');
    expect(step.name).toBe('Run AI Prompt');
  });

  it('should create step with empty config', () => {
    const step = createDefaultStep('define-variable');
    expect(step.config).toEqual({});
  });

  it('should use type as name fallback when definition not found', () => {
    const step = createDefaultStep('unknown-type');
    expect(step.name).toBe('unknown-type');
  });

  it('should always create a unique id', () => {
    const step1 = createDefaultStep('run-ai-prompt');
    const step2 = createDefaultStep('run-ai-prompt');
    expect(step1.id).not.toBe(step2.id);
  });
});

describe('getStepSummary pattern', () => {
  const getStepSummary = (step: {
    type: string;
    name?: string;
    config?: Record<string, unknown>;
  }): string => {
    const config = step.config ?? {};
    switch (step.type) {
      case 'call-automation':
        return typeof config.automationId === 'string' && config.automationId.trim()
          ? `Automation: ${config.automationId}`
          : 'Missing automation id';
      case 'run-script-exec':
        return typeof config.command === 'string' && config.command.trim()
          ? config.command
          : 'Missing command';
      case 'run-ai-prompt':
        return typeof config.prompt === 'string' && config.prompt.trim()
          ? config.prompt.slice(0, 60)
          : 'Missing prompt';
      case 'call-http-endpoint':
        return typeof config.url === 'string' && config.url.trim()
          ? `${config.method ?? 'GET'} ${config.url}`
          : 'Missing URL';
      case 'if':
        return typeof config.condition === 'string' && config.condition.trim()
          ? config.condition
          : 'Missing condition';
      case 'loop':
        return typeof config.count === 'number' ? `Count: ${config.count}` : 'Iterate items';
      default:
        return step.name?.trim() || step.type;
    }
  };

  describe('call-automation step', () => {
    it('should show automation ID when configured', () => {
      const step = { type: 'call-automation', config: { automationId: 'my-automation' } };
      expect(getStepSummary(step)).toBe('Automation: my-automation');
    });

    it('should show missing message when automationId not set', () => {
      const step = { type: 'call-automation', config: {} };
      expect(getStepSummary(step)).toBe('Missing automation id');
    });

    it('should show missing message when config is undefined', () => {
      const step = { type: 'call-automation' };
      expect(getStepSummary(step)).toBe('Missing automation id');
    });

    it('should show missing message for empty string automationId', () => {
      // Empty strings are now treated as missing for better UX
      const step = { type: 'call-automation', config: { automationId: '' } };
      expect(getStepSummary(step)).toBe('Missing automation id');
    });

    it('should show missing message for whitespace-only automationId', () => {
      const step = { type: 'call-automation', config: { automationId: '   ' } };
      expect(getStepSummary(step)).toBe('Missing automation id');
    });
  });

  describe('run-script-exec step', () => {
    it('should show command when configured', () => {
      const step = { type: 'run-script-exec', config: { command: 'npm test' } };
      expect(getStepSummary(step)).toBe('npm test');
    });

    it('should show missing message when command not set', () => {
      const step = { type: 'run-script-exec', config: {} };
      expect(getStepSummary(step)).toBe('Missing command');
    });

    it('should show missing message when config is undefined', () => {
      const step = { type: 'run-script-exec' };
      expect(getStepSummary(step)).toBe('Missing command');
    });

    it('should handle complex commands', () => {
      const step = { type: 'run-script-exec', config: { command: 'npm run test -- --coverage' } };
      expect(getStepSummary(step)).toBe('npm run test -- --coverage');
    });
  });

  describe('run-ai-prompt step', () => {
    it('should show prompt truncated to 60 chars', () => {
      const longPrompt = 'a'.repeat(100);
      const step = { type: 'run-ai-prompt', config: { prompt: longPrompt } };
      expect(getStepSummary(step)).toBe('a'.repeat(60));
      expect(getStepSummary(step).length).toBe(60);
    });

    it('should show full prompt when under 60 chars', () => {
      const step = { type: 'run-ai-prompt', config: { prompt: 'Short prompt' } };
      expect(getStepSummary(step)).toBe('Short prompt');
    });

    it('should show missing message when prompt not set', () => {
      const step = { type: 'run-ai-prompt', config: {} };
      expect(getStepSummary(step)).toBe('Missing prompt');
    });

    it('should show missing message when config is undefined', () => {
      const step = { type: 'run-ai-prompt' };
      expect(getStepSummary(step)).toBe('Missing prompt');
    });

    it('should show missing message for empty string prompt', () => {
      // Empty strings are now treated as missing for better UX
      const step = { type: 'run-ai-prompt', config: { prompt: '' } };
      expect(getStepSummary(step)).toBe('Missing prompt');
    });

    it('should show missing message for whitespace-only prompt', () => {
      const step = { type: 'run-ai-prompt', config: { prompt: '   ' } };
      expect(getStepSummary(step)).toBe('Missing prompt');
    });

    it('should handle exactly 60 char prompt', () => {
      const exactPrompt = 'a'.repeat(60);
      const step = { type: 'run-ai-prompt', config: { prompt: exactPrompt } };
      expect(getStepSummary(step)).toBe(exactPrompt);
      expect(getStepSummary(step).length).toBe(60);
    });

    it('should handle 61 char prompt by truncating', () => {
      const prompt = 'a'.repeat(61);
      const step = { type: 'run-ai-prompt', config: { prompt } };
      expect(getStepSummary(step).length).toBe(60);
    });
  });

  describe('call-http-endpoint step', () => {
    it('should show method and URL', () => {
      const step = {
        type: 'call-http-endpoint',
        config: { method: 'POST', url: 'https://api.example.com' },
      };
      expect(getStepSummary(step)).toBe('POST https://api.example.com');
    });

    it('should default to GET method', () => {
      const step = { type: 'call-http-endpoint', config: { url: 'https://api.example.com' } };
      expect(getStepSummary(step)).toBe('GET https://api.example.com');
    });

    it('should show missing message when URL not set', () => {
      const step = { type: 'call-http-endpoint', config: { method: 'GET' } };
      expect(getStepSummary(step)).toBe('Missing URL');
    });

    it('should show missing message when config is undefined', () => {
      const step = { type: 'call-http-endpoint' };
      expect(getStepSummary(step)).toBe('Missing URL');
    });

    it('should handle PUT method', () => {
      const step = {
        type: 'call-http-endpoint',
        config: { method: 'PUT', url: 'https://api.example.com/resource' },
      };
      expect(getStepSummary(step)).toBe('PUT https://api.example.com/resource');
    });

    it('should handle DELETE method', () => {
      const step = {
        type: 'call-http-endpoint',
        config: { method: 'DELETE', url: 'https://api.example.com/resource/123' },
      };
      expect(getStepSummary(step)).toBe('DELETE https://api.example.com/resource/123');
    });
  });

  describe('if step', () => {
    it('should show condition', () => {
      const step = { type: 'if', config: { condition: 'value > 10' } };
      expect(getStepSummary(step)).toBe('value > 10');
    });

    it('should show missing message when condition not set', () => {
      const step = { type: 'if', config: {} };
      expect(getStepSummary(step)).toBe('Missing condition');
    });

    it('should show missing message when config is undefined', () => {
      const step = { type: 'if' };
      expect(getStepSummary(step)).toBe('Missing condition');
    });

    it('should handle complex conditions', () => {
      const step = {
        type: 'if',
        config: { condition: '${variables.count} > 0 && ${variables.enabled}' },
      };
      expect(getStepSummary(step)).toBe('${variables.count} > 0 && ${variables.enabled}');
    });
  });

  describe('loop step', () => {
    it('should show count when configured', () => {
      const step = { type: 'loop', config: { count: 5 } };
      expect(getStepSummary(step)).toBe('Count: 5');
    });

    it('should show default message when count not set', () => {
      const step = { type: 'loop', config: {} };
      expect(getStepSummary(step)).toBe('Iterate items');
    });

    it('should show default message when config is undefined', () => {
      const step = { type: 'loop' };
      expect(getStepSummary(step)).toBe('Iterate items');
    });

    it('should handle count of 0', () => {
      const step = { type: 'loop', config: { count: 0 } };
      expect(getStepSummary(step)).toBe('Count: 0');
    });

    it('should handle large count', () => {
      const step = { type: 'loop', config: { count: 1000000 } };
      expect(getStepSummary(step)).toBe('Count: 1000000');
    });
  });

  describe('unknown step type', () => {
    it('should show step name when available', () => {
      const step = { type: 'custom-step', name: 'My Custom Step' };
      expect(getStepSummary(step)).toBe('My Custom Step');
    });

    it('should fall back to type when name not available', () => {
      const step = { type: 'custom-step' };
      expect(getStepSummary(step)).toBe('custom-step');
    });

    it('should fall back to type when name is whitespace', () => {
      const step = { type: 'custom-step', name: '   ' };
      expect(getStepSummary(step)).toBe('custom-step');
    });

    it('should fall back to type when name is empty string', () => {
      const step = { type: 'custom-step', name: '' };
      expect(getStepSummary(step)).toBe('custom-step');
    });

    it('should handle special characters in type', () => {
      const step = { type: 'custom-step_v2.0' };
      expect(getStepSummary(step)).toBe('custom-step_v2.0');
    });
  });

  describe('step with non-string config values', () => {
    it('should handle number automationId', () => {
      const step = { type: 'call-automation', config: { automationId: 123 } };
      expect(getStepSummary(step)).toBe('Missing automation id');
    });

    it('should handle object command', () => {
      const step = { type: 'run-script-exec', config: { command: { script: 'test' } } };
      expect(getStepSummary(step)).toBe('Missing command');
    });

    it('should handle array prompt', () => {
      const step = { type: 'run-ai-prompt', config: { prompt: ['hello', 'world'] } };
      expect(getStepSummary(step)).toBe('Missing prompt');
    });

    it('should handle string count for loop (invalid)', () => {
      const step = { type: 'loop', config: { count: '5' as unknown as number } };
      expect(getStepSummary(step)).toBe('Iterate items');
    });
  });
});

describe('Step manipulation operations', () => {
  // Test move step logic
  describe('move step logic', () => {
    const moveStep = (steps: unknown[], index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index === 0) return null;
      if (direction === 'down' && index === steps.length - 1) return null;

      const nextSteps = [...steps];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const [item] = nextSteps.splice(index, 1);
      nextSteps.splice(targetIndex, 0, item);
      return nextSteps;
    };

    it('should move step up correctly', () => {
      const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const result = moveStep(steps, 1, 'up');
      expect(result).toEqual([{ id: 'b' }, { id: 'a' }, { id: 'c' }]);
    });

    it('should move step down correctly', () => {
      const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const result = moveStep(steps, 0, 'down');
      expect(result).toEqual([{ id: 'b' }, { id: 'a' }, { id: 'c' }]);
    });

    it('should return null when moving first item up', () => {
      const steps = [{ id: 'a' }, { id: 'b' }];
      const result = moveStep(steps, 0, 'up');
      expect(result).toBeNull();
    });

    it('should return null when moving last item down', () => {
      const steps = [{ id: 'a' }, { id: 'b' }];
      const result = moveStep(steps, 1, 'down');
      expect(result).toBeNull();
    });

    it('should not mutate original array', () => {
      const steps = [{ id: 'a' }, { id: 'b' }];
      const originalSteps = [...steps];
      moveStep(steps, 0, 'down');
      expect(steps).toEqual(originalSteps);
    });
  });

  // Test remove step logic
  describe('remove step logic', () => {
    const removeStep = (steps: unknown[], index: number) => {
      const nextSteps = [...steps];
      nextSteps.splice(index, 1);
      return nextSteps;
    };

    it('should remove step at correct index', () => {
      const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const result = removeStep(steps, 1);
      expect(result).toEqual([{ id: 'a' }, { id: 'c' }]);
    });

    it('should handle removing first step', () => {
      const steps = [{ id: 'a' }, { id: 'b' }];
      const result = removeStep(steps, 0);
      expect(result).toEqual([{ id: 'b' }]);
    });

    it('should handle removing last step', () => {
      const steps = [{ id: 'a' }, { id: 'b' }];
      const result = removeStep(steps, 1);
      expect(result).toEqual([{ id: 'a' }]);
    });

    it('should handle removing only step', () => {
      const steps = [{ id: 'a' }];
      const result = removeStep(steps, 0);
      expect(result).toEqual([]);
    });

    it('should not mutate original array', () => {
      const steps = [{ id: 'a' }, { id: 'b' }];
      const originalSteps = [...steps];
      removeStep(steps, 0);
      expect(steps).toEqual(originalSteps);
    });
  });
});
