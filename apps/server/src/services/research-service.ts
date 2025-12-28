/**
 * Research Service
 *
 * Coordinates research across available MCP tools (Greptile, Exa, LSP).
 * Conducts semantic code search, web research, and code analysis.
 *
 * This service implements Phase 1 of the orchestrator workflow:
 * - Semantic code search using Greptile
 * - Web research using Exa
 * - Deep code analysis using TypeScript LSP
 * - Synthesis of findings into actionable recommendations
 */

import type { EventEmitter } from '../lib/events.js';
import type {
  ResearchResult,
  ResearchSubtask,
  GreptileSearchResult,
  ExaSearchResult,
  LSPCodeAnalysis,
} from '@automaker/types';
import {
  ExaResearchClient,
  type WebSearchOptions,
  type CodeContextOptions,
} from './exa-research-client.js';
import { getGreptileClient } from './greptile-client.js';
import { getMCPBridge } from '../lib/mcp-bridge.js';

/**
 * Research context options
 */
export interface ResearchContext {
  /** Repository path for code analysis */
  repositoryPath: string;
  /** Related files to analyze */
  relatedFiles?: string[];
  /** Repository name for Greptile */
  repository?: string;
  /** Branch name */
  branch?: string;
}

/**
 * Research options
 */
export interface ResearchOptions {
  /** Maximum web results to fetch */
  maxWebResults?: number;
  /** Maximum code results to fetch */
  maxCodeResults?: number;
  /** Whether to include deep research */
  useDeepResearch?: boolean;
  /** Specific research categories */
  categories?: Array<'best-practices' | 'examples' | 'documentation' | 'similar-code'>;
}

/**
 * Subtask generation options
 */
export interface SubtaskGenerationOptions {
  /** Maximum number of subtasks */
  maxSubtasks?: number;
  /** Whether to include dependencies */
  includeDependencies?: boolean;
  /** Target complexity level */
  targetComplexity?: 'low' | 'medium' | 'high';
}

/**
 * Research Service Error
 */
export class ResearchServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ResearchServiceError';
  }
}

/**
 * Research Service
 *
 * Coordinates research across multiple tools to generate
 * comprehensive implementation guidance.
 */
export class ResearchService {
  private events: EventEmitter;
  private exaClient: ExaResearchClient;
  private activeResearches: Map<string, ResearchResult> = new Map();
  private greptileRepository?: string;

  constructor(exaClient: ExaResearchClient, events: EventEmitter, greptileRepository?: string) {
    this.exaClient = exaClient;
    this.events = events;
    this.greptileRepository = greptileRepository;

    // Initialize MCP bridge
    getMCPBridge(events);

    // Initialize Greptile client if repository provided
    if (greptileRepository) {
      getGreptileClient({
        repository: greptileRepository,
        branch: process.env.ORCHESTRATOR_DEFAULT_BRANCH || 'main',
        events,
      });
    }
  }

