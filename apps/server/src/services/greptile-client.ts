/**
 * Greptile Client Service
 *
 * Wraps Greptile MCP tools for semantic code search and PR analysis.
 *
 * Greptile provides:
 * - Semantic code search across repositories
 * - PR analysis and review automation
 * - Codebase intelligence and insights
 *
 * Greptile MCP Tools Reference:
 * - mcp__plugin_greptile_greptile__list_pull_requests
 * - mcp__plugin_greptile_greptile__search_greptile_comments
 * - mcp__plugin_greptile_greptile__get_merge_request
 * - mcp__plugin_greptile_greptile__trigger_code_review
 */

import type { EventEmitter } from '../lib/events.js';
import type { GreptileSearchResult } from '@automaker/types';
import { getMCPBridge } from '../lib/mcp-bridge.js';

// Re-export types for convenience
export type { GreptileSearchResult };

/**
 * Greptile Client Options
 */
export interface GreptileClientOptions {
  /** Greptile API key (optional, can use env var) */
  apiKey?: string;
  /** Greptile API URL (optional, uses default) */
  apiUrl?: string;
  /** Repository name in format 'owner/repo' */
  repository: string;
  /** Default branch (default: 'main') */
  branch?: string;
  /** Event emitter for MCP bridge */
  events?: EventEmitter;
}

/**
 * Greptile remote type
 */
export type GreptileRemote = 'github' | 'gitlab' | 'azure' | 'bitbucket';

/**
 * PR state filter
 */
export type PRState = 'open' | 'closed' | 'merged';

/**
 * Default Greptile API URL
 */
const DEFAULT_GREPTILE_URL = 'https://api.greptile.com';

/**
 * Greptile Client Error
 */
export class GreptileError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'GreptileError';
  }
}

/**
 * Pull Request summary
 */
export interface PullRequestSummary {
  number: number;
  title: string;
  state: PRState;
  author: string;
  createdAt: string;
  updatedAt: string;
  headRef?: string;
  baseRef?: string;
}

/**
 * Merge request details from Greptile
 */
export interface MergeRequestDetails {
  number: number;
  title: string;
  body: string;
  state: PRState;
  author: string;
  createdAt: string;
  updatedAt: string;
  headRef: string;
  baseRef: string;
  files: string[];
  comments: PRComment[];
  reviewComments: PRReviewComment[];
  metadata: {
    repository: string;
    branch: string;
    commit?: string;
  };
}

/**
 * PR Comment
 */
export interface PRComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

/**
 * PR Review Comment
 */
export interface PRReviewComment {
  id: string;
  author: string;
  body: string;
  path: string;
  line: number;
  createdAt: string;
}

/**
 * Greptile Client
 */
export class GreptileClient {
  private apiKey: string | undefined;
  private apiUrl: string;
  private repository: string;
  private branch: string;
  private remote: GreptileRemote;
  private events?: EventEmitter;

  constructor(options: GreptileClientOptions) {
    this.apiKey = options.apiKey || process.env.GREPTILE_API_KEY;
    this.apiUrl = options.apiUrl || process.env.GREPTILE_API_URL || DEFAULT_GREPTILE_URL;
    this.repository = options.repository;
    this.branch = options.branch || process.env.ORCHESTRATOR_DEFAULT_BRANCH || 'main';
    this.remote = this.inferRemote(options.repository);
    this.events = options.events;

    // Initialize MCP bridge if events provided
    if (this.events) {
      getMCPBridge(this.events);
    }
  }

  /**
   * Infer remote type from repository URL
   */
  private inferRemote(repository: string): GreptileRemote {
    if (repository.includes('github.com')) {
      return 'github';
    } else if (repository.includes('gitlab.com')) {
      return 'gitlab';
    } else if (repository.includes('dev.azure.com') || repository.includes('azure.com')) {
      return 'azure';
    } else if (repository.includes('bitbucket.org')) {
      return 'bitbucket';
    }
    // Default to github for 'owner/repo' format
    return 'github';
  }

