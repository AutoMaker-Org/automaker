/**
 * Unit tests for suggested automation templates
 */

import { describe, it, expect } from 'vitest';
import {
  SUGGESTED_AUTOMATIONS,
  SUGGESTED_AUTOMATION_CATEGORIES,
  type SuggestedAutomationCategoryFilter,
} from './suggested-automations';

describe('SUGGESTED_AUTOMATIONS', () => {
  it('should contain at least one automation template', () => {
    expect(SUGGESTED_AUTOMATIONS.length).toBeGreaterThan(0);
  });

  it('should have unique IDs for all suggestions', () => {
    const ids = SUGGESTED_AUTOMATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have non-empty required fields for every suggestion', () => {
    for (const suggestion of SUGGESTED_AUTOMATIONS) {
      expect(suggestion.id.trim()).not.toBe('');
      expect(suggestion.icon.trim()).not.toBe('');
      expect(suggestion.name.trim()).not.toBe('');
      expect(suggestion.description.trim()).not.toBe('');
      expect(suggestion.category).toBeTruthy();
    }
  });

  it('should only use valid categories', () => {
    const validCategories = new Set([
      'development',
      'quality',
      'reporting',
      'maintenance',
      'workflow',
    ]);
    for (const suggestion of SUGGESTED_AUTOMATIONS) {
      expect(validCategories.has(suggestion.category)).toBe(true);
    }
  });

  it('should have at least one suggestion per category', () => {
    const categorySet = new Set(SUGGESTED_AUTOMATIONS.map((s) => s.category));
    expect(categorySet.has('development')).toBe(true);
    expect(categorySet.has('quality')).toBe(true);
    expect(categorySet.has('reporting')).toBe(true);
    expect(categorySet.has('maintenance')).toBe(true);
    expect(categorySet.has('workflow')).toBe(true);
  });

  describe('buildDefinition', () => {
    it('should return a valid definition for every suggestion', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('test-123');

        expect(definition.id).toBe('test-123');
        expect(definition.name.trim()).not.toBe('');
        expect(typeof definition.enabled).toBe('boolean');
        expect(definition.trigger).toBeDefined();
        expect(definition.trigger.type).toBeTruthy();
        expect(Array.isArray(definition.steps)).toBe(true);
        expect(definition.steps.length).toBeGreaterThan(0);
      }
    });

    it('should use the provided nextId as the automation ID', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const def1 = suggestion.buildDefinition('42');
        const def2 = suggestion.buildDefinition('custom-id');

        expect(def1.id).toBe('42');
        expect(def2.id).toBe('custom-id');
      }
    });

    it('should generate unique step IDs within each definition', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');
        const stepIds = definition.steps.map((step) => step.id);
        const uniqueStepIds = new Set(stepIds);

        expect(uniqueStepIds.size).toBe(stepIds.length);
      }
    });

    it('should generate deterministic sequential step IDs (step-1, step-2, ...)', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');

        definition.steps.forEach((step, index) => {
          expect(step.id).toBe(`step-${index + 1}`);
        });
      }
    });

    it('should produce consistent step IDs across multiple calls', () => {
      const suggestion = SUGGESTED_AUTOMATIONS[0];
      const def1 = suggestion.buildDefinition('1');
      const def2 = suggestion.buildDefinition('1');

      const ids1 = def1.steps.map((s) => s.id);
      const ids2 = def2.steps.map((s) => s.id);

      expect(ids1).toEqual(ids2);
    });

    it('should produce steps with valid required fields', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');

        for (const step of definition.steps) {
          expect(step.id).toBeTruthy();
          expect(step.type).toBeTruthy();
          expect(typeof step.name).toBe('string');
          expect(step.name!.trim()).not.toBe('');
          expect(step.config).toBeDefined();
        }
      }
    });

    it('should not include version or scope fields (they are omitted)', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');

        expect((definition as Record<string, unknown>).version).toBeUndefined();
        expect((definition as Record<string, unknown>).scope).toBeUndefined();
      }
    });

    it('should produce valid trigger configurations', () => {
      const validTriggerTypes = new Set(['manual', 'event', 'schedule', 'webhook', 'date']);

      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');
        expect(validTriggerTypes.has(definition.trigger.type)).toBe(true);

        if (definition.trigger.type === 'schedule') {
          expect(definition.trigger.cron).toBeTruthy();
        }

        if (definition.trigger.type === 'event') {
          expect(definition.trigger.event).toBeTruthy();
        }
      }
    });

    it('should use valid step types', () => {
      const validStepTypes = new Set([
        'create-feature',
        'manage-feature',
        'run-ai-prompt',
        'run-typescript-code',
        'define-variable',
        'set-variable',
        'call-http-endpoint',
        'run-script-exec',
        'emit-event',
        'if',
        'loop',
        'call-automation',
        'git-status',
        'git-branch',
        'git-commit',
        'git-push',
        'git-pull',
        'git-checkout',
        'start-auto-mode',
        'stop-auto-mode',
        'get-auto-mode-status',
        'set-auto-mode-concurrency',
      ]);

      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');
        for (const step of definition.steps) {
          expect(
            validStepTypes.has(step.type),
            `Suggestion "${suggestion.id}" has invalid step type "${step.type}"`
          ).toBe(true);
        }
      }
    });

    it('should have template variable references that match step IDs', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');
        const stepIds = new Set(definition.steps.map((s) => s.id));

        for (const step of definition.steps) {
          const configStr = JSON.stringify(step.config ?? {});
          const refs = [...configStr.matchAll(/\{\{steps\.([^.}]+)\.output\}\}/g)];

          for (const ref of refs) {
            expect(
              stepIds.has(ref[1]),
              `Suggestion "${suggestion.id}" step "${step.id}" references non-existent step "${ref[1]}"`
            ).toBe(true);
          }
        }
      }
    });
  });

  describe('specific template validations', () => {
    function findSuggestion(id: string) {
      const found = SUGGESTED_AUTOMATIONS.find((s) => s.id === id);
      expect(found).toBeDefined();
      return found!;
    }

    it('bug scanner should have schedule trigger and run-script-exec + run-ai-prompt steps', () => {
      const definition = findSuggestion('scan-recent-commits').buildDefinition('1');

      expect(definition.trigger.type).toBe('schedule');
      expect(definition.steps.length).toBe(2);
      expect(definition.steps[0].type).toBe('run-script-exec');
      expect(definition.steps[1].type).toBe('run-ai-prompt');
    });

    it('release notes drafter should have 3 steps: 2 script + 1 ai', () => {
      const definition = findSuggestion('draft-release-notes').buildDefinition('1');

      expect(definition.trigger.type).toBe('schedule');
      expect(definition.steps.length).toBe(3);
      expect(definition.steps[0].type).toBe('run-script-exec');
      expect(definition.steps[1].type).toBe('run-script-exec');
      expect(definition.steps[2].type).toBe('run-ai-prompt');
    });

    it('auto-create feature on event should use event trigger and create-feature step', () => {
      const definition = findSuggestion('feature-on-event').buildDefinition('1');

      expect(definition.trigger.type).toBe('event');
      expect(definition.trigger.event).toBe('feature_created');
      expect(definition.enabled).toBe(false);
      expect(definition.steps.length).toBe(1);
      expect(definition.steps[0].type).toBe('create-feature');
    });

    it('pre-release checklist should have manual trigger and 4 steps', () => {
      const definition = findSuggestion('pre-release-checklist').buildDefinition('1');

      expect(definition.trigger.type).toBe('manual');
      expect(definition.steps.length).toBe(4);
      expect(definition.steps[0].type).toBe('run-script-exec');
      expect(definition.steps[1].type).toBe('run-script-exec');
      expect(definition.steps[2].type).toBe('run-script-exec');
      expect(definition.steps[3].type).toBe('run-ai-prompt');
    });

    it('event-triggered automations should default to disabled', () => {
      const eventTriggered = SUGGESTED_AUTOMATIONS.filter((s) => {
        const def = s.buildDefinition('1');
        return def.trigger.type === 'event';
      });

      expect(eventTriggered.length).toBeGreaterThan(0);
      for (const suggestion of eventTriggered) {
        const def = suggestion.buildDefinition('1');
        expect(
          def.enabled,
          `Event-triggered suggestion "${suggestion.id}" should default to disabled`
        ).toBe(false);
      }
    });

    it('error handler should create a fix feature on failure', () => {
      const definition = findSuggestion('error-handler').buildDefinition('1');

      expect(definition.trigger.type).toBe('event');
      expect(definition.trigger.event).toBe('feature_error');
      expect(definition.steps[0].type).toBe('create-feature');
      expect(definition.steps[0].config?.make).toBe(false);
    });

    it('run-script-exec steps should have a command in config', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');
        for (const step of definition.steps) {
          if (step.type === 'run-script-exec') {
            expect(
              typeof step.config?.command,
              `Script step in "${suggestion.id}" should have a command string`
            ).toBe('string');
            expect((step.config!.command as string).trim()).not.toBe('');
          }
        }
      }
    });

    it('run-ai-prompt steps should have a prompt in config', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');
        for (const step of definition.steps) {
          if (step.type === 'run-ai-prompt') {
            expect(
              typeof step.config?.prompt,
              `AI prompt step in "${suggestion.id}" should have a prompt string`
            ).toBe('string');
            expect((step.config!.prompt as string).trim()).not.toBe('');
          }
        }
      }
    });

    it('run-ai-prompt steps should use the provided default model when given', () => {
      const defaultModel = { model: 'claude-opus', thinkingLevel: 'adaptive' as const };
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1', defaultModel);
        for (const step of definition.steps) {
          if (step.type === 'run-ai-prompt') {
            expect(
              step.config?.model,
              `AI prompt step in "${suggestion.id}" should have the default model set`
            ).toEqual(defaultModel);
          }
        }
      }
    });

    it('run-ai-prompt steps should not have a model when no default model is provided', () => {
      for (const suggestion of SUGGESTED_AUTOMATIONS) {
        const definition = suggestion.buildDefinition('1');
        for (const step of definition.steps) {
          if (step.type === 'run-ai-prompt') {
            expect(
              step.config?.model,
              `AI prompt step in "${suggestion.id}" should not have a model when no default is provided`
            ).toBeUndefined();
          }
        }
      }
    });
  });
});

