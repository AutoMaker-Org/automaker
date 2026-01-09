/**
 * JSON Extraction Utilities
 *
 * Robust JSON extraction from AI responses that may contain markdown,
 * code blocks, or other text mixed with JSON content.
 *
 * Used by various routes that parse structured output from Cursor or
 * Claude responses when structured output is not available.
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('JsonExtractor');

/**
 * Logger interface for optional custom logging
 */
export interface JsonExtractorLogger {
  debug: (message: string, ...args: unknown[]) => void;
  warn?: (message: string, ...args: unknown[]) => void;
}

/**
 * Options for JSON extraction
 */
export interface ExtractJsonOptions {
  /** Custom logger (defaults to internal logger) */
  logger?: JsonExtractorLogger;
  /** Required key that must be present in the extracted JSON */
  requiredKey?: string;
  /** Whether the required key's value must be an array */
  requireArray?: boolean;
}

/**
 * Extract JSON from response text using multiple strategies.
 *
 * Strategies tried in order:
 * 1. JSON in ```json code block
 * 2. JSON in ``` code block (no language)
 * 3. Find JSON object by matching braces (starting with requiredKey if specified)
 * 4. Find any JSON object by matching braces
 * 5. Parse entire response as JSON
 *
 * @param responseText - The raw response text that may contain JSON
 * @param options - Optional extraction options
 * @returns Parsed JSON object or null if extraction fails
 */
export function extractJson<T = Record<string, unknown>>(
  responseText: string,
  options: ExtractJsonOptions = {}
): T | null {
  const log = options.logger || logger;
  const requiredKey = options.requiredKey;
  const requireArray = options.requireArray ?? false;

  /**
   * Validate that the result has the required key/structure
   */
  const validateResult = (result: unknown): result is T => {
    if (!result || typeof result !== 'object') return false;
    if (requiredKey) {
      const obj = result as Record<string, unknown>;
      if (!(requiredKey in obj)) return false;
      if (requireArray && !Array.isArray(obj[requiredKey])) return false;
    }
    return true;
  };

  /**
   * Find matching closing brace by counting brackets
   */
  const findMatchingBrace = (text: string, startIdx: number): number => {
    let depth = 0;
    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === '{') depth++;
      if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          return i + 1;
        }
      }
    }
    return -1;
  };

  const strategies = [
    // Strategy 1: JSON in ```json code block
    () => {
      const match = responseText.match(/```json\s*([\s\S]*?)```/);
      if (match) {
        log.debug('Extracting JSON from ```json code block');
        return JSON.parse(match[1].trim());
      }
      return null;
    },

    // Strategy 2: JSON in ``` code block (no language specified)
    () => {
      const match = responseText.match(/```\s*([\s\S]*?)```/);
      if (match) {
        const content = match[1].trim();
        // Only try if it looks like JSON (starts with { or [)
        if (content.startsWith('{') || content.startsWith('[')) {
          log.debug('Extracting JSON from ``` code block');
          return JSON.parse(content);
        }
      }
      return null;
    },

    // Strategy 3: Find JSON object containing the required key (if specified)
    () => {
      if (!requiredKey) return null;

      const searchPattern = `{"${requiredKey}"`;
      const startIdx = responseText.indexOf(searchPattern);
      if (startIdx === -1) return null;

      const endIdx = findMatchingBrace(responseText, startIdx);
      if (endIdx > startIdx) {
        log.debug(`Extracting JSON with required key "${requiredKey}"`);
        return JSON.parse(responseText.slice(startIdx, endIdx));
      }
      return null;
    },

    // Strategy 4: Find any JSON object by matching braces
    () => {
      const startIdx = responseText.indexOf('{');
      if (startIdx === -1) return null;

      const endIdx = findMatchingBrace(responseText, startIdx);
      if (endIdx > startIdx) {
        log.debug('Extracting JSON by brace matching');
        return JSON.parse(responseText.slice(startIdx, endIdx));
      }
      return null;
    },

    // Strategy 5: Find JSON using first { to last } (may be less accurate)
    () => {
      const firstBrace = responseText.indexOf('{');
      const lastBrace = responseText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        log.debug('Extracting JSON from first { to last }');
        return JSON.parse(responseText.slice(firstBrace, lastBrace + 1));
      }
      return null;
    },

    // Strategy 6: Try parsing the entire response as JSON
    () => {
      const trimmed = responseText.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        log.debug('Parsing entire response as JSON');
        return JSON.parse(trimmed);
      }
      return null;
    },
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (validateResult(result)) {
        log.debug('Successfully extracted JSON');
        return result as T;
      }
    } catch {
      // Strategy failed, try next
    }
  }

  log.debug('Failed to extract JSON from response');
  return null;
}

/**
 * Extract JSON with a specific required key.
 * Convenience wrapper around extractJson.
 *
 * @param responseText - The raw response text
 * @param requiredKey - Key that must be present in the extracted JSON
 * @param options - Additional options
 * @returns Parsed JSON object or null
 */
export function extractJsonWithKey<T = Record<string, unknown>>(
  responseText: string,
  requiredKey: string,
  options: Omit<ExtractJsonOptions, 'requiredKey'> = {}
): T | null {
  return extractJson<T>(responseText, { ...options, requiredKey });
}

/**
 * Extract JSON that has a required array property.
 * Useful for extracting responses like { "suggestions": [...] }
 *
 * @param responseText - The raw response text
 * @param arrayKey - Key that must contain an array
 * @param options - Additional options
 * @returns Parsed JSON object or null
 */
export function extractJsonWithArray<T = Record<string, unknown>>(
  responseText: string,
  arrayKey: string,
  options: Omit<ExtractJsonOptions, 'requiredKey' | 'requireArray'> = {}
): T | null {
  return extractJson<T>(responseText, { ...options, requiredKey: arrayKey, requireArray: true });
}