  /**
   * Phase 1: Initial Research & Analysis
   *
   * Conduct comprehensive research for a given task description
   * using all available research tools in parallel.
   */
  async conductResearch(
    taskId: string,
    description: string,
    context: ResearchContext,
    options?: ResearchOptions
  ): Promise<ResearchResult> {
    const startTime = Date.now();

    this.events.emit('orchestrator:research-started', {
      taskId,
      description,
      timestamp: new Date().toISOString(),
    });

    console.log(`[ResearchService] Starting research for task ${taskId}`);

    try {
      // Extract key terms for search
      const searchTerms = this.extractSearchTerms(description);

      // Run all research in parallel
      const results = await Promise.allSettled([
        this.searchGreptile(searchTerms, context),
        this.searchExa(description, searchTerms, options),
        this.analyzeWithLSP(context),
      ]);

      // Extract results
      const greptileResults = results[0].status === 'fulfilled' ? results[0].value : [];
      const exaResults = results[1].status === 'fulfilled' ? results[1].value : [];
      const lspAnalysis =
        results[2].status === 'fulfilled'
          ? results[2].value
          : {
              types: [],
              dependencies: [],
              references: [],
              imports: [],
              exports: [],
            };

      // Log any errors
      for (const result of results) {
        if (result.status === 'rejected') {
          console.warn(`[ResearchService] Research step failed:`, result.reason);
        }
      }

      // Synthesize recommendations
      const recommendations = this.synthesizeRecommendations(
        description,
        greptileResults,
        exaResults,
        lspAnalysis
      );

      // Identify risks
      const risks = this.identifyRisks(greptileResults, exaResults, lspAnalysis);

      // Generate subtasks
      const subtasks = this.generateSubtasks(
        description,
        recommendations,
        context,
        options as SubtaskGenerationOptions
      );

      const researchResult: ResearchResult = {
        taskId,
        greptileResults,
        exaResults,
        lspAnalysis,
        recommendations,
        risks,
        subtasks,
      };

      // Cache result
      this.activeResearches.set(taskId, researchResult);

      // Emit completion event
      this.events.emit('orchestrator:research-completed', {
        taskId,
        result: researchResult,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      });

      console.log(
        `[ResearchService] Research complete for task ${taskId} (${Date.now() - startTime}ms)`
      );

      return researchResult;
    } catch (error) {
      throw new ResearchServiceError(
        `Research failed for task ${taskId}: ${(error as Error).message}`,
        'RESEARCH_FAILED',
        error
      );
    }
  }

  /**
   * Search codebase using Greptile semantic search
   */
  private async searchGreptile(
    searchTerms: string[],
    context: ResearchContext
  ): Promise<GreptileSearchResult[]> {
    const bridge = getMCPBridge();

    if (!bridge.isAvailable()) {
      console.warn('[ResearchService] Greptile not available - skipping semantic search');
      return [];
    }

    const results: GreptileSearchResult[] = [];
    const repository =
      context.repository ||
      this.greptileRepository ||
      process.env.ORCHESTRATOR_GITHUB_REPO ||
      'oxtsotsi/DevFlow';

    try {
      const greptileClient = getGreptileClient({
        repository,
        branch: context.branch || process.env.ORCHESTRATOR_DEFAULT_BRANCH || 'main',
        events: this.events,
      });

      // Limit to 3 searches to avoid overwhelming the API
      for (const term of searchTerms.slice(0, 3)) {
        try {
          const searchResults = await greptileClient.semanticSearch(term, {
            limit: 5,
            filePath: context.relatedFiles?.[0],
          });
          results.push(...searchResults);
        } catch (error) {
          console.warn(`[ResearchService] Greptile search failed for "${term}":`, error);
        }
      }
    } catch (error) {
      console.warn('[ResearchService] Greptile client error:', error);
    }

    return results;
  }

  /**
   * Search web and code using Exa
   */
  private async searchExa(
    description: string,
    searchTerms: string[],
    options?: ResearchOptions
  ): Promise<ExaSearchResult[]> {
    console.log(`[ResearchService] Searching Exa for: ${searchTerms.join(', ')}`);

    const allResults: ExaSearchResult[] = [];

    // Web search for best practices
    try {
      const webResults = await this.exaClient.webSearch({
        query: `${searchTerms[0]} best practices implementation guide`,
        numResults: options?.maxWebResults || 5,
        useAutoprompt: true,
      });
      allResults.push(...webResults);
    } catch (error) {
      console.warn('[ResearchService] Exa web search failed:', error);
    }

    // Code context search
    try {
      const codeResults = await this.exaClient.getCodeContext({
        query: description,
        numResults: options?.maxCodeResults || 5,
      });
      allResults.push(...codeResults);
    } catch (error) {
      console.warn('[ResearchService] Exa code search failed:', error);
    }

    return allResults;
  }

