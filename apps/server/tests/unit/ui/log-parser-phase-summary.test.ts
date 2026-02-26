/**
 * Unit tests for log-parser phase summary parsing functions.
 *
 * These functions are used to parse accumulated summaries that contain multiple
 * pipeline step summaries separated by `---` and identified by `### StepName` headers.
 *
 * Functions tested:
 * - parsePhaseSummaries: Parses the entire accumulated summary into a Map
 * - extractPhaseSummary: Extracts a specific phase's content
 * - extractImplementationSummary: Extracts implementation phase content (convenience)
 * - isAccumulatedSummary: Checks if a summary is in accumulated format
 */

import { describe, it, expect } from 'vitest';

// Mirror the functions from apps/ui/src/lib/log-parser.ts
// (We can't import directly because it's a UI file)

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
 * Extracts the implementation phase summary from an accumulated summary string.
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

/**
 * Represents a single phase entry in an accumulated summary.
 */
interface PhaseSummaryEntry {
  /** The phase name (e.g., "Implementation", "Testing", "Code Review") */
  phaseName: string;
  /** The content of this phase's summary */
  content: string;
  /** The original header line (e.g., "### Implementation") */
  header: string;
}

/** Default phase name used for non-accumulated summaries */
const DEFAULT_PHASE_NAME = 'Summary';

/**
 * Parses an accumulated summary into individual phase entries.
 * Returns phases in the order they appear in the summary.
 */
