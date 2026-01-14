import { describe, it, expect } from 'vitest';
import {
  getEnhancementPrompt,
  getSystemPrompt,
  getExamples,
  buildUserPrompt,
  isValidEnhancementMode,
  getAvailableEnhancementModes,
  IMPROVE_SYSTEM_PROMPT,
  TECHNICAL_SYSTEM_PROMPT,
  SIMPLIFY_SYSTEM_PROMPT,
  ACCEPTANCE_SYSTEM_PROMPT,
  IMPROVE_EXAMPLES,
  TECHNICAL_EXAMPLES,
  SIMPLIFY_EXAMPLES,
  ACCEPTANCE_EXAMPLES,
  type EnhancementMode,
} from '@/lib/enhancement-prompts.js';

const ENHANCEMENT_MODES: EnhancementMode[] = [
  'improve',
  'technical',
  'simplify',
  'acceptance',
  'ux-reviewer',
];

describe('enhancement-prompts.ts', () => {
  describe('System Prompt Constants', () => {
    it('should have non-empty improve system prompt', () => {
      expect(IMPROVE_SYSTEM_PROMPT).toBeDefined();
      expect(IMPROVE_SYSTEM_PROMPT.length).toBeGreaterThan(100);
      expect(IMPROVE_SYSTEM_PROMPT).toContain('ANALYZE');
      expect(IMPROVE_SYSTEM_PROMPT).toContain('CLARIFY');
    });

    it('should have non-empty technical system prompt', () => {
      expect(TECHNICAL_SYSTEM_PROMPT).toBeDefined();
      expect(TECHNICAL_SYSTEM_PROMPT.length).toBeGreaterThan(100);
      expect(TECHNICAL_SYSTEM_PROMPT).toContain('technical');
    });

    it('should have non-empty simplify system prompt', () => {
      expect(SIMPLIFY_SYSTEM_PROMPT).toBeDefined();
      expect(SIMPLIFY_SYSTEM_PROMPT.length).toBeGreaterThan(100);
      expect(SIMPLIFY_SYSTEM_PROMPT).toContain('simplify');
    });

    it('should have non-empty acceptance system prompt', () => {
      expect(ACCEPTANCE_SYSTEM_PROMPT).toBeDefined();
      expect(ACCEPTANCE_SYSTEM_PROMPT.length).toBeGreaterThan(100);
      expect(ACCEPTANCE_SYSTEM_PROMPT).toContain('acceptance criteria');
    });
  });

  describe('Example Constants', () => {
    it('should have improve examples with input and output', () => {
      expect(IMPROVE_EXAMPLES).toBeDefined();
      expect(IMPROVE_EXAMPLES.length).toBeGreaterThan(0);
      IMPROVE_EXAMPLES.forEach((example) => {
        expect(example.input).toBeDefined();
        expect(example.output).toBeDefined();
        expect(example.input.length).toBeGreaterThan(0);
        expect(example.output.length).toBeGreaterThan(0);
      });
    });

    it('should have technical examples with input and output', () => {
      expect(TECHNICAL_EXAMPLES).toBeDefined();
      expect(TECHNICAL_EXAMPLES.length).toBeGreaterThan(0);
      TECHNICAL_EXAMPLES.forEach((example) => {
        expect(example.input).toBeDefined();
        expect(example.output).toBeDefined();
      });
    });

    it('should have simplify examples with input and output', () => {
      expect(SIMPLIFY_EXAMPLES).toBeDefined();
      expect(SIMPLIFY_EXAMPLES.length).toBeGreaterThan(0);
      SIMPLIFY_EXAMPLES.forEach((example) => {
        expect(example.input).toBeDefined();
        expect(example.output).toBeDefined();
      });
    });

    it('should have acceptance examples with input and output', () => {
      expect(ACCEPTANCE_EXAMPLES).toBeDefined();
      expect(ACCEPTANCE_EXAMPLES.length).toBeGreaterThan(0);
      ACCEPTANCE_EXAMPLES.forEach((example) => {
        expect(example.input).toBeDefined();
        expect(example.output).toBeDefined();
      });
    });
  });

  describe('getEnhancementPrompt', () => {
    it('should return config for improve mode', () => {
      const config = getEnhancementPrompt('improve');
      expect(config.systemPrompt).toBe(IMPROVE_SYSTEM_PROMPT);
      expect(config.description).toContain('clear');
    });

    it('should return config for technical mode', () => {
      const config = getEnhancementPrompt('technical');
      expect(config.systemPrompt).toBe(TECHNICAL_SYSTEM_PROMPT);
      expect(config.description).toContain('technical');
    });

    it('should return config for simplify mode', () => {
      const config = getEnhancementPrompt('simplify');
      expect(config.systemPrompt).toBe(SIMPLIFY_SYSTEM_PROMPT);
      expect(config.description).toContain('concise');
    });

    it('should return config for acceptance mode', () => {
      const config = getEnhancementPrompt('acceptance');
      expect(config.systemPrompt).toBe(ACCEPTANCE_SYSTEM_PROMPT);
      expect(config.description).toContain('acceptance');
    });

    it('should handle case-insensitive mode', () => {
      const config = getEnhancementPrompt('IMPROVE');
      expect(config.systemPrompt).toBe(IMPROVE_SYSTEM_PROMPT);
    });

    it('should fall back to improve for invalid mode', () => {
      const config = getEnhancementPrompt('invalid-mode');
      expect(config.systemPrompt).toBe(IMPROVE_SYSTEM_PROMPT);
    });

    it('should fall back to improve for empty string', () => {
      const config = getEnhancementPrompt('');
      expect(config.systemPrompt).toBe(IMPROVE_SYSTEM_PROMPT);
    });
  });

  describe('getSystemPrompt', () => {
    it('should return correct system prompt for each mode', () => {
      expect(getSystemPrompt('improve')).toBe(IMPROVE_SYSTEM_PROMPT);
      expect(getSystemPrompt('technical')).toBe(TECHNICAL_SYSTEM_PROMPT);
      expect(getSystemPrompt('simplify')).toBe(SIMPLIFY_SYSTEM_PROMPT);
      expect(getSystemPrompt('acceptance')).toBe(ACCEPTANCE_SYSTEM_PROMPT);
    });
  });

  describe('getExamples', () => {
    it('should return correct examples for each mode', () => {
      expect(getExamples('improve')).toBe(IMPROVE_EXAMPLES);
      expect(getExamples('technical')).toBe(TECHNICAL_EXAMPLES);
      expect(getExamples('simplify')).toBe(SIMPLIFY_EXAMPLES);
      expect(getExamples('acceptance')).toBe(ACCEPTANCE_EXAMPLES);
    });

    it('should return arrays with example objects', () => {
      const modes: EnhancementMode[] = ['improve', 'technical', 'simplify', 'acceptance'];
      modes.forEach((mode) => {
        const examples = getExamples(mode);
        expect(Array.isArray(examples)).toBe(true);
        expect(examples.length).toBeGreaterThan(0);
      });
    });
  });

  describe('buildUserPrompt', () => {
    const testText = 'Add a logout button';

    it('should build prompt with examples by default', () => {
      const prompt = buildUserPrompt('improve', testText);
      expect(prompt).toContain('Example 1:');
      expect(prompt).toContain(testText);
      expect(prompt).toContain('Now, please enhance the following task description:');
    });

    it('should build prompt without examples when includeExamples is false', () => {
      const prompt = buildUserPrompt('improve', testText, false);
      expect(prompt).not.toContain('Example 1:');
      expect(prompt).toContain(testText);
      expect(prompt).toContain('Please enhance the following task description:');
    });

    it('should include all examples for improve mode', () => {
      const prompt = buildUserPrompt('improve', testText);
      IMPROVE_EXAMPLES.forEach((example, index) => {
        expect(prompt).toContain(`Example ${index + 1}:`);
        expect(prompt).toContain(example.input);
      });
    });

    it('should include separator between examples', () => {
      const prompt = buildUserPrompt('improve', testText);
      expect(prompt).toContain('---');
    });

    it('should work with all enhancement modes', () => {
      ENHANCEMENT_MODES.forEach((mode) => {
        const prompt = buildUserPrompt(mode, testText);
        expect(prompt).toContain(testText);
        expect(prompt.length).toBeGreaterThan(100);
      });
    });

    it('should preserve the original text exactly', () => {
      const specialText = 'Add feature with special chars: <>&"\'';
      const prompt = buildUserPrompt('improve', specialText);
      expect(prompt).toContain(specialText);
    });
  });

  describe('isValidEnhancementMode', () => {
    it('should return true for valid modes', () => {
      expect(isValidEnhancementMode('improve')).toBe(true);
      expect(isValidEnhancementMode('technical')).toBe(true);
      expect(isValidEnhancementMode('simplify')).toBe(true);
      expect(isValidEnhancementMode('acceptance')).toBe(true);
      expect(isValidEnhancementMode('ux-reviewer')).toBe(true);
    });

    it('should return false for invalid modes', () => {
      expect(isValidEnhancementMode('invalid')).toBe(false);
      expect(isValidEnhancementMode('IMPROVE')).toBe(false); // case-sensitive
      expect(isValidEnhancementMode('')).toBe(false);
      expect(isValidEnhancementMode('random')).toBe(false);
    });
  });

  describe('getAvailableEnhancementModes', () => {
    it('should return all enhancement modes', () => {
      const modes = getAvailableEnhancementModes();
      expect(modes).toHaveLength(ENHANCEMENT_MODES.length);
      ENHANCEMENT_MODES.forEach((mode) => {
        expect(modes).toContain(mode);
      });
    });

    it('should return an array', () => {
      const modes = getAvailableEnhancementModes();
      expect(Array.isArray(modes)).toBe(true);
    });
  });
});
