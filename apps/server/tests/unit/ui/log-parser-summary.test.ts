/**
 * Unit tests for the UI's log-parser extractSummary() function.
 *
 * These tests document the behavior of extractSummary() which is used as a
 * CLIENT-SIDE FALLBACK when feature.summary (server-accumulated) is not available.
 *
 * IMPORTANT: extractSummary() returns only the LAST <summary> tag from raw output.
 * For pipeline features with multiple steps, the server-side FeatureStateManager
 * accumulates all step summaries into feature.summary, which the UI prefers.
 *
 * The tests below verify that extractSummary() correctly:
 * - Returns the LAST summary when multiple exist (mimicking pipeline accumulation)
 * - Handles various summary formats (<summary> tags, markdown headers)
 * - Returns null when no summary is found
 * - Handles edge cases like empty input and malformed tags
 */

import { describe, it, expect } from 'vitest';

// Recreate the extractSummary logic from apps/ui/src/lib/log-parser.ts
// We can't import directly because it's a UI file, so we mirror the logic here

/**
 * Cleans up fragmented streaming text by removing spurious newlines
 */
function cleanFragmentedText(content: string): string {
  let cleaned = content.replace(/([a-zA-Z])\n+([a-zA-Z])/g, '$1$2');
  cleaned = cleaned.replace(/<([a-zA-Z]+)\n*([a-zA-Z]*)\n*>/g, '<$1$2>');
  cleaned = cleaned.replace(/<\/([a-zA-Z]+)\n*([a-zA-Z]*)\n*>/g, '</$1$2>');
  return cleaned;
}

/**
 * Extracts summary content from raw log output
 * Returns the LAST summary text if found, or null if no summary exists
 */
