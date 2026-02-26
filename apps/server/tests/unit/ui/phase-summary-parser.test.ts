/**
 * Unit tests for the UI's log-parser phase summary parsing functions.
 *
 * These tests verify the behavior of:
 * - parsePhaseSummaries(): Parses accumulated summary into individual phases
 * - extractPhaseSummary(): Extracts a specific phase's summary
 * - extractImplementationSummary(): Extracts only the implementation phase
 * - isAccumulatedSummary(): Checks if summary is in accumulated format
 *
 * The accumulated summary format uses markdown headers with `###` for phase names
 * and `---` as separators between phases.
 *
 * TODO: These test helper functions are mirrored from apps/ui/src/lib/log-parser.ts
 * because server-side tests cannot import from the UI module. If the production
 * implementation changes, these tests may pass while production fails.
 * Consider adding an integration test that validates the actual UI parsing behavior.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// MIRRORED FUNCTIONS from apps/ui/src/lib/log-parser.ts
// ============================================================================
// NOTE: These functions are mirrored from the UI implementation because
// server-side tests cannot import from apps/ui/. Keep these in sync with the
// production implementation. The UI implementation includes additional
// handling for getPhaseSections/leadingImplementationSection for backward
// compatibility with mixed formats.

/**
 * Parses an accumulated summary string into individual phase summaries.
 */
