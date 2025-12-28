/**
 * Exa Research MCP Client
 *
 * Wraps Exa MCP tools for web research, code context, and deep research.
 *
 * Exa provides:
 * - Web search with semantic understanding
 * - Code context search for implementation patterns
 * - Document crawling for research
 * - Company research
 * - LinkedIn search
 * - Deep research (async)
 *
 * Exa MCP Tools Reference:
 * - mcp__exa__web_search_exa
 * - mcp__exa__get_code_context_exa
 * - mcp__exa__crawling_exa
 * - mcp__exa__company_research_exa
 * - mcp__exa__linkedin_search_exa
 * - mcp__exa__deep_researcher_start
 * - mcp__exa__deep_researcher_check
 */

import type { ExaSearchResult } from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import { getMCPBridge } from '../lib/mcp-bridge.js';

// Re-export types
export type { ExaSearchResult };

/**
 * Web search options
 */
export interface WebSearchOptions {
  /** Search query */
  query: string;
  /** Number of results (default: 10) */
  numResults?: number;
  /** Use autoprompt to improve query (default: true) */
  useAutoprompt?: boolean;
  /** Search type */
  type?: 'keyword' | 'neural';
  /** Category filter */
  category?:
    | 'company'
    | 'research paper'
    | 'news'
    | 'github'
    | 'tweet'
    | 'movie'
    | 'song'
    | 'personal site'
    | 'pdf';
  /** Exclude domains */
  excludeDomains?: string[];
  /** Include only these domains */
  includeDomains?: string[];
  /** Start date for published articles */
  startDate?: string;
  /** End date for published articles */
  endDate?: string;
}

/**
 * Code context search options
 */
export interface CodeContextOptions {
  /** Search query */
  query: string;
  /** Number of results (default: 10) */
  numResults?: number;
  /** Repository to search in */
  repo?: string;
  /** Specific language */
  language?: string;
}

/**
 * Crawling options
 */
export interface CrawlingOptions {
  /** URL to crawl */
  url: string;
  /** Output format */
  outputFormat?: 'markdown' | 'html' | 'text';
}

/**
 * Company research options
 */
export interface CompanyResearchOptions {
  /** Company name or query */
  query: string;
  /** Number of results (default: 10) */
  numResults?: number;
}

/**
 * Deep research options
 */
export interface DeepResearchOptions {
  /** Research query */
  query: string;
  /** Max search iterations (default: 15) */
  maxIterations?: number;
  /** Max depth per query (default: 3) */
  maxDepth?: number;
}

/**
 * Deep research result
 */
export interface DeepResearchResult {
  /** Research ID */
  id: string;
  /** Research status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Research results when complete */
  results?: unknown;
  /** Error if failed */
  error?: string;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

/**
 * Exa Client Error
 */
export class ExaError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ExaError';
  }
}

/**
 * Exa Research MCP Client
 *
 * This client uses the Exa MCP tools for intelligent web and code research.
 */
export class ExaResearchClient {
  private apiKey: string;
  private mcpUrl: string;
  private connected = false;
  private retryConfig: RetryConfig;
  private activeDeepResearches: Map<string, DeepResearchResult> = new Map();
  private events?: EventEmitter;

  constructor(
    apiKey: string,
    mcpUrl: string,
    options?: { retryConfig?: RetryConfig; events?: EventEmitter }
  ) {
    this.apiKey = apiKey;
    this.mcpUrl = mcpUrl;
    this.retryConfig = options?.retryConfig || DEFAULT_RETRY;
    this.events = options?.events;

    // Initialize MCP bridge if events provided
    if (this.events) {
      getMCPBridge(this.events);
    }
  }

  /**
   * Initialize the client
   */
  async connect(): Promise<void> {
    try {
      // Test connection with a simple search
      await this.webSearch({ query: 'test', numResults: 1 });
      this.connected = true;
      console.log('[Exa] Connected successfully');
    } catch (error) {
      throw new ExaError(
        `Failed to connect to Exa: ${(error as Error).message}`,
        'CONNECTION_ERROR',
        error
      );
    }
  }