  /**
   * Deep code analysis using TypeScript LSP
   */
  private async analyzeWithLSP(context: ResearchContext): Promise<LSPCodeAnalysis> {
    const bridge = getMCPBridge();

    // Try LSP MCP tools if available
    if (bridge.isAvailable()) {
      try {
        // Check for TypeScript LSP tools
        const response = await bridge.callTool('mcp__typescript_lsp__get_symbols', {
          path: context.repositoryPath,
        });

        if (response.success && response.data) {
          return this.normalizeLSPResults(response.data);
        }
      } catch (error) {
        console.warn('[ResearchService] LSP analysis failed, using fallback:', error);
      }
    }

    // Fallback: Basic file analysis using fs
    return this.basicFileAnalysis(context);
  }

  /**
   * Basic file analysis fallback when LSP is unavailable
   */
  private basicFileAnalysis(context: ResearchContext): LSPCodeAnalysis {
    const types: Array<{ name: string; file: string; line: number }> = [];
    const imports: Array<{ module: string; file: string; line: number }> = [];
    const exports: Array<{ name: string; file: string; line: number }> = [];

    // This would use fs to scan files - for now return empty
    // In a full implementation, we'd:
    // 1. Scan related files for type/interface definitions
    // 2. Extract import statements
    // 3. Find export statements
    return {
      types,
      dependencies: [],
      references: [],
      imports,
      exports,
    };
  }

  /**
   * Normalize LSP results to our format
   */
  private normalizeLSPResults(data: unknown): LSPCodeAnalysis {
    // Transform LSP results to our format
    // The actual structure depends on the LSP MCP tool's response format
    if (typeof data !== 'object' || data === null) {
      return {
        types: [],
        dependencies: [],
        references: [],
        imports: [],
        exports: [],
      };
    }

    const result = data as Record<string, unknown>;

    return {
      types: this.extractTypes(result),
      dependencies: this.extractDependencies(result),
      references: this.extractReferences(result),
      imports: this.extractImports(result),
      exports: this.extractExports(result),
    };
  }

  private extractTypes(
    result: Record<string, unknown>
  ): Array<{ name: string; file: string; line: number }> {
    // Extract type definitions from LSP results
    const types: Array<{ name: string; file: string; line: number }> = [];
    const symbols = result.symbols as Array<Record<string, unknown>> | undefined;

    if (Array.isArray(symbols)) {
      for (const symbol of symbols) {
        if (symbol.kind === 'interface' || symbol.kind === 'class' || symbol.kind === 'type') {
          types.push({
            name: (symbol.name as string) || '',
            file: (symbol.file as string) || '',
            line: (symbol.line as number) || 0,
          });
        }
      }
    }

    return types;
  }

  private extractDependencies(
    result: Record<string, unknown>
  ): Array<{ name: string; version?: string }> {
    const deps: Array<{ name: string; version?: string }> = [];
    const dependencies = result.dependencies as Array<Record<string, unknown>> | undefined;

    if (Array.isArray(dependencies)) {
      for (const dep of dependencies) {
        deps.push({
          name: (dep.name as string) || '',
          version: dep.version as string | undefined,
        });
      }
    }

    return deps;
  }

  private extractReferences(
    result: Record<string, unknown>
  ): Array<{ file: string; line: number; context: string }> {
    const refs: Array<{ file: string; line: number; context: string }> = [];
    const references = result.references as Array<Record<string, unknown>> | undefined;

    if (Array.isArray(references)) {
      for (const ref of references) {
        refs.push({
          file: (ref.file as string) || '',
          line: (ref.line as number) || 0,
          context: (ref.context as string) || '',
        });
      }
    }

    return refs;
  }

  private extractImports(
    result: Record<string, unknown>
  ): Array<{ module: string; file: string; line: number }> {
    const imports: Array<{ module: string; file: string; line: number }> = [];
    const importStatements = result.imports as Array<Record<string, unknown>> | undefined;

    if (Array.isArray(importStatements)) {
      for (const imp of importStatements) {
        imports.push({
          module: (imp.module as string) || '',
          file: (imp.file as string) || '',
          line: (imp.line as number) || 0,
        });
      }
    }

    return imports;
  }

