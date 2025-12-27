/**
 * Tests for provider-query utility
 * Tests provider-agnostic query execution, structured output parsing, and JSON handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildStructuredOutputPrompt,
  parseJsonFromText,
} from '../../../../src/lib/provider-query.js';

// Mock provider-factory to allow importing provider-query
vi.mock('../../../../src/providers/provider-factory.js', () => ({
  ProviderFactory: {
    getProviderForModel: vi.fn(),
    registerProvider: vi.fn(),
    unregisterProvider: vi.fn(),
    getAllProviders: vi.fn(),
    checkAllProviders: vi.fn(),
    getProviderByName: vi.fn(),
    getAllAvailableModels: vi.fn(),
  },
}));

describe('provider-query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildStructuredOutputPrompt', () => {
    it('should append JSON instructions to the base prompt', () => {
      const basePrompt = 'Generate a user profile';
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const result = buildStructuredOutputPrompt(basePrompt, schema);

      expect(result).toContain(basePrompt);
      expect(result).toContain('IMPORTANT: You must respond with valid JSON');
      expect(result).toContain('name: string (required)');
      expect(result).toContain('age: number');
    });

    it('should describe nested object properties', () => {
      const schema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
      };

      const result = buildStructuredOutputPrompt('test', schema);

      expect(result).toContain('address:');
      expect(result).toContain('street:');
      expect(result).toContain('city:');
    });

    it('should describe array items', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
          },
        },
      };

      const result = buildStructuredOutputPrompt('test', schema);

      expect(result).toContain('Array of:');
    });
  });

  describe('parseJsonFromText - ReDoS-safe implementation', () => {
    it('should parse pure JSON text', () => {
      const text = '{"name": "test", "value": 123}';
      const result = parseJsonFromText(text);

      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should parse pure JSON array', () => {
      const text = '[1, 2, 3]';
      const result = parseJsonFromText(text);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should extract JSON from conversational text', () => {
      const text =
        'Here is the result: {"name": "test", "value": 123}. Let me know if you need anything else.';
      const result = parseJsonFromText(text);

      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should extract JSON array from conversational text', () => {
      const text = 'The items are: [1, 2, 3]. Enjoy!';
      const result = parseJsonFromText(text);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle nested objects correctly', () => {
      const text = '{"user": {"name": "John", "address": {"city": "NYC"}}}';
      const result = parseJsonFromText(text);

      expect(result).toEqual({
        user: { name: 'John', address: { city: 'NYC' } },
      });
    });

    it('should handle nested arrays correctly', () => {
      const text = '{"items": [[1, 2], [3, 4]]}';
      const result = parseJsonFromText(text);

      expect(result).toEqual({
        items: [
          [1, 2],
          [3, 4],
        ],
      });
    });

    it('should handle strings with escaped quotes', () => {
      const text = '{"message": "He said \\"hello\\""}';
      const result = parseJsonFromText(text);

      expect(result).toEqual({ message: 'He said "hello"' });
    });

    it('should return null for invalid JSON', () => {
      const text = 'This is not JSON at all';
      const result = parseJsonFromText(text);

      expect(result).toBeNull();
    });

    it('should return null for malformed JSON', () => {
      const text = '{"name": "test", }';
      const result = parseJsonFromText(text);

      expect(result).toBeNull();
    });

    it('should handle unbalanced braces gracefully', () => {
      const text = '{"name": "test"';
      const result = parseJsonFromText(text);

      expect(result).toBeNull();
    });

    it('should validate against schema when provided', () => {
      const text = '{"name": "test", "age": 25}';
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const result = parseJsonFromText(text, schema);

      expect(result).toEqual({ name: 'test', age: 25 });
    });

    it('should return null when schema validation fails', () => {
      const text = '{"name": "test"}'; // Missing required 'age'
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const result = parseJsonFromText(text, schema);

      expect(result).toBeNull();
    });

    it('should validate enum values', () => {
      const text = '{"status": "active"}';
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      };

      const result = parseJsonFromText(text, schema);

      expect(result).toEqual({ status: 'active' });
    });

    it('should reject invalid enum values', () => {
      const text = '{"status": "pending"}';
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      };

      const result = parseJsonFromText(text, schema);

      expect(result).toBeNull();
    });

    // ReDoS resistance test - this should complete quickly
    it('should be resistant to ReDoS attacks', () => {
      // This input could cause catastrophic backtracking with naive regex
      const text = '{"data": "' + '{'.repeat(100) + 'test' + '}'.repeat(100) + '"}';
      const start = Date.now();
      const result = parseJsonFromText(text);
      const duration = Date.now() - start;

      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
      // Result may be null due to malformed JSON, but shouldn't hang
    });
  });

  // Integration tests for executeProviderQuery require complex mocking
  // and are skipped for now. The core functionality (JSON parsing, prompt building)
  // is tested above. Provider routing is tested in provider-factory.test.ts.
  describe('executeProviderQuery', () => {
    it.skip('should route to Zai provider for glm models', async () => {
      // TODO: Fix mocking for integration tests
    });

    it.skip('should route to Claude provider for claude models', async () => {
      // TODO: Fix mocking for integration tests
    });

    it.skip('should add structured output prompt for non-Claude providers', async () => {
      // TODO: Fix mocking for integration tests
    });
  });
});