function parseAllPhaseSummaries(summary: string | undefined): PhaseSummaryEntry[] {
  const entries: PhaseSummaryEntry[] = [];

  if (!summary || !summary.trim()) {
    return entries;
  }

  // Check if this is an accumulated summary (has phase headers)
  if (!summary.includes('### ')) {
    // Not an accumulated summary - return as single entry with generic name
    return [
      { phaseName: DEFAULT_PHASE_NAME, content: summary, header: `### ${DEFAULT_PHASE_NAME}` },
    ];
  }

  // Split by the horizontal rule separator
  const sections = summary.split(/\n\n---\n\n/);

  for (const section of sections) {
    // Match the phase header pattern: ### Phase Name
    const headerMatch = section.match(/^(###\s+)(.+?)(?:\n|$)/);
    if (headerMatch) {
      const header = headerMatch[0].trim();
      const phaseName = headerMatch[2].trim();
      // Extract content after the header (skip the header line and leading newlines)
      const content = section.substring(headerMatch[0].length).trim();
      entries.push({ phaseName, content, header });
    }
  }

  return entries;
}

describe('parsePhaseSummaries', () => {
  describe('basic parsing', () => {
    it('should parse single phase summary', () => {
      const summary = `### Implementation

## Changes Made
- Created new module
- Added unit tests`;

      const result = parsePhaseSummaries(summary);

      expect(result.size).toBe(1);
      expect(result.get('implementation')).toBe(
        '## Changes Made\n- Created new module\n- Added unit tests'
      );
    });

    it('should parse multiple phase summaries', () => {
      const summary = `### Implementation

## Changes Made
- Created new module

---

### Testing

## Test Results
- All tests pass`;

      const result = parsePhaseSummaries(summary);

      expect(result.size).toBe(2);
      expect(result.get('implementation')).toBe('## Changes Made\n- Created new module');
      expect(result.get('testing')).toBe('## Test Results\n- All tests pass');
    });

    it('should handle three or more phases', () => {
      const summary = `### Planning

Plan created

---

### Implementation

Code written

---

### Testing

Tests pass

---

### Refinement

Code polished`;

      const result = parsePhaseSummaries(summary);

      expect(result.size).toBe(4);
      expect(result.get('planning')).toBe('Plan created');
      expect(result.get('implementation')).toBe('Code written');
      expect(result.get('testing')).toBe('Tests pass');
      expect(result.get('refinement')).toBe('Code polished');
    });
  });

  describe('edge cases', () => {
    it('should return empty map for undefined summary', () => {
      const result = parsePhaseSummaries(undefined);
      expect(result.size).toBe(0);
    });

    it('should return empty map for null summary', () => {
      const result = parsePhaseSummaries(null as unknown as string);
      expect(result.size).toBe(0);
    });

    it('should return empty map for empty string', () => {
      const result = parsePhaseSummaries('');
      expect(result.size).toBe(0);
    });

    it('should return empty map for whitespace-only string', () => {
      const result = parsePhaseSummaries('   \n\n   ');
      expect(result.size).toBe(0);
    });

    it('should handle summary without phase headers', () => {
      const summary = 'Just some regular content without headers';
      const result = parsePhaseSummaries(summary);
      expect(result.size).toBe(0);
    });

    it('should handle section without header after separator', () => {
      const summary = `### Implementation

Content here

---

This section has no header`;

      const result = parsePhaseSummaries(summary);

      expect(result.size).toBe(1);
      expect(result.get('implementation')).toBe('Content here');
    });
  });

  describe('phase name normalization', () => {
    it('should normalize phase names to lowercase', () => {
      const summary = `### IMPLEMENTATION

Content`;

      const result = parsePhaseSummaries(summary);
      expect(result.has('implementation')).toBe(true);
      expect(result.has('IMPLEMENTATION')).toBe(false);
    });

    it('should handle mixed case phase names', () => {
      const summary = `### Code Review

Content`;

      const result = parsePhaseSummaries(summary);
      expect(result.has('code review')).toBe(true);
    });

    it('should preserve spaces in multi-word phase names', () => {
      const summary = `### Code Review

Content`;

      const result = parsePhaseSummaries(summary);
      expect(result.get('code review')).toBe('Content');
    });
  });

  describe('content preservation', () => {
    it('should preserve markdown formatting in content', () => {
      const summary = `### Implementation

## Heading
- **Bold text**
- \`code\`
\`\`\`typescript
const x = 1;
\`\`\``;

      const result = parsePhaseSummaries(summary);
      const content = result.get('implementation');

      expect(content).toContain('**Bold text**');
      expect(content).toContain('`code`');
      expect(content).toContain('```typescript');
    });

    it('should preserve unicode in content', () => {
      const summary = `### Testing

Results: ✅ 42 passed, ❌ 0 failed`;

      const result = parsePhaseSummaries(summary);
      expect(result.get('testing')).toContain('✅');
      expect(result.get('testing')).toContain('❌');
    });

    it('should preserve tables in content', () => {
      const summary = `### Testing

| Test | Result |
|------|--------|
| Unit | Pass   |`;

      const result = parsePhaseSummaries(summary);
      expect(result.get('testing')).toContain('| Test | Result |');
    });

    it('should handle empty phase content', () => {
      const summary = `### Implementation

---

### Testing

Content`;

      const result = parsePhaseSummaries(summary);
      expect(result.get('implementation')).toBe('');
      expect(result.get('testing')).toBe('Content');
    });
  });
});

describe('extractPhaseSummary', () => {
  describe('extraction by phase name', () => {
    it('should extract specified phase content', () => {
      const summary = `### Implementation

Implementation content

---

### Testing

Testing content`;

      expect(extractPhaseSummary(summary, 'Implementation')).toBe('Implementation content');
      expect(extractPhaseSummary(summary, 'Testing')).toBe('Testing content');
    });

    it('should be case-insensitive for phase name', () => {
      const summary = `### Implementation

Content`;

      expect(extractPhaseSummary(summary, 'implementation')).toBe('Content');
      expect(extractPhaseSummary(summary, 'IMPLEMENTATION')).toBe('Content');
      expect(extractPhaseSummary(summary, 'ImPlEmEnTaTiOn')).toBe('Content');
    });

    it('should return null for non-existent phase', () => {
      const summary = `### Implementation

Content`;

      expect(extractPhaseSummary(summary, 'NonExistent')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return null for undefined summary', () => {
      expect(extractPhaseSummary(undefined, 'Implementation')).toBeNull();
    });

    it('should return null for empty summary', () => {
      expect(extractPhaseSummary('', 'Implementation')).toBeNull();
    });

    it('should handle whitespace in phase name', () => {
      const summary = `### Code Review

Content`;

      expect(extractPhaseSummary(summary, 'Code Review')).toBe('Content');
      expect(extractPhaseSummary(summary, 'code review')).toBe('Content');
    });
  });
});

describe('extractImplementationSummary', () => {
  describe('exact match', () => {
    it('should extract implementation phase by exact name', () => {
      const summary = `### Implementation

## Changes Made
- Created feature
- Added tests

---

### Testing

Tests pass`;

      const result = extractImplementationSummary(summary);
      expect(result).toBe('## Changes Made\n- Created feature\n- Added tests');
    });

    it('should be case-insensitive', () => {
      const summary = `### IMPLEMENTATION

Content`;

      expect(extractImplementationSummary(summary)).toBe('Content');
    });
  });

  describe('partial match fallback', () => {
    it('should find phase containing "implement"', () => {
      const summary = `### Feature Implementation

Content here`;

      const result = extractImplementationSummary(summary);
      expect(result).toBe('Content here');
    });

    it('should find phase containing "implementation"', () => {
      const summary = `### Implementation Phase

Content here`;

      const result = extractImplementationSummary(summary);
      expect(result).toBe('Content here');
    });
  });

  describe('legacy/non-accumulated summary handling', () => {
    it('should return full summary if no phase headers present', () => {
      const summary = `## Changes Made
- Created feature
- Added tests`;

      const result = extractImplementationSummary(summary);
      expect(result).toBe(summary);
    });

    it('should return null if summary has phase headers but no implementation', () => {
      const summary = `### Testing

Tests pass

---

### Review

Review complete`;

      const result = extractImplementationSummary(summary);
      expect(result).toBeNull();
    });

    it('should not return full summary if it contains phase headers', () => {
      const summary = `### Testing

Tests pass`;

      const result = extractImplementationSummary(summary);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return null for undefined summary', () => {
      expect(extractImplementationSummary(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractImplementationSummary('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(extractImplementationSummary('   \n\n   ')).toBeNull();
    });
  });
});

describe('isAccumulatedSummary', () => {
  describe('accumulated format detection', () => {
    it('should return true for accumulated summary with separator and headers', () => {
      const summary = `### Implementation

Content

---

### Testing

Content`;

      expect(isAccumulatedSummary(summary)).toBe(true);
    });

    it('should return true for accumulated summary with multiple phases', () => {
      const summary = `### Phase 1

Content 1

---

### Phase 2

Content 2

---

### Phase 3

Content 3`;

      expect(isAccumulatedSummary(summary)).toBe(true);
    });

    it('should return true for accumulated summary with just one phase and separator', () => {
      // Even a single phase with a separator suggests it's in accumulated format
      const summary = `### Implementation

Content

---

### Testing

More content`;

      expect(isAccumulatedSummary(summary)).toBe(true);
    });
  });

  describe('non-accumulated format detection', () => {
    it('should return false for summary without separator', () => {
      const summary = `### Implementation

Just content`;

      expect(isAccumulatedSummary(summary)).toBe(false);
    });

    it('should return false for summary with separator but no headers', () => {
      const summary = `Content

---

More content`;

      expect(isAccumulatedSummary(summary)).toBe(false);
    });

    it('should return false for simple text summary', () => {
      const summary = 'Just a simple summary without any special formatting';
      expect(isAccumulatedSummary(summary)).toBe(false);
    });

    it('should return false for markdown summary without phase headers', () => {
      const summary = `## Changes Made
- Created feature
- Added tests`;
      expect(isAccumulatedSummary(summary)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for undefined summary', () => {
      expect(isAccumulatedSummary(undefined)).toBe(false);
    });

    it('should return false for null summary', () => {
      expect(isAccumulatedSummary(null as unknown as string)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isAccumulatedSummary('')).toBe(false);
    });

    it('should return false for whitespace-only string', () => {
      expect(isAccumulatedSummary('   \n\n   ')).toBe(false);
    });
  });
});

describe('Integration: Full parsing workflow', () => {
  it('should correctly parse typical server-accumulated pipeline summary', () => {
    // This simulates what FeatureStateManager.saveFeatureSummary() produces
    const summary = [
      '### Implementation',
      '',
      '## Changes',
      '- Added auth module',
      '- Created user service',
      '',
      '---',
      '',
      '### Code Review',
      '',
      '## Review Results',
      '- Style issues fixed',
      '- Added error handling',
      '',
      '---',
      '',
      '### Testing',
      '',
      '## Test Results',
      '- 42 tests pass',
      '- 98% coverage',
    ].join('\n');

    // Verify isAccumulatedSummary
    expect(isAccumulatedSummary(summary)).toBe(true);

    // Verify parsePhaseSummaries
    const phases = parsePhaseSummaries(summary);
    expect(phases.size).toBe(3);
    expect(phases.get('implementation')).toContain('Added auth module');
    expect(phases.get('code review')).toContain('Style issues fixed');
    expect(phases.get('testing')).toContain('42 tests pass');

    // Verify extractPhaseSummary
    expect(extractPhaseSummary(summary, 'Implementation')).toContain('Added auth module');
    expect(extractPhaseSummary(summary, 'Code Review')).toContain('Style issues fixed');
    expect(extractPhaseSummary(summary, 'Testing')).toContain('42 tests pass');

    // Verify extractImplementationSummary
    expect(extractImplementationSummary(summary)).toContain('Added auth module');
  });

  it('should handle legacy non-pipeline summary correctly', () => {
    // Legacy features have simple summaries without accumulation
    const summary = `## Implementation Complete
- Created the feature
- All tests pass`;

    // Should NOT be detected as accumulated
    expect(isAccumulatedSummary(summary)).toBe(false);

    // parsePhaseSummaries should return empty
    const phases = parsePhaseSummaries(summary);
    expect(phases.size).toBe(0);

    // extractPhaseSummary should return null
    expect(extractPhaseSummary(summary, 'Implementation')).toBeNull();

    // extractImplementationSummary should return the full summary (legacy handling)
    expect(extractImplementationSummary(summary)).toBe(summary);
  });

  it('should handle single-step pipeline summary', () => {
    // A single pipeline step still gets the header but no separator
    const summary = `### Implementation

## Changes
- Created the feature`;

    // Should NOT be detected as accumulated (no separator)
    expect(isAccumulatedSummary(summary)).toBe(false);

    // parsePhaseSummaries should still extract the single phase
    const phases = parsePhaseSummaries(summary);
    expect(phases.size).toBe(1);
    expect(phases.get('implementation')).toContain('Created the feature');
  });
});

/**
 * KEY ARCHITECTURE NOTES:
 *
 * 1. The accumulated summary format uses:
 *    - `### PhaseName` for step headers
 *    - `\n\n---\n\n` as separator between steps
 *
 * 2. Phase names are normalized to lowercase in the Map for case-insensitive lookup.
 *
 * 3. Legacy summaries (non-pipeline features) don't have phase headers and should
 *    be returned as-is by extractImplementationSummary.
 *
 * 4. isAccumulatedSummary() checks for BOTH separator AND phase headers to be
 *    confident that the summary is in the accumulated format.
 *
 * 5. The server-side FeatureStateManager.saveFeatureSummary() is responsible for
 *    creating summaries in this accumulated format.
 */

describe('parseAllPhaseSummaries', () => {
  describe('basic parsing', () => {
    it('should parse single phase summary into array with one entry', () => {
      const summary = `### Implementation

## Changes Made
- Created new module
- Added unit tests`;

      const result = parseAllPhaseSummaries(summary);

      expect(result.length).toBe(1);
      expect(result[0].phaseName).toBe('Implementation');
      expect(result[0].content).toBe('## Changes Made\n- Created new module\n- Added unit tests');
      expect(result[0].header).toBe('### Implementation');
    });

    it('should parse multiple phase summaries in order', () => {
      const summary = `### Implementation

## Changes Made
- Created new module

---

### Testing

## Test Results
- All tests pass`;

      const result = parseAllPhaseSummaries(summary);

      expect(result.length).toBe(2);
      // Verify order is preserved
      expect(result[0].phaseName).toBe('Implementation');
      expect(result[0].content).toBe('## Changes Made\n- Created new module');
      expect(result[1].phaseName).toBe('Testing');
      expect(result[1].content).toBe('## Test Results\n- All tests pass');
    });

    it('should parse three or more phases in correct order', () => {
      const summary = `### Planning

Plan created

---

### Implementation

Code written

---

### Testing

Tests pass

---

### Refinement

Code polished`;

      const result = parseAllPhaseSummaries(summary);

      expect(result.length).toBe(4);
      expect(result[0].phaseName).toBe('Planning');
      expect(result[1].phaseName).toBe('Implementation');
      expect(result[2].phaseName).toBe('Testing');
      expect(result[3].phaseName).toBe('Refinement');
    });
  });

  describe('non-accumulated summary handling', () => {
    it('should return single entry for summary without phase headers', () => {
      const summary = `## Changes Made
- Created feature
- Added tests`;

      const result = parseAllPhaseSummaries(summary);

      expect(result.length).toBe(1);
      expect(result[0].phaseName).toBe('Summary');
      expect(result[0].content).toBe(summary);
    });

    it('should return single entry for simple text summary', () => {
      const summary = 'Just a simple summary without any special formatting';

      const result = parseAllPhaseSummaries(summary);

      expect(result.length).toBe(1);
      expect(result[0].phaseName).toBe('Summary');
      expect(result[0].content).toBe(summary);
    });
  });

  describe('edge cases', () => {
    it('should return empty array for undefined summary', () => {
      const result = parseAllPhaseSummaries(undefined);
      expect(result.length).toBe(0);
    });

    it('should return empty array for empty string', () => {
      const result = parseAllPhaseSummaries('');
      expect(result.length).toBe(0);
    });

    it('should return empty array for whitespace-only string', () => {
      const result = parseAllPhaseSummaries('   \n\n   ');
      expect(result.length).toBe(0);
    });

    it('should handle section without header after separator', () => {
      const summary = `### Implementation

Content here

---

This section has no header`;

      const result = parseAllPhaseSummaries(summary);

      expect(result.length).toBe(1);
      expect(result[0].phaseName).toBe('Implementation');
    });
  });

  describe('content preservation', () => {
    it('should preserve markdown formatting in content', () => {
      const summary = `### Implementation

## Heading
- **Bold text**
- \`code\`
\`\`\`typescript
const x = 1;
\`\`\``;

      const result = parseAllPhaseSummaries(summary);
      const content = result[0].content;

      expect(content).toContain('**Bold text**');
      expect(content).toContain('`code`');
      expect(content).toContain('```typescript');
    });

    it('should preserve unicode in content', () => {
      const summary = `### Testing

Results: ✅ 42 passed, ❌ 0 failed`;

      const result = parseAllPhaseSummaries(summary);
      expect(result[0].content).toContain('✅');
      expect(result[0].content).toContain('❌');
    });

    it('should preserve tables in content', () => {
      const summary = `### Testing

| Test | Result |
|------|--------|
| Unit | Pass   |`;

      const result = parseAllPhaseSummaries(summary);
      expect(result[0].content).toContain('| Test | Result |');
    });

    it('should handle empty phase content', () => {
      const summary = `### Implementation

---

### Testing

Content`;

      const result = parseAllPhaseSummaries(summary);
      expect(result.length).toBe(2);
      expect(result[0].content).toBe('');
      expect(result[1].content).toBe('Content');
    });
  });

  describe('header preservation', () => {
    it('should preserve original header text', () => {
      const summary = `### Code Review

Content`;

      const result = parseAllPhaseSummaries(summary);
      expect(result[0].header).toBe('### Code Review');
    });

    it('should preserve phase name with original casing', () => {
      const summary = `### CODE REVIEW

Content`;

      const result = parseAllPhaseSummaries(summary);
      expect(result[0].phaseName).toBe('CODE REVIEW');
    });
  });

  describe('chronological order preservation', () => {
    it('should maintain order: Alpha before Beta before Gamma', () => {
      const summary = `### Alpha

First

---

### Beta

Second

---

### Gamma

Third`;

      const result = parseAllPhaseSummaries(summary);

      expect(result.length).toBe(3);
      const names = result.map((e) => e.phaseName);
      expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('should preserve typical pipeline order', () => {
      const summary = [
        '### Implementation',
        '',
        '## Changes',
        '- Added auth module',
        '',
        '---',
        '',
        '### Code Review',
        '',
        '## Review Results',
        '- Style issues fixed',
        '',
        '---',
        '',
        '### Testing',
        '',
        '## Test Results',
        '- 42 tests pass',
      ].join('\n');

      const result = parseAllPhaseSummaries(summary);

      expect(result.length).toBe(3);
      expect(result[0].phaseName).toBe('Implementation');
      expect(result[1].phaseName).toBe('Code Review');
      expect(result[2].phaseName).toBe('Testing');
    });
  });
});
