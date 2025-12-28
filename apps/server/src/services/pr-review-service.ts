/**
 * PR Review Service
 *
 * Monitors GitHub PRs for comments, conflicts, and CI failures.
 * Uses Greptile and LSP to analyze and resolve issues.
 *
 * This service handles Phases 5-6 of the orchestrator workflow:
 * - Monitor PRs for comments and conflicts
 * - Parse comments to identify issues
 * - Use research tools to find solutions
 * - Generate fix recommendations
 * - Post analysis back to Vibe-Kanban tasks
 */

import type { EventEmitter } from '../lib/events.js';
import type { PRCommentAnalysis } from '@automaker/types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * PR comment as returned by GitHub
 */
export interface PRComment {
  id: string;
  databaseId: number;
  author: string;
  authorAssociation: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  isMinimized: boolean;
}

/**
 * PR status check
 */
export interface PRStatusCheck {
  name: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'ERROR';
  conclusion?: string;
  url?: string;
}

/**
 * PR review state
 */
export interface PRReviewState {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergeable: boolean | null;
  mergeableState: 'BEHIND' | 'CLEAN' | 'DIRTY' | 'DRAFT' | 'HAS_HOOKS' | 'UNKNOWN';
  headRefOid: string;
  baseRefOid: string;
  headRefName: string;
  baseRefName: string;
  comments: PRComment[];
  reviewComments: PRComment[];
  reviews: PRReview[];
  statusChecks: PRStatusCheck[];
}

/**
 * PR review
 */
export interface PRReview {
  id: string;
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  body: string;
  submittedAt: string;
}

/**
 * PR Review Service Error
 */
export class PRReviewServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'PRReviewServiceError';
  }
}

/**
 * PR Review Service Options
 */
export interface PRReviewServiceOptions {
  /** GitHub repository (owner/repo) */
  githubRepository: string;
  /** Default base branch */
  defaultBaseBranch?: string;
}

/**
 * Comment analysis result with fixes
 */
export interface CommentAnalysisWithFix extends PRCommentAnalysis {
  /** Suggested fix code */
  fixCode?: string;
  /** Files to modify */
  filesToModify: string[];
  /** Priority ranking */
  rank: number;
}

/**
 * PR Review Service
 *
 * Analyzes PR comments and generates actionable fix recommendations.
 */
export class PRReviewService {
  private events: EventEmitter;
  private githubRepository: string;
  private defaultBaseBranch: string;
  private prCache: Map<number, PRReviewState> = new Map();

  constructor(options: PRReviewServiceOptions & { events: EventEmitter }) {
    this.events = options.events;
    this.githubRepository = options.githubRepository;
    this.defaultBaseBranch = options.defaultBaseBranch || 'main';
  }

  /**
   * Get PR state
   */
  async getPRState(prNumber: number): Promise<PRReviewState> {
    try {
      // Use gh CLI to get PR details
      const { stdout: prData } = await execAsync(
        `gh pr view ${prNumber} --json title,state,mergeable,mergeableStatus,headRefOid,baseRefOid,headRefName,baseRefName --repo ${this.githubRepository}`
      );

      const pr = JSON.parse(prData);

      // Get comments
      const { stdout: commentsData } = await execAsync(
        `gh pr view ${prNumber} --json comments --repo ${this.githubRepository} -q '.comments'`
      );
      const comments: PRComment[] = JSON.parse(commentsData || '[]');

      // Get review comments
      const { stdout: reviewCommentsData } = await execAsync(
        `gh pr view ${prNumber} --json comments --repo ${this.githubRepository} -q '.comments[] | select(.reviewId != null)'`
      );
      const reviewComments: PRComment[] = JSON.parse(reviewCommentsData || '[]');

      // Get reviews
      const { stdout: reviewsData } = await execAsync(
        `gh pr reviews ${prNumber} --json author,state,body,submittedAt --repo ${this.githubRepository}`
      );
      const reviews: PRReview[] = JSON.parse(reviewsData || '[]');

      // Get status checks
      const statusChecks = await this.getPRStatusChecks(prNumber);

      const state: PRReviewState = {
        number: prNumber,
        title: pr.title || '',
        state: pr.state || 'OPEN',
        mergeable: pr.mergeable ?? null,
        mergeableState: pr.mergeableStatus || 'UNKNOWN',
        headRefOid: pr.headRefOid || '',
        baseRefOid: pr.baseRefOid || '',
        headRefName: pr.headRefName || '',
        baseRefName: pr.baseRefName || '',
        comments,
        reviewComments,
        reviews,
        statusChecks,
      };

      // Cache the state
      this.prCache.set(prNumber, state);

      return state;
    } catch (error) {
      throw new PRReviewServiceError(
        `Failed to get PR ${prNumber} state: ${(error as Error).message}`,
        'PR_FETCH_FAILED',
        error
      );
    }
  }

