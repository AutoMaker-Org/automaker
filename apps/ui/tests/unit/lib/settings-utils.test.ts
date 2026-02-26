import { describe, it, expect } from 'vitest';
import { sanitizeWorktreeByProject } from '../../../src/lib/settings-utils';

describe('sanitizeWorktreeByProject', () => {
  it('returns an empty object when input is undefined', () => {
    expect(sanitizeWorktreeByProject(undefined)).toEqual({});
  });

  it('keeps structurally valid worktree entries', () => {
    const input = {
      '/project-a': { path: null, branch: 'main' },
      '/project-b': { path: '/project-b/.worktrees/feature-x', branch: 'feature/x' },
    };

    expect(sanitizeWorktreeByProject(input)).toEqual(input);
  });

  it('drops malformed entries and keeps valid ones', () => {
    const input: Record<string, unknown> = {
      '/valid': { path: '/valid/.worktrees/feature-y', branch: 'feature/y' },
      '/valid-main': { path: null, branch: 'main' },
      '/invalid-not-object': 'bad',
      '/invalid-null': null,
      '/invalid-no-branch': { path: '/x' },
      '/invalid-branch-type': { path: '/x', branch: 123 },
      '/invalid-empty-branch': { path: '/x', branch: '   ' },
      '/invalid-path-type': { path: 42, branch: 'feature/z' },
      '/invalid-empty-path': { path: '   ', branch: 'feature/z' },
    };

    expect(sanitizeWorktreeByProject(input)).toEqual({
      '/valid': { path: '/valid/.worktrees/feature-y', branch: 'feature/y' },
      '/valid-main': { path: null, branch: 'main' },
    });
  });
});