describe('SUGGESTED_AUTOMATION_CATEGORIES', () => {
  it('should include the "all" filter option', () => {
    const allCategory = SUGGESTED_AUTOMATION_CATEGORIES.find((c) => c.id === 'all');
    expect(allCategory).toBeDefined();
    expect(allCategory!.label).toBe('All');
  });

  it('should include all categories used by suggestions', () => {
    const categoryIds = new Set(SUGGESTED_AUTOMATION_CATEGORIES.map((c) => c.id));
    const usedCategories = new Set(SUGGESTED_AUTOMATIONS.map((s) => s.category));

    for (const used of usedCategories) {
      expect(
        categoryIds.has(used),
        `Category "${used}" used by suggestions but missing from SUGGESTED_AUTOMATION_CATEGORIES`
      ).toBe(true);
    }
  });

  it('should have unique IDs and non-empty labels', () => {
    const ids = SUGGESTED_AUTOMATION_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const category of SUGGESTED_AUTOMATION_CATEGORIES) {
      expect(category.label.trim()).not.toBe('');
    }
  });
});

describe('SuggestedAutomationCategoryFilter type', () => {
  it('should accept all valid category filter values', () => {
    const validFilters: SuggestedAutomationCategoryFilter[] = [
      'all',
      'development',
      'quality',
      'reporting',
      'maintenance',
      'workflow',
    ];
    expect(validFilters.length).toBe(SUGGESTED_AUTOMATION_CATEGORIES.length);
  });
});

describe('category filtering', () => {
  it('should correctly filter suggestions by each category', () => {
    const categories = ['development', 'quality', 'reporting', 'maintenance', 'workflow'] as const;

    for (const category of categories) {
      const filtered = SUGGESTED_AUTOMATIONS.filter((s) => s.category === category);
      expect(
        filtered.length,
        `Category "${category}" should have at least one suggestion`
      ).toBeGreaterThan(0);
      for (const s of filtered) {
        expect(s.category).toBe(category);
      }
    }
  });

  it('should return all suggestions when no filter is applied', () => {
    const filtered = SUGGESTED_AUTOMATIONS.filter(() => true);
    expect(filtered.length).toBe(SUGGESTED_AUTOMATIONS.length);
  });
});
