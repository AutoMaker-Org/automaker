/**
 * Ideation Service - Manages brainstorming sessions and ideas
 * Provides AI-powered ideation, project analysis, and idea-to-feature conversion
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import type { Feature, ExecuteOptions } from '@automaker/types';
import type {
  Idea,
  IdeaCategory,
  IdeaStatus,
  IdeationSession,
  IdeationSessionWithMessages,
  IdeationMessage,
  ProjectAnalysisResult,
  AnalysisSuggestion,
  AnalysisFileInfo,
  CreateIdeaInput,
  UpdateIdeaInput,
  StartSessionOptions,
  SendMessageOptions,
  PromptCategory,
  IdeationPrompt,
} from '@automaker/types';
import {
  getIdeationDir,
  getIdeasDir,
  getIdeaDir,
  getIdeaPath,
  getIdeationSessionsDir,
  getIdeationSessionPath,
  getIdeationAnalysisPath,
  ensureIdeationDir,
} from '@automaker/platform';
import { createLogger, loadContextFiles, isAbortError } from '@automaker/utils';
import { ProviderFactory } from '../providers/provider-factory.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import { createChatOptions, validateWorkingDirectory } from '../lib/sdk-options.js';
import { resolveModelString } from '@automaker/model-resolver';
import { stripProviderPrefix } from '@automaker/types';

const logger = createLogger('IdeationService');

interface ActiveSession {
  session: IdeationSession;
  messages: IdeationMessage[];
  isRunning: boolean;
  abortController: AbortController | null;
}

export class IdeationService {
  private activeSessions = new Map<string, ActiveSession>();
  private events: EventEmitter;
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;

  constructor(
    events: EventEmitter,
    settingsService?: SettingsService,
    featureLoader?: FeatureLoader
  ) {
    this.events = events;
    this.settingsService = settingsService ?? null;
    this.featureLoader = featureLoader ?? null;
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Start a new ideation session
   */
  async startSession(projectPath: string, options?: StartSessionOptions): Promise<IdeationSession> {
    validateWorkingDirectory(projectPath);
    await ensureIdeationDir(projectPath);

    const sessionId = this.generateId('session');
    const now = new Date().toISOString();

    const session: IdeationSession = {
      id: sessionId,
      projectPath,
      promptCategory: options?.promptCategory,
      promptId: options?.promptId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const activeSession: ActiveSession = {
      session,
      messages: [],
      isRunning: false,
      abortController: null,
    };

    this.activeSessions.set(sessionId, activeSession);
    await this.saveSessionToDisk(projectPath, session, []);

    this.events.emit('ideation:session-started', { sessionId, projectPath });

    // If there's an initial message from a prompt, send it
    if (options?.initialMessage) {
      await this.sendMessage(sessionId, options.initialMessage);
    }

    return session;
  }

  /**
   * Get an existing session
   */
  async getSession(
    projectPath: string,
    sessionId: string
  ): Promise<IdeationSessionWithMessages | null> {
    // Check if session is already active in memory
    let activeSession = this.activeSessions.get(sessionId);

    if (!activeSession) {
      // Try to load from disk
      const loaded = await this.loadSessionFromDisk(projectPath, sessionId);
      if (!loaded) return null;

      activeSession = {
        session: loaded.session,
        messages: loaded.messages,
        isRunning: false,
        abortController: null,
      };
      this.activeSessions.set(sessionId, activeSession);
    }

    return {
      ...activeSession.session,
      messages: activeSession.messages,
    };
  }

  /**
   * Send a message in an ideation session
   */
  async sendMessage(
    sessionId: string,
    message: string,
    options?: SendMessageOptions
  ): Promise<void> {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (activeSession.isRunning) {
      throw new Error('Session is already processing a message');
    }

    activeSession.isRunning = true;
    activeSession.abortController = new AbortController();

    // Add user message
    const userMessage: IdeationMessage = {
      id: this.generateId('msg'),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    activeSession.messages.push(userMessage);

    // Emit user message
    this.events.emit('ideation:stream', {
      sessionId,
      type: 'message',
      message: userMessage,
    });

    try {
      const projectPath = activeSession.session.projectPath;

      // Build conversation history
      const conversationHistory = activeSession.messages.slice(0, -1).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Load context files
      const contextResult = await loadContextFiles({
        projectPath,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      });

      // Gather existing features and ideas to prevent duplicate suggestions
      const existingWorkContext = await this.gatherExistingWorkContext(projectPath);

      // Build system prompt for ideation
      const systemPrompt = this.buildIdeationSystemPrompt(
        contextResult.formattedPrompt,
        activeSession.session.promptCategory,
        existingWorkContext
      );

      // Resolve model alias to canonical identifier (with prefix)
      const modelId = resolveModelString(options?.model ?? 'sonnet');

      // Create SDK options
      const sdkOptions = createChatOptions({
        cwd: projectPath,
        model: modelId,
        systemPrompt,
        abortController: activeSession.abortController!,
      });

      const provider = ProviderFactory.getProviderForModel(modelId);

      // Strip provider prefix - providers need bare model IDs
      const bareModel = stripProviderPrefix(modelId);

      const executeOptions: ExecuteOptions = {
        prompt: message,
        model: bareModel,
        originalModel: modelId,
        cwd: projectPath,
        systemPrompt: sdkOptions.systemPrompt,
        maxTurns: 1, // Single turn for ideation
        abortController: activeSession.abortController!,
        conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
      };

      const stream = provider.executeQuery(executeOptions);

      let responseText = '';
      const assistantMessage: IdeationMessage = {
        id: this.generateId('msg'),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };

      for await (const msg of stream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              responseText += block.text;
              assistantMessage.content = responseText;

              this.events.emit('ideation:stream', {
                sessionId,
                type: 'stream',
                content: responseText,
                done: false,
              });
            }
          }
        } else if (msg.type === 'result') {
          if (msg.subtype === 'success' && msg.result) {
            assistantMessage.content = msg.result;
            responseText = msg.result;
          }
        }
      }

      activeSession.messages.push(assistantMessage);

      this.events.emit('ideation:stream', {
        sessionId,
        type: 'message-complete',
        message: assistantMessage,
        content: responseText,
        done: true,
      });

      // Save session
      await this.saveSessionToDisk(projectPath, activeSession.session, activeSession.messages);
    } catch (error) {
      if (isAbortError(error)) {
        this.events.emit('ideation:stream', {
          sessionId,
          type: 'aborted',
        });
      } else {
        logger.error('Error in ideation message:', error);
        this.events.emit('ideation:stream', {
          sessionId,
          type: 'error',
          error: (error as Error).message,
        });
      }
    } finally {
      activeSession.isRunning = false;
      activeSession.abortController = null;
    }
  }

  /**
   * Stop an active session
   */
  async stopSession(sessionId: string): Promise<void> {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) return;

    if (activeSession.abortController) {
      activeSession.abortController.abort();
    }

    activeSession.isRunning = false;
    activeSession.abortController = null;
    activeSession.session.status = 'completed';

    await this.saveSessionToDisk(
      activeSession.session.projectPath,
      activeSession.session,
      activeSession.messages
    );

    this.events.emit('ideation:session-ended', { sessionId });
  }

  // ============================================================================
  // Ideas CRUD
  // ============================================================================

  /**
   * Create a new idea
   */
  async createIdea(projectPath: string, input: CreateIdeaInput): Promise<Idea> {
    validateWorkingDirectory(projectPath);
    await ensureIdeationDir(projectPath);

    const ideaId = this.generateId('idea');
    const now = new Date().toISOString();

    const idea: Idea = {
      id: ideaId,
      title: input.title,
      description: input.description,
      category: input.category,
      status: input.status || 'raw',
      impact: input.impact || 'medium',
      effort: input.effort || 'medium',
      conversationId: input.conversationId,
      sourcePromptId: input.sourcePromptId,
      userStories: input.userStories,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };

    // Save to disk
    const ideaDir = getIdeaDir(projectPath, ideaId);
    await secureFs.mkdir(ideaDir, { recursive: true });
    await secureFs.writeFile(
      getIdeaPath(projectPath, ideaId),
      JSON.stringify(idea, null, 2),
      'utf-8'
    );

    return idea;
  }

  /**
   * Get all ideas for a project
   */
  async getIdeas(projectPath: string): Promise<Idea[]> {
    try {
      const ideasDir = getIdeasDir(projectPath);

      try {
        await secureFs.access(ideasDir);
      } catch {
        return [];
      }

      const entries = (await secureFs.readdir(ideasDir, { withFileTypes: true })) as any[];
      const ideaDirs = entries.filter((entry) => entry.isDirectory());

      const ideas: Idea[] = [];
      for (const dir of ideaDirs) {
        try {
          const ideaPath = getIdeaPath(projectPath, dir.name);
          const content = (await secureFs.readFile(ideaPath, 'utf-8')) as string;
          ideas.push(JSON.parse(content));
        } catch (error) {
          logger.warn(`Failed to load idea ${dir.name}:`, error);
        }
      }

      // Sort by updatedAt descending
      return ideas.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      logger.error('Failed to get ideas:', error);
      return [];
    }
  }

  /**
   * Get a single idea
   */
  async getIdea(projectPath: string, ideaId: string): Promise<Idea | null> {
    try {
      const ideaPath = getIdeaPath(projectPath, ideaId);
      const content = (await secureFs.readFile(ideaPath, 'utf-8')) as string;
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Update an idea
   */
  async updateIdea(
    projectPath: string,
    ideaId: string,
    updates: UpdateIdeaInput
  ): Promise<Idea | null> {
    const idea = await this.getIdea(projectPath, ideaId);
    if (!idea) return null;

    const updatedIdea: Idea = {
      ...idea,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await secureFs.writeFile(
      getIdeaPath(projectPath, ideaId),
      JSON.stringify(updatedIdea, null, 2),
      'utf-8'
    );

    return updatedIdea;
  }

  /**
   * Delete an idea
   */
  async deleteIdea(projectPath: string, ideaId: string): Promise<void> {
    const ideaDir = getIdeaDir(projectPath, ideaId);
    try {
      await secureFs.rm(ideaDir, { recursive: true });
    } catch {
      // Ignore if doesn't exist
    }
  }

  /**
   * Archive an idea
   */
  async archiveIdea(projectPath: string, ideaId: string): Promise<Idea | null> {
    return this.updateIdea(projectPath, ideaId, {
      status: 'archived' as IdeaStatus,
    });
  }

  // ============================================================================
  // Project Analysis
  // ============================================================================

  /**
   * Analyze project structure and generate suggestions
   */
  async analyzeProject(projectPath: string): Promise<ProjectAnalysisResult> {
    validateWorkingDirectory(projectPath);
    await ensureIdeationDir(projectPath);

    this.emitAnalysisEvent('ideation:analysis-started', {
      projectPath,
      message: 'Starting project analysis...',
    });

    try {
      // Gather project structure
      const structure = await this.gatherProjectStructure(projectPath);

      this.emitAnalysisEvent('ideation:analysis-progress', {
        projectPath,
        progress: 30,
        message: 'Analyzing codebase structure...',
      });

      // Use AI to generate suggestions
      const suggestions = await this.generateAnalysisSuggestions(projectPath, structure);

      this.emitAnalysisEvent('ideation:analysis-progress', {
        projectPath,
        progress: 80,
        message: 'Generating improvement suggestions...',
      });

      const result: ProjectAnalysisResult = {
        projectPath,
        analyzedAt: new Date().toISOString(),
        totalFiles: structure.totalFiles,
        routes: structure.routes,
        components: structure.components,
        services: structure.services,
        framework: structure.framework,
        language: structure.language,
        dependencies: structure.dependencies,
        suggestions,
        summary: this.generateAnalysisSummary(structure, suggestions),
      };

      // Cache the result
      await secureFs.writeFile(
        getIdeationAnalysisPath(projectPath),
        JSON.stringify(result, null, 2),
        'utf-8'
      );

      this.emitAnalysisEvent('ideation:analysis-complete', {
        projectPath,
        result,
      });

      return result;
    } catch (error) {
      logger.error('Project analysis failed:', error);
      this.emitAnalysisEvent('ideation:analysis-error', {
        projectPath,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Emit analysis event wrapped in ideation:analysis format
   */
  private emitAnalysisEvent(eventType: string, data: Record<string, unknown>): void {
    this.events.emit('ideation:analysis', {
      type: eventType,
      ...data,
    });
  }

  /**
   * Check if a session is currently running (processing a message)
   */
  isSessionRunning(sessionId: string): boolean {
    const activeSession = this.activeSessions.get(sessionId);
    return activeSession?.isRunning ?? false;
  }

  /**
   * Get cached analysis result
   */
  async getCachedAnalysis(projectPath: string): Promise<ProjectAnalysisResult | null> {
    try {
      const content = (await secureFs.readFile(
        getIdeationAnalysisPath(projectPath),
        'utf-8'
      )) as string;
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Convert to Feature
  // ============================================================================

  /**
   * Convert an idea to a feature
   */
  async convertToFeature(projectPath: string, ideaId: string): Promise<Feature> {
    const idea = await this.getIdea(projectPath, ideaId);
    if (!idea) {
      throw new Error(`Idea ${ideaId} not found`);
    }

    // Build feature description from idea
    let description = idea.description;
    if (idea.userStories && idea.userStories.length > 0) {
      description += '\n\n## User Stories\n' + idea.userStories.map((s) => `- ${s}`).join('\n');
    }
    if (idea.notes) {
      description += '\n\n## Notes\n' + idea.notes;
    }

    const feature: Feature = {
      id: this.generateId('feature'),
      title: idea.title,
      category: this.mapIdeaCategoryToFeatureCategory(idea.category),
      description,
      status: 'backlog',
    };

    return feature;
  }

  // ============================================================================
  // Generate Suggestions
  // ============================================================================

  /**
   * Generate structured suggestions for a prompt
   * Returns parsed suggestions that can be directly added to the board
   */
  async generateSuggestions(
    projectPath: string,
    promptId: string,
    category: IdeaCategory,
    count: number = 10
  ): Promise<AnalysisSuggestion[]> {
    validateWorkingDirectory(projectPath);

    // Get the prompt
    const prompt = this.getAllPrompts().find((p) => p.id === promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    // Emit start event
    this.events.emit('ideation:suggestions', {
      type: 'started',
      promptId,
      category,
    });

    try {
      // Load context files
      const contextResult = await loadContextFiles({
        projectPath,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      });

      // Build context from multiple sources
      let contextPrompt = contextResult.formattedPrompt;

      // If no context files, try to gather basic project info
      if (!contextPrompt) {
        const projectInfo = await this.gatherBasicProjectInfo(projectPath);
        if (projectInfo) {
          contextPrompt = projectInfo;
        }
      }

      // Gather existing features and ideas to prevent duplicates
      const existingWorkContext = await this.gatherExistingWorkContext(projectPath);

      // Build system prompt for structured suggestions
      const systemPrompt = this.buildSuggestionsSystemPrompt(
        contextPrompt,
        category,
        count,
        existingWorkContext
      );

      // Resolve model alias to canonical identifier (with prefix)
      const modelId = resolveModelString('sonnet');

      // Create SDK options
      const sdkOptions = createChatOptions({
        cwd: projectPath,
        model: modelId,
        systemPrompt,
        abortController: new AbortController(),
      });

      const provider = ProviderFactory.getProviderForModel(modelId);

      // Strip provider prefix - providers need bare model IDs
      const bareModel = stripProviderPrefix(modelId);

      const executeOptions: ExecuteOptions = {
        prompt: prompt.prompt,
        model: bareModel,
        originalModel: modelId,
        cwd: projectPath,
        systemPrompt: sdkOptions.systemPrompt,
        maxTurns: 1,
        // Disable all tools - we just want text generation, not codebase analysis
        allowedTools: [],
        abortController: new AbortController(),
      };

      const stream = provider.executeQuery(executeOptions);

      let responseText = '';
      for await (const msg of stream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              responseText += block.text;
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
          responseText = msg.result;
        }
      }

      // Parse the response into structured suggestions
      const suggestions = this.parseSuggestionsFromResponse(responseText, category);

      // Emit complete event
      this.events.emit('ideation:suggestions', {
        type: 'complete',
        promptId,
        category,
        suggestions,
      });

      return suggestions;
    } catch (error) {
      logger.error('Failed to generate suggestions:', error);
      this.events.emit('ideation:suggestions', {
        type: 'error',
        promptId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Build system prompt for structured suggestion generation
   */
  private buildSuggestionsSystemPrompt(
    contextFilesPrompt: string | undefined,
    category: IdeaCategory,
    count: number = 10,
    existingWorkContext?: string
  ): string {
    const contextSection = contextFilesPrompt
      ? `## Project Context\n${contextFilesPrompt}`
      : `## No Project Context Available\nNo context files were found. Generate suggestions based on the user's prompt and general best practices for the type of application being described.`;

    const existingWorkSection = existingWorkContext ? `\n\n${existingWorkContext}` : '';

    return `You are an AI product strategist helping brainstorm feature ideas for a software project.

IMPORTANT: You do NOT have access to any tools. You CANNOT read files, search code, or run commands.
You must generate suggestions based ONLY on the project context provided below.
Do NOT say "I'll analyze" or "Let me explore" - you cannot do those things.

Based on the project context and the user's prompt, generate exactly ${count} creative and actionable feature suggestions.

YOUR RESPONSE MUST BE ONLY A JSON ARRAY - nothing else. No explanation, no preamble, no markdown code fences.

Each suggestion must have this structure:
{
  "title": "Short, actionable title (max 60 chars)",
  "description": "Clear description of what to build or improve (2-3 sentences)",
  "rationale": "Why this is valuable - the problem it solves or opportunity it creates",
  "priority": "high" | "medium" | "low"
}

Focus area: ${this.getCategoryDescription(category)}

Guidelines:
- Generate exactly ${count} suggestions
- Be specific and actionable - avoid vague ideas
- Mix different priority levels (some high, some medium, some low)
- Each suggestion should be independently implementable
- Think creatively - include both obvious improvements and innovative ideas
- Consider the project's domain and target users
- IMPORTANT: Do NOT suggest features or ideas that already exist in the "Existing Features" or "Existing Ideas" sections below

${contextSection}${existingWorkSection}`;
  }

  /**
   * Parse AI response into structured suggestions
   */
  private parseSuggestionsFromResponse(
    response: string,
    category: IdeaCategory
  ): AnalysisSuggestion[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn('No JSON array found in response, falling back to text parsing');
        return this.parseTextResponse(response, category);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        return this.parseTextResponse(response, category);
      }

      return parsed.map((item: any, index: number) => ({
        id: this.generateId('sug'),
        category,
        title: item.title || `Suggestion ${index + 1}`,
        description: item.description || '',
        rationale: item.rationale || '',
        priority: item.priority || 'medium',
        relatedFiles: item.relatedFiles || [],
      }));
    } catch (error) {
      logger.warn('Failed to parse JSON response:', error);
      return this.parseTextResponse(response, category);
    }
  }

  /**
   * Fallback: parse text response into suggestions
   */
  private parseTextResponse(response: string, category: IdeaCategory): AnalysisSuggestion[] {
    const suggestions: AnalysisSuggestion[] = [];

    // Try to find numbered items or headers
    const lines = response.split('\n');
    let currentSuggestion: Partial<AnalysisSuggestion> | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      // Check for numbered items or markdown headers
      const titleMatch = line.match(/^(?:\d+[\.\)]\s*\*{0,2}|#{1,3}\s+)(.+)/);

      if (titleMatch) {
        // Save previous suggestion
        if (currentSuggestion && currentSuggestion.title) {
          suggestions.push({
            id: this.generateId('sug'),
            category,
            title: currentSuggestion.title,
            description: currentContent.join(' ').trim() || currentSuggestion.title,
            rationale: '',
            priority: 'medium',
            ...currentSuggestion,
          } as AnalysisSuggestion);
        }

        // Start new suggestion
        currentSuggestion = {
          title: titleMatch[1].replace(/\*{1,2}/g, '').trim(),
        };
        currentContent = [];
      } else if (currentSuggestion && line.trim()) {
        currentContent.push(line.trim());
      }
    }

    // Don't forget the last suggestion
    if (currentSuggestion && currentSuggestion.title) {
      suggestions.push({
        id: this.generateId('sug'),
        category,
        title: currentSuggestion.title,
        description: currentContent.join(' ').trim() || currentSuggestion.title,
        rationale: '',
        priority: 'medium',
      } as AnalysisSuggestion);
    }

    // If no suggestions found, create one from the whole response
    if (suggestions.length === 0 && response.trim()) {
      suggestions.push({
        id: this.generateId('sug'),
        category,
        title: 'AI Suggestion',
        description: response.slice(0, 500),
        rationale: '',
        priority: 'medium',
      });
    }

    return suggestions.slice(0, 5); // Max 5 suggestions
  }

  // ============================================================================
  // Guided Prompts
  // ============================================================================

  /**
   * Get all prompt categories
   */
  getPromptCategories(): PromptCategory[] {
    return [
      {
        id: 'feature',
        name: 'Features',
        icon: 'Zap',
        description: 'New capabilities and functionality',
      },
      {
        id: 'ux-ui',
        name: 'UX/UI',
        icon: 'Palette',
        description: 'Design and user experience improvements',
      },
      {
        id: 'dx',
        name: 'Developer Experience',
        icon: 'Code',
        description: 'Developer tooling and workflows',
      },
      {
        id: 'growth',
        name: 'Growth',
        icon: 'TrendingUp',
        description: 'User engagement and retention',
      },
      {
        id: 'technical',
        name: 'Technical',
        icon: 'Cpu',
        description: 'Architecture and infrastructure',
      },
      {
        id: 'security',
        name: 'Security',
        icon: 'Shield',
        description: 'Security improvements and vulnerability fixes',
      },
      {
        id: 'performance',
        name: 'Performance',
        icon: 'Gauge',
        description: 'Performance optimization and speed improvements',
      },
      {
        id: 'accessibility',
        name: 'Accessibility',
        icon: 'Accessibility',
        description: 'Accessibility features and inclusive design',
      },
      {
        id: 'analytics',
        name: 'Analytics',
        icon: 'BarChart',
        description: 'Analytics, monitoring, and insights features',
      },
    ];
  }

  /**
   * Get prompts for a specific category
   */
  getPromptsByCategory(category: IdeaCategory): IdeationPrompt[] {
    const allPrompts = this.getAllPrompts();
    return allPrompts.filter((p) => p.category === category);
  }

  /**
   * Get all guided prompts
   * This is the single source of truth for guided prompts data.
   * Frontend fetches this data via /api/ideation/prompts endpoint.
   */
  getAllPrompts(): IdeationPrompt[] {
    return [
      // Feature prompts
      {
        id: 'feature-missing',
        category: 'feature',
        title: 'Missing Features',
        description: 'Discover features users might expect',
        prompt:
          "Based on the project context provided, identify features that users of similar applications typically expect but might be missing. Consider the app's domain, target users, and common patterns in similar products.",
      },
      {
        id: 'feature-automation',
        category: 'feature',
        title: 'Automation Opportunities',
        description: 'Find manual processes that could be automated',
        prompt:
          'Based on the project context, identify manual processes or repetitive tasks that could be automated. Look for patterns where users might be doing things repeatedly that software could handle.',
      },
      {
        id: 'feature-integrations',
        category: 'feature',
        title: 'Integration Ideas',
        description: 'Identify valuable third-party integrations',
        prompt:
          "Based on the project context, what third-party services or APIs would provide value if integrated? Consider the app's domain and what complementary services users might need.",
      },
      {
        id: 'feature-workflow',
        category: 'feature',
        title: 'Workflow Improvements',
        description: 'Streamline user workflows',
        prompt:
          'Based on the project context, analyze the user workflows. What steps could be combined, eliminated, or automated? Where are users likely spending too much time on repetitive tasks?',
      },

      // UX/UI prompts
      {
        id: 'ux-friction',
        category: 'ux-ui',
        title: 'Friction Points',
        description: 'Identify where users might get stuck',
        prompt:
          'Based on the project context, identify potential user friction points. Where might users get confused, stuck, or frustrated? Consider form submissions, navigation, error states, and complex interactions.',
      },
      {
        id: 'ux-empty-states',
        category: 'ux-ui',
        title: 'Empty States',
        description: 'Improve empty state experiences',
        prompt:
          "Based on the project context, identify empty states that could be improved. How can we guide users when there's no content? Consider onboarding, helpful prompts, and sample data.",
      },
      {
        id: 'ux-accessibility',
        category: 'ux-ui',
        title: 'Accessibility Improvements',
        description: 'Enhance accessibility and inclusivity',
        prompt:
          'Based on the project context, suggest accessibility improvements. Consider keyboard navigation, screen reader support, color contrast, focus states, and ARIA labels. What specific improvements would make this more accessible?',
      },
      {
        id: 'ux-mobile',
        category: 'ux-ui',
        title: 'Mobile Experience',
        description: 'Optimize for mobile users',
        prompt:
          'Based on the project context, suggest improvements for the mobile user experience. Consider touch targets, responsive layouts, and mobile-specific interactions.',
      },
      {
        id: 'ux-feedback',
        category: 'ux-ui',
        title: 'User Feedback',
        description: 'Improve feedback and status indicators',
        prompt:
          'Based on the project context, analyze how the application communicates with users. Where are loading states, success messages, or error handling missing or unclear? What feedback would help users understand what is happening?',
      },

      // DX prompts
      {
        id: 'dx-documentation',
        category: 'dx',
        title: 'Documentation Gaps',
        description: 'Identify missing documentation',
        prompt:
          'Based on the project context, identify areas that could benefit from better documentation. What would help new developers understand the architecture, APIs, and conventions? Consider inline comments, READMEs, and API docs.',
      },
      {
        id: 'dx-testing',
        category: 'dx',
        title: 'Testing Improvements',
        description: 'Enhance test coverage and quality',
        prompt:
          'Based on the project context, suggest areas that need better test coverage. What types of tests might be missing? Consider unit tests, integration tests, and end-to-end tests.',
      },
      {
        id: 'dx-tooling',
        category: 'dx',
        title: 'Developer Tooling',
        description: 'Improve development workflows',
        prompt:
          'Based on the project context, suggest improvements to development workflows. What improvements would speed up development? Consider build times, hot reload, debugging tools, and developer scripts.',
      },
      {
        id: 'dx-error-handling',
        category: 'dx',
        title: 'Error Handling',
        description: 'Improve error messages and debugging',
        prompt:
          'Based on the project context, analyze error handling. Where are error messages unclear or missing? What would help developers debug issues faster? Consider logging, error boundaries, and stack traces.',
      },

      // Growth prompts
      {
        id: 'growth-onboarding',
        category: 'growth',
        title: 'Onboarding Flow',
        description: 'Improve new user experience',
        prompt:
          'Based on the project context, suggest improvements to the onboarding experience. How can we help new users understand the value and get started quickly? Consider tutorials, progressive disclosure, and quick wins.',
      },
      {
        id: 'growth-engagement',
        category: 'growth',
        title: 'User Engagement',
        description: 'Increase user retention and activity',
        prompt:
          'Based on the project context, suggest features that would increase user engagement and retention. What would bring users back daily? Consider notifications, streaks, social features, and personalization.',
      },
      {
        id: 'growth-sharing',
        category: 'growth',
        title: 'Shareability',
        description: 'Make the app more shareable',
        prompt:
          'Based on the project context, suggest ways to make the application more shareable. What features would encourage users to invite others or share their work? Consider collaboration, public profiles, and export features.',
      },
      {
        id: 'growth-monetization',
        category: 'growth',
        title: 'Monetization Ideas',
        description: 'Identify potential revenue streams',
        prompt:
          'Based on the project context, what features or tiers could support monetization? Consider premium features, usage limits, team features, and integrations that users would pay for.',
      },

      // Technical prompts
      {
        id: 'tech-performance',
        category: 'technical',
        title: 'Performance Optimization',
        description: 'Identify performance bottlenecks',
        prompt:
          'Based on the project context, suggest performance optimization opportunities. Where might bottlenecks exist? Consider database queries, API calls, bundle size, rendering, and caching strategies.',
      },
      {
        id: 'tech-architecture',
        category: 'technical',
        title: 'Architecture Review',
        description: 'Evaluate and improve architecture',
        prompt:
          'Based on the project context, suggest architectural improvements. What would make the codebase more maintainable, scalable, or testable? Consider separation of concerns, dependency management, and patterns.',
      },
      {
        id: 'tech-debt',
        category: 'technical',
        title: 'Technical Debt',
        description: 'Identify areas needing refactoring',
        prompt:
          'Based on the project context, identify potential technical debt. What areas might be becoming hard to maintain or understand? What refactoring would have the highest impact? Consider duplicated code, complexity, and outdated patterns.',
      },
      {
        id: 'tech-security',
        category: 'technical',
        title: 'Security Review',
        description: 'Identify security improvements',
        prompt:
          'Based on the project context, review for security improvements. What best practices are missing? Consider authentication, authorization, input validation, and data protection. Note: This is for improvement suggestions, not a security audit.',
      },

      // Security prompts
      {
        id: 'security-auth',
        category: 'security',
        title: 'Authentication Security',
        description: 'Review authentication mechanisms',
        prompt:
          'Based on the project context, analyze the authentication system. What security improvements would strengthen user authentication? Consider password policies, session management, MFA, and token handling.',
      },
      {
        id: 'security-data',
        category: 'security',
        title: 'Data Protection',
        description: 'Protect sensitive user data',
        prompt:
          'Based on the project context, review how sensitive data is handled. What improvements would better protect user privacy? Consider encryption, data minimization, secure storage, and data retention policies.',
      },
      {
        id: 'security-input',
        category: 'security',
        title: 'Input Validation',
        description: 'Prevent injection attacks',
        prompt:
          'Based on the project context, analyze input handling. Where could input validation be strengthened? Consider SQL injection, XSS, command injection, and file upload vulnerabilities.',
      },
      {
        id: 'security-api',
        category: 'security',
        title: 'API Security',
        description: 'Secure API endpoints',
        prompt:
          'Based on the project context, review API security. What improvements would make the API more secure? Consider rate limiting, authorization, CORS, and request validation.',
      },

      // Performance prompts
      {
        id: 'perf-frontend',
        category: 'performance',
        title: 'Frontend Performance',
        description: 'Optimize UI rendering and loading',
        prompt:
          'Based on the project context, analyze frontend performance. What optimizations would improve load times and responsiveness? Consider bundle splitting, lazy loading, memoization, and render optimization.',
      },
      {
        id: 'perf-backend',
        category: 'performance',
        title: 'Backend Performance',
        description: 'Optimize server-side operations',
        prompt:
          'Based on the project context, review backend performance. What optimizations would improve response times? Consider database queries, caching strategies, async operations, and resource pooling.',
      },
      {
        id: 'perf-database',
        category: 'performance',
        title: 'Database Optimization',
        description: 'Improve query performance',
        prompt:
          'Based on the project context, analyze database interactions. What optimizations would improve data access performance? Consider indexing, query optimization, denormalization, and connection pooling.',
      },
      {
        id: 'perf-caching',
        category: 'performance',
        title: 'Caching Strategies',
        description: 'Implement effective caching',
        prompt:
          'Based on the project context, review caching opportunities. Where would caching provide the most benefit? Consider API responses, computed values, static assets, and session data.',
      },

      // Accessibility prompts
      {
        id: 'a11y-keyboard',
        category: 'accessibility',
        title: 'Keyboard Navigation',
        description: 'Enable full keyboard access',
        prompt:
          'Based on the project context, analyze keyboard accessibility. What improvements would enable users to navigate entirely with keyboard? Consider focus management, tab order, and keyboard shortcuts.',
      },
      {
        id: 'a11y-screen-reader',
        category: 'accessibility',
        title: 'Screen Reader Support',
        description: 'Improve screen reader experience',
        prompt:
          'Based on the project context, review screen reader compatibility. What improvements would help users with visual impairments? Consider ARIA labels, semantic HTML, live regions, and alt text.',
      },
      {
        id: 'a11y-visual',
        category: 'accessibility',
        title: 'Visual Accessibility',
        description: 'Improve visual design for all users',
        prompt:
          'Based on the project context, analyze visual accessibility. What improvements would help users with visual impairments? Consider color contrast, text sizing, focus indicators, and reduced motion.',
      },
      {
        id: 'a11y-forms',
        category: 'accessibility',
        title: 'Accessible Forms',
        description: 'Make forms usable for everyone',
        prompt:
          'Based on the project context, review form accessibility. What improvements would make forms more accessible? Consider labels, error messages, required field indicators, and input assistance.',
      },

      // Analytics prompts
      {
        id: 'analytics-tracking',
        category: 'analytics',
        title: 'User Tracking',
        description: 'Track key user behaviors',
        prompt:
          'Based on the project context, analyze analytics opportunities. What user behaviors should be tracked to understand engagement? Consider page views, feature usage, conversion funnels, and session duration.',
      },
      {
        id: 'analytics-metrics',
        category: 'analytics',
        title: 'Key Metrics',
        description: 'Define success metrics',
        prompt:
          'Based on the project context, what key metrics should be tracked? Consider user acquisition, retention, engagement, and feature adoption. What dashboards would be most valuable?',
      },
      {
        id: 'analytics-errors',
        category: 'analytics',
        title: 'Error Monitoring',
        description: 'Track and analyze errors',
        prompt:
          'Based on the project context, review error handling for monitoring opportunities. What error tracking would help identify and fix issues faster? Consider error aggregation, alerting, and stack traces.',
      },
      {
        id: 'analytics-performance',
        category: 'analytics',
        title: 'Performance Monitoring',
        description: 'Track application performance',
        prompt:
          'Based on the project context, analyze performance monitoring opportunities. What metrics would help identify bottlenecks? Consider load times, API response times, and resource usage.',
      },
    ];
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private buildIdeationSystemPrompt(
    contextFilesPrompt: string | undefined,
    category?: IdeaCategory,
    existingWorkContext?: string
  ): string {
    const basePrompt = `You are an AI product strategist and UX expert helping brainstorm ideas for improving a software project.

Your role is to:
- Analyze the codebase structure and patterns
- Identify opportunities for improvement
- Suggest actionable ideas with clear rationale
- Consider user experience, technical feasibility, and business value
- Be specific and reference actual files/components when possible

When suggesting ideas:
1. Provide a clear, concise title
2. Explain the problem or opportunity
3. Describe the proposed solution
4. Highlight the expected benefit
5. Note any dependencies or considerations

IMPORTANT: Do NOT suggest features or ideas that already exist in the project. Check the "Existing Features" and "Existing Ideas" sections below to avoid duplicates.

Focus on practical, implementable suggestions that would genuinely improve the product.`;

    const categoryContext = category
      ? `\n\nFocus area: ${this.getCategoryDescription(category)}`
      : '';

    const contextSection = contextFilesPrompt
      ? `\n\n## Project Context\n${contextFilesPrompt}`
      : '';

    const existingWorkSection = existingWorkContext ? `\n\n${existingWorkContext}` : '';

    return basePrompt + categoryContext + contextSection + existingWorkSection;
  }

  private getCategoryDescription(category: IdeaCategory): string {
    const descriptions: Record<IdeaCategory, string> = {
      feature: 'New features and capabilities that add value for users',
      'ux-ui': 'User interface and user experience improvements',
      dx: 'Developer experience and tooling improvements',
      growth: 'User acquisition, engagement, and retention',
      technical: 'Architecture, performance, and infrastructure',
      security: 'Security improvements and vulnerability fixes',
      performance: 'Performance optimization and speed improvements',
      accessibility: 'Accessibility features and inclusive design',
      analytics: 'Analytics, monitoring, and insights features',
    };
    return descriptions[category] || '';
  }

  /**
   * Gather basic project information for context when no context files exist
   */
  private async gatherBasicProjectInfo(projectPath: string): Promise<string | null> {
    const parts: string[] = [];

    // Try to read package.json
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = (await secureFs.readFile(packageJsonPath, 'utf-8')) as string;
      const pkg = JSON.parse(content);

      parts.push('## Project Information (from package.json)');
      if (pkg.name) parts.push(`**Name:** ${pkg.name}`);
      if (pkg.description) parts.push(`**Description:** ${pkg.description}`);
      if (pkg.version) parts.push(`**Version:** ${pkg.version}`);

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depNames = Object.keys(allDeps);

      // Detect framework and language
      let framework = 'Unknown';
      if (allDeps.react) framework = allDeps.next ? 'Next.js' : 'React';
      else if (allDeps.vue) framework = allDeps.nuxt ? 'Nuxt' : 'Vue';
      else if (allDeps['@angular/core']) framework = 'Angular';
      else if (allDeps.svelte) framework = 'Svelte';
      else if (allDeps.express) framework = 'Express';
      else if (allDeps.fastify) framework = 'Fastify';
      else if (allDeps.koa) framework = 'Koa';

      const language = allDeps.typescript ? 'TypeScript' : 'JavaScript';
      parts.push(`**Tech Stack:** ${framework} with ${language}`);

      // Key dependencies
      const keyDeps = depNames
        .filter(
          (d) => !d.startsWith('@types/') && !['typescript', 'eslint', 'prettier'].includes(d)
        )
        .slice(0, 15);
      if (keyDeps.length > 0) {
        parts.push(`**Key Dependencies:** ${keyDeps.join(', ')}`);
      }

      // Scripts
      if (pkg.scripts) {
        const scriptNames = Object.keys(pkg.scripts).slice(0, 10);
        parts.push(`**Available Scripts:** ${scriptNames.join(', ')}`);
      }
    } catch {
      // No package.json, try other files
    }

    // Try to read README.md (first 500 chars)
    try {
      const readmePath = path.join(projectPath, 'README.md');
      const content = (await secureFs.readFile(readmePath, 'utf-8')) as string;
      if (content) {
        parts.push('\n## README.md (excerpt)');
        parts.push(content.slice(0, 1000));
      }
    } catch {
      // No README
    }

    // Try to get cached analysis
    const cachedAnalysis = await this.getCachedAnalysis(projectPath);
    if (cachedAnalysis) {
      parts.push('\n## Project Structure Analysis');
      parts.push(cachedAnalysis.summary || '');
      if (cachedAnalysis.routes && cachedAnalysis.routes.length > 0) {
        parts.push(`**Routes:** ${cachedAnalysis.routes.map((r) => r.name).join(', ')}`);
      }
      if (cachedAnalysis.components && cachedAnalysis.components.length > 0) {
        parts.push(
          `**Components:** ${cachedAnalysis.components
            .slice(0, 10)
            .map((c) => c.name)
            .join(
              ', '
            )}${cachedAnalysis.components.length > 10 ? ` and ${cachedAnalysis.components.length - 10} more` : ''}`
        );
      }
    }

    if (parts.length === 0) {
      return null;
    }

    return parts.join('\n');
  }

  /**
   * Gather existing features and ideas to prevent duplicate suggestions
   * Returns a concise list of titles grouped by status to avoid polluting context
   */
  private async gatherExistingWorkContext(projectPath: string): Promise<string> {
    const parts: string[] = [];

    // Load existing features from the board
    if (this.featureLoader) {
      try {
        const features = await this.featureLoader.getAll(projectPath);
        if (features.length > 0) {
          parts.push('## Existing Features (Do NOT regenerate these)');
          parts.push(
            'The following features already exist on the board. Do NOT suggest similar ideas:\n'
          );

          // Group features by status for clarity
          const byStatus: Record<string, string[]> = {
            done: [],
            'in-review': [],
            'in-progress': [],
            backlog: [],
          };

          for (const feature of features) {
            const status = feature.status || 'backlog';
            const title = feature.title || 'Untitled';
            if (byStatus[status]) {
              byStatus[status].push(title);
            } else {
              byStatus['backlog'].push(title);
            }
          }

          // Output completed features first (most important to not duplicate)
          if (byStatus['done'].length > 0) {
            parts.push(`**Completed:** ${byStatus['done'].join(', ')}`);
          }
          if (byStatus['in-review'].length > 0) {
            parts.push(`**In Review:** ${byStatus['in-review'].join(', ')}`);
          }
          if (byStatus['in-progress'].length > 0) {
            parts.push(`**In Progress:** ${byStatus['in-progress'].join(', ')}`);
          }
          if (byStatus['backlog'].length > 0) {
            parts.push(`**Backlog:** ${byStatus['backlog'].join(', ')}`);
          }
          parts.push('');
        }
      } catch (error) {
        logger.warn('Failed to load existing features:', error);
      }
    }

    // Load existing ideas
    try {
      const ideas = await this.getIdeas(projectPath);
      // Filter out archived ideas
      const activeIdeas = ideas.filter((idea) => idea.status !== 'archived');

      if (activeIdeas.length > 0) {
        parts.push('## Existing Ideas (Do NOT regenerate these)');
        parts.push(
          'The following ideas have already been captured. Do NOT suggest similar ideas:\n'
        );

        // Group by category for organization
        const byCategory: Record<string, string[]> = {};
        for (const idea of activeIdeas) {
          const cat = idea.category || 'feature';
          if (!byCategory[cat]) {
            byCategory[cat] = [];
          }
          byCategory[cat].push(idea.title);
        }

        for (const [category, titles] of Object.entries(byCategory)) {
          parts.push(`**${category}:** ${titles.join(', ')}`);
        }
        parts.push('');
      }
    } catch (error) {
      logger.warn('Failed to load existing ideas:', error);
    }

    return parts.join('\n');
  }

  private async gatherProjectStructure(projectPath: string): Promise<{
    totalFiles: number;
    routes: AnalysisFileInfo[];
    components: AnalysisFileInfo[];
    services: AnalysisFileInfo[];
    framework?: string;
    language?: string;
    dependencies?: string[];
  }> {
    const routes: AnalysisFileInfo[] = [];
    const components: AnalysisFileInfo[] = [];
    const services: AnalysisFileInfo[] = [];
    let totalFiles = 0;
    let framework: string | undefined;
    let language: string | undefined;
    const dependencies: string[] = [];

    // Check for package.json to detect framework and dependencies
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = (await secureFs.readFile(packageJsonPath, 'utf-8')) as string;
      const pkg = JSON.parse(content);

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      dependencies.push(...Object.keys(allDeps).slice(0, 20)); // Top 20 deps

      if (allDeps.react) framework = 'React';
      else if (allDeps.vue) framework = 'Vue';
      else if (allDeps.angular) framework = 'Angular';
      else if (allDeps.next) framework = 'Next.js';
      else if (allDeps.express) framework = 'Express';

      language = allDeps.typescript ? 'TypeScript' : 'JavaScript';
    } catch {
      // No package.json
    }

    // Scan common directories
    const scanPatterns = [
      { dir: 'src/routes', type: 'route' as const },
      { dir: 'src/pages', type: 'route' as const },
      { dir: 'app', type: 'route' as const },
      { dir: 'src/components', type: 'component' as const },
      { dir: 'components', type: 'component' as const },
      { dir: 'src/services', type: 'service' as const },
      { dir: 'src/lib', type: 'service' as const },
      { dir: 'lib', type: 'service' as const },
    ];

    for (const pattern of scanPatterns) {
      const fullPath = path.join(projectPath, pattern.dir);
      try {
        const files = await this.scanDirectory(fullPath, pattern.type);
        totalFiles += files.length;

        if (pattern.type === 'route') routes.push(...files);
        else if (pattern.type === 'component') components.push(...files);
        else if (pattern.type === 'service') services.push(...files);
      } catch {
        // Directory doesn't exist
      }
    }

    return {
      totalFiles,
      routes: routes.slice(0, 20),
      components: components.slice(0, 30),
      services: services.slice(0, 20),
      framework,
      language,
      dependencies,
    };
  }

  private async scanDirectory(
    dirPath: string,
    type: 'route' | 'component' | 'service' | 'model' | 'config' | 'test' | 'other'
  ): Promise<AnalysisFileInfo[]> {
    const results: AnalysisFileInfo[] = [];

    try {
      const entries = (await secureFs.readdir(dirPath, { withFileTypes: true })) as any[];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subResults = await this.scanDirectory(path.join(dirPath, entry.name), type);
          results.push(...subResults);
        } else if (entry.isFile() && this.isCodeFile(entry.name)) {
          results.push({
            path: path.join(dirPath, entry.name),
            type,
            name: entry.name.replace(/\.(tsx?|jsx?|vue)$/, ''),
          });
        }
      }
    } catch {
      // Ignore errors
    }

    return results;
  }

  private isCodeFile(filename: string): boolean {
    return (
      /\.(tsx?|jsx?|vue|svelte)$/.test(filename) &&
      !filename.includes('.test.') &&
      !filename.includes('.spec.')
    );
  }

  private async generateAnalysisSuggestions(
    _projectPath: string,
    structure: Awaited<ReturnType<typeof this.gatherProjectStructure>>
  ): Promise<AnalysisSuggestion[]> {
    // Generate basic suggestions based on project structure analysis
    const suggestions: AnalysisSuggestion[] = [];

    if (structure.routes.length > 0 && structure.routes.length < 5) {
      suggestions.push({
        id: this.generateId('sug'),
        category: 'feature',
        title: 'Expand Core Functionality',
        description: 'The app has a small number of routes. Consider adding more features.',
        rationale: `Only ${structure.routes.length} routes detected. Most apps benefit from additional navigation options.`,
        priority: 'medium',
      });
    }

    if (
      !structure.dependencies?.includes('react-query') &&
      !structure.dependencies?.includes('@tanstack/react-query')
    ) {
      suggestions.push({
        id: this.generateId('sug'),
        category: 'technical',
        title: 'Add Data Fetching Library',
        description: 'Consider adding React Query or similar for better data management.',
        rationale:
          'Data fetching libraries provide caching, background updates, and better loading states.',
        priority: 'low',
      });
    }

    return suggestions;
  }

  private generateAnalysisSummary(
    structure: Awaited<ReturnType<typeof this.gatherProjectStructure>>,
    suggestions: AnalysisSuggestion[]
  ): string {
    const parts: string[] = [];

    if (structure.framework) {
      parts.push(`${structure.framework} ${structure.language || ''} application`);
    }

    parts.push(`with ${structure.totalFiles} code files`);
    parts.push(`${structure.routes.length} routes`);
    parts.push(`${structure.components.length} components`);
    parts.push(`${structure.services.length} services`);

    const summary = parts.join(', ');
    const highPriority = suggestions.filter((s) => s.priority === 'high').length;

    return `${summary}. Found ${suggestions.length} improvement opportunities${highPriority > 0 ? ` (${highPriority} high priority)` : ''}.`;
  }

  /**
   * Map idea category to feature category
   * Used internally for idea-to-feature conversion
   */
  private mapIdeaCategoryToFeatureCategory(category: IdeaCategory): string {
    return this.mapSuggestionCategoryToFeatureCategory(category);
  }

  /**
   * Map suggestion/idea category to feature category
   * This is the single source of truth for category mapping.
   * Used by both idea-to-feature conversion and suggestion-to-feature conversion.
   */
  mapSuggestionCategoryToFeatureCategory(category: IdeaCategory): string {
    const mapping: Record<IdeaCategory, string> = {
      feature: 'ui',
      'ux-ui': 'enhancement',
      dx: 'chore',
      growth: 'feature',
      technical: 'refactor',
      security: 'bug',
      performance: 'enhancement',
      accessibility: 'enhancement',
      analytics: 'feature',
    };
    return mapping[category] || 'feature';
  }

  private async saveSessionToDisk(
    projectPath: string,
    session: IdeationSession,
    messages: IdeationMessage[]
  ): Promise<void> {
    await secureFs.mkdir(getIdeationSessionsDir(projectPath), { recursive: true });
    const data = { session, messages };
    await secureFs.writeFile(
      getIdeationSessionPath(projectPath, session.id),
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  private async loadSessionFromDisk(
    projectPath: string,
    sessionId: string
  ): Promise<{ session: IdeationSession; messages: IdeationMessage[] } | null> {
    try {
      const content = (await secureFs.readFile(
        getIdeationSessionPath(projectPath, sessionId),
        'utf-8'
      )) as string;
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
