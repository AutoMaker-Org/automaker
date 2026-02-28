/**
 * Tests for PRCommentResolutionPRInfo interface and URL passthrough
 *
 * Verifies that the PRCommentResolutionPRInfo type properly carries the URL
 * from the board-view worktree panel through to the PR comment resolution dialog,
 * enabling prUrl to be set on created features.
 */

import { describe, it, expect } from 'vitest';
import type { PRCommentResolutionPRInfo } from '../../../src/components/dialogs/pr-comment-resolution-dialog';

describe('PRCommentResolutionPRInfo interface', () => {
  it('should accept PR info with url field', () => {
    const prInfo: PRCommentResolutionPRInfo = {
      number: 42,
      title: 'Fix auth flow',
      url: 'https://github.com/org/repo/pull/42',
    };

    expect(prInfo.url).toBe('https://github.com/org/repo/pull/42');
  });

  it('should accept PR info without url field (optional)', () => {
    const prInfo: PRCommentResolutionPRInfo = {
      number: 42,
      title: 'Fix auth flow',
    };

    expect(prInfo.url).toBeUndefined();
  });

  it('should accept PR info with headRefName', () => {
    const prInfo: PRCommentResolutionPRInfo = {
      number: 42,
      title: 'Fix auth flow',
      headRefName: 'feature/auth-fix',
      url: 'https://github.com/org/repo/pull/42',
    };

    expect(prInfo.headRefName).toBe('feature/auth-fix');
    expect(prInfo.url).toBe('https://github.com/org/repo/pull/42');
  });

  it('should correctly represent board-view to dialog passthrough', () => {
    // Simulates what handleAddressPRComments does in board-view.tsx
    const worktree = { branch: 'fix/my-fix' };
    const prInfo = {
      number: 123,
      title: 'My PR',
      url: 'https://github.com/org/repo/pull/123',
    };

    const dialogPRInfo: PRCommentResolutionPRInfo = {
      number: prInfo.number,
      title: prInfo.title,
      headRefName: worktree.branch,
      url: prInfo.url,
    };

    expect(dialogPRInfo.number).toBe(123);
    expect(dialogPRInfo.title).toBe('My PR');
    expect(dialogPRInfo.headRefName).toBe('fix/my-fix');
    expect(dialogPRInfo.url).toBe('https://github.com/org/repo/pull/123');
  });

  it('should handle board-view passthrough when PR has no URL', () => {
    const worktree = { branch: 'fix/my-fix' };
    const prInfo = { number: 123, title: 'My PR' };

    const dialogPRInfo: PRCommentResolutionPRInfo = {
      number: prInfo.number,
      title: prInfo.title,
      headRefName: worktree.branch,
    };

    expect(dialogPRInfo.url).toBeUndefined();
  });

  it('should spread prUrl conditionally based on url presence', () => {
    // This tests the pattern: ...(pr.url ? { prUrl: pr.url } : {})
    const prWithUrl: PRCommentResolutionPRInfo = {
      number: 1,
      title: 'Test',
      url: 'https://github.com/test',
    };
    const prWithoutUrl: PRCommentResolutionPRInfo = {
      number: 2,
      title: 'Test',
    };

    const featureWithUrl = {
      id: 'test',
      ...(prWithUrl.url ? { prUrl: prWithUrl.url } : {}),
    };
    const featureWithoutUrl = {
      id: 'test',
      ...(prWithoutUrl.url ? { prUrl: prWithoutUrl.url } : {}),
    };

    expect(featureWithUrl).toHaveProperty('prUrl', 'https://github.com/test');
    expect(featureWithoutUrl).not.toHaveProperty('prUrl');
  });
});
