/**
 * Tests for getFirstNonEmptySummary utility
 * Verifies priority-based summary selection used by agent-output-modal
 * and agent-info-panel for preferring server-side accumulated summaries
 * over client-side extracted summaries.
 */

import { describe, it, expect } from 'vitest';
import { getFirstNonEmptySummary } from '../../../src/lib/summary-selection';

describe('getFirstNonEmptySummary', () => {
  it('should return the first non-empty string candidate', () => {
    const result = getFirstNonEmptySummary(null, 'Hello', 'World');
    expect(result).toBe('Hello');
  });

  it('should skip null candidates', () => {
    const result = getFirstNonEmptySummary(null, null, 'Fallback');
    expect(result).toBe('Fallback');
  });

  it('should skip undefined candidates', () => {
    const result = getFirstNonEmptySummary(undefined, undefined, 'Fallback');
    expect(result).toBe('Fallback');
  });

  it('should skip whitespace-only strings', () => {
    const result = getFirstNonEmptySummary('   ', '\n\t', 'Content');
    expect(result).toBe('Content');
  });

  it('should skip empty strings', () => {
    const result = getFirstNonEmptySummary('', '', 'Content');
    expect(result).toBe('Content');
  });

  it('should return null when all candidates are empty or null', () => {
    const result = getFirstNonEmptySummary(null, undefined, '', '  ');
    expect(result).toBeNull();
  });

  it('should return null when no candidates are provided', () => {
    const result = getFirstNonEmptySummary();
    expect(result).toBeNull();
  });

  it('should preserve original formatting (no trimming) of selected summary', () => {
    const result = getFirstNonEmptySummary('  Content with spaces  ');
    expect(result).toBe('  Content with spaces  ');
  });

  it('should prefer server-side summary over client-side when both exist', () => {
    const serverSummary =
      '## Summary from server\n- Pipeline step 1 complete\n- Pipeline step 2 complete';
    const clientSummary = '## Summary\n- Only step 2 visible';
    const result = getFirstNonEmptySummary(serverSummary, clientSummary);
    expect(result).toBe(serverSummary);
  });

  it('should fall back to client-side summary when server-side is null', () => {
    const clientSummary = '## Summary\n- Changes made';
    const result = getFirstNonEmptySummary(null, clientSummary);
    expect(result).toBe(clientSummary);
  });

  it('should handle single candidate', () => {
    expect(getFirstNonEmptySummary('Single')).toBe('Single');
    expect(getFirstNonEmptySummary(null)).toBeNull();
    expect(getFirstNonEmptySummary('')).toBeNull();
  });
});