  /**
   * Semantic code search using Greptile MCP
   *
   * Searches for code using natural language queries.
   *
   * @param query - Natural language search query
   * @param options - Search options
   * @returns Array of search results
   */
  async semanticSearch(
    query: string,
    options?: {
      /** Maximum number of results (default: 10) */
      limit?: number;
      /** Filter to specific file path */
      filePath?: string;
    }
  ): Promise<GreptileSearchResult[]> {
    const bridge = getMCPBridge();

    if (!bridge.isAvailable()) {
      console.warn('[Greptile] MCP not available - returning empty results');
      return [];
    }

    try {
      const response = await bridge.callTool(
        'mcp__plugin_greptile_greptile__search_greptile_comments',
        {
          query,
          limit: options?.limit || 10,
        }
      );

      if (!response.success || !response.data) {
        return [];
      }

      return this.normalizeSearchResults(response.data);
    } catch (error) {
      console.warn('[Greptile] Search failed:', error);
      return [];
    }
  }

  /**
   * Get PR details with Greptile analysis
   *
   * @param prNumber - Pull request number
   * @returns PR details with comments and metadata
   */
  async getPRAnalysis(prNumber: number): Promise<MergeRequestDetails> {
    const bridge = getMCPBridge();

    const response = await bridge.callTool('mcp__plugin_greptile_greptile__get_merge_request', {
      name: this.repository,
      remote: this.remote,
      defaultBranch: this.branch,
      prNumber,
    });

    if (!response.success || !response.data) {
      throw new GreptileError('Failed to get PR analysis', 'PR_ERROR');
    }

    return this.normalizePRDetails(response.data);
  }

  /**
   * Trigger code review for a PR
   *
   * @param prNumber - Pull request number
   * @param branch - Optional branch name
   */
  async triggerCodeReview(prNumber: number, branch?: string): Promise<void> {
    const bridge = getMCPBridge();

    const response = await bridge.callTool('mcp__plugin_greptile_greptile__trigger_code_review', {
      name: this.repository,
      remote: this.remote,
      defaultBranch: this.branch,
      branch: branch || this.branch,
      prNumber,
    });

    if (!response.success) {
      throw new GreptileError(response.error || 'Failed to trigger code review', 'REVIEW_ERROR');
    }
  }

  /**
   * List pull requests
   *
   * @param options - Filter options
   * @returns Array of PR summaries
   */
  async listPullRequests(options?: {
    /** Filter by state */
    state?: PRState;
    /** Filter by source branch */
    sourceBranch?: string;
    /** Maximum number of results (default: 20) */
    limit?: number;
  }): Promise<PullRequestSummary[]> {
    const bridge = getMCPBridge();

    const params: Record<string, unknown> = {
      name: this.repository,
      remote: this.remote,
      defaultBranch: this.branch,
    };

    if (options?.state) params.state = options.state;
    if (options?.sourceBranch) params.sourceBranch = options.sourceBranch;
    if (options?.limit) params.limit = options.limit;

    const response = await bridge.callTool(
      'mcp__plugin_greptile_greptile__list_pull_requests',
      params
    );

    if (!response.success || !response.data) {
      return [];
    }

    return this.normalizePRList(response.data);
  }

  /**
   * Search for specific comments across PRs
   *
   * @param query - Search query for comments
   * @param options - Search options
   * @returns Matching comments
   */
  async searchComments(
    query: string,
    options?: {
      /** Filter by addressed status */
      addressed?: boolean;
      /** Filter by creation date (ISO format) */
      createdAfter?: string;
      /** Maximum results (default: 10) */
      limit?: number;
    }
  ): Promise<PRReviewComment[]> {
    const bridge = getMCPBridge();

    const params: Record<string, unknown> = {
      query,
      limit: options?.limit || 10,
    };

    if (options?.addressed !== undefined) params.addressed = options.addressed;
    if (options?.createdAfter) params.createdAfter = options.createdAfter;

    const response = await bridge.callTool(
      'mcp__plugin_greptile_greptile__search_greptile_comments',
      params
    );

    if (!response.success || !response.data) {
      return [];
    }

    return this.normalizeComments(response.data);
  }

