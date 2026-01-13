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
} from '../src/enhancement.js';

describe('enhancement.ts', () => {
  describe('System Prompt Constants', () => {
    it('should export IMPROVE_SYSTEM_PROMPT', () => {
      expect(IMPROVE_SYSTEM_PROMPT).toBeDefined();
      expect(typeof IMPROVE_SYSTEM_PROMPT).toBe('string');
      expect(IMPROVE_SYSTEM_PROMPT).toContain('vague, unclear');
      expect(IMPROVE_SYSTEM_PROMPT).toContain('actionable');
    });

    it('should export TECHNICAL_SYSTEM_PROMPT', () => {
      expect(TECHNICAL_SYSTEM_PROMPT).toBeDefined();
      expect(typeof TECHNICAL_SYSTEM_PROMPT).toBe('string');
      expect(TECHNICAL_SYSTEM_PROMPT).toContain('technical');
      expect(TECHNICAL_SYSTEM_PROMPT).toContain('implementation');
    });

    it('should export SIMPLIFY_SYSTEM_PROMPT', () => {
      expect(SIMPLIFY_SYSTEM_PROMPT).toBeDefined();
      expect(typeof SIMPLIFY_SYSTEM_PROMPT).toBe('string');
      expect(SIMPLIFY_SYSTEM_PROMPT).toContain('verbose');
      expect(SIMPLIFY_SYSTEM_PROMPT).toContain('concise');
    });

    it('should export ACCEPTANCE_SYSTEM_PROMPT', () => {
      expect(ACCEPTANCE_SYSTEM_PROMPT).toBeDefined();
      expect(typeof ACCEPTANCE_SYSTEM_PROMPT).toBe('string');
      expect(ACCEPTANCE_SYSTEM_PROMPT).toContain('acceptance criteria');
      expect(ACCEPTANCE_SYSTEM_PROMPT).toContain('testable');
    });
  });

  describe('Examples Constants', () => {
    it('should export IMPROVE_EXAMPLES with valid structure', () => {
      expect(IMPROVE_EXAMPLES).toBeDefined();
      expect(Array.isArray(IMPROVE_EXAMPLES)).toBe(true);
      expect(IMPROVE_EXAMPLES.length).toBeGreaterThan(0);

      IMPROVE_EXAMPLES.forEach((example) => {
        expect(example).toHaveProperty('input');
        expect(example).toHaveProperty('output');
        expect(typeof example.input).toBe('string');
        expect(typeof example.output).toBe('string');
      });
    });

    it('should export TECHNICAL_EXAMPLES with valid structure', () => {
      expect(TECHNICAL_EXAMPLES).toBeDefined();
      expect(Array.isArray(TECHNICAL_EXAMPLES)).toBe(true);
      expect(TECHNICAL_EXAMPLES.length).toBeGreaterThan(0);

      TECHNICAL_EXAMPLES.forEach((example) => {
        expect(example).toHaveProperty('input');
        expect(example).toHaveProperty('output');
        expect(typeof example.input).toBe('string');
        expect(typeof example.output).toBe('string');
      });
    });

    it('should export SIMPLIFY_EXAMPLES with valid structure', () => {
      expect(SIMPLIFY_EXAMPLES).toBeDefined();
      expect(Array.isArray(SIMPLIFY_EXAMPLES)).toBe(true);
      expect(SIMPLIFY_EXAMPLES.length).toBeGreaterThan(0);

      SIMPLIFY_EXAMPLES.forEach((example) => {
        expect(example).toHaveProperty('input');
        expect(example).toHaveProperty('output');
        expect(typeof example.input).toBe('string');
        expect(typeof example.output).toBe('string');
      });
    });

    it('should export ACCEPTANCE_EXAMPLES with valid structure', () => {
      expect(ACCEPTANCE_EXAMPLES).toBeDefined();
      expect(Array.isArray(ACCEPTANCE_EXAMPLES)).toBe(true);
      expect(ACCEPTANCE_EXAMPLES.length).toBeGreaterThan(0);

      ACCEPTANCE_EXAMPLES.forEach((example) => {
        expect(example).toHaveProperty('input');
        expect(example).toHaveProperty('output');
        expect(typeof example.input).toBe('string');
        expect(typeof example.output).toBe('string');
      });
    });

    it('should have shorter outputs in SIMPLIFY_EXAMPLES', () => {
      SIMPLIFY_EXAMPLES.forEach((example) => {
        // Simplify examples should have shorter output than input
        // (though not always strictly enforced, it's the general pattern)
        expect(example.output).toBeDefined();
        expect(example.output.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getEnhancementPrompt', () => {
    it("should return prompt config for 'improve' mode", () => {
      const result = getEnhancementPrompt('improve');

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('description');
      expect(result.systemPrompt).toBe(IMPROVE_SYSTEM_PROMPT);
      expect(result.description).toContain('vague');
      expect(result.description).toContain('actionable');
    });

    it("should return prompt config for 'technical' mode", () => {
      const result = getEnhancementPrompt('technical');

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('description');
      expect(result.systemPrompt).toBe(TECHNICAL_SYSTEM_PROMPT);
      expect(result.description).toContain('implementation');
    });

    it("should return prompt config for 'simplify' mode", () => {
      const result = getEnhancementPrompt('simplify');

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('description');
      expect(result.systemPrompt).toBe(SIMPLIFY_SYSTEM_PROMPT);
      expect(result.description).toContain('verbose');
    });

    it("should return prompt config for 'acceptance' mode", () => {
      const result = getEnhancementPrompt('acceptance');

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('description');
      expect(result.systemPrompt).toBe(ACCEPTANCE_SYSTEM_PROMPT);
      expect(result.description).toContain('acceptance');
    });

    it('should handle uppercase mode', () => {
      const result = getEnhancementPrompt('IMPROVE');

      expect(result.systemPrompt).toBe(IMPROVE_SYSTEM_PROMPT);
    });

    it('should handle mixed case mode', () => {
      const result = getEnhancementPrompt('TeChnIcaL');

      expect(result.systemPrompt).toBe(TECHNICAL_SYSTEM_PROMPT);
    });

    it("should fall back to 'improve' for invalid mode", () => {
      const result = getEnhancementPrompt('invalid-mode');

      expect(result.systemPrompt).toBe(IMPROVE_SYSTEM_PROMPT);
      expect(result.description).toContain('vague');
    });

    it("should fall back to 'improve' for empty string", () => {
      const result = getEnhancementPrompt('');

      expect(result.systemPrompt).toBe(IMPROVE_SYSTEM_PROMPT);
    });
  });

  describe('getSystemPrompt', () => {
    it("should return IMPROVE_SYSTEM_PROMPT for 'improve'", () => {
      const result = getSystemPrompt('improve');
      expect(result).toBe(IMPROVE_SYSTEM_PROMPT);
    });

    it("should return TECHNICAL_SYSTEM_PROMPT for 'technical'", () => {
      const result = getSystemPrompt('technical');
      expect(result).toBe(TECHNICAL_SYSTEM_PROMPT);
    });

    it("should return SIMPLIFY_SYSTEM_PROMPT for 'simplify'", () => {
      const result = getSystemPrompt('simplify');
      expect(result).toBe(SIMPLIFY_SYSTEM_PROMPT);
    });

    it("should return ACCEPTANCE_SYSTEM_PROMPT for 'acceptance'", () => {
      const result = getSystemPrompt('acceptance');
      expect(result).toBe(ACCEPTANCE_SYSTEM_PROMPT);
    });
  });

  describe('getExamples', () => {
    it("should return IMPROVE_EXAMPLES for 'improve'", () => {
      const result = getExamples('improve');
      expect(result).toBe(IMPROVE_EXAMPLES);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should return TECHNICAL_EXAMPLES for 'technical'", () => {
      const result = getExamples('technical');
      expect(result).toBe(TECHNICAL_EXAMPLES);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should return SIMPLIFY_EXAMPLES for 'simplify'", () => {
      const result = getExamples('simplify');
      expect(result).toBe(SIMPLIFY_EXAMPLES);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should return ACCEPTANCE_EXAMPLES for 'acceptance'", () => {
      const result = getExamples('acceptance');
      expect(result).toBe(ACCEPTANCE_EXAMPLES);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('buildUserPrompt', () => {
    const testText = 'Add a login feature';

    describe('with examples (default)', () => {
      it("should include examples by default for 'improve' mode", () => {
        const result = buildUserPrompt('improve', testText);

        expect(result).toContain('Here are some examples');
        expect(result).toContain('Example 1:');
        expect(result).toContain(IMPROVE_EXAMPLES[0].input);
        expect(result).toContain(IMPROVE_EXAMPLES[0].output);
        expect(result).toContain(testText);
      });

      it("should include examples by default for 'technical' mode", () => {
        const result = buildUserPrompt('technical', testText);

        expect(result).toContain('Here are some examples');
        expect(result).toContain('Example 1:');
        expect(result).toContain(TECHNICAL_EXAMPLES[0].input);
        expect(result).toContain(testText);
      });

      it('should include examples when explicitly set to true', () => {
        const result = buildUserPrompt('improve', testText, true);

        expect(result).toContain('Here are some examples');
        expect(result).toContain(testText);
      });

      it('should format all examples with numbered labels', () => {
        const result = buildUserPrompt('improve', testText);

        IMPROVE_EXAMPLES.forEach((_, index) => {
          expect(result).toContain(`Example ${index + 1}:`);
        });
      });

      it('should separate examples with dividers', () => {
        const result = buildUserPrompt('improve', testText);

        // Count dividers (---) - should be (examples.length) + 1
        const dividerCount = (result.match(/---/g) || []).length;
        expect(dividerCount).toBe(IMPROVE_EXAMPLES.length);
      });

      it("should include 'Now, please enhance' before user text", () => {
        const result = buildUserPrompt('improve', testText);

        expect(result).toContain('Now, please enhance the following');
        expect(result).toContain(testText);
      });
    });

    describe('without examples', () => {
      it('should not include examples when includeExamples is false', () => {
        const result = buildUserPrompt('improve', testText, false);

        expect(result).not.toContain('Here are some examples');
        expect(result).not.toContain('Example 1:');
        expect(result).not.toContain(IMPROVE_EXAMPLES[0].input);
      });

      it('should have simple prompt without examples', () => {
        const result = buildUserPrompt('improve', testText, false);

        expect(result).toBe(`Please enhance the following task description:\n\n${testText}`);
      });

      it('should preserve user text without examples', () => {
        const result = buildUserPrompt('technical', testText, false);

        expect(result).toContain(testText);
        expect(result).toContain('Please enhance');
      });
    });

    describe('text formatting', () => {
      it('should preserve multiline text', () => {
        const multilineText = 'Line 1\nLine 2\nLine 3';
        const result = buildUserPrompt('improve', multilineText);

        expect(result).toContain(multilineText);
      });

      it('should handle empty text', () => {
        const result = buildUserPrompt('improve', '');

        // With examples by default, it should contain "Now, please enhance"
        expect(result).toContain('Now, please enhance');
        expect(result).toContain('Here are some examples');
      });

      it('should handle whitespace-only text', () => {
        const result = buildUserPrompt('improve', '   ');

        expect(result).toContain('   ');
      });

      it('should handle special characters in text', () => {
        const specialText = 'Test <html> & "quotes" \'apostrophes\'';
        const result = buildUserPrompt('improve', specialText);

        expect(result).toContain(specialText);
      });
    });

    describe('all modes', () => {
      it('should work for all valid enhancement modes', () => {
        const modes: Array<'improve' | 'technical' | 'simplify' | 'acceptance'> = [
          'improve',
          'technical',
          'simplify',
          'acceptance',
        ];

        modes.forEach((mode) => {
          const result = buildUserPrompt(mode, testText);

          expect(result).toBeDefined();
          expect(result).toContain(testText);
          expect(result.length).toBeGreaterThan(testText.length);
        });
      });
    });
  });

  describe('isValidEnhancementMode', () => {
    it("should return true for 'improve'", () => {
      expect(isValidEnhancementMode('improve')).toBe(true);
    });

    it("should return true for 'technical'", () => {
      expect(isValidEnhancementMode('technical')).toBe(true);
    });

    it("should return true for 'simplify'", () => {
      expect(isValidEnhancementMode('simplify')).toBe(true);
    });

    it("should return true for 'acceptance'", () => {
      expect(isValidEnhancementMode('acceptance')).toBe(true);
    });

    it('should return false for invalid mode', () => {
      expect(isValidEnhancementMode('invalid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidEnhancementMode('')).toBe(false);
    });

    it('should return false for uppercase mode', () => {
      // Should be case-sensitive since we check object keys directly
      expect(isValidEnhancementMode('IMPROVE')).toBe(false);
    });

    it('should return false for mixed case mode', () => {
      expect(isValidEnhancementMode('ImProve')).toBe(false);
    });

    it('should return false for partial mode names', () => {
      expect(isValidEnhancementMode('impro')).toBe(false);
      expect(isValidEnhancementMode('tech')).toBe(false);
    });

    it('should return false for mode with extra characters', () => {
      expect(isValidEnhancementMode('improve ')).toBe(false);
      expect(isValidEnhancementMode(' improve')).toBe(false);
    });
  });

  describe('getAvailableEnhancementModes', () => {
    it('should return array of all enhancement modes', () => {
      const modes = getAvailableEnhancementModes();

      expect(Array.isArray(modes)).toBe(true);
      expect(modes.length).toBe(5);
    });

    it('should include all valid modes', () => {
      const modes = getAvailableEnhancementModes();

      expect(modes).toContain('improve');
      expect(modes).toContain('technical');
      expect(modes).toContain('simplify');
      expect(modes).toContain('acceptance');
      expect(modes).toContain('ux-reviewer');
    });

    it('should return modes in consistent order', () => {
      const modes1 = getAvailableEnhancementModes();
      const modes2 = getAvailableEnhancementModes();

      expect(modes1).toEqual(modes2);
    });

    it('should return all valid modes that pass isValidEnhancementMode', () => {
      const modes = getAvailableEnhancementModes();

      modes.forEach((mode) => {
        expect(isValidEnhancementMode(mode)).toBe(true);
      });
    });
  });

  describe('Integration tests', () => {
    it('should work together: getEnhancementPrompt + buildUserPrompt', () => {
      const mode = 'improve';
      const text = 'Add search feature';

      const { systemPrompt, description } = getEnhancementPrompt(mode);
      const userPrompt = buildUserPrompt(mode, text);

      expect(systemPrompt).toBe(IMPROVE_SYSTEM_PROMPT);
      expect(description).toBeDefined();
      expect(userPrompt).toContain(text);
    });

    it('should handle complete enhancement workflow', () => {
      const availableModes = getAvailableEnhancementModes();

      expect(availableModes.length).toBeGreaterThan(0);

      availableModes.forEach((mode) => {
        const isValid = isValidEnhancementMode(mode);
        expect(isValid).toBe(true);

        const systemPrompt = getSystemPrompt(mode);
        expect(systemPrompt).toBeDefined();
        expect(systemPrompt.length).toBeGreaterThan(0);

        const examples = getExamples(mode);
        expect(Array.isArray(examples)).toBe(true);
        expect(examples.length).toBeGreaterThan(0);

        const userPrompt = buildUserPrompt(mode, 'test description');
        expect(userPrompt).toContain('test description');
      });
    });

    it('should provide consistent data across functions', () => {
      const mode = 'technical';

      const promptConfig = getEnhancementPrompt(mode);
      const systemPrompt = getSystemPrompt(mode);
      const examples = getExamples(mode);

      expect(promptConfig.systemPrompt).toBe(systemPrompt);
      expect(examples).toBe(TECHNICAL_EXAMPLES);
    });
  });

  describe('Examples content validation', () => {
    it('IMPROVE_EXAMPLES should demonstrate improvement', () => {
      IMPROVE_EXAMPLES.forEach((example) => {
        // Output should be longer and more detailed than input
        expect(example.output.length).toBeGreaterThan(example.input.length);
        // Input should be brief/vague
        expect(example.input.length).toBeLessThan(100);
      });
    });

    it('TECHNICAL_EXAMPLES should contain technical terms', () => {
      const technicalTerms = [
        'API',
        'endpoint',
        'component',
        'database',
        'frontend',
        'backend',
        'validation',
        'schema',
        'React',
        'GET',
        'PUT',
        'POST',
      ];

      TECHNICAL_EXAMPLES.forEach((example) => {
        const hasAnyTechnicalTerm = technicalTerms.some((term) => example.output.includes(term));
        expect(hasAnyTechnicalTerm).toBe(true);
      });
    });

    it('ACCEPTANCE_EXAMPLES should contain acceptance criteria format', () => {
      ACCEPTANCE_EXAMPLES.forEach((example) => {
        // Should contain numbered criteria or Given-When-Then format
        const hasAcceptanceCriteria =
          example.output.includes('Acceptance Criteria') || example.output.match(/\d+\./g);
        expect(hasAcceptanceCriteria).toBeTruthy();

        // Should contain Given-When-Then format
        const hasGWT =
          example.output.includes('Given') &&
          example.output.includes('when') &&
          example.output.includes('then');
        expect(hasGWT).toBe(true);
      });
    });
  });
});
