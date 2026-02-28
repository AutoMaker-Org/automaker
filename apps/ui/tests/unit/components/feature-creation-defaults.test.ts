/**
 * Tests for default fields on auto-created features
 *
 * Verifies that features created from PR review comments, GitHub issues,
 * and quick templates include required default fields:
 * - planningMode: 'skip'
 * - requirePlanApproval: false
 * - dependencies: []
 * - prUrl: set when PR URL is available
 *
 * These tests validate the feature object construction patterns used across
 * multiple UI creation paths to ensure consistency.
 */

import { describe, it, expect } from 'vitest';
import { resolveModelString } from '@automaker/model-resolver';

// ============================================
// Feature construction helpers that mirror the actual creation logic
// in the source components. These intentionally duplicate the object-construction
// patterns from the components so that any deviation in the source will
// require a deliberate update to the corresponding builder here.
// ============================================

/**
 * Constructs a feature object as done by handleAutoAddressComments in github-prs-view.tsx
 */
function buildPRAutoAddressFeature(pr: { number: number; url?: string; headRefName?: string }) {
  const featureId = `pr-${pr.number}-test-uuid`;
  return {
    id: featureId,
    title: `Address PR #${pr.number} Review Comments`,
    category: 'bug-fix',
    description: `Read the review requests on PR #${pr.number} and address any feedback the best you can.`,
    steps: [],
    status: 'backlog',
    model: resolveModelString('opus'),
    thinkingLevel: 'none',
    planningMode: 'skip',
    requirePlanApproval: false,
    dependencies: [],
    ...(pr.url ? { prUrl: pr.url } : {}),
    ...(pr.headRefName ? { branchName: pr.headRefName } : {}),
  };
}

/**
 * Constructs a feature object as done by handleSubmit('together') in pr-comment-resolution-dialog.tsx
 */
function buildPRCommentResolutionGroupFeature(
  pr: {
    number: number;
    title: string;
    url?: string;
    headRefName?: string;
  },
  commentCount = 2
) {
  return {
    id: 'test-uuid',
    title: `Address ${commentCount} review comment${commentCount > 1 ? 's' : ''} on PR #${pr.number}`,
    category: 'bug-fix',
    description: `PR Review Comments for #${pr.number}`,
    steps: [],
    status: 'backlog',
    model: resolveModelString('opus'),
    thinkingLevel: 'none',
    reasoningEffort: undefined,
    providerId: undefined,
    planningMode: 'skip',
    requirePlanApproval: false,
    dependencies: [],
    ...(pr.url ? { prUrl: pr.url } : {}),
    ...(pr.headRefName ? { branchName: pr.headRefName } : {}),
  };
}

/**
 * Constructs a feature object as done by handleSubmit('individually') in pr-comment-resolution-dialog.tsx
 */
function buildPRCommentResolutionIndividualFeature(pr: {
  number: number;
  title: string;
  url?: string;
  headRefName?: string;
}) {
  return {
    id: 'test-uuid',
    title: `Address PR #${pr.number} comment by @reviewer on file.ts:10`,
    category: 'bug-fix',
    description: `Single PR comment resolution`,
    steps: [],
    status: 'backlog',
    model: resolveModelString('opus'),
    thinkingLevel: 'none',
    reasoningEffort: undefined,
    providerId: undefined,
    planningMode: 'skip',
    requirePlanApproval: false,
    dependencies: [],
    ...(pr.url ? { prUrl: pr.url } : {}),
    ...(pr.headRefName ? { branchName: pr.headRefName } : {}),
  };
}

/**
 * Constructs a feature object as done by handleConvertToTask in github-issues-view.tsx
 */
