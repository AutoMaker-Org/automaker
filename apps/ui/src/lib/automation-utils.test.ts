/**
 * Unit tests for automation utility functions
 */

import { describe, it, expect } from 'vitest';
import { getValueAsString, parseValueFromInput, valueToDisplayString } from './automation-utils';

describe('getValueAsString', () => {
  describe('undefined and null values', () => {
    it('should return empty string for undefined value', () => {
      expect(getValueAsString({})).toBe('');
      expect(getValueAsString({ value: undefined })).toBe('');
    });

    it('should return empty string for null value', () => {
      expect(getValueAsString({ value: null })).toBe('');
    });
  });

  describe('string values', () => {
    it('should return the string as-is for string values', () => {
      expect(getValueAsString({ value: 'hello world' })).toBe('hello world');
      expect(getValueAsString({ value: '' })).toBe('');
      expect(getValueAsString({ value: 'test-value-123' })).toBe('test-value-123');
    });

    it('should return strings with variable syntax as-is', () => {
      expect(getValueAsString({ value: '{{system.projectName}}' })).toBe('{{system.projectName}}');
      expect(getValueAsString({ value: 'prefix-{{workflow.var}}-suffix' })).toBe(
        'prefix-{{workflow.var}}-suffix'
      );
    });
  });

  describe('numeric values', () => {
    it('should stringify numbers', () => {
      expect(getValueAsString({ value: 42 })).toBe('42');
      expect(getValueAsString({ value: 0 })).toBe('0');
      expect(getValueAsString({ value: 3.14 })).toBe('3.14');
      expect(getValueAsString({ value: -10 })).toBe('-10');
    });
  });

  describe('boolean values', () => {
    it('should stringify booleans', () => {
      expect(getValueAsString({ value: true })).toBe('true');
      expect(getValueAsString({ value: false })).toBe('false');
    });
  });

  describe('object values', () => {
    it('should stringify objects with pretty formatting', () => {
      const result = getValueAsString({ value: { key: 'value' } });
      expect(result).toBe('{\n  "key": "value"\n}');
    });

    it('should stringify nested objects', () => {
      const result = getValueAsString({
        value: { outer: { inner: 'nested-value' } },
      });
      expect(result).toContain('"outer"');
      expect(result).toContain('"inner"');
      expect(result).toContain('"nested-value"');
    });

    it('should stringify objects with multiple keys', () => {
      const result = getValueAsString({
        value: { name: 'test', count: 5, enabled: true },
      });
      expect(result).toContain('"name"');
      expect(result).toContain('"test"');
      expect(result).toContain('"count"');
      expect(result).toContain('5');
      expect(result).toContain('"enabled"');
      expect(result).toContain('true');
    });
  });

  describe('array values', () => {
    it('should stringify arrays with pretty formatting', () => {
      const result = getValueAsString({ value: [1, 2, 3] });
      expect(result).toBe('[\n  1,\n  2,\n  3\n]');
    });

    it('should stringify empty arrays', () => {
      expect(getValueAsString({ value: [] })).toBe('[]');
    });

    it('should stringify arrays with objects', () => {
      const result = getValueAsString({
        value: [{ id: 1 }, { id: 2 }],
      });
      expect(result).toContain('"id"');
      expect(result).toContain('1');
      expect(result).toContain('2');
    });
  });

  describe('edge cases', () => {
    it('should handle empty config object', () => {
      expect(getValueAsString({})).toBe('');
    });

    it('should handle config with other properties but no value', () => {
      expect(getValueAsString({ name: 'test', type: 'variable' })).toBe('');
    });
  });
});

describe('parseValueFromInput', () => {
  describe('empty input', () => {
    it('should return undefined for empty string', () => {
      const result = parseValueFromInput('');
      expect(result.value).toBeUndefined();
      expect(result.isValid).toBe(true);
    });

    it('should return undefined for whitespace-only string', () => {
      const result = parseValueFromInput('   ');
      expect(result.value).toBeUndefined();
      expect(result.isValid).toBe(true);
    });
  });

  describe('JSON parsing', () => {
    it('should parse valid JSON number', () => {
      const result = parseValueFromInput('42');
      expect(result.value).toBe(42);
      expect(result.isValid).toBe(true);
    });

    it('should parse valid JSON string (quoted)', () => {
      const result = parseValueFromInput('"hello"');
      expect(result.value).toBe('hello');
      expect(result.isValid).toBe(true);
    });

    it('should parse valid JSON object', () => {
      const result = parseValueFromInput('{ "key": "value" }');
      expect(result.value).toEqual({ key: 'value' });
      expect(result.isValid).toBe(true);
    });

    it('should parse valid JSON array', () => {
      const result = parseValueFromInput('[1, 2, 3]');
      expect(result.value).toEqual([1, 2, 3]);
      expect(result.isValid).toBe(true);
    });

    it('should parse boolean values', () => {
      const trueResult = parseValueFromInput('true');
      expect(trueResult.value).toBe(true);
      expect(trueResult.isValid).toBe(true);

      const falseResult = parseValueFromInput('false');
      expect(falseResult.value).toBe(false);
      expect(falseResult.isValid).toBe(true);
    });

    it('should parse null', () => {
      const result = parseValueFromInput('null');
      expect(result.value).toBe(null);
      expect(result.isValid).toBe(true);
    });
  });

  describe('fallback to raw string', () => {
    it('should return raw string for unquoted text', () => {
      const result = parseValueFromInput('hello world');
      expect(result.value).toBe('hello world');
      expect(result.isValid).toBe(false);
    });

    it('should return raw string for invalid JSON', () => {
      const result = parseValueFromInput('{ invalid json }');
      expect(result.value).toBe('{ invalid json }');
      expect(result.isValid).toBe(false);
    });

    it('should preserve variable syntax as raw string', () => {
      const result = parseValueFromInput('{{workflow.myVar}}');
      expect(result.value).toBe('{{workflow.myVar}}');
      expect(result.isValid).toBe(false);
    });

    it('should handle mixed content with variable syntax', () => {
      const result = parseValueFromInput('prefix-{{system.projectName}}-suffix');
      expect(result.value).toBe('prefix-{{system.projectName}}-suffix');
      expect(result.isValid).toBe(false);
    });
  });
});

describe('valueToDisplayString', () => {
  describe('null and undefined', () => {
    it('should return empty string for undefined', () => {
      expect(valueToDisplayString(undefined)).toBe('');
    });

    it('should return empty string for null', () => {
      expect(valueToDisplayString(null)).toBe('');
    });
  });

  describe('string values', () => {
    it('should return string as-is', () => {
      expect(valueToDisplayString('hello')).toBe('hello');
    });

    it('should return empty string as-is', () => {
      expect(valueToDisplayString('')).toBe('');
    });
  });

  describe('non-string values', () => {
    it('should stringify numbers', () => {
      expect(valueToDisplayString(42)).toBe('42');
    });

    it('should stringify objects with pretty formatting', () => {
      const result = valueToDisplayString({ key: 'value' });
      expect(result).toBe('{\n  "key": "value"\n}');
    });

    it('should stringify arrays', () => {
      const result = valueToDisplayString([1, 2, 3]);
      expect(result).toBe('[\n  1,\n  2,\n  3\n]');
    });

    it('should stringify booleans', () => {
      expect(valueToDisplayString(true)).toBe('true');
      expect(valueToDisplayString(false)).toBe('false');
    });
  });
});
