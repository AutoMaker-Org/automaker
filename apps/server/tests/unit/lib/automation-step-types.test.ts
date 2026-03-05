/**
 * Unit tests for Automation Step Type Definitions
 *
 * Tests that step type definitions in @automaker/types are:
 * - Complete with all required properties
 * - Properly categorized
 * - Have valid config schemas
 * - Include all expected step types for the dropdown UI
 *
 * Feature: Make the step add button show a dropdown with the step types
 */

import { describe, expect, it } from 'vitest';
import { AUTOMATION_BUILTIN_STEP_TYPES } from '@automaker/types';

// Expected step types - must match the dropdown UI options
const EXPECTED_STEP_TYPES = [
  'create-feature',
  'manage-feature',
  'run-ai-prompt',
  'run-typescript-code',
  'define-variable',
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
];

// Expected categories
const EXPECTED_CATEGORIES = [
  'features',
  'ai',
  'variables',
  'integrations',
  'flow',
  'git',
  'auto-mode',
];

describe('Automation Step Type Definitions', () => {
  describe('Step Type Completeness', () => {
    it('should have all expected step types', () => {
      const exportedTypes = AUTOMATION_BUILTIN_STEP_TYPES.map((def) => def.type);
      for (const expectedType of EXPECTED_STEP_TYPES) {
        expect(exportedTypes).toContain(expectedType);
      }
    });

    it('should have exactly 21 step definitions', () => {
      expect(AUTOMATION_BUILTIN_STEP_TYPES).toHaveLength(21);
    });

    it('each step type should be unique', () => {
      const types = AUTOMATION_BUILTIN_STEP_TYPES.map((def) => def.type);
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(types.length);
    });
  });

  describe('Step Definition Structure', () => {
    it('each step definition should have required properties', () => {
      for (const def of AUTOMATION_BUILTIN_STEP_TYPES) {
        expect(def).toHaveProperty('type');
        expect(def).toHaveProperty('title');
        expect(def).toHaveProperty('description');
        expect(def).toHaveProperty('category');
        expect(def).toHaveProperty('editorComponent');
        expect(def).toHaveProperty('inputContract');
        expect(def).toHaveProperty('outputContract');
        expect(def).toHaveProperty('configSchema');

        // Verify types
        expect(typeof def.type).toBe('string');
        expect(typeof def.title).toBe('string');
        expect(typeof def.description).toBe('string');
        expect(typeof def.category).toBe('string');
        expect(typeof def.editorComponent).toBe('string');
        expect(typeof def.inputContract).toBe('string');
        expect(typeof def.outputContract).toBe('string');
        expect(typeof def.configSchema).toBe('object');
      }
    });

    it('each step definition should have a valid category', () => {
      for (const def of AUTOMATION_BUILTIN_STEP_TYPES) {
        expect(EXPECTED_CATEGORIES).toContain(def.category);
      }
    });

    it('configSchema should have correct structure', () => {
      for (const def of AUTOMATION_BUILTIN_STEP_TYPES) {
        expect(def.configSchema.type).toBe('object');
        expect(Array.isArray(def.configSchema.fields)).toBe(true);

        for (const field of def.configSchema.fields) {
          expect(field).toHaveProperty('key');
          expect(field).toHaveProperty('type');
          expect(field).toHaveProperty('label');
          expect(['string', 'number', 'boolean', 'json', 'enum', 'string[]']).toContain(field.type);
        }
      }
    });

    it('each step type should be kebab-case', () => {
      for (const def of AUTOMATION_BUILTIN_STEP_TYPES) {
        expect(def.type).toMatch(/^[a-z]+(-[a-z]+)*$/);
      }
    });
  });

  describe('Step Definitions by Category', () => {
    it('features category should have create-feature and manage-feature', () => {
      const featuresSteps = AUTOMATION_BUILTIN_STEP_TYPES.filter(
        (def) => def.category === 'features'
      );
      expect(featuresSteps).toHaveLength(2);

      const types = featuresSteps.map((def) => def.type);
      expect(types).toContain('create-feature');
      expect(types).toContain('manage-feature');
    });

    it('ai category should have run-ai-prompt and run-typescript-code', () => {
      const aiSteps = AUTOMATION_BUILTIN_STEP_TYPES.filter((def) => def.category === 'ai');
      expect(aiSteps).toHaveLength(2);

      const types = aiSteps.map((def) => def.type);
      expect(types).toContain('run-ai-prompt');
      expect(types).toContain('run-typescript-code');
    });

    it('variables category should have define-variable', () => {
      const variablesSteps = AUTOMATION_BUILTIN_STEP_TYPES.filter(
        (def) => def.category === 'variables'
      );
      expect(variablesSteps).toHaveLength(1);

      const types = variablesSteps.map((def) => def.type);
      expect(types).toContain('define-variable');
    });

    it('integrations category should have call-http-endpoint, run-script-exec, and emit-event', () => {
      const integrationsSteps = AUTOMATION_BUILTIN_STEP_TYPES.filter(
        (def) => def.category === 'integrations'
      );
      expect(integrationsSteps).toHaveLength(3);

      const types = integrationsSteps.map((def) => def.type);
      expect(types).toContain('call-http-endpoint');
      expect(types).toContain('run-script-exec');
      expect(types).toContain('emit-event');
    });

    it('flow category should have if, loop, and call-automation', () => {
      const flowSteps = AUTOMATION_BUILTIN_STEP_TYPES.filter((def) => def.category === 'flow');
      expect(flowSteps).toHaveLength(3);

      const types = flowSteps.map((def) => def.type);
      expect(types).toContain('if');
      expect(types).toContain('loop');
      expect(types).toContain('call-automation');
    });

    it('git category should have git-status, git-branch, git-commit, git-push, git-pull, and git-checkout', () => {
      const gitSteps = AUTOMATION_BUILTIN_STEP_TYPES.filter((def) => def.category === 'git');
      expect(gitSteps).toHaveLength(6);

      const types = gitSteps.map((def) => def.type);
      expect(types).toContain('git-status');
      expect(types).toContain('git-branch');
      expect(types).toContain('git-commit');
      expect(types).toContain('git-push');
      expect(types).toContain('git-pull');
      expect(types).toContain('git-checkout');
    });

    it('auto-mode category should have start-auto-mode, stop-auto-mode, get-auto-mode-status, and set-auto-mode-concurrency', () => {
      const autoModeSteps = AUTOMATION_BUILTIN_STEP_TYPES.filter(
        (def) => def.category === 'auto-mode'
      );
      expect(autoModeSteps).toHaveLength(4);

      const types = autoModeSteps.map((def) => def.type);
      expect(types).toContain('start-auto-mode');
      expect(types).toContain('stop-auto-mode');
      expect(types).toContain('get-auto-mode-status');
      expect(types).toContain('set-auto-mode-concurrency');
    });
  });

  describe('Step Definition Details', () => {
    it('create-feature step should have correct properties', () => {
      const def = AUTOMATION_BUILTIN_STEP_TYPES.find((d) => d.type === 'create-feature');
      expect(def).toBeDefined();
      expect(def?.title).toBe('Create Feature');
      expect(def?.description).toBe('Creates a new feature in the current project scope.');
      expect(def?.category).toBe('features');
      expect(def?.editorComponent).toBe('createFeature');
    });

    it('run-ai-prompt step should have correct properties', () => {
      const def = AUTOMATION_BUILTIN_STEP_TYPES.find((d) => d.type === 'run-ai-prompt');
      expect(def).toBeDefined();
      expect(def?.title).toBe('Run AI Prompt');
      expect(def?.description).toBe('Executes a prompt with configurable model selection.');
      expect(def?.category).toBe('ai');
      expect(def?.editorComponent).toBe('runAiPrompt');
    });

    it('if conditional step should have correct properties', () => {
      const def = AUTOMATION_BUILTIN_STEP_TYPES.find((d) => d.type === 'if');
      expect(def).toBeDefined();
      expect(def?.title).toBe('If (Conditional)');
      expect(def?.description).toBe('Branches execution based on a condition expression.');
      expect(def?.category).toBe('flow');
      expect(def?.editorComponent).toBe('ifConditional');
    });

    it('define-variable step should have correct properties', () => {
      const def = AUTOMATION_BUILTIN_STEP_TYPES.find((d) => d.type === 'define-variable');
      expect(def).toBeDefined();
      expect(def?.title).toBe('Define/Set Variable');
      expect(def?.description).toBe('Creates or updates workflow variables.');
      expect(def?.category).toBe('variables');
      expect(def?.editorComponent).toBe('defineVariable');
    });
  });

  describe('Required Fields Validation', () => {
    it('steps with required fields should have them marked correctly', () => {
      // manage-feature should require action and featureId
      const manageFeature = AUTOMATION_BUILTIN_STEP_TYPES.find((d) => d.type === 'manage-feature');
      const actionField = manageFeature?.configSchema.fields.find((f) => f.key === 'action');
      const featureIdField = manageFeature?.configSchema.fields.find((f) => f.key === 'featureId');
      expect(actionField?.required).toBe(true);
      expect(featureIdField?.required).toBe(true);

      // run-ai-prompt should require prompt
      const runAiPrompt = AUTOMATION_BUILTIN_STEP_TYPES.find((d) => d.type === 'run-ai-prompt');
      const promptField = runAiPrompt?.configSchema.fields.find((f) => f.key === 'prompt');
      expect(promptField?.required).toBe(true);

      // if should require condition
      const ifStep = AUTOMATION_BUILTIN_STEP_TYPES.find((d) => d.type === 'if');
      const conditionField = ifStep?.configSchema.fields.find((f) => f.key === 'condition');
      expect(conditionField?.required).toBe(true);
    });

    it('enum fields should have valid options', () => {
      // manage-feature action should have valid options
      const manageFeature = AUTOMATION_BUILTIN_STEP_TYPES.find((d) => d.type === 'manage-feature');
      const actionField = manageFeature?.configSchema.fields.find((f) => f.key === 'action');
      expect(actionField?.type).toBe('enum');
      expect(actionField?.options).toEqual(['start', 'stop', 'edit', 'delete']);

      // call-http-endpoint method should have valid options
      const httpStep = AUTOMATION_BUILTIN_STEP_TYPES.find((d) => d.type === 'call-http-endpoint');
      const methodField = httpStep?.configSchema.fields.find((f) => f.key === 'method');
      expect(methodField?.type).toBe('enum');
      expect(methodField?.options).toContain('GET');
      expect(methodField?.options).toContain('POST');
      expect(methodField?.options).toContain('PUT');
      expect(methodField?.options).toContain('DELETE');
    });
  });
});
