/**
 * Tests to validate worktree-panel.tsx prop integrity after rebase conflict resolution.
 *
 * During the rebase onto upstream/v1.0.0rc, duplicate JSX props (isDevServerStarting,
 * isStartingAnyDevServer) were introduced by overlapping commits. This test validates
 * that the source code has no duplicate JSX prop assignments, which would cause
 * React warnings and unpredictable behavior (last value wins).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('worktree-panel.tsx prop integrity', () => {
  const filePath = path.resolve(
    __dirname,
    '../../../src/components/views/board-view/worktree-panel/worktree-panel.tsx'
  );

  let sourceCode: string;

  beforeAll(() => {
    sourceCode = fs.readFileSync(filePath, 'utf-8');
  });

  it('should not have duplicate isDevServerStarting props within any single JSX element', () => {
    // Parse JSX elements and verify no element has isDevServerStarting more than once.
    // Props are passed to WorktreeTab, WorktreeMobileDropdown, WorktreeActionsDropdown, etc.
    // Each individual element should have the prop at most once.
    const lines = sourceCode.split('\n');
    let inElement = false;
    let propCount = 0;
    let elementName = '';
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();

      const elementStart = trimmed.match(/^<(\w+)\b/);
      if (elementStart && !trimmed.startsWith('</')) {
        inElement = true;
        propCount = 0;
        elementName = elementStart[1];
      }

      if (inElement && trimmed.includes('isDevServerStarting=')) {
        propCount++;
        if (propCount > 1) {
          violations.push(`Duplicate isDevServerStarting in <${elementName}> at line ${i + 1}`);
        }
      }

      if (
        inElement &&
        (trimmed.includes('/>') || (trimmed.endsWith('>') && !trimmed.includes('=')))
      ) {
        inElement = false;
      }
    }

    expect(violations).toEqual([]);
    // Verify the prop is actually used somewhere
    expect(sourceCode).toContain('isDevServerStarting=');
  });

  it('should not have duplicate isStartingAnyDevServer props within any single JSX element', () => {
    const lines = sourceCode.split('\n');
    let inElement = false;
    let propCount = 0;
    let elementName = '';
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();

      const elementStart = trimmed.match(/^<(\w+)\b/);
      if (elementStart && !trimmed.startsWith('</')) {
        inElement = true;
        propCount = 0;
        elementName = elementStart[1];
      }

      if (inElement && trimmed.includes('isStartingAnyDevServer=')) {
        propCount++;
        if (propCount > 1) {
          violations.push(`Duplicate isStartingAnyDevServer in <${elementName}> at line ${i + 1}`);
        }
      }

      if (
        inElement &&
        (trimmed.includes('/>') || (trimmed.endsWith('>') && !trimmed.includes('=')))
      ) {
        inElement = false;
      }
    }

    expect(violations).toEqual([]);
  });

  it('should not have any JSX element with duplicate prop names', () => {
    // Parse all JSX-like blocks and check for duplicate props
    // This regex finds prop assignments like propName={...} or propName="..."
    const lines = sourceCode.split('\n');

    // Track props per JSX element by looking for indentation patterns
    // A JSX opening tag starts with < and ends when indentation drops
    let currentJsxProps: Map<string, number[]> = new Map();
    let inJsxElement = false;
    let _elementIndent = 0;

    const duplicates: Array<{ prop: string; line: number; element: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;

      // Detect start of JSX element
      if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.startsWith('{')) {
        const elementMatch = trimmed.match(/^<(\w+)/);
        if (elementMatch) {
          inJsxElement = true;
          _elementIndent = indent;
          currentJsxProps = new Map();
        }
      }

      if (inJsxElement) {
        // Extract prop names from this line (prop={value} or prop="value")
        const propMatches = trimmed.matchAll(/\b(\w+)=\{/g);
        for (const match of propMatches) {
          const propName = match[1];
          if (!currentJsxProps.has(propName)) {
            currentJsxProps.set(propName, []);
          }
          currentJsxProps.get(propName)!.push(i + 1);

          // Check for duplicates
          if (currentJsxProps.get(propName)!.length > 1) {
            duplicates.push({
              prop: propName,
              line: i + 1,
              element: trimmed.substring(0, 50),
            });
          }
        }

        // Detect end of JSX element (self-closing /> or >)
        if (trimmed.includes('/>') || (trimmed.endsWith('>') && !trimmed.includes('='))) {
          inJsxElement = false;
          currentJsxProps = new Map();
        }
      }
    }

    expect(duplicates).toEqual([]);
  });
});

describe('worktree-panel.tsx uses both isStartingAnyDevServer and isDevServerStarting', () => {
  const filePath = path.resolve(
    __dirname,
    '../../../src/components/views/board-view/worktree-panel/worktree-panel.tsx'
  );

  let sourceCode: string;

  beforeAll(() => {
    sourceCode = fs.readFileSync(filePath, 'utf-8');
  });

  it('should use isStartingAnyDevServer from the useDevServers hook', () => {
    // The hook destructuring should include isStartingAnyDevServer
    expect(sourceCode).toContain('isStartingAnyDevServer');
  });

  it('should use isDevServerStarting from the useDevServers hook', () => {
    // The hook destructuring should include isDevServerStarting
    expect(sourceCode).toContain('isDevServerStarting');
  });

  it('isStartingAnyDevServer and isDevServerStarting should be distinct concepts', () => {
    // isStartingAnyDevServer is a boolean (any server starting)
    // isDevServerStarting is a function (specific worktree starting)
    // Both should be destructured from the hook
    const hookDestructuring = sourceCode.match(
      /const\s*\{[^}]*isStartingAnyDevServer[^}]*isDevServerStarting[^}]*\}/s
    );
    expect(hookDestructuring).not.toBeNull();
  });
});
