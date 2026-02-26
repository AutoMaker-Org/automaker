/**
 * Unit tests for the agent output summary priority logic.
 *
 * These tests verify the summary display logic used in AgentOutputModal
 * where the UI must choose between server-accumulated summaries and
 * client-side extracted summaries.
 *
 * Priority order (from agent-output-modal.tsx):
 * 1. feature.summary (server-accumulated, contains all pipeline steps)
 * 2. extractSummary(output) (client-side fallback, last summary only)
 *
 * This priority is crucial for pipeline features where the server-side
 * accumulation provides the complete history of all step summaries.
 */

import { describe, it, expect } from 'vitest';
// Import the actual extractSummary function to ensure test behavior matches production
import { extractSummary } from '../../../../ui/src/lib/log-parser.ts';
import { getFirstNonEmptySummary } from '../../../../ui/src/lib/summary-selection.ts';

/**
 * Simulates the summary priority logic from AgentOutputModal.
 *
 * Priority:
 * 1. feature?.summary (server-accumulated)
 * 2. extractSummary(output) (client-side fallback)
 */
function getDisplaySummary(
  featureSummary: string | undefined | null,
  rawOutput: string
): string | null {
  return getFirstNonEmptySummary(featureSummary, extractSummary(rawOutput));
}

describe('Agent Output Summary Priority Logic', () => {
  describe('priority order: feature.summary over extractSummary', () => {
    it('should use feature.summary when available (server-accumulated wins)', () => {
      const featureSummary = '### Step 1\n\nFirst step\n\n---\n\n### Step 2\n\nSecond step';
      const rawOutput = `
<summary>
Only the last summary is extracted client-side
</summary>
`;

      const result = getDisplaySummary(featureSummary, rawOutput);

      // Server-accumulated summary should be used, not client-side extraction
      expect(result).toBe(featureSummary);
      expect(result).toContain('### Step 1');
      expect(result).toContain('### Step 2');
      expect(result).not.toContain('Only the last summary');
    });

    it('should use client-side extractSummary when feature.summary is undefined', () => {
      const rawOutput = `
<summary>
This is the only summary
</summary>
`;

      const result = getDisplaySummary(undefined, rawOutput);

      expect(result).toBe('This is the only summary');
    });

    it('should use client-side extractSummary when feature.summary is null', () => {
      const rawOutput = `
<summary>
Client-side extracted summary
</summary>
`;

      const result = getDisplaySummary(null, rawOutput);

      expect(result).toBe('Client-side extracted summary');
    });

    it('should use client-side extractSummary when feature.summary is empty string', () => {
      const rawOutput = `
<summary>
Fallback content
</summary>
`;

      const result = getDisplaySummary('', rawOutput);

      // Empty string is falsy, so fallback is used
      expect(result).toBe('Fallback content');
    });

    it('should use client-side extractSummary when feature.summary is whitespace only', () => {
      const rawOutput = `
<summary>
Fallback for whitespace summary
</summary>
`;

      const result = getDisplaySummary('   \n  ', rawOutput);

      expect(result).toBe('Fallback for whitespace summary');
    });

    it('should preserve original server summary formatting when non-empty after trim', () => {
      const featureSummary = '\n### Implementation\n\n- Added API route\n';

      const result = getDisplaySummary(featureSummary, '');

      expect(result).toBe(featureSummary);
      expect(result).toContain('### Implementation');
    });
  });

  describe('pipeline step accumulation scenarios', () => {
    it('should display all pipeline steps when using server-accumulated summary', () => {
      // This simulates a feature that went through 3 pipeline steps
      const featureSummary = [
        '### Implementation',
        '',
        '## Changes',
        '- Created new module',
        '- Added tests',
        '',
        '---',
        '',
        '### Code Review',
        '',
        '## Review Results',
        '- Approved with minor suggestions',
        '',
        '---',
        '',
        '### Testing',
        '',
        '## Test Results',
        '- All 42 tests pass',
        '- Coverage: 98%',
      ].join('\n');

      const rawOutput = `
<summary>
Only testing step visible in raw output
</summary>
`;

      const result = getDisplaySummary(featureSummary, rawOutput);

      // All pipeline steps should be visible
      expect(result).toContain('### Implementation');
      expect(result).toContain('### Code Review');
      expect(result).toContain('### Testing');
      expect(result).toContain('All 42 tests pass');
    });

    it('should display only last summary when server-side accumulation not available', () => {
      // When feature.summary is not available, only the last summary is shown
      const rawOutput = `
<summary>
Step 1: Implementation complete
</summary>

---

<summary>
Step 2: Code review complete
</summary>

---

<summary>
Step 3: Testing complete
</summary>
`;

      const result = getDisplaySummary(undefined, rawOutput);

      // Only the LAST summary should be shown (client-side fallback behavior)
      expect(result).toBe('Step 3: Testing complete');
      expect(result).not.toContain('Step 1');
      expect(result).not.toContain('Step 2');
    });

    it('should handle single-step pipeline (no accumulation needed)', () => {
      const featureSummary = '### Implementation\n\nCreated the feature';
      const rawOutput = '';

      const result = getDisplaySummary(featureSummary, rawOutput);

      expect(result).toBe(featureSummary);
      expect(result).not.toContain('---'); // No separator for single step
    });
  });

  describe('edge cases', () => {
    it('should return null when both feature.summary and extractSummary are unavailable', () => {
      const rawOutput = 'No summary tags here, just regular output.';

      const result = getDisplaySummary(undefined, rawOutput);

      expect(result).toBeNull();
    });

    it('should return null when rawOutput is empty and no feature summary', () => {
      const result = getDisplaySummary(undefined, '');

      expect(result).toBeNull();
    });

    it('should return null when rawOutput is whitespace only', () => {
      const result = getDisplaySummary(undefined, '   \n\n   ');

      expect(result).toBeNull();
    });

    it('should use client-side fallback when feature.summary is empty string (falsy)', () => {
      // Empty string is falsy in JavaScript, so fallback is correctly used.
      // This is the expected behavior - an empty summary has no value to display.
      const rawOutput = `
<summary>
Fallback content when server summary is empty
</summary>
`;

      // Empty string is falsy, so fallback is used
      const result = getDisplaySummary('', rawOutput);
      expect(result).toBe('Fallback content when server summary is empty');
    });

    it('should behave identically when feature is null vs feature.summary is undefined', () => {
      // This test verifies that the behavior is consistent whether:
      // - The feature object itself is null/undefined
      // - The feature object exists but summary property is undefined
      const rawOutput = `
<summary>
Client-side extracted summary
</summary>
`;

      // Both scenarios should use client-side fallback
      const resultWithUndefined = getDisplaySummary(undefined, rawOutput);
      const resultWithNull = getDisplaySummary(null, rawOutput);

      expect(resultWithUndefined).toBe('Client-side extracted summary');
      expect(resultWithNull).toBe('Client-side extracted summary');
      expect(resultWithUndefined).toBe(resultWithNull);
    });
  });

  describe('markdown content preservation', () => {
    it('should preserve markdown formatting in server-accumulated summary', () => {
      const featureSummary = `### Code Review

## Changes Made
- Fixed **critical bug** in \`parser.ts\`
- Added \`validateInput()\` function

\`\`\`typescript
const x = 1;
\`\`\`

| Test | Result |
|------|--------|
| Unit | Pass   |`;

      const result = getDisplaySummary(featureSummary, '');

      expect(result).toContain('**critical bug**');
      expect(result).toContain('`parser.ts`');
      expect(result).toContain('```typescript');
      expect(result).toContain('| Test | Result |');
    });

    it('should preserve unicode in server-accumulated summary', () => {
      const featureSummary = '### Testing\n\n✅ 42 passed\n❌ 0 failed\n🎉 100% coverage';

      const result = getDisplaySummary(featureSummary, '');

      expect(result).toContain('✅');
      expect(result).toContain('❌');
      expect(result).toContain('🎉');
    });
  });

  describe('real-world scenarios', () => {
    it('should handle typical pipeline feature with server accumulation', () => {
      // Simulates a real pipeline feature that went through Implementation → Testing
      const featureSummary = `### Implementation

## Changes Made
- Created UserProfile component
- Added authentication middleware
- Updated API endpoints

---

### Testing

## Test Results
- Unit tests: 15 passed
- Integration tests: 8 passed
- E2E tests: 3 passed`;

      const rawOutput = `
Working on the feature...

<summary>
## Test Results
- Unit tests: 15 passed
- Integration tests: 8 passed
- E2E tests: 3 passed
</summary>
`;

      const result = getDisplaySummary(featureSummary, rawOutput);

      // Both steps should be visible
      expect(result).toContain('### Implementation');
      expect(result).toContain('### Testing');
      expect(result).toContain('UserProfile component');
      expect(result).toContain('15 passed');
    });

    it('should handle non-pipeline feature (single summary)', () => {
      // Non-pipeline features have a single summary, no accumulation
      const featureSummary = '## Implementation Complete\n- Created the feature\n- All tests pass';
      const rawOutput = '';

      const result = getDisplaySummary(featureSummary, rawOutput);

      expect(result).toBe(featureSummary);
      expect(result).not.toContain('###'); // No step headers for non-pipeline
    });

    it('should handle legacy feature without server summary (fallback)', () => {
      // Legacy features may not have feature.summary set
      const rawOutput = `
<summary>
Legacy implementation from before server-side accumulation
</summary>
`;

      const result = getDisplaySummary(undefined, rawOutput);

      expect(result).toBe('Legacy implementation from before server-side accumulation');
    });
  });

  describe('view mode determination logic', () => {
    /**
     * Simulates the effectiveViewMode logic from agent-output-modal.tsx line 86
     * Default to 'summary' if summary is available, otherwise 'parsed'
     */
    function getEffectiveViewMode(
      viewMode: string | null,
      summary: string | null
    ): 'summary' | 'parsed' {
      return (viewMode ?? (summary ? 'summary' : 'parsed')) as 'summary' | 'parsed';
    }

    it('should default to summary view when server summary is available', () => {
      const summary = '### Implementation\n\nContent';
      const result = getEffectiveViewMode(null, summary);
      expect(result).toBe('summary');
    });

    it('should default to summary view when client-side extraction succeeds', () => {
      const summary = 'Extracted from raw output';
      const result = getEffectiveViewMode(null, summary);
      expect(result).toBe('summary');
    });

    it('should default to parsed view when no summary is available', () => {
      const result = getEffectiveViewMode(null, null);
      expect(result).toBe('parsed');
    });

    it('should respect explicit view mode selection over default', () => {
      const summary = 'Summary is available';
      expect(getEffectiveViewMode('raw', summary)).toBe('raw');
      expect(getEffectiveViewMode('parsed', summary)).toBe('parsed');
      expect(getEffectiveViewMode('changes', summary)).toBe('changes');
    });
  });
});

/**
 * KEY ARCHITECTURE INSIGHT:
 *
 * The priority order (feature.summary > extractSummary(output)) is essential for
 * pipeline features because:
 *
 * 1. Server-side accumulation (FeatureStateManager.saveFeatureSummary) collects
 *    ALL step summaries with headers and separators in chronological order.
 *
 * 2. Client-side extractSummary() only returns the LAST summary tag from raw output,
 *    losing all previous step summaries.
 *
 * 3. The UI must prefer feature.summary to display the complete history of all
 *    pipeline steps to the user.
 *
 * For non-pipeline features (single execution), both sources contain the same
 * summary, so the priority doesn't matter. But for pipeline features, using the
 * wrong source would result in incomplete information display.
 */