function parsePhaseSummaries(summary: string | undefined): Map<string, string> {
  const phaseSummaries = new Map<string, string>();

  if (!summary || !summary.trim()) {
    return phaseSummaries;
  }

  // Split by the horizontal rule separator
  const sections = summary.split(/\n\n---\n\n/);

  for (const section of sections) {
    // Match the phase header pattern: ### Phase Name
    const headerMatch = section.match(/^###\s+(.+?)(?:\n|$)/);
    if (headerMatch) {
      const phaseName = headerMatch[1].trim().toLowerCase();
      // Extract content after the header (skip the header line and leading newlines)
      const content = section.substring(headerMatch[0].length).trim();
      phaseSummaries.set(phaseName, content);
    }
  }

  return phaseSummaries;
}

/**
 * Extracts a specific phase summary from an accumulated summary string.
 */
function extractPhaseSummary(summary: string | undefined, phaseName: string): string | null {
  const phaseSummaries = parsePhaseSummaries(summary);
  const normalizedPhaseName = phaseName.toLowerCase();
  return phaseSummaries.get(normalizedPhaseName) || null;
}

/**
 * Gets the implementation phase summary from an accumulated summary string.
 */
function extractImplementationSummary(summary: string | undefined): string | null {
  if (!summary || !summary.trim()) {
    return null;
  }

  const phaseSummaries = parsePhaseSummaries(summary);

  // Try exact match first
  const implementationContent = phaseSummaries.get('implementation');
  if (implementationContent) {
    return implementationContent;
  }

  // Fallback: find any phase containing "implement"
  for (const [phaseName, content] of phaseSummaries) {
    if (phaseName.includes('implement')) {
      return content;
    }
  }

  // If no phase summaries found, the summary might not be in accumulated format
  // (legacy or non-pipeline feature). In this case, return the whole summary
  // if it looks like a single summary (no phase headers).
  if (!summary.includes('### ') && !summary.includes('\n---\n')) {
    return summary;
  }

  return null;
}

/**
 * Checks if a summary string is in the accumulated multi-phase format.
 */
function isAccumulatedSummary(summary: string | undefined): boolean {
  if (!summary || !summary.trim()) {
    return false;
  }

  // Check for the presence of phase headers with separator
  const hasMultiplePhases =
    summary.includes('\n\n---\n\n') && summary.match(/###\s+.+/g)?.length > 0;

  return hasMultiplePhases;
}

describe('phase summary parser', () => {
  describe('parsePhaseSummaries', () => {
    it('should parse single phase summary', () => {
      const summary = `### Implementation

Created auth module with login functionality.`;

      const result = parsePhaseSummaries(summary);

      expect(result.size).toBe(1);
      expect(result.get('implementation')).toBe('Created auth module with login functionality.');
    });

    it('should parse multiple phase summaries', () => {
      const summary = `### Implementation

Created auth module.

---

### Testing

All tests pass.

---

### Code Review

Approved with minor suggestions.`;

      const result = parsePhaseSummaries(summary);

      expect(result.size).toBe(3);
      expect(result.get('implementation')).toBe('Created auth module.');
      expect(result.get('testing')).toBe('All tests pass.');
      expect(result.get('code review')).toBe('Approved with minor suggestions.');
    });

    it('should handle empty input', () => {
      expect(parsePhaseSummaries('').size).toBe(0);
      expect(parsePhaseSummaries(undefined).size).toBe(0);
      expect(parsePhaseSummaries('   \n\n   ').size).toBe(0);
    });

    it('should handle phase names with spaces', () => {
      const summary = `### Code Review

Review findings here.`;

      const result = parsePhaseSummaries(summary);
      expect(result.get('code review')).toBe('Review findings here.');
    });

    it('should normalize phase names to lowercase', () => {
      const summary = `### IMPLEMENTATION

Content here.`;

      const result = parsePhaseSummaries(summary);
      expect(result.get('implementation')).toBe('Content here.');
      expect(result.get('IMPLEMENTATION')).toBeUndefined();
    });

    it('should handle content with markdown', () => {
      const summary = `### Implementation

## Changes Made
- Fixed bug in parser.ts
- Added error handling

\`\`\`typescript
const x = 1;
\`\`\``;

      const result = parsePhaseSummaries(summary);
      expect(result.get('implementation')).toContain('## Changes Made');
      expect(result.get('implementation')).toContain('```typescript');
    });

    it('should return empty map for non-accumulated format', () => {
      // Legacy format without phase headers
      const summary = `## Summary

This is a simple summary without phase headers.`;

      const result = parsePhaseSummaries(summary);
      expect(result.size).toBe(0);
    });
  });

  describe('extractPhaseSummary', () => {
    it('should extract specific phase by name (case-insensitive)', () => {
      const summary = `### Implementation

Implementation content.

---

### Testing

Testing content.`;

      expect(extractPhaseSummary(summary, 'implementation')).toBe('Implementation content.');
      expect(extractPhaseSummary(summary, 'IMPLEMENTATION')).toBe('Implementation content.');
      expect(extractPhaseSummary(summary, 'Implementation')).toBe('Implementation content.');
      expect(extractPhaseSummary(summary, 'testing')).toBe('Testing content.');
    });

    it('should return null for non-existent phase', () => {
      const summary = `### Implementation

Content here.`;

      expect(extractPhaseSummary(summary, 'code review')).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(extractPhaseSummary('', 'implementation')).toBeNull();
      expect(extractPhaseSummary(undefined, 'implementation')).toBeNull();
    });
  });

  describe('extractImplementationSummary', () => {
    it('should extract implementation phase from accumulated summary', () => {
      const summary = `### Implementation

Created auth module.

---

### Testing

All tests pass.

---

### Code Review

Approved.`;

      const result = extractImplementationSummary(summary);
      expect(result).toBe('Created auth module.');
      expect(result).not.toContain('Testing');
      expect(result).not.toContain('Code Review');
    });

    it('should return implementation phase even when not first', () => {
      const summary = `### Planning

Plan created.

---

### Implementation

Implemented the feature.

---

### Review

Reviewed.`;

      const result = extractImplementationSummary(summary);
      expect(result).toBe('Implemented the feature.');
    });

    it('should handle phase with "implementation" in name', () => {
      const summary = `### Feature Implementation

Built the feature.`;

      const result = extractImplementationSummary(summary);
      expect(result).toBe('Built the feature.');
    });

    it('should return full summary for non-accumulated format (legacy)', () => {
      // Non-pipeline features store summary without phase headers
      const summary = `## Changes
- Fixed bug
- Added tests`;

      const result = extractImplementationSummary(summary);
      expect(result).toBe(summary);
    });

    it('should return null for empty input', () => {
      expect(extractImplementationSummary('')).toBeNull();
      expect(extractImplementationSummary(undefined)).toBeNull();
      expect(extractImplementationSummary('   \n\n   ')).toBeNull();
    });

    it('should return null when no implementation phase in accumulated summary', () => {
      const summary = `### Testing

Tests written.

---

### Code Review

Approved.`;

      const result = extractImplementationSummary(summary);
      expect(result).toBeNull();
    });
  });

  describe('isAccumulatedSummary', () => {
    it('should return true for accumulated multi-phase summary', () => {
      const summary = `### Implementation

Content.

---

### Testing

Content.`;

      expect(isAccumulatedSummary(summary)).toBe(true);
    });

    it('should return false for single phase summary (no separator)', () => {
      const summary = `### Implementation

Content.`;

      expect(isAccumulatedSummary(summary)).toBe(false);
    });

    it('should return false for legacy non-accumulated format', () => {
      const summary = `## Summary

This is a simple summary.`;

      expect(isAccumulatedSummary(summary)).toBe(false);
    });

    it('should return false for empty input', () => {
      expect(isAccumulatedSummary('')).toBe(false);
      expect(isAccumulatedSummary(undefined)).toBe(false);
      expect(isAccumulatedSummary('   \n\n   ')).toBe(false);
    });

    it('should return true even for two phases', () => {
      const summary = `### Implementation

Content A.

---

### Code Review

Content B.`;

      expect(isAccumulatedSummary(summary)).toBe(true);
    });
  });

  describe('acceptance criteria scenarios', () => {
    it('AC1: Implementation summary preserved when Testing completes', () => {
      // Given a task card completes the Implementation phase,
      // when the Testing phase subsequently completes,
      // then the Implementation phase summary must remain stored independently
      const summary = `### Implementation

- Created auth module
- Added user service

---

### Testing

- 42 tests pass
- 98% coverage`;

      const impl = extractImplementationSummary(summary);
      const testing = extractPhaseSummary(summary, 'testing');

      expect(impl).toBe('- Created auth module\n- Added user service');
      expect(testing).toBe('- 42 tests pass\n- 98% coverage');
      expect(impl).not.toContain('Testing');
      expect(testing).not.toContain('auth module');
    });

    it('AC4: Implementation Summary tab shows only implementation phase', () => {
      // Given a task card has completed the Implementation phase
      // (regardless of how many subsequent phases have run),
      // when the user opens the "Implementation Summary" tab,
      // then it must display only the summary produced by the Implementation phase
      const summary = `### Implementation

Implementation phase output here.

---

### Testing

Testing phase output here.

---

### Code Review

Code review output here.`;

      const impl = extractImplementationSummary(summary);

      expect(impl).toBe('Implementation phase output here.');
      expect(impl).not.toContain('Testing');
      expect(impl).not.toContain('Code Review');
    });

    it('AC5: Empty state when implementation not started', () => {
      // Given a task card has not yet started the Implementation phase
      const summary = `### Planning

Planning phase complete.`;

      const impl = extractImplementationSummary(summary);

      // Should return null (UI shows "No implementation summary available")
      expect(impl).toBeNull();
    });

    it('AC6: Single phase summary displayed correctly', () => {
      // Given a task card where Implementation was the only completed phase
      const summary = `### Implementation

Only implementation was done.`;

      const impl = extractImplementationSummary(summary);

      expect(impl).toBe('Only implementation was done.');
    });

    it('AC9: Mid-progress shows only completed phases', () => {
      // Given a task card is mid-progress
      // (e.g., Implementation and Testing complete, Code Review pending)
      const summary = `### Implementation

Implementation done.

---

### Testing

Testing done.`;

      const phases = parsePhaseSummaries(summary);

      expect(phases.size).toBe(2);
      expect(phases.has('implementation')).toBe(true);
      expect(phases.has('testing')).toBe(true);
      expect(phases.has('code review')).toBe(false);
    });

    it('AC10: All phases in chronological order', () => {
      // Given all phases of a task card are complete
      const summary = `### Implementation

First phase content.

---

### Testing

Second phase content.

---

### Code Review

Third phase content.`;

      // ParsePhaseSummaries should preserve order
      const phases = parsePhaseSummaries(summary);
      const phaseNames = [...phases.keys()];

      expect(phaseNames).toEqual(['implementation', 'testing', 'code review']);
    });

    it('AC17: Retried phase shows only latest', () => {
      // Given a phase was retried, when viewing the Summary tab,
      // only one entry for the retried phase must appear (the latest retry's summary)
      //
      // Note: The server-side FeatureStateManager overwrites the phase summary
      // when the same phase runs again, so we only have one entry per phase name.
      // This test verifies that the parser correctly handles this.
      const summary = `### Implementation

First attempt content.

---

### Testing

First test run.

---

### Implementation

Retry content - fixed issues.

---

### Testing

Retry - all tests now pass.`;

      const phases = parsePhaseSummaries(summary);

      // The parser will have both entries, but Map keeps last value for same key
      expect(phases.get('implementation')).toBe('Retry content - fixed issues.');
      expect(phases.get('testing')).toBe('Retry - all tests now pass.');
    });
  });
});
