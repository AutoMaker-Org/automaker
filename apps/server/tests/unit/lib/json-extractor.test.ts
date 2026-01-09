import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractJson, extractJsonWithKey, extractJsonWithArray } from '@/lib/json-extractor.js';

describe('json-extractor.ts', () => {
  const mockLogger = {
    debug: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractJson', () => {
    describe('Strategy 1: JSON in ```json code block', () => {
      it('should extract JSON from ```json code block', () => {
        const responseText = `Here is the result:
\`\`\`json
{"name": "test", "value": 42}
\`\`\`
That's all!`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ name: 'test', value: 42 });
        expect(mockLogger.debug).toHaveBeenCalledWith('Extracting JSON from ```json code block');
      });

      it('should handle multiline JSON in code block', () => {
        const responseText = `\`\`\`json
{
  "items": [
    {"id": 1},
    {"id": 2}
  ]
}
\`\`\``;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ items: [{ id: 1 }, { id: 2 }] });
      });
    });

    describe('Strategy 2: JSON in ``` code block (no language)', () => {
      it('should extract JSON from unmarked code block', () => {
        const responseText = `Result:
\`\`\`
{"status": "ok"}
\`\`\``;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ status: 'ok' });
        expect(mockLogger.debug).toHaveBeenCalledWith('Extracting JSON from ``` code block');
      });

      it('should handle array JSON in unmarked code block', () => {
        const responseText = `\`\`\`
[1, 2, 3]
\`\`\``;

        const result = extractJson<number[]>(responseText, { logger: mockLogger });

        expect(result).toEqual([1, 2, 3]);
      });

      it('should skip non-JSON code blocks and find JSON via brace matching', () => {
        // When code block contains non-JSON, later strategies will try to extract
        // The first { in the response is in the function code, so brace matching
        // will try that and fail. The JSON after the code block is found via strategy 5.
        const responseText = `\`\`\`
return true;
\`\`\`
Here is the JSON: {"actual": "json"}`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ actual: 'json' });
      });
    });

    describe('Strategy 3: Find JSON with required key', () => {
      it('should find JSON containing required key', () => {
        const responseText = `Some text before {"features": ["a", "b"]} and after`;

        const result = extractJson(responseText, {
          logger: mockLogger,
          requiredKey: 'features',
        });

        expect(result).toEqual({ features: ['a', 'b'] });
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Extracting JSON with required key "features"'
        );
      });

      it('should skip JSON without required key', () => {
        const responseText = `{"wrong": "key"} {"features": ["correct"]}`;

        const result = extractJson(responseText, {
          logger: mockLogger,
          requiredKey: 'features',
        });

        expect(result).toEqual({ features: ['correct'] });
      });
    });

    describe('Strategy 4: Find any JSON by brace matching', () => {
      it('should extract JSON by matching braces', () => {
        const responseText = `Let me provide the response: {"result": "success", "data": {"nested": true}}. Done.`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ result: 'success', data: { nested: true } });
        expect(mockLogger.debug).toHaveBeenCalledWith('Extracting JSON by brace matching');
      });

      it('should handle deeply nested objects', () => {
        const responseText = `{"a": {"b": {"c": {"d": "deep"}}}}`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ a: { b: { c: { d: 'deep' } } } });
      });
    });

    describe('Strategy 5: First { to last }', () => {
      it('should extract from first to last brace when other strategies fail', () => {
        // Create malformed JSON that brace matching fails but first-to-last works
        const responseText = `Prefix {"key": "value"} suffix text`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ key: 'value' });
      });
    });

    describe('Strategy 6: Parse entire response as JSON', () => {
      it('should parse entire response when it is valid JSON object', () => {
        const responseText = `{"complete": "json"}`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ complete: 'json' });
      });

      it('should parse entire response when it is valid JSON array', () => {
        const responseText = `["a", "b", "c"]`;

        const result = extractJson<string[]>(responseText, { logger: mockLogger });

        expect(result).toEqual(['a', 'b', 'c']);
      });

      it('should handle whitespace around JSON', () => {
        const responseText = `
  {"trimmed": true}
  `;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ trimmed: true });
      });
    });

    describe('requireArray option', () => {
      it('should validate required key contains array', () => {
        const responseText = `{"items": ["a", "b", "c"]}`;

        const result = extractJson(responseText, {
          logger: mockLogger,
          requiredKey: 'items',
          requireArray: true,
        });

        expect(result).toEqual({ items: ['a', 'b', 'c'] });
      });

      it('should reject when required key is not an array', () => {
        const responseText = `{"items": "not an array"}`;

        const result = extractJson(responseText, {
          logger: mockLogger,
          requiredKey: 'items',
          requireArray: true,
        });

        expect(result).toBeNull();
      });
    });

    describe('error handling', () => {
      it('should return null for invalid JSON', () => {
        const responseText = `This is not JSON at all`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toBeNull();
        expect(mockLogger.debug).toHaveBeenCalledWith('Failed to extract JSON from response');
      });

      it('should return null for malformed JSON', () => {
        const responseText = `{"broken": }`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toBeNull();
      });

      it('should return null for empty input', () => {
        const result = extractJson('', { logger: mockLogger });

        expect(result).toBeNull();
      });

      it('should return null when required key is missing', () => {
        const responseText = `{"other": "key"}`;

        const result = extractJson(responseText, {
          logger: mockLogger,
          requiredKey: 'missing',
        });

        expect(result).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should handle JSON with escaped characters', () => {
        const responseText = `{"text": "Hello \\"World\\"", "path": "C:\\\\Users"}`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ text: 'Hello "World"', path: 'C:\\Users' });
      });

      it('should handle JSON with unicode', () => {
        const responseText = `{"emoji": "🚀", "japanese": "日本語"}`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ emoji: '🚀', japanese: '日本語' });
      });

      it('should work without custom logger', () => {
        const responseText = `{"simple": "test"}`;

        const result = extractJson(responseText);

        expect(result).toEqual({ simple: 'test' });
      });

      it('should handle multiple JSON objects in text - takes first valid one', () => {
        const responseText = `First: {"a": 1} Second: {"b": 2}`;

        const result = extractJson(responseText, { logger: mockLogger });

        expect(result).toEqual({ a: 1 });
      });
    });
  });

  describe('extractJsonWithKey', () => {
    it('should extract JSON with specified required key', () => {
      const responseText = `{"suggestions": [{"title": "Test"}]}`;

      const result = extractJsonWithKey(responseText, 'suggestions', { logger: mockLogger });

      expect(result).toEqual({ suggestions: [{ title: 'Test' }] });
    });

    it('should return null when key is missing', () => {
      const responseText = `{"other": "data"}`;

      const result = extractJsonWithKey(responseText, 'suggestions', { logger: mockLogger });

      expect(result).toBeNull();
    });
  });

  describe('extractJsonWithArray', () => {
    it('should extract JSON with array at specified key', () => {
      const responseText = `{"features": ["feature1", "feature2"]}`;

      const result = extractJsonWithArray(responseText, 'features', { logger: mockLogger });

      expect(result).toEqual({ features: ['feature1', 'feature2'] });
    });

    it('should return null when key value is not an array', () => {
      const responseText = `{"features": "not an array"}`;

      const result = extractJsonWithArray(responseText, 'features', { logger: mockLogger });

      expect(result).toBeNull();
    });

    it('should return null when key is missing', () => {
      const responseText = `{"other": ["array"]}`;

      const result = extractJsonWithArray(responseText, 'features', { logger: mockLogger });

      expect(result).toBeNull();
    });
  });
});