  /**
   * Get PR status checks
   */
  private async getPRStatusChecks(prNumber: number): Promise<PRStatusCheck[]> {
    try {
      const { stdout } = await execAsync(
        `gh pr checks ${prNumber} --repo ${this.githubRepository}`
      );

      // Parse the output (format varies by gh version)
      const checks: PRStatusCheck[] = [];
      const lines = stdout.split('\n');

      for (const line of lines) {
        if (line.includes('pass') || line.includes('fail') || line.includes('pending')) {
          checks.push({
            name: line.split(' ')[0] || 'unknown',
            status: line.includes('pass')
              ? 'SUCCESS'
              : line.includes('fail')
                ? 'FAILURE'
                : 'PENDING',
          });
        }
      }

      return checks;
    } catch {
      return [];
    }
  }

  /**
   * Analyze PR comments to identify issues
   */
  async analyzePRComments(prNumber: number): Promise<CommentAnalysisWithFix[]> {
    try {
      const prState = await this.getPRState(prNumber);
      const analyses: CommentAnalysisWithFix[] = [];

      // Analyze regular comments
      for (const comment of prState.comments) {
        if (comment.isMinimized) continue; // Skip minimized comments

        const analysis = this.analyzeComment(comment, prState);
        if (analysis) {
          analyses.push(analysis);
        }
      }

      // Analyze review comments
      for (const comment of prState.reviewComments) {
        if (comment.isMinimized) continue;

        const analysis = this.analyzeComment(comment, prState);
        if (analysis) {
          analyses.push(analysis);
        }
      }

      // Sort by priority
      analyses.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Add rank
      analyses.forEach((a, i) => (a.rank = i + 1));

      // Emit event
      this.events.emit('orchestrator:pr-comment-analysis', {
        taskId: `pr-${prNumber}`,
        prNumber,
        analyses,
        timestamp: new Date().toISOString(),
      });

      return analyses;
    } catch (error) {
      throw new PRReviewServiceError(
        `Failed to analyze PR ${prNumber} comments: ${(error as Error).message}`,
        'ANALYSIS_FAILED',
        error
      );
    }
  }

  /**
   * Analyze a single comment
   */
  private analyzeComment(
    comment: PRComment,
    prState: PRReviewState
  ): CommentAnalysisWithFix | null {
    const body = comment.body.toLowerCase();

    // Skip bot comments and trivial comments
    if (comment.author.includes('bot') || comment.author.includes('dependabot')) {
      return null;
    }

    // Determine issue type
    let issueType: PRCommentAnalysis['issueType'] = 'other';
    let priority: PRCommentAnalysis['priority'] = 'low';

    // Check for conflicts
    if (body.includes('conflict') || body.includes('merge conflict')) {
      issueType = 'conflict';
      priority = 'critical';
    }

    // Check for CI failures
    if (
      body.includes('ci failed') ||
      body.includes('build failed') ||
      body.includes('test failed')
    ) {
      issueType = 'ci_failure';
      priority = 'high';
    }

    // Check for suggestions
    if (body.includes('suggest') || body.includes('consider') || body.includes('could you')) {
      issueType = 'suggestion';
      priority = 'medium';
    }

    // Check for questions
    if (body.includes('?') && body.split('?').length < 3) {
      issueType = 'question';
      priority = 'low';
    }

    // Extract affected files from comment
    const affectedFiles = this.extractFilesFromComment(comment.body);

    // Determine recommended action
    let recommendedAction: PRCommentAnalysis['recommendedAction'] = 'ignore';
    if (issueType === 'conflict' || issueType === 'ci_failure') {
      recommendedAction = 'fix';
    } else if (issueType === 'suggestion') {
      recommendedAction = 'fix';
    } else if (issueType === 'question') {
      recommendedAction = 'respond';
    }

    return {
      id: comment.id,
      author: comment.author,
      body: comment.body,
      issueType,
      affectedFiles,
      recommendedAction,
      priority,
      filesToModify: affectedFiles,
      rank: 0,
    };
  }