  private extractExports(
    result: Record<string, unknown>
  ): Array<{ name: string; file: string; line: number }> {
    const exports: Array<{ name: string; file: string; line: number }> = [];
    const exportStatements = result.exports as Array<Record<string, unknown>> | undefined;

    if (Array.isArray(exportStatements)) {
      for (const exp of exportStatements) {
        exports.push({
          name: (exp.name as string) || '',
          file: (exp.file as string) || '',
          line: (exp.line as number) || 0,
        });
      }
    }

    return exports;
  }

  /**
   * Extract key search terms from description
   */
  private extractSearchTerms(description: string): string[] {
    // Extract technical terms, library names, and key phrases
    const words = description.split(/\s+/);
    const terms: string[] = [];

    // Look for common patterns:
    // - "add X to Y" -> X, Y
    // - "implement X" -> X
    // - "fix X in Y" -> X, Y
    // - Library names (React, TypeScript, etc.)
    // - File extensions (.ts, .tsx, etc.)

    const techTerms = words.filter((word) => {
      // Match: PascalCase, camelCase, or common technical terms
      return (
        /[A-Z][a-z]/.test(word) || // PascalCase
        /^[a-z]+[A-Z]/.test(word) || // camelCase
        /\.(ts|tsx|js|jsx|json)/.test(word) || // file extensions
        /^(React|TypeScript|Node|Express|API|GraphQL|REST)/.test(word) // common terms
      );
    });

    terms.push(...techTerms);

    // Also extract quoted phrases
    const quotedPhrases = description.match(/"([^"]+)"/g);
    if (quotedPhrases) {
      terms.push(...quotedPhrases.map((p) => p.replace(/"/g, '')));
    }

    return terms.length > 0 ? terms : ['implementation', 'feature'];
  }

  /**
   * Synthesize recommendations from all research sources
   */
  private synthesizeRecommendations(
    description: string,
    greptileResults: GreptileSearchResult[],
    exaResults: ExaSearchResult[],
    lspAnalysis: LSPCodeAnalysis
  ): string[] {
    const recommendations: string[] = [];

    // From existing code patterns (Greptile)
    if (greptileResults.length > 0) {
      recommendations.push('Follow existing patterns in the codebase for consistency');
    }

    // From web research (Exa)
    const hasBestPractices = exaResults.some(
      (r) =>
        r.title.toLowerCase().includes('best practice') ||
        r.snippet.toLowerCase().includes('best practice')
    );
    if (hasBestPractices) {
      recommendations.push('Reference industry best practices for this implementation');
    }

    // From LSP analysis
    if (lspAnalysis.dependencies.length > 0) {
      recommendations.push(
        `Leverage existing dependencies: ${lspAnalysis.dependencies.map((d) => d.name).join(', ')}`
      );
    }

    // Default recommendations
    if (recommendations.length === 0) {
      recommendations.push(
        'Start with a minimal implementation',
        'Add comprehensive tests',
        'Document the implementation',
        'Consider error handling and edge cases'
      );
    }

    return recommendations;
  }

  /**
   * Identify potential risks and blockers
   */
  private identifyRisks(
    greptileResults: GreptileSearchResult[],
    exaResults: ExaSearchResult[],
    lspAnalysis: LSPCodeAnalysis
  ): string[] {
    const risks: string[] = [];

    // Check for conflicting implementations
    const similarImplementations = greptileResults.filter((r) => r.relevanceScore > 0.8);
    if (similarImplementations.length > 2) {
      risks.push('Multiple similar implementations exist - ensure consistency');
    }

    // Check for deprecated patterns
    const deprecatedMentions = exaResults.filter(
      (r) =>
        r.snippet.toLowerCase().includes('deprecated') ||
        r.title.toLowerCase().includes('deprecated')
    );
    if (deprecatedMentions.length > 0) {
      risks.push('Some sources mention deprecated patterns - verify current approaches');
    }

    // Check for complex dependencies
    if (lspAnalysis.dependencies.length > 10) {
      risks.push('High dependency count - consider simplifying the implementation');
    }

    return risks;
  }

  /**
   * Generate subtasks from research results
   */
  private generateSubtasks(
    description: string,
    recommendations: string[],
    context: ResearchContext,
    options?: SubtaskGenerationOptions
  ): ResearchSubtask[] {
    const subtasks: ResearchSubtask[] = [];
    const maxSubtasks = options?.maxSubtasks || 5;

    // Generate subtask ID prefix
    let taskIndex = 1;

    // Subtask 1: Setup/Initialization
    subtasks.push({
      id: `${this.generateTaskId()}-${taskIndex++}`,
      title: 'Setup and initialization',
      description: `Set up the basic structure for: ${description}`,
      files: context.relatedFiles || [],
      complexity: 'low',
      dependencies: [],
      acceptanceCriteria: ['Basic structure created', 'No build errors', 'Type definitions added'],
    });

    // Subtask 2: Core implementation
    subtasks.push({
      id: `${this.generateTaskId()}-${taskIndex++}`,
      title: 'Core implementation',
      description: `Implement the main functionality for: ${description}`,
      files: context.relatedFiles || [],
      complexity: options?.targetComplexity || 'medium',
      dependencies: [subtasks[0].id],
      acceptanceCriteria: [
        'Core functionality working',
        'Handles edge cases',
        'Error handling in place',
      ],
    });

    // Subtask 3: Testing
    if (maxSubtasks >= 3) {
      subtasks.push({
        id: `${this.generateTaskId()}-${taskIndex++}`,
        title: 'Testing and validation',
        description: `Add tests for: ${description}`,
        files: [],
        complexity: 'low',
        dependencies: [subtasks[1].id],
        acceptanceCriteria: ['Unit tests added', 'Integration tests added', 'All tests passing'],
      });
    }

    // Subtask 4: Documentation
    if (maxSubtasks >= 4) {
      subtasks.push({
        id: `${this.generateTaskId()}-${taskIndex++}`,
        title: 'Documentation',
        description: `Document the implementation of: ${description}`,
        files: context.relatedFiles || [],
        complexity: 'low',
        dependencies: [subtasks[1].id],
        acceptanceCriteria: [
          'Code comments added',
          'README updated (if applicable)',
          'API documentation added',
        ],
      });
    }

    // Subtask 5: Review and refinement
    if (maxSubtasks >= 5) {
      subtasks.push({
        id: `${this.generateTaskId()}-${taskIndex++}`,
        title: 'Review and refinement',
        description: `Review and refine: ${description}`,
        files: context.relatedFiles || [],
        complexity: 'low',
        dependencies: [subtasks[2].id, subtasks[3].id],
        acceptanceCriteria: ['Code review complete', 'Feedback addressed', 'Ready for merge'],
      });
    }

    return subtasks;
  }

  /**
   * Generate a task ID
   */
  private generateTaskId(): string {
    return `T${Date.now().toString(36)}`;
  }

  /**
   * Get cached research result
   */
  getResearchResult(taskId: string): ResearchResult | undefined {
    return this.activeResearches.get(taskId);
  }

  /**
   * Remove cached research result
   */
  removeResearchResult(taskId: string): void {
    this.activeResearches.delete(taskId);
  }

  /**
   * Clear all cached research
   */
  clearAllResearch(): void {
    this.activeResearches.clear();
  }

  /**
   * Get research statistics
   */
  getStats(): {
    totalResearches: number;
    activeResearches: number;
    avgResultsCount: number;
  } {
    const researches = Array.from(this.activeResearches.values());
    const totalResultsCount = researches.reduce(
      (sum, r) => sum + r.greptileResults.length + r.exaResults.length,
      0
    );

    return {
      totalResearches: researches.length,
      activeResearches: researches.length,
      avgResultsCount: researches.length > 0 ? totalResultsCount / researches.length : 0,
    };
  }
}

/**
 * Create a research service
 */
export function createResearchService(
  exaClient: ExaResearchClient,
  events: EventEmitter
): ResearchService {
  return new ResearchService(exaClient, events);
}
