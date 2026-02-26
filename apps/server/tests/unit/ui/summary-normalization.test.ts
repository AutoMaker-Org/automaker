/**
 * Unit tests for summary normalization between UI components and parser functions.
 *
 * These tests verify that:
 * - getFirstNonEmptySummary returns string | null
 * - parseAllPhaseSummaries and isAccumulatedSummary expect string | undefined
 * - The normalization (summary ?? undefined) correctly converts null to undefined
 *
 * This ensures the UI components properly bridge the type gap between:
 * - getFirstNonEmptySummary (returns string | null)
 * - parseAllPhaseSummaries (expects string | undefined)
 * - isAccumulatedSummary (expects string | undefined)
 */

import { describe, it, expect } from 'vitest';
import { parseAllPhaseSummaries, isAccumulatedSummary } from '../../../../ui/src/lib/log-parser.ts';
import { getFirstNonEmptySummary } from '../../../../ui/src/lib/summary-selection.ts';

describe('Summary Normalization', () => {
  describe('getFirstNonEmptySummary', () => {
    it('should return the first non-empty string', () => {
      const result = getFirstNonEmptySummary(null, undefined, 'valid summary', 'another');
      expect(result).toBe('valid summary');
    });

    it('should return null when all candidates are empty', () => {
      const result = getFirstNonEmptySummary(null, undefined, '', '   ');
      expect(result).toBeNull();
    });

    it('should return null when no candidates provided', () => {
      const result = getFirstNonEmptySummary();
      expect(result).toBeNull();
    });

    it('should return null for all null/undefined candidates', () => {
      const result = getFirstNonEmptySummary(null, undefined, null);
      expect(result).toBeNull();
    });

    it('should preserve original string formatting (not trim)', () => {
      const result = getFirstNonEmptySummary('  summary with spaces  ');
      expect(result).toBe('  summary with spaces  ');
    });
  });

  describe('parseAllPhaseSummaries with normalized input', () => {
    it('should handle null converted to undefined via ?? operator', () => {
      const summary = getFirstNonEmptySummary(null, undefined);
      // This is the normalization: summary ?? undefined
      const normalizedSummary = summary ?? undefined;

      // TypeScript should accept this without error
      const result = parseAllPhaseSummaries(normalizedSummary);
      expect(result).toEqual([]);
    });

    it('should parse accumulated summary when non-null is normalized', () => {
      const rawSummary =
        '### Implementation\n\nDid some work\n\n---\n\n### Testing\n\nAll tests pass';
      const summary = getFirstNonEmptySummary(null, rawSummary);
      const normalizedSummary = summary ?? undefined;

      const result = parseAllPhaseSummaries(normalizedSummary);
      expect(result).toHaveLength(2);
      expect(result[0].phaseName).toBe('Implementation');
      expect(result[1].phaseName).toBe('Testing');
    });
  });

  describe('isAccumulatedSummary with normalized input', () => {
    it('should return false for null converted to undefined', () => {
      const summary = getFirstNonEmptySummary(null, undefined);
      const normalizedSummary = summary ?? undefined;

      const result = isAccumulatedSummary(normalizedSummary);
      expect(result).toBe(false);
    });

    it('should return true for valid accumulated summary after normalization', () => {
      const rawSummary =
        '### Implementation\n\nDid some work\n\n---\n\n### Testing\n\nAll tests pass';
      const summary = getFirstNonEmptySummary(rawSummary);
      const normalizedSummary = summary ?? undefined;

      const result = isAccumulatedSummary(normalizedSummary);
      expect(result).toBe(true);
    });

    it('should return false for single-phase summary after normalization', () => {
      const rawSummary = '### Implementation\n\nDid some work';
      const summary = getFirstNonEmptySummary(rawSummary);
      const normalizedSummary = summary ?? undefined;

      const result = isAccumulatedSummary(normalizedSummary);
      expect(result).toBe(false);
    });
  });

  describe('Type safety verification', () => {
    it('should demonstrate that null must be normalized to undefined', () => {
      // This test documents the type mismatch that requires normalization
      const summary: string | null = getFirstNonEmptySummary(null);
      const normalizedSummary: string | undefined = summary ?? undefined;

      // parseAllPhaseSummaries expects string | undefined, not string | null
      // The normalization converts null -> undefined, which is compatible
      const result = parseAllPhaseSummaries(normalizedSummary);
      expect(result).toEqual([]);
    });

    it('should work with the actual usage pattern from components', () => {
      // Simulates the actual pattern used in summary-dialog.tsx and agent-output-modal.tsx
      const featureSummary: string | null | undefined = null;
      const extractedSummary: string | null | undefined = undefined;

      const rawSummary = getFirstNonEmptySummary(featureSummary, extractedSummary);
      const normalizedSummary = rawSummary ?? undefined;

      // Both parser functions should work with the normalized value
      const phases = parseAllPhaseSummaries(normalizedSummary);
      const hasMultiple = isAccumulatedSummary(normalizedSummary);

      expect(phases).toEqual([]);
      expect(hasMultiple).toBe(false);
    });
  });
});