  /**
   * Extract file references from comment
   */
  private extractFilesFromComment(body: string): string[] {
    const files: string[] = [];

    // Match file paths like `src/file.ts` or "src/file.ts"
    const fileRegex = /[`"]([a-zA-Z0-9_./]+\.ts|tsx|js|jsx|json)[`"]/g;
    let match;

    while ((match = fileRegex.exec(body)) !== null) {
      files.push(match[1]);
    }

    // Also look for patterns like "in X" where X might be a file
    const inRegex = /in\s+([a-zA-Z0-9_./]+\.[a-z]+)/gi;
    while ((match = inRegex.exec(body)) !== null) {
      files.push(match[1]);
    }

    return [...new Set(files)]; // Deduplicate
  }

  /**
   * Check PR for merge conflicts
   */
  async checkForConflicts(prNumber: number): Promise<boolean> {
    try {
      const prState = await this.getPRState(prNumber);

      // Check mergeable state
      if (prState.mergeable === false) {
        return true;
      }

      if (prState.mergeableState === 'DIRTY' || prState.mergeableState === 'BEHIND') {
        return true;
      }

      return false;
    } catch (error) {
      console.warn(`[PRReviewService] Failed to check conflicts for PR ${prNumber}:`, error);
      return false;
    }
  }

  /**
   * Check CI status for PR
   */
  async checkCIStatus(prNumber: number): Promise<'pending' | 'success' | 'failure'> {
    try {
      const prState = await this.getPRState(prNumber);

      // Check if any checks have failed
      if (prState.statusChecks.some((c) => c.status === 'FAILURE')) {
        return 'failure';
      }

      // Check if all checks have passed
      if (
        prState.statusChecks.length > 0 &&
        prState.statusChecks.every((c) => c.status === 'SUCCESS')
      ) {
        return 'success';
      }

      return 'pending';
    } catch (error) {
      console.warn(`[PRReviewService] Failed to check CI status for PR ${prNumber}:`, error);
      return 'pending';
    }
  }

  /**
   * Generate fix suggestions using Greptile/Exa
   * Note: This is a placeholder - actual implementation would use MCP tools
   */
  async generateFixSuggestions(
    prNumber: number,
    analyses: CommentAnalysisWithFix[]
  ): Promise<Map<string, string[]>> {
    const suggestions = new Map<string, string[]>();

    for (const analysis of analyses) {
      if (analysis.issueType === 'conflict') {
        const suggestion = await this.searchConflictResolution(
          analysis.affectedFiles[0] || '',
          prNumber
        );
        if (suggestion) {
          suggestions.set(analysis.id, [suggestion]);
        }
      } else if (analysis.issueType === 'suggestion') {
        // For suggestions, we might search for similar patterns
        const similarPatterns = await this.searchSimilarPatterns(analysis.affectedFiles[0] || '');
        if (similarPatterns.length > 0) {
          suggestions.set(analysis.id, similarPatterns);
        }
      }
    }

    return suggestions;
  }

  /**
   * Search for conflict resolution strategies
   */
  private async searchConflictResolution(file: string, prNumber: number): Promise<string | null> {
    // TODO: Use Greptile MCP to search for similar conflict resolutions
    // For now, return a generic suggestion
    return `Consider using "git checkout --theirs ${file}" or "git checkout --ours ${file}" to resolve conflicts manually.`;
  }

  /**
   * Search for similar code patterns
   */
  private async searchSimilarPatterns(file: string): Promise<string[]> {
    // TODO: Use Greptile MCP to find similar patterns
    return [];
  }

  /**
   * Format analysis as markdown for posting to Vibe-Kanban
   */
  formatAnalysisAsMarkdown(prNumber: string, analyses: CommentAnalysisWithFix[]): string {
    const lines = [
      `# PR #${prNumber} Review Analysis`,
      '',
      `## Summary`,
      `Found ${analyses.length} items requiring attention.`,
      '',
      `## Issues`,
    ];

    for (const analysis of analyses) {
      lines.push(`### ${analysis.priority.toUpperCase()}: ${analysis.issueType}`);
      lines.push('');
      lines.push(`**Author:** ${analysis.author}`);
      lines.push(`**Comment:** ${analysis.body.substring(0, 200)}...`);
      if (analysis.affectedFiles.length > 0) {
        lines.push(`**Files:** ${analysis.affectedFiles.join(', ')}`);
      }
      lines.push(`**Action:** ${analysis.recommendedAction}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Clear cached PR data
   */
  clearCache(prNumber?: number): void {
    if (prNumber) {
      this.prCache.delete(prNumber);
    } else {
      this.prCache.clear();
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    cachedPRs: number;
  } {
    return {
      cachedPRs: this.prCache.size,
    };
  }
}

/**
 * Create a PR review service
 */
export function createPRReviewService(
  options: PRReviewServiceOptions & { events: EventEmitter }
): PRReviewService {
  return new PRReviewService(options);
}