function extractSummary(rawOutput: string): string | null {
  if (!rawOutput || !rawOutput.trim()) {
    return null;
  }

  const cleanedOutput = cleanFragmentedText(rawOutput);

  const regexesToTry: Array<{
    regex: RegExp;
    processor: (m: RegExpMatchArray) => string;
  }> = [
    { regex: /<summary>([\s\S]*?)<\/summary>/gi, processor: (m) => m[1] },
    { regex: /^##\s+Summary[^\n]*\n([\s\S]*?)(?=\n##\s+[^#]|\n🔧|$)/gm, processor: (m) => m[1] },
    {
      regex: /^##\s+(Feature|Changes|Implementation)[^\n]*\n([\s\S]*?)(?=\n##\s+[^#]|\n🔧|$)/gm,
      processor: (m) => `## ${m[1]}\n${m[2]}`,
    },
    {
      regex: /(^|\n)(All tasks completed[\s\S]*?)(?=\n🔧|\n📋|\n⚡|\n❌|$)/g,
      processor: (m) => m[2],
    },
    {
      regex:
        /(^|\n)((I've|I have) (successfully |now )?(completed|finished|implemented)[\s\S]*?)(?=\n🔧|\n📋|\n⚡|\n❌|$)/g,
      processor: (m) => m[2],
    },
  ];

  for (const { regex, processor } of regexesToTry) {
    const matches = [...cleanedOutput.matchAll(regex)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      return cleanFragmentedText(processor(lastMatch)).trim();
    }
  }

  return null;
}

describe('log-parser extractSummary (UI fallback)', () => {
  describe('basic summary extraction', () => {
    it('should extract summary from <summary> tags', () => {
      const output = `
Some agent output...

<summary>
## Changes Made
- Fixed the bug in parser.ts
- Added error handling
</summary>

More output...
`;
      const result = extractSummary(output);
      expect(result).toBe('## Changes Made\n- Fixed the bug in parser.ts\n- Added error handling');
    });

    it('should prefer <summary> tags over markdown headers', () => {
      const output = `
## Summary

Markdown summary here.

<summary>
XML summary here.
</summary>
`;
      const result = extractSummary(output);
      expect(result).toBe('XML summary here.');
    });
  });

  describe('multiple summaries (pipeline accumulation scenario)', () => {
    it('should return ONLY the LAST summary tag when multiple exist', () => {
      // This is the key behavior for pipeline features:
      // extractSummary returns only the LAST, which is why server-side
      // accumulation is needed for multi-step pipelines
      const output = `
## Step 1: Code Review

<summary>
- Found 3 issues
- Approved with changes
</summary>

---

## Step 2: Testing

<summary>
- All tests pass
- Coverage 95%
</summary>
`;
      const result = extractSummary(output);
      expect(result).toBe('- All tests pass\n- Coverage 95%');
      expect(result).not.toContain('Code Review');
      expect(result).not.toContain('Found 3 issues');
    });

    it('should return ONLY the LAST summary from three pipeline steps', () => {
      const output = `
<summary>Step 1 complete</summary>

---

<summary>Step 2 complete</summary>

---

<summary>Step 3 complete - all done!</summary>
`;
      const result = extractSummary(output);
      expect(result).toBe('Step 3 complete - all done!');
      expect(result).not.toContain('Step 1');
      expect(result).not.toContain('Step 2');
    });

    it('should handle mixed summary formats across pipeline steps', () => {
      const output = `
## Step 1

<summary>
Implementation done
</summary>

---

## Step 2

## Summary
Review complete

---

## Step 3

<summary>
All tests passing
</summary>
`;
      const result = extractSummary(output);
      // The <summary> tag format takes priority, and returns the LAST match
      expect(result).toBe('All tests passing');
    });
  });

  describe('priority order of summary patterns', () => {
    it('should try patterns in priority order: <summary> first, then markdown headers', () => {
      // When both <summary> tags and markdown headers exist,
      // <summary> tags should take priority
      const output = `
## Summary

This markdown summary should be ignored.

<summary>
This XML summary should be used.
</summary>
`;
      const result = extractSummary(output);
      expect(result).toBe('This XML summary should be used.');
      expect(result).not.toContain('ignored');
    });

    it('should fall back to Feature/Changes/Implementation headers when no <summary> tag', () => {
      // Note: The regex for these headers requires content before the header
      // (^ at start or preceded by newline). Adding some content before.
      const output = `
Agent output here...

## Feature

New authentication system with OAuth support.

## Next
`;
      const result = extractSummary(output);
      // Should find the Feature header and include it in result
      // Note: Due to regex behavior, it captures content until next ##
      expect(result).toContain('## Feature');
    });

    it('should fall back to completion phrases when no structured summary found', () => {
      const output = `
Working on the feature...
Making progress...

All tasks completed successfully. The feature is ready.

🔧 Tool: Bash
`;
      const result = extractSummary(output);
      expect(result).toContain('All tasks completed');
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(extractSummary('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(extractSummary('   \n\n   ')).toBeNull();
    });

    it('should return null when no summary pattern found', () => {
      expect(extractSummary('Random agent output without any summary patterns')).toBeNull();
    });

    it('should handle malformed <summary> tags gracefully', () => {
      const output = `
<summary>
This summary is never closed...
`;
      // Without closing tag, the regex won't match
      expect(extractSummary(output)).toBeNull();
    });

    it('should handle empty <summary> tags', () => {
      const output = `
<summary></summary>
`;
      const result = extractSummary(output);
      expect(result).toBe(''); // Empty string is valid
    });

    it('should handle <summary> tags with only whitespace', () => {
      const output = `
<summary>

</summary>
`;
      const result = extractSummary(output);
      expect(result).toBe(''); // Trimmed to empty string
    });

    it('should handle summary with markdown code blocks', () => {
      const output = `
<summary>
## Changes

\`\`\`typescript
const x = 1;
\`\`\`

Done!
</summary>
`;
      const result = extractSummary(output);
      expect(result).toContain('```typescript');
      expect(result).toContain('const x = 1;');
    });

    it('should handle summary with special characters', () => {
      const output = `
<summary>
Fixed bug in parser.ts: "quotes" and 'apostrophes'
Special chars: <>&$@#%^*
</summary>
`;
      const result = extractSummary(output);
      expect(result).toContain('"quotes"');
      expect(result).toContain('<>&$@#%^*');
    });
  });

  describe('fragmented streaming text handling', () => {
    it('should handle fragmented <summary> tags from streaming', () => {
      // Sometimes streaming providers split text like "<sum\n\nmary>"
      const output = `
<sum

mary>
Fixed the issue
</sum

mary>
`;
      const result = extractSummary(output);
      // The cleanFragmentedText function should normalize this
      expect(result).toBe('Fixed the issue');
    });

    it('should handle fragmented text within summary content', () => {
      const output = `
<summary>
Fixed the bug in par
ser.ts
</summary>
`;
      const result = extractSummary(output);
      // cleanFragmentedText should join "par\n\nser" into "parser"
      expect(result).toBe('Fixed the bug in parser.ts');
    });
  });

  describe('completion phrase detection', () => {
    it('should extract "All tasks completed" summaries', () => {
      const output = `
Some output...

All tasks completed successfully. The feature is ready for review.

🔧 Tool: Bash
`;
      const result = extractSummary(output);
      expect(result).toContain('All tasks completed');
    });

    it("should extract I've completed summaries", () => {
      const output = `
Working on feature...

I've successfully implemented the feature with all requirements met.

🔧 Tool: Read
`;
      const result = extractSummary(output);
      expect(result).toContain("I've successfully implemented");
    });

    it('should extract "I have finished" summaries', () => {
      const output = `
Implementation phase...

I have finished the implementation.

📋 Planning
`;
      const result = extractSummary(output);
      expect(result).toContain('I have finished');
    });
  });

  describe('real-world pipeline scenarios', () => {
    it('should handle typical multi-step pipeline output (returns last only)', () => {
      // This test documents WHY server-side accumulation is essential:
      // extractSummary only returns the last step's summary
      const output = `
📋 Planning Mode: Full

🔧 Tool: Read
Input: {"file_path": "src/parser.ts"}

<summary>
## Code Review
- Analyzed parser.ts
- Found potential improvements
</summary>

---

## Follow-up Session

🔧 Tool: Edit
Input: {"file_path": "src/parser.ts"}

<summary>
## Implementation
- Applied suggested improvements
- Updated tests
</summary>

---

## Follow-up Session

🔧 Tool: Bash
Input: {"command": "npm test"}

<summary>
## Testing
- All 42 tests pass
- No regressions detected
</summary>
`;
      const result = extractSummary(output);
      // Only the LAST summary is returned
      expect(result).toBe('## Testing\n- All 42 tests pass\n- No regressions detected');
      // Earlier summaries are lost
      expect(result).not.toContain('Code Review');
      expect(result).not.toContain('Implementation');
    });

    it('should handle single-step non-pipeline output', () => {
      // For non-pipeline features, extractSummary works correctly
      const output = `
Working on feature...

<summary>
## Implementation Complete
- Created new component
- Added unit tests
- Updated documentation
</summary>
`;
      const result = extractSummary(output);
      expect(result).toContain('Implementation Complete');
      expect(result).toContain('Created new component');
    });
  });
});

/**
 * These tests verify the UI fallback behavior for summary extraction.
 *
 * KEY INSIGHT: The extractSummary() function returns only the LAST summary,
 * which is why the server-side FeatureStateManager.saveFeatureSummary() method
 * accumulates all step summaries into feature.summary.
 *
 * The UI's AgentOutputModal component uses this priority:
 * 1. feature.summary (server-accumulated, contains all steps)
 * 2. extractSummary(output) (client-side fallback, last summary only)
 *
 * For pipeline features, this ensures all step summaries are displayed.
 */