  /**
   * Normalize search results to GreptileSearchResult format
   */
  private normalizeSearchResults(data: unknown): GreptileSearchResult[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) {
        return {
          repository: this.repository,
          filePath: 'unknown',
          lineNumber: 0,
          code: '',
          relevanceScore: 0,
        };
      }

      const result = item as Record<string, unknown>;
      return {
        repository: (result.repository as string) || this.repository,
        filePath: ((result.filePath || result.file || result.path) as string) || 'unknown',
        lineNumber: ((result.lineNumber || result.line) as number) || 0,
        code: ((result.code || result.snippet || result.content) as string) || '',
        relevanceScore: ((result.score || result.relevance) as number) || 0,
        symbolName: (result.symbolName || result.symbol) as string | undefined,
      };
    });
  }

  /**
   * Normalize PR details
   */
  private normalizePRDetails(data: unknown): MergeRequestDetails {
    const result = data as Record<string, unknown>;

    return {
      number: (result.number as number) || 0,
      title: (result.title as string) || '',
      body: (result.body as string) || '',
      state: (result.state as PRState) || 'open',
      author: (result.author as string) || '',
      createdAt: (result.createdAt as string) || new Date().toISOString(),
      updatedAt: (result.updatedAt as string) || new Date().toISOString(),
      headRef: ((result.headRef || result.head_ref) as string) || '',
      baseRef: ((result.baseRef || result.base_ref) as string) || '',
      files: (result.files as string[]) || [],
      comments: this.normalizeComments(result.comments),
      reviewComments: this.normalizeReviewComments(result.reviewComments),
      metadata: {
        repository: this.repository,
        branch: this.branch,
        commit: (result.commit as string) || undefined,
      },
    };
  }

  /**
   * Normalize PR list
   */
  private normalizePRList(data: unknown): PullRequestSummary[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: unknown) => {
      const result = item as Record<string, unknown>;
      return {
        number: (result.number as number) || 0,
        title: (result.title as string) || '',
        state: (result.state as PRState) || 'open',
        author: (result.author as string) || '',
        createdAt: (result.createdAt as string) || new Date().toISOString(),
        updatedAt: (result.updatedAt as string) || new Date().toISOString(),
        headRef: (result.headRef as string) || undefined,
        baseRef: (result.baseRef as string) || undefined,
      };
    });
  }

  /**
   * Normalize comments
   */
  private normalizeComments(data: unknown): PRComment[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: unknown) => {
      const result = item as Record<string, unknown>;
      return {
        id: (result.id as string) || '',
        author: (result.author as string) || '',
        body: (result.body as string) || '',
        createdAt: (result.createdAt as string) || new Date().toISOString(),
      };
    });
  }

  /**
   * Normalize review comments
   */
  private normalizeReviewComments(data: unknown): PRReviewComment[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: unknown) => {
      const result = item as Record<string, unknown>;
      return {
        id: (result.id as string) || '',
        author: (result.author as string) || '',
        body: (result.body as string) || '',
        path: ((result.path || result.filePath) as string) || '',
        line: ((result.line || result.lineNumber) as number) || 0,
        createdAt: (result.createdAt as string) || new Date().toISOString(),
      };
    });
  }
}

/**
 * Global Greptile client instance
 */
let globalClient: GreptileClient | null = null;

/**
 * Get the global Greptile client instance
 *
 * @param options - Client options (required for first-time initialization)
 * @returns The Greptile client instance
 */
export function getGreptileClient(options?: GreptileClientOptions): GreptileClient {
  if (!globalClient) {
    if (!options?.repository) {
      throw new GreptileError('Repository required for Greptile client', 'NO_REPOSITORY');
    }
    globalClient = new GreptileClient(options);
  }
  return globalClient;
}

/**
 * Reset the global Greptile client instance
 *
 * This is primarily useful for testing.
 */
export function resetGreptileClient(): void {
  globalClient = null;
}