  /**
   * Disconnect from Exa
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.activeDeepResearches.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Web search using Exa
   */
  async webSearch(options: WebSearchOptions): Promise<ExaSearchResult[]> {
    this.ensureConnected();

    try {
      const params: Record<string, unknown> = {
        query: options.query,
        numResults: options.numResults || 10,
        useAutoprompt: options.useAutoprompt !== false,
      };

      if (options.type) {
        params.type = options.type;
      }
      if (options.category) {
        params.category = options.category;
      }
      if (options.excludeDomains?.length) {
        params.excludeDomains = options.excludeDomains;
      }
      if (options.includeDomains?.length) {
        params.includeDomains = options.includeDomains;
      }
      if (options.startDate) {
        params.startDate = options.startDate;
      }
      if (options.endDate) {
        params.endDate = options.endDate;
      }

      const result = await this.callTool('mcp__exa__web_search_exa', params);

      if (!result?.success || !result.data) {
        return [];
      }

      return this.normalizeExaResults(result.data);
    } catch (error) {
      throw this.wrapError('Web search failed', error);
    }
  }

  /**
   * Search code context using Exa
   */
  async getCodeContext(options: CodeContextOptions): Promise<ExaSearchResult[]> {
    this.ensureConnected();

    try {
      const params: Record<string, unknown> = {
        query: options.query,
        numResults: options.numResults || 10,
      };

      if (options.repo) {
        params.repo = options.repo;
      }
      if (options.language) {
        params.language = options.language;
      }

      const result = await this.callTool('mcp__exa__get_code_context_exa', params);

      if (!result?.success || !result.data) {
        return [];
      }

      return this.normalizeExaResults(result.data);
    } catch (error) {
      throw this.wrapError('Code context search failed', error);
    }
  }

  /**
   * Crawl a URL for content
   */
  async crawling(options: CrawlingOptions): Promise<string> {
    this.ensureConnected();

    try {
      const result = await this.callTool('mcp__exa__crawling_exa', {
        url: options.url,
        outputFormat: options.outputFormat || 'markdown',
      });

      if (!result?.success || !result.data) {
        throw new Error('Crawling failed');
      }

      return result.data as string;
    } catch (error) {
      throw this.wrapError(`Crawling failed for ${options.url}`, error);
    }
  }

  /**
   * Company research
   */
  async companyResearch(options: CompanyResearchOptions): Promise<ExaSearchResult[]> {
    this.ensureConnected();

    try {
      const result = await this.callTool('mcp__exa__company_research_exa', {
        query: options.query,
        numResults: options.numResults || 10,
      });

      if (!result?.success || !result.data) {
        return [];
      }

      return this.normalizeExaResults(result.data);
    } catch (error) {
      throw this.wrapError('Company research failed', error);
    }
  }

  /**
   * LinkedIn search
   */
  async linkedinSearch(query: string, numResults = 10): Promise<ExaSearchResult[]> {
    this.ensureConnected();

    try {
      const result = await this.callTool('mcp__exa__linkedin_search_exa', {
        query,
        numResults,
      });

      if (!result?.success || !result.data) {
        return [];
      }

      return this.normalizeExaResults(result.data);
    } catch (error) {
      throw this.wrapError('LinkedIn search failed', error);
    }
  }

  /**
   * Start deep research (async)
   */
  async startDeepResearch(options: DeepResearchOptions): Promise<string> {
    this.ensureConnected();

    try {
      const result = await this.callTool('mcp__exa__deep_researcher_start', {
        query: options.query,
        maxIterations: options.maxIterations || 15,
        maxDepth: options.maxDepth || 3,
      });

      if (!result?.success || !result.data) {
        throw new Error('Failed to start deep research');
      }

      const researchId = result.data as string;

      // Track the research
      this.activeDeepResearches.set(researchId, {
        id: researchId,
        status: 'pending',
      });

      console.log(`[Exa] Started deep research: ${researchId}`);
      return researchId;
    } catch (error) {
      throw this.wrapError('Failed to start deep research', error);
    }
  }

  /**
   * Check deep research status
   */
  async checkDeepResearch(researchId: string): Promise<DeepResearchResult> {
    this.ensureConnected();

    try {
      const result = await this.callTool('mcp__exa__deep_researcher_check', {
        researchId,
      });

      if (!result?.success || !result.data) {
        throw new Error('Failed to check deep research');
      }

      const data = result.data as { status: string; results?: unknown; error?: string };

      // Update tracking
      const research: DeepResearchResult = {
        id: researchId,
        status: data.status as DeepResearchResult['status'],
        results: data.results,
        error: data.error,
      };

      this.activeDeepResearches.set(researchId, research);

      return research;
    } catch (error) {
      throw this.wrapError('Failed to check deep research', error);
    }
  }