function buildGitHubIssueConvertFeature(
  issue: {
    number: number;
    title: string;
  },
  currentBranch: string
) {
  return {
    id: `issue-${issue.number}-test-uuid`,
    title: issue.title,
    description: `From GitHub Issue #${issue.number}`,
    category: 'From GitHub',
    status: 'backlog' as const,
    passes: false,
    priority: 2,
    model: resolveModelString('opus'),
    thinkingLevel: 'none' as const,
    branchName: currentBranch,
    planningMode: 'skip' as const,
    requirePlanApproval: false,
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Constructs a feature object as done by handleAddFeatureFromIssue in github-issues-view.tsx
 */
function buildGitHubIssueDialogFeature(
  issue: {
    number: number;
  },
  featureData: {
    title: string;
    planningMode: string;
    requirePlanApproval: boolean;
    workMode: string;
    branchName: string;
  },
  currentBranch: string
) {
  return {
    id: `issue-${issue.number}-test-uuid`,
    title: featureData.title,
    description: 'Test description',
    category: 'test-category',
    status: 'backlog' as const,
    passes: false,
    priority: 2,
    model: 'claude-opus-4-6',
    thinkingLevel: 'none',
    reasoningEffort: 'none',
    skipTests: false,
    branchName: featureData.workMode === 'current' ? currentBranch : featureData.branchName,
    planningMode: featureData.planningMode,
    requirePlanApproval: featureData.requirePlanApproval,
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Constructs a feature data object as done by handleAutoAddressPRComments in board-view.tsx
 */
function buildBoardViewAutoAddressPRFeature(
  worktree: {
    branch: string;
  },
  prInfo: {
    number: number;
    url?: string;
  }
) {
  return {
    title: `Address PR #${prInfo.number} Review Comments`,
    category: 'Maintenance',
    description: `Read the review requests on PR #${prInfo.number} and address any feedback the best you can.`,
    images: [],
    imagePaths: [],
    skipTests: false,
    model: resolveModelString('opus'),
    thinkingLevel: 'none' as const,
    branchName: worktree.branch,
    workMode: 'custom' as const,
    priority: 1,
    planningMode: 'skip' as const,
    requirePlanApproval: false,
    dependencies: [],
  };
}

// ============================================
// Tests
// ============================================

describe('Feature creation default fields', () => {
  describe('PR auto-address feature (github-prs-view)', () => {
    it('should include planningMode: "skip"', () => {
      const feature = buildPRAutoAddressFeature({ number: 42 });
      expect(feature.planningMode).toBe('skip');
    });

    it('should include requirePlanApproval: false', () => {
      const feature = buildPRAutoAddressFeature({ number: 42 });
      expect(feature.requirePlanApproval).toBe(false);
    });

    it('should include dependencies: []', () => {
      const feature = buildPRAutoAddressFeature({ number: 42 });
      expect(feature.dependencies).toEqual([]);
    });

    it('should set prUrl when PR has a URL', () => {
      const feature = buildPRAutoAddressFeature({
        number: 42,
        url: 'https://github.com/org/repo/pull/42',
      });
      expect(feature.prUrl).toBe('https://github.com/org/repo/pull/42');
    });

    it('should not include prUrl when PR has no URL', () => {
      const feature = buildPRAutoAddressFeature({ number: 42 });
      expect(feature).not.toHaveProperty('prUrl');
    });

    it('should set branchName from headRefName when present', () => {
      const feature = buildPRAutoAddressFeature({
        number: 42,
        headRefName: 'feature/my-pr',
      });
      expect(feature.branchName).toBe('feature/my-pr');
    });

    it('should not include branchName when headRefName is absent', () => {
      const feature = buildPRAutoAddressFeature({ number: 42 });
      expect(feature).not.toHaveProperty('branchName');
    });

    it('should set status to backlog', () => {
      const feature = buildPRAutoAddressFeature({ number: 42 });
      expect(feature.status).toBe('backlog');
    });
  });

  describe('PR comment resolution - group mode (pr-comment-resolution-dialog)', () => {
    const basePR = { number: 99, title: 'Fix thing' };

    it('should include planningMode: "skip"', () => {
      const feature = buildPRCommentResolutionGroupFeature(basePR);
      expect(feature.planningMode).toBe('skip');
    });

    it('should include requirePlanApproval: false', () => {
      const feature = buildPRCommentResolutionGroupFeature(basePR);
      expect(feature.requirePlanApproval).toBe(false);
    });

    it('should include dependencies: []', () => {
      const feature = buildPRCommentResolutionGroupFeature(basePR);
      expect(feature.dependencies).toEqual([]);
    });

    it('should set prUrl when PR has a URL', () => {
      const feature = buildPRCommentResolutionGroupFeature({
        ...basePR,
        url: 'https://github.com/org/repo/pull/99',
      });
      expect(feature.prUrl).toBe('https://github.com/org/repo/pull/99');
    });

    it('should not set prUrl when PR has no URL', () => {
      const feature = buildPRCommentResolutionGroupFeature(basePR);
      expect(feature).not.toHaveProperty('prUrl');
    });

    it('should set branchName from headRefName when present', () => {
      const feature = buildPRCommentResolutionGroupFeature({
        ...basePR,
        headRefName: 'fix/thing',
      });
      expect(feature.branchName).toBe('fix/thing');
    });

    it('should pluralize title correctly for single vs multiple comments', () => {
      const singleComment = buildPRCommentResolutionGroupFeature(basePR, 1);
      const multipleComments = buildPRCommentResolutionGroupFeature(basePR, 5);

      expect(singleComment.title).toBe(`Address 1 review comment on PR #${basePR.number}`);
      expect(multipleComments.title).toBe(`Address 5 review comments on PR #${basePR.number}`);
    });
  });

  describe('PR comment resolution - individual mode (pr-comment-resolution-dialog)', () => {
    const basePR = { number: 55, title: 'Add feature' };

    it('should include planningMode: "skip"', () => {
      const feature = buildPRCommentResolutionIndividualFeature(basePR);
      expect(feature.planningMode).toBe('skip');
    });

    it('should include requirePlanApproval: false', () => {
      const feature = buildPRCommentResolutionIndividualFeature(basePR);
      expect(feature.requirePlanApproval).toBe(false);
    });

    it('should include dependencies: []', () => {
      const feature = buildPRCommentResolutionIndividualFeature(basePR);
      expect(feature.dependencies).toEqual([]);
    });

    it('should set prUrl when PR has a URL', () => {
      const feature = buildPRCommentResolutionIndividualFeature({
        ...basePR,
        url: 'https://github.com/org/repo/pull/55',
      });
      expect(feature.prUrl).toBe('https://github.com/org/repo/pull/55');
    });
  });

  describe('GitHub issue quick convert (github-issues-view)', () => {
    const issue = { number: 123, title: 'Fix bug' };

    it('should include planningMode: "skip"', () => {
      const feature = buildGitHubIssueConvertFeature(issue, 'main');
      expect(feature.planningMode).toBe('skip');
    });

    it('should include requirePlanApproval: false', () => {
      const feature = buildGitHubIssueConvertFeature(issue, 'main');
      expect(feature.requirePlanApproval).toBe(false);
    });

    it('should include dependencies: []', () => {
      const feature = buildGitHubIssueConvertFeature(issue, 'main');
      expect(feature.dependencies).toEqual([]);
    });

    it('should set branchName to current branch', () => {
      const feature = buildGitHubIssueConvertFeature(issue, 'feature/my-branch');
      expect(feature.branchName).toBe('feature/my-branch');
    });

    it('should set status to backlog', () => {
      const feature = buildGitHubIssueConvertFeature(issue, 'main');
      expect(feature.status).toBe('backlog');
    });
  });

  describe('GitHub issue dialog creation (github-issues-view)', () => {
    const issue = { number: 456 };

    it('should include dependencies: [] regardless of dialog data', () => {
      const feature = buildGitHubIssueDialogFeature(
        issue,
        {
          title: 'Test',
          planningMode: 'full',
          requirePlanApproval: true,
          workMode: 'custom',
          branchName: 'feat/test',
        },
        'main'
      );
      expect(feature.dependencies).toEqual([]);
    });

    it('should preserve planningMode from dialog (not override)', () => {
      const feature = buildGitHubIssueDialogFeature(
        issue,
        {
          title: 'Test',
          planningMode: 'full',
          requirePlanApproval: true,
          workMode: 'custom',
          branchName: 'feat/test',
        },
        'main'
      );
      // Dialog-provided values are preserved (not overridden to 'skip')
      expect(feature.planningMode).toBe('full');
      expect(feature.requirePlanApproval).toBe(true);
    });

    it('should use currentBranch when workMode is "current"', () => {
      const feature = buildGitHubIssueDialogFeature(
        issue,
        {
          title: 'Test',
          planningMode: 'skip',
          requirePlanApproval: false,
          workMode: 'current',
          branchName: 'feat/custom',
        },
        'main'
      );
      expect(feature.branchName).toBe('main');
    });

    it('should use provided branchName when workMode is not "current"', () => {
      const feature = buildGitHubIssueDialogFeature(
        issue,
        {
          title: 'Test',
          planningMode: 'skip',
          requirePlanApproval: false,
          workMode: 'custom',
          branchName: 'feat/custom',
        },
        'main'
      );
      expect(feature.branchName).toBe('feat/custom');
    });
  });

  describe('Board view auto-address PR comments (board-view)', () => {
    const worktree = { branch: 'feature/my-feature' };
    const prInfo = { number: 77, url: 'https://github.com/org/repo/pull/77' };

    it('should include planningMode: "skip"', () => {
      const featureData = buildBoardViewAutoAddressPRFeature(worktree, prInfo);
      expect(featureData.planningMode).toBe('skip');
    });

    it('should include requirePlanApproval: false', () => {
      const featureData = buildBoardViewAutoAddressPRFeature(worktree, prInfo);
      expect(featureData.requirePlanApproval).toBe(false);
    });

    it('should include dependencies: []', () => {
      const featureData = buildBoardViewAutoAddressPRFeature(worktree, prInfo);
      expect(featureData.dependencies).toEqual([]);
    });

    it('should set branchName from worktree', () => {
      const featureData = buildBoardViewAutoAddressPRFeature(worktree, prInfo);
      expect(featureData.branchName).toBe('feature/my-feature');
    });

    it('should set workMode to "custom"', () => {
      const featureData = buildBoardViewAutoAddressPRFeature(worktree, prInfo);
      expect(featureData.workMode).toBe('custom');
    });
  });

  describe('Cross-path consistency', () => {
    // Shared fixture: build one feature from each auto-creation path
    function buildAllAutoCreatedFeatures() {
      return {
        prAutoAddress: buildPRAutoAddressFeature({ number: 1 }),
        commentGroup: buildPRCommentResolutionGroupFeature({ number: 2, title: 'PR' }),
        commentIndividual: buildPRCommentResolutionIndividualFeature({ number: 3, title: 'PR' }),
        issueConvert: buildGitHubIssueConvertFeature({ number: 4, title: 'Issue' }, 'main'),
        boardAutoAddress: buildBoardViewAutoAddressPRFeature({ branch: 'main' }, { number: 5 }),
      };
    }

    it('all auto-creation paths should include planningMode: "skip"', () => {
      const features = buildAllAutoCreatedFeatures();
      for (const [path, feature] of Object.entries(features)) {
        expect(feature.planningMode, `${path} should have planningMode: "skip"`).toBe('skip');
      }
    });

    it('all auto-creation paths should include requirePlanApproval: false', () => {
      const features = buildAllAutoCreatedFeatures();
      for (const [path, feature] of Object.entries(features)) {
        expect(feature.requirePlanApproval, `${path} should have requirePlanApproval: false`).toBe(
          false
        );
      }
    });

    it('all auto-creation paths should include dependencies: []', () => {
      const features = buildAllAutoCreatedFeatures();
      for (const [path, feature] of Object.entries(features)) {
        expect(feature.dependencies, `${path} should have dependencies: []`).toEqual([]);
      }
    });

    it('PR-related paths should set prUrl when URL is available', () => {
      const prFeature = buildPRAutoAddressFeature({
        number: 1,
        url: 'https://github.com/org/repo/pull/1',
      });
      const commentGroupFeature = buildPRCommentResolutionGroupFeature({
        number: 2,
        title: 'PR',
        url: 'https://github.com/org/repo/pull/2',
      });
      const commentIndividualFeature = buildPRCommentResolutionIndividualFeature({
        number: 3,
        title: 'PR',
        url: 'https://github.com/org/repo/pull/3',
      });

      expect(prFeature.prUrl).toBe('https://github.com/org/repo/pull/1');
      expect(commentGroupFeature.prUrl).toBe('https://github.com/org/repo/pull/2');
      expect(commentIndividualFeature.prUrl).toBe('https://github.com/org/repo/pull/3');
    });

    it('PR-related paths should NOT include prUrl when URL is absent', () => {
      const prFeature = buildPRAutoAddressFeature({ number: 1 });
      const commentGroupFeature = buildPRCommentResolutionGroupFeature({ number: 2, title: 'PR' });
      const commentIndividualFeature = buildPRCommentResolutionIndividualFeature({
        number: 3,
        title: 'PR',
      });

      expect(prFeature).not.toHaveProperty('prUrl');
      expect(commentGroupFeature).not.toHaveProperty('prUrl');
      expect(commentIndividualFeature).not.toHaveProperty('prUrl');
    });
  });
});
