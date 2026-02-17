import { describe, it, expect } from 'vitest';
import {
  parseTasksFromSpec,
  detectTaskStartMarker,
  detectTaskCompleteMarker,
  detectPhaseCompleteMarker,
  detectSpecFallback,
  extractSummary,
} from '../../../src/services/spec-parser.js';

describe('SpecParser', () => {
  describe('parseTasksFromSpec', () => {
    it('should parse tasks from a tasks code block', () => {
      const specContent = `
## Specification

Some description here.

\`\`\`tasks
- [ ] T001: Create user model | File: src/models/user.ts
- [ ] T002: Add API endpoint | File: src/routes/users.ts
- [ ] T003: Write unit tests | File: tests/user.test.ts
\`\`\`

## Notes
Some notes here.
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(3);
      expect(tasks[0]).toEqual({
        id: 'T001',
        description: 'Create user model',
        filePath: 'src/models/user.ts',
        phase: undefined,
        status: 'pending',
      });
      expect(tasks[1].id).toBe('T002');
      expect(tasks[2].id).toBe('T003');
    });

    it('should parse tasks with phases', () => {
      const specContent = `
\`\`\`tasks
## Phase 1: Foundation
- [ ] T001: Initialize project | File: package.json
- [ ] T002: Configure TypeScript | File: tsconfig.json

## Phase 2: Implementation
- [ ] T003: Create main module | File: src/index.ts
- [ ] T004: Add utility functions | File: src/utils.ts

## Phase 3: Testing
- [ ] T005: Write tests | File: tests/index.test.ts
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(5);
      expect(tasks[0].phase).toBe('Phase 1: Foundation');
      expect(tasks[1].phase).toBe('Phase 1: Foundation');
      expect(tasks[2].phase).toBe('Phase 2: Implementation');
      expect(tasks[3].phase).toBe('Phase 2: Implementation');
      expect(tasks[4].phase).toBe('Phase 3: Testing');
    });

    it('should return empty array for content without tasks', () => {
      const specContent = 'Just some text without any tasks';
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toEqual([]);
    });

    it('should fallback to finding task lines outside code block', () => {
      const specContent = `
## Implementation Plan

- [ ] T001: First task | File: src/first.ts
- [ ] T002: Second task | File: src/second.ts
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('T001');
      expect(tasks[1].id).toBe('T002');
    });

    it('should handle empty tasks block', () => {
      const specContent = `
\`\`\`tasks
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toEqual([]);
    });

    it('should handle empty string input', () => {
      const tasks = parseTasksFromSpec('');
      expect(tasks).toEqual([]);
    });

    it('should handle task without file path', () => {
      const specContent = `
\`\`\`tasks
- [ ] T001: Task without file
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual({
        id: 'T001',
        description: 'Task without file',
        phase: undefined,
        status: 'pending',
      });
    });

    it('should handle mixed valid and invalid lines', () => {
      const specContent = `
\`\`\`tasks
- [ ] T001: Valid task | File: src/valid.ts
- Invalid line
Some other text
- [ ] T002: Another valid task
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(2);
    });

    it('should preserve task order', () => {
      const specContent = `
\`\`\`tasks
- [ ] T003: Third
- [ ] T001: First
- [ ] T002: Second
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks[0].id).toBe('T003');
      expect(tasks[1].id).toBe('T001');
      expect(tasks[2].id).toBe('T002');
    });

    it('should handle task IDs with different numbers', () => {
      const specContent = `
\`\`\`tasks
- [ ] T001: First
- [ ] T010: Tenth
- [ ] T100: Hundredth
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe('T001');
      expect(tasks[1].id).toBe('T010');
      expect(tasks[2].id).toBe('T100');
    });

    it('should trim whitespace from description and file path', () => {
      const specContent = `
\`\`\`tasks
- [ ] T001:   Create API endpoint   | File:   src/routes/api.ts
\`\`\`
`;
      const tasks = parseTasksFromSpec(specContent);
      expect(tasks[0].description).toBe('Create API endpoint');
      expect(tasks[0].filePath).toBe('src/routes/api.ts');
    });
  });

  describe('detectTaskStartMarker', () => {
    it('should detect task start marker and return task ID', () => {
      expect(detectTaskStartMarker('[TASK_START] T001')).toBe('T001');
      expect(detectTaskStartMarker('[TASK_START] T042')).toBe('T042');
      expect(detectTaskStartMarker('[TASK_START] T999')).toBe('T999');
    });

    it('should handle marker with description', () => {
      expect(detectTaskStartMarker('[TASK_START] T001: Creating user model')).toBe('T001');
    });

    it('should return null when no marker present', () => {
      expect(detectTaskStartMarker('No marker here')).toBeNull();
      expect(detectTaskStartMarker('')).toBeNull();
    });

    it('should find marker in accumulated text', () => {
      const accumulated = `
Some earlier output...

Now starting the task:
[TASK_START] T003: Setting up database

Let me begin by...
`;
      expect(detectTaskStartMarker(accumulated)).toBe('T003');
    });

    it('should handle whitespace variations', () => {
      expect(detectTaskStartMarker('[TASK_START]  T001')).toBe('T001');
      expect(detectTaskStartMarker('[TASK_START]\tT001')).toBe('T001');
    });

    it('should not match invalid task IDs', () => {
      expect(detectTaskStartMarker('[TASK_START] TASK1')).toBeNull();
      expect(detectTaskStartMarker('[TASK_START] T1')).toBeNull();
      expect(detectTaskStartMarker('[TASK_START] T12')).toBeNull();
    });
  });

  describe('detectTaskCompleteMarker', () => {
    it('should detect task complete marker and return task ID', () => {
      expect(detectTaskCompleteMarker('[TASK_COMPLETE] T001')).toBe('T001');
      expect(detectTaskCompleteMarker('[TASK_COMPLETE] T042')).toBe('T042');
    });

    it('should handle marker with summary', () => {
      expect(detectTaskCompleteMarker('[TASK_COMPLETE] T001: User model created')).toBe('T001');
    });

    it('should return null when no marker present', () => {
      expect(detectTaskCompleteMarker('No marker here')).toBeNull();
      expect(detectTaskCompleteMarker('')).toBeNull();
    });

    it('should find marker in accumulated text', () => {
      const accumulated = `
Working on the task...

Done with the implementation:
[TASK_COMPLETE] T003: Database setup complete

Moving on to...
`;
      expect(detectTaskCompleteMarker(accumulated)).toBe('T003');
    });

    it('should not confuse with TASK_START marker', () => {
      expect(detectTaskCompleteMarker('[TASK_START] T001')).toBeNull();
    });

    it('should not match invalid task IDs', () => {
      expect(detectTaskCompleteMarker('[TASK_COMPLETE] TASK1')).toBeNull();
      expect(detectTaskCompleteMarker('[TASK_COMPLETE] T1')).toBeNull();
    });
  });

  describe('detectPhaseCompleteMarker', () => {
    it('should detect phase complete marker and return phase number', () => {
      expect(detectPhaseCompleteMarker('[PHASE_COMPLETE] Phase 1')).toBe(1);
      expect(detectPhaseCompleteMarker('[PHASE_COMPLETE] Phase 2')).toBe(2);
      expect(detectPhaseCompleteMarker('[PHASE_COMPLETE] Phase 10')).toBe(10);
    });

    it('should handle marker with description', () => {
      expect(detectPhaseCompleteMarker('[PHASE_COMPLETE] Phase 1 complete')).toBe(1);
      expect(detectPhaseCompleteMarker('[PHASE_COMPLETE] Phase 2: Foundation done')).toBe(2);
    });

    it('should return null when no marker present', () => {
      expect(detectPhaseCompleteMarker('No marker here')).toBeNull();
      expect(detectPhaseCompleteMarker('')).toBeNull();
    });

    it('should be case-insensitive', () => {
      expect(detectPhaseCompleteMarker('[PHASE_COMPLETE] phase 1')).toBe(1);
      expect(detectPhaseCompleteMarker('[PHASE_COMPLETE] PHASE 2')).toBe(2);
    });

    it('should find marker in accumulated text', () => {
      const accumulated = `
Finishing up the phase...

All tasks complete:
[PHASE_COMPLETE] Phase 2 complete

Starting Phase 3...
`;
      expect(detectPhaseCompleteMarker(accumulated)).toBe(2);
    });

    it('should not confuse with task markers', () => {
      expect(detectPhaseCompleteMarker('[TASK_COMPLETE] T001')).toBeNull();
    });
  });

  describe('detectSpecFallback', () => {
    it('should detect spec with tasks block and acceptance criteria', () => {
      const content = `
## Acceptance Criteria
- GIVEN a user, WHEN they login, THEN they see the dashboard

\`\`\`tasks
- [ ] T001: Create login form | File: src/Login.tsx
\`\`\`
`;
      expect(detectSpecFallback(content)).toBe(true);
    });

    it('should detect spec with task lines and problem statement', () => {
      const content = `
## Problem Statement
Users cannot currently log in to the application.

## Implementation Plan
- [ ] T001: Add authentication endpoint
- [ ] T002: Create login UI
`;
      expect(detectSpecFallback(content)).toBe(true);
    });

    it('should detect spec with Goal section (lite planning mode)', () => {
      const content = `
**Goal**: Implement user authentication

**Solution**: Use JWT tokens for session management

- [ ] T001: Setup auth middleware
- [ ] T002: Create token service
`;
      expect(detectSpecFallback(content)).toBe(true);
    });

    it('should detect spec with User Story format', () => {
      const content = `
## User Story
As a user, I want to reset my password, so that I can regain access.

## Technical Context
This will modify the auth module.

\`\`\`tasks
- [ ] T001: Add reset endpoint
\`\`\`
`;
      expect(detectSpecFallback(content)).toBe(true);
    });

    it('should detect spec with Overview section', () => {
      const content = `
## Overview
This feature adds dark mode support.

\`\`\`tasks
- [ ] T001: Add theme toggle
\`\`\`
`;
      expect(detectSpecFallback(content)).toBe(true);
    });

    it('should detect spec with Summary section', () => {
      const content = `
## Summary
Adding a new dashboard component.

- [ ] T001: Create dashboard layout
`;
      expect(detectSpecFallback(content)).toBe(true);
    });

    it('should detect spec with implementation plan', () => {
      const content = `
## Implementation Plan
We will add the feature in two phases.

- [ ] T001: Phase 1 setup
`;
      expect(detectSpecFallback(content)).toBe(true);
    });

    it('should detect spec with implementation steps', () => {
      const content = `
## Implementation Steps
Follow these steps:

- [ ] T001: Step one
`;
      expect(detectSpecFallback(content)).toBe(true);
    });

    it('should detect spec with implementation approach', () => {
      const content = `
## Implementation Approach
We will use a modular approach.

- [ ] T001: Create modules
`;
      expect(detectSpecFallback(content)).toBe(true);
    });

    it('should NOT detect spec without task structure', () => {
      const content = `
## Problem Statement
Users cannot log in.

## Acceptance Criteria
- GIVEN a user, WHEN they try to login, THEN it works
`;
      expect(detectSpecFallback(content)).toBe(false);
    });

    it('should NOT detect spec without spec content sections', () => {
      const content = `
Here are some tasks:

- [ ] T001: Do something
- [ ] T002: Do another thing
`;
      expect(detectSpecFallback(content)).toBe(false);
    });

    it('should NOT detect random text as spec', () => {
      expect(detectSpecFallback('Just some random text')).toBe(false);
      expect(detectSpecFallback('')).toBe(false);
    });

    it('should handle case-insensitive matching for spec sections', () => {
      const content = `
## ACCEPTANCE CRITERIA
All caps section header

- [ ] T001: Task
`;
      expect(detectSpecFallback(content)).toBe(true);
    });
  });

  describe('extractSummary', () => {
    describe('explicit <summary> tags', () => {
      it('should extract content from summary tags', () => {
        const text = 'Some preamble <summary>This is the summary content</summary> more text';
        expect(extractSummary(text)).toBe('This is the summary content');
      });

      it('should use last match to avoid stale summaries', () => {
        const text = `
<summary>Old stale summary</summary>

More agent output...

<summary>Fresh new summary</summary>
`;
        expect(extractSummary(text)).toBe('Fresh new summary');
      });

      it('should handle multiline summary content', () => {
        const text = `<summary>First line
Second line
Third line</summary>`;
        expect(extractSummary(text)).toBe('First line\nSecond line\nThird line');
      });

      it('should trim whitespace from summary', () => {
        const text = '<summary>  trimmed content  </summary>';
        expect(extractSummary(text)).toBe('trimmed content');
      });
    });

    describe('## Summary section (markdown)', () => {
      it('should extract from ## Summary section', () => {
        const text = `
## Summary

This is a summary paragraph.

## Other Section
More content.
`;
        expect(extractSummary(text)).toBe('This is a summary paragraph.');
      });

      it('should truncate long summaries to 500 chars', () => {
        const longContent = 'A'.repeat(600);
        const text = `
## Summary

${longContent}

## Next Section
`;
        const result = extractSummary(text);
        expect(result).not.toBeNull();
        expect(result!.length).toBeLessThanOrEqual(503); // 500 + '...'
        expect(result!.endsWith('...')).toBe(true);
      });

      it('should use last match for ## Summary', () => {
        const text = `
## Summary

Old summary content.

## Summary

New summary content.
`;
        expect(extractSummary(text)).toBe('New summary content.');
      });

      it('should stop at next markdown header', () => {
        const text = `
## Summary

Summary content here.

## Implementation
Implementation details.
`;
        expect(extractSummary(text)).toBe('Summary content here.');
      });
    });

    describe('**Goal**: section (lite planning mode)', () => {
      it('should extract from **Goal**: section', () => {
        const text = '**Goal**: Implement user authentication\n**Approach**: Use JWT';
        expect(extractSummary(text)).toBe('Implement user authentication');
      });

      it('should use last match for **Goal**:', () => {
        const text = `
**Goal**: Old goal

More output...

**Goal**: New goal
`;
        expect(extractSummary(text)).toBe('New goal');
      });

      it('should handle inline goal', () => {
        const text = '1. **Goal**: Add login functionality';
        expect(extractSummary(text)).toBe('Add login functionality');
      });
    });

    describe('**Problem**: section (spec/full modes)', () => {
      it('should extract from **Problem**: section', () => {
        const text = `
**Problem**: Users cannot log in to the application

**Solution**: Add authentication
`;
        expect(extractSummary(text)).toBe('Users cannot log in to the application');
      });

      it('should extract from **Problem Statement**: section', () => {
        const text = `
**Problem Statement**: Users need password reset functionality

1. Create reset endpoint
`;
        expect(extractSummary(text)).toBe('Users need password reset functionality');
      });

      it('should truncate long problem descriptions', () => {
        const longProblem = 'X'.repeat(600);
        const text = `**Problem**: ${longProblem}`;
        const result = extractSummary(text);
        expect(result).not.toBeNull();
        expect(result!.length).toBeLessThanOrEqual(503);
      });
    });

    describe('**Solution**: section (fallback)', () => {
      it('should extract from **Solution**: section as fallback', () => {
        const text = '**Solution**: Use JWT for authentication\n1. Install package';
        expect(extractSummary(text)).toBe('Use JWT for authentication');
      });

      it('should truncate solution to 300 chars', () => {
        const longSolution = 'Y'.repeat(400);
        const text = `**Solution**: ${longSolution}`;
        const result = extractSummary(text);
        expect(result).not.toBeNull();
        expect(result!.length).toBeLessThanOrEqual(303);
      });
    });

    describe('priority order', () => {
      it('should prefer <summary> over ## Summary', () => {
        const text = `
## Summary

Markdown summary

<summary>Tagged summary</summary>
`;
        expect(extractSummary(text)).toBe('Tagged summary');
      });

      it('should prefer ## Summary over **Goal**:', () => {
        const text = `
**Goal**: Goal content

## Summary

Summary section content.
`;
        expect(extractSummary(text)).toBe('Summary section content.');
      });

      it('should prefer **Goal**: over **Problem**:', () => {
        const text = `
**Problem**: Problem description

**Goal**: Goal description
`;
        expect(extractSummary(text)).toBe('Goal description');
      });

      it('should prefer **Problem**: over **Solution**:', () => {
        const text = `
**Solution**: Solution description

**Problem**: Problem description
`;
        expect(extractSummary(text)).toBe('Problem description');
      });
    });

    describe('edge cases', () => {
      it('should return null for empty string', () => {
        expect(extractSummary('')).toBeNull();
      });

      it('should return null when no summary pattern found', () => {
        expect(extractSummary('Random text without any summary patterns')).toBeNull();
      });

      it('should handle multiple paragraph summaries (return first paragraph)', () => {
        const text = `
## Summary

First paragraph of summary.

Second paragraph of summary.

## Other
`;
        expect(extractSummary(text)).toBe('First paragraph of summary.');
      });
    });
  });
});