  /**
   * Wait for deep research to complete
   */
  async waitForDeepResearch(
    researchId: string,
    options?: { timeout?: number; interval?: number }
  ): Promise<DeepResearchResult> {
    const timeout = options?.timeout || 300000; // 5 minutes default
    const interval = options?.interval || 5000; // 5 seconds default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.checkDeepResearch(researchId);

      if (result.status === 'completed') {
        return result;
      }

      if (result.status === 'failed') {
        throw new ExaError(
          `Deep research failed: ${result.error || 'Unknown error'}`,
          'RESEARCH_FAILED'
        );
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new ExaError('Deep research timed out', 'TIMEOUT');
  }

  /**
   * Combined research: search web and code context
   */
  async combinedResearch(
    query: string,
    options?: {
      webResults?: number;
      codeResults?: number;
      repos?: string[];
    }
  ): Promise<{
    webResults: ExaSearchResult[];
    codeResults: ExaSearchResult[];
  }> {
    const [webResults, codeResults] = await Promise.all([
      this.webSearch({ query, numResults: options?.webResults || 5 }),
      this.getCodeContext({
        query,
        numResults: options?.codeResults || 5,
      }),
    ]);

    return { webResults, codeResults };
  }

  /**
   * Research best practices for a technology/feature
   */
  async researchBestPractices(topic: string): Promise<{
    overview: ExaSearchResult[];
    codeExamples: ExaSearchResult[];
    documentation: ExaSearchResult[];
  }> {
    const [overview, codeExamples, documentation] = await Promise.all([
      this.webSearch({
        query: `${topic} best practices guide tutorial`,
        numResults: 5,
        category: 'news',
      }),
      this.getCodeContext({
        query: `${topic} implementation example`,
        numResults: 5,
      }),
      this.webSearch({
        query: `${topic} official documentation API reference`,
        numResults: 3,
        includeDomains: ['docs.rs', 'developer.mozilla.org', 'react.dev', 'nextjs.org'],
      }),
    ]);

    return { overview, codeExamples, documentation };
  }

  /**
   * Normalize Exa results to standard format
   */
  private normalizeExaResults(data: unknown): ExaSearchResult[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) {
        return {
          title: 'Unknown',
          url: '',
          snippet: '',
          score: 0,
        };
      }

      const result = item as Record<string, unknown>;
      return {
        title: (result.title as string) || 'Untitled',
        url: (result.url as string) || '',
        snippet: (result.snippet || result.text || result.excerpt || '') as string,
        score: (result.score as number) || 0,
        publishedDate: result.publishedDate as string | undefined,
        author: result.author as string | undefined,
      };
    });
  }

  /**
   * Ensure client is connected
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new ExaError('Client not connected', 'NOT_CONNECTED');
    }
  }

  /**
   * Wrap an error with context
   */
  private wrapError(message: string, error: unknown): ExaError {
    if (error instanceof ExaError) {
      return error;
    }
    return new ExaError(message, undefined, error);
  }

  /**
   * Call an MCP tool with retry logic
   */
  private async callTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const bridge = getMCPBridge();

    const result = await bridge.callTool(toolName, params);

    if (!result.success) {
      throw new ExaError(result.error || 'MCP tool call failed', 'MCP_ERROR');
    }

    return result;
  }

  /**
   * Get active deep researches
   */
  getActiveDeepResearches(): Map<string, DeepResearchResult> {
    return this.activeDeepResearches;
  }
}

/**
 * Create a singleton instance
 */
let globalClient: ExaResearchClient | null = null;

export function getExaResearchClient(apiKey?: string, mcpUrl?: string): ExaResearchClient {
  if (!globalClient) {
    // Use defaults if not provided
    const exaKey = apiKey || '9b2f9ab7-c27c-4763-b0ef-2c743232dab9';
    const exaUrl = mcpUrl || 'https://mcp.exa.ai/mcp';
    globalClient = new ExaResearchClient(exaKey, exaUrl);
  }
  return globalClient;
}

export function resetExaResearchClient(): void {
  globalClient = null;
}
