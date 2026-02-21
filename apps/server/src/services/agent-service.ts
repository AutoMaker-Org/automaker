/**
 * Agent Service - Runs AI agents via provider architecture
 * Manages conversation sessions and streams responses via WebSocket
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import type { ExecuteOptions, ThinkingLevel, ReasoningEffort } from '@automaker/types';
import { stripProviderPrefix } from '@automaker/types';
import {
  readImageAsBase64,
  buildPromptWithImages,
  isAbortError,
  loadContextFiles,
  createLogger,
  classifyError,
} from '@automaker/utils';
import { ProviderFactory } from '../providers/provider-factory.js';
import { createChatOptions, validateWorkingDirectory } from '../lib/sdk-options.js';
import type { SettingsService } from './settings-service.js';
import {
  getAutoLoadClaudeMdSetting,
  filterClaudeMdFromContext,
  getMCPServersFromSettings,
  getPromptCustomization,
  getSkillsConfiguration,
  getSubagentsConfiguration,
  getCustomSubagents,
  getProviderByModelId,
  getDefaultMaxTurnsSetting,
} from '../lib/settings-helpers.js';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: Array<{
    data: string;
    mimeType: string;
    filename: string;
  }>;
  timestamp: string;
  isError?: boolean;
}

interface QueuedPrompt {
  id: string;
  message: string;
  imagePaths?: string[];
  model?: string;
  thinkingLevel?: ThinkingLevel;
  addedAt: string;
}

interface Session {
  messages: Message[];
  isRunning: boolean;
  abortController: AbortController | null;
  workingDirectory: string;
  model?: string;
  thinkingLevel?: ThinkingLevel; // Thinking level for Claude models
  reasoningEffort?: ReasoningEffort; // Reasoning effort for Codex models
  sdkSessionId?: string; // Claude SDK session ID for conversation continuity
  promptQueue: QueuedPrompt[]; // Queue of prompts to auto-run after current task
}

interface SessionMetadata {
  id: string;
  name: string;
  projectPath?: string;
  workingDirectory: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  tags?: string[];
  model?: string;
  sdkSessionId?: string; // Claude SDK session ID for conversation continuity
}

export class AgentService {
  private sessions = new Map<string, Session>();
  private stateDir: string;
  private metadataFile: string;
  private events: EventEmitter;
  private settingsService: SettingsService | null = null;
  private logger = createLogger('AgentService');

  constructor(dataDir: string, events: EventEmitter, settingsService?: SettingsService) {
    this.stateDir = path.join(dataDir, 'agent-sessions');
    this.metadataFile = path.join(dataDir, 'sessions-metadata.json');
    this.events = events;
    this.settingsService = settingsService ?? null;
  }

  async initialize(): Promise<void> {
    await secureFs.mkdir(this.stateDir, { recursive: true });
  }

  /**
   * Detect provider-side session errors (session not found, expired, etc.).
   * Used to decide whether to clear a stale sdkSessionId.
   */
  private isStaleSessionError(rawErrorText: string): boolean {
    const errorLower = rawErrorText.toLowerCase();
    return (
      errorLower.includes('session not found') ||
      errorLower.includes('session expired') ||
      errorLower.includes('invalid session') ||
      errorLower.includes('no such session')
    );
  }

  /**
   * Start or resume a conversation
   */
  async startConversation({
    sessionId,
    workingDirectory,
  }: {
    sessionId: string;
    workingDirectory?: string;
  }) {
    // ensureSession handles loading from disk if not in memory.
    // For startConversation, we always want to create a session even if
    // metadata doesn't exist yet (new session), so we fall back to creating one.
    let session = await this.ensureSession(sessionId, workingDirectory);
    if (!session) {
      // Session doesn't exist on disk either — create a fresh in-memory session.
      const effectiveWorkingDirectory = workingDirectory || process.cwd();
      const resolvedWorkingDirectory = path.resolve(effectiveWorkingDirectory);
      validateWorkingDirectory(resolvedWorkingDirectory);

      session = {
        messages: [],
        isRunning: false,
        abortController: null,
        workingDirectory: resolvedWorkingDirectory,
        promptQueue: [],
      };
      this.sessions.set(sessionId, session);
    }

    return {
      success: true,
      messages: session.messages,
      sessionId,
    };
  }

  /**
   * Ensure a session is loaded into memory.
   *
   * Sessions may exist on disk (in metadata and session files) but not be
   * present in the in-memory Map — for example after a server restart, or
   * when a client calls sendMessage before explicitly calling startConversation.
   *
   * This helper transparently loads the session from disk when it is missing
   * from memory, eliminating "session not found" errors for sessions that
   * were previously created but not yet initialized in memory.
   *
   * If both metadata and session files are missing, the session truly doesn't
   * exist. A detailed diagnostic log is emitted so developers can track down
   * how the invalid session ID was generated.
   *
   * @returns The in-memory Session object, or null if the session doesn't exist at all
   */
  private async ensureSession(
    sessionId: string,
    workingDirectory?: string
  ): Promise<Session | null> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    // Try to load from disk — the session may have been created earlier
    // (e.g. via createSession) but never initialized in memory.
    let metadata: Record<string, SessionMetadata>;
    let messages: Message[];
    try {
      [metadata, messages] = await Promise.all([this.loadMetadata(), this.loadSession(sessionId)]);
    } catch (error) {
      // Disk read failure should not be treated as "session not found" —
      // it's a transient I/O problem. Log and return null so callers can
      // surface an appropriate error message.
      this.logger.error(
        `Failed to load session ${sessionId} from disk (I/O error — NOT a missing session):`,
        error
      );
      return null;
    }

    const sessionMetadata = metadata[sessionId];

    // If there's no metadata AND no persisted messages, the session truly doesn't exist.
    // Log diagnostic info to help track down how we ended up with an invalid session ID.
    if (!sessionMetadata && messages.length === 0) {
      this.logger.warn(
        `Session "${sessionId}" not found: no metadata and no persisted messages. ` +
          `This can happen when a session ID references a deleted/expired session, ` +
          `or when the server restarted and the session was never persisted to disk. ` +
          `Available session IDs in metadata: [${Object.keys(metadata).slice(0, 10).join(', ')}${Object.keys(metadata).length > 10 ? '...' : ''}]`
      );
      return null;
    }

    const effectiveWorkingDirectory =
      workingDirectory || sessionMetadata?.workingDirectory || process.cwd();
    const resolvedWorkingDirectory = path.resolve(effectiveWorkingDirectory);

    // Validate that the working directory is allowed using centralized validation
    try {
      validateWorkingDirectory(resolvedWorkingDirectory);
    } catch (validationError) {
      this.logger.warn(
        `Session "${sessionId}": working directory "${resolvedWorkingDirectory}" is not allowed — ` +
          `returning null so callers treat it as a missing session. Error: ${(validationError as Error).message}`
      );
      return null;
    }

    // Load persisted queue
    const promptQueue = await this.loadQueueState(sessionId);

    const session: Session = {
      messages,
      isRunning: false,
      abortController: null,
      workingDirectory: resolvedWorkingDirectory,
      sdkSessionId: sessionMetadata?.sdkSessionId,
      promptQueue,
    };

    this.sessions.set(sessionId, session);
    this.logger.info(
      `Auto-initialized session ${sessionId} from disk ` +
        `(${messages.length} messages, sdkSessionId: ${sessionMetadata?.sdkSessionId ? 'present' : 'none'})`
    );
    return session;
  }

  /**
   * Send a message to the agent and stream responses
   */
  async sendMessage({
    sessionId,
    message,
    workingDirectory,
    imagePaths,
    model,
    thinkingLevel,
    reasoningEffort,
  }: {
    sessionId: string;
    message: string;
    workingDirectory?: string;
    imagePaths?: string[];
    model?: string;
    thinkingLevel?: ThinkingLevel;
    reasoningEffort?: ReasoningEffort;
  }) {
    const session = await this.ensureSession(sessionId, workingDirectory);
    if (!session) {
      this.logger.error(
        `Session not found: ${sessionId}. ` +
          `The session may have been deleted, never created, or lost after a server restart. ` +
          `In-memory sessions: ${this.sessions.size}, requested ID: ${sessionId}`
      );
      throw new Error(
        `Session ${sessionId} not found. ` +
          `The session may have been deleted or expired. ` +
          `Please create a new session and try again.`
      );
    }

    if (session.isRunning) {
      this.logger.error('ERROR: Agent already running for session:', sessionId);
      throw new Error('Agent is already processing a message');
    }

    // Update session model, thinking level, and reasoning effort if provided
    if (model) {
      session.model = model;
      await this.updateSession(sessionId, { model });
    }
    if (thinkingLevel !== undefined) {
      session.thinkingLevel = thinkingLevel;
    }
    if (reasoningEffort !== undefined) {
      session.reasoningEffort = reasoningEffort;
    }

    // Validate vision support before processing images
    const effectiveModel = model || session.model;
    if (imagePaths && imagePaths.length > 0 && effectiveModel) {
      const supportsVision = ProviderFactory.modelSupportsVision(effectiveModel);
      if (!supportsVision) {
        throw new Error(
          `This model (${effectiveModel}) does not support image input. ` +
            `Please switch to a model that supports vision, or remove the images and try again.`
        );
      }
    }

    // Read images and convert to base64
    const images: Message['images'] = [];
    if (imagePaths && imagePaths.length > 0) {
      for (const imagePath of imagePaths) {
        try {
          const imageData = await readImageAsBase64(imagePath);
          images.push({
            data: imageData.base64,
            mimeType: imageData.mimeType,
            filename: imageData.filename,
          });
        } catch (error) {
          this.logger.error(`Failed to load image ${imagePath}:`, error);
        }
      }
    }

    // Add user message
    const userMessage: Message = {
      id: this.generateId(),
      role: 'user',
      content: message,
      images: images.length > 0 ? images : undefined,
      timestamp: new Date().toISOString(),
    };

    // Build conversation history from existing messages BEFORE adding current message
    const conversationHistory = session.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    session.messages.push(userMessage);
    session.isRunning = true;
    session.abortController = new AbortController();

    // Emit started event so UI can show thinking indicator
    this.emitAgentEvent(sessionId, {
      type: 'started',
    });

    // Emit user message event
    this.emitAgentEvent(sessionId, {
      type: 'message',
      message: userMessage,
    });

    await this.saveSession(sessionId, session.messages);

    try {
      // Determine the effective working directory for context loading
      const effectiveWorkDir = workingDirectory || session.workingDirectory;

      // Load autoLoadClaudeMd setting (project setting takes precedence over global)
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        effectiveWorkDir,
        this.settingsService,
        '[AgentService]'
      );

      // Load MCP servers from settings (global setting only)
      const mcpServers = await getMCPServersFromSettings(this.settingsService, '[AgentService]');

      // Get Skills configuration from settings
      const skillsConfig = this.settingsService
        ? await getSkillsConfiguration(this.settingsService)
        : { enabled: false, sources: [] as Array<'user' | 'project'>, shouldIncludeInTools: false };

      // Get Subagents configuration from settings
      const subagentsConfig = this.settingsService
        ? await getSubagentsConfiguration(this.settingsService)
        : { enabled: false, sources: [] as Array<'user' | 'project'>, shouldIncludeInTools: false };

      // Get custom subagents from settings (merge global + project-level) only if enabled
      const customSubagents =
        this.settingsService && subagentsConfig.enabled
          ? await getCustomSubagents(this.settingsService, effectiveWorkDir)
          : undefined;

      // Get credentials for API calls
      const credentials = await this.settingsService?.getCredentials();

      // Try to find a provider for the model (if it's a provider model like "GLM-4.7")
      // This allows users to select provider models in the Agent Runner UI
      let claudeCompatibleProvider: import('@automaker/types').ClaudeCompatibleProvider | undefined;
      let providerResolvedModel: string | undefined;
      const requestedModel = model || session.model;
      if (requestedModel && this.settingsService) {
        const providerResult = await getProviderByModelId(
          requestedModel,
          this.settingsService,
          '[AgentService]'
        );
        if (providerResult.provider) {
          claudeCompatibleProvider = providerResult.provider;
          providerResolvedModel = providerResult.resolvedModel;
          this.logger.info(
            `[AgentService] Using provider "${providerResult.provider.name}" for model "${requestedModel}"` +
              (providerResolvedModel ? ` -> resolved to "${providerResolvedModel}"` : '')
          );
        }
      }

      // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) and memory files
      // Use the user's message as task context for smart memory selection
      const contextResult = await loadContextFiles({
        projectPath: effectiveWorkDir,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
        taskContext: {
          title: message.substring(0, 200), // Use first 200 chars as title
          description: message,
        },
      });

      // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
      // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
      const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

      // Build combined system prompt with base prompt and context files
      const baseSystemPrompt = await this.getSystemPrompt();
      const combinedSystemPrompt = contextFilesPrompt
        ? `${contextFilesPrompt}\n\n${baseSystemPrompt}`
        : baseSystemPrompt;

      // Build SDK options using centralized configuration
      // Use thinking level and reasoning effort from request, or fall back to session's stored values
      const effectiveThinkingLevel = thinkingLevel ?? session.thinkingLevel;
      const effectiveReasoningEffort = reasoningEffort ?? session.reasoningEffort;

      // When using a custom provider (GLM, MiniMax), use resolved Claude model for SDK config
      // (thinking level budgets, allowedTools) but we MUST pass the provider's model ID
      // (e.g. "GLM-4.7") to the API - not "claude-sonnet-4-6" which causes "model not found"
      const modelForSdk = providerResolvedModel || model;
      const sessionModelForSdk = providerResolvedModel ? undefined : session.model;

      // Read user-configured max turns from settings
      const userMaxTurns = await getDefaultMaxTurnsSetting(this.settingsService, '[AgentService]');

      const sdkOptions = createChatOptions({
        cwd: effectiveWorkDir,
        model: modelForSdk,
        sessionModel: sessionModelForSdk,
        systemPrompt: combinedSystemPrompt,
        abortController: session.abortController!,
        autoLoadClaudeMd,
        thinkingLevel: effectiveThinkingLevel, // Pass thinking level for Claude models
        maxTurns: userMaxTurns, // User-configured max turns from settings
        mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      });

      // Extract model, maxTurns, and allowedTools from SDK options
      const effectiveModel = sdkOptions.model!;
      const maxTurns = sdkOptions.maxTurns;
      let allowedTools = sdkOptions.allowedTools as string[] | undefined;

      // Build merged settingSources array using Set for automatic deduplication
      const sdkSettingSources = (sdkOptions.settingSources ?? []).filter(
        (source): source is 'user' | 'project' => source === 'user' || source === 'project'
      );
      const skillSettingSources = skillsConfig.enabled ? skillsConfig.sources : [];
      const settingSources = [...new Set([...sdkSettingSources, ...skillSettingSources])];

      // Enhance allowedTools with Skills and Subagents tools
      // These tools are not in the provider's default set - they're added dynamically based on settings
      const needsSkillTool = skillsConfig.shouldIncludeInTools;
      const needsTaskTool =
        subagentsConfig.shouldIncludeInTools &&
        customSubagents &&
        Object.keys(customSubagents).length > 0;

      // Base tools that match the provider's default set
      const baseTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'];

      if (allowedTools) {
        allowedTools = [...allowedTools]; // Create a copy to avoid mutating SDK options
        // Add Skill tool if skills are enabled
        if (needsSkillTool && !allowedTools.includes('Skill')) {
          allowedTools.push('Skill');
        }
        // Add Task tool if custom subagents are configured
        if (needsTaskTool && !allowedTools.includes('Task')) {
          allowedTools.push('Task');
        }
      } else if (needsSkillTool || needsTaskTool) {
        // If no allowedTools specified but we need to add Skill/Task tools,
        // build the full list including base tools
        allowedTools = [...baseTools];
        if (needsSkillTool) {
          allowedTools.push('Skill');
        }
        if (needsTaskTool) {
          allowedTools.push('Task');
        }
      }

      // Get provider for this model (with prefix)
      // When using custom provider (GLM, MiniMax), requestedModel routes to Claude provider
      const modelForProvider = claudeCompatibleProvider
        ? (requestedModel ?? effectiveModel)
        : effectiveModel;
      const provider = ProviderFactory.getProviderForModel(modelForProvider);

      // Strip provider prefix - providers should receive bare model IDs
      // CRITICAL: For custom providers (GLM, MiniMax), pass the provider's model ID (e.g. "GLM-4.7")
      // to the API, NOT the resolved Claude model - otherwise we get "model not found"
      const bareModel: string = claudeCompatibleProvider
        ? (requestedModel ?? effectiveModel)
        : stripProviderPrefix(effectiveModel);

      // Build options for provider
      const options: ExecuteOptions = {
        prompt: '', // Will be set below based on images
        model: bareModel, // Bare model ID (e.g., "gpt-5.1-codex-max", "composer-1")
        originalModel: effectiveModel, // Original with prefix for logging (e.g., "codex-gpt-5.1-codex-max")
        cwd: effectiveWorkDir,
        systemPrompt: sdkOptions.systemPrompt,
        maxTurns: maxTurns,
        allowedTools: allowedTools,
        abortController: session.abortController!,
        conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
        settingSources: settingSources.length > 0 ? settingSources : undefined,
        sdkSessionId: session.sdkSessionId, // Pass SDK session ID for resuming
        mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined, // Pass MCP servers configuration
        agents: customSubagents, // Pass custom subagents for task delegation
        thinkingLevel: effectiveThinkingLevel, // Pass thinking level for Claude models
        reasoningEffort: effectiveReasoningEffort, // Pass reasoning effort for Codex models
        credentials, // Pass credentials for resolving 'credentials' apiKeySource
        claudeCompatibleProvider, // Pass provider for alternative endpoint configuration (GLM, MiniMax, etc.)
      };

      // Build prompt content with images
      const { content: promptContent } = await buildPromptWithImages(
        message,
        imagePaths,
        undefined, // no workDir for agent service
        true // include image paths in text
      );

      // Set the prompt in options
      options.prompt = promptContent;

      // Execute via provider
      const stream = provider.executeQuery(options);

      let currentAssistantMessage: Message | null = null;
      let responseText = '';
      const toolUses: Array<{ name: string; input: unknown }> = [];

      for await (const msg of stream) {
        // Capture SDK session ID from any message and persist it.
        // Update when:
        //  - No session ID set yet (first message in a new session)
        //  - The provider returned a *different* session ID (e.g., after a
        //    "Session not found" recovery where the provider started a fresh
        //    session — the stale ID must be replaced with the new one)
        if (msg.session_id && msg.session_id !== session.sdkSessionId) {
          session.sdkSessionId = msg.session_id;
          // Persist the SDK session ID to ensure conversation continuity across server restarts
          await this.updateSession(sessionId, { sdkSessionId: msg.session_id });
        }

        if (msg.type === 'assistant') {
          if (msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text') {
                responseText += block.text;

                if (!currentAssistantMessage) {
                  currentAssistantMessage = {
                    id: this.generateId(),
                    role: 'assistant',
                    content: responseText,
                    timestamp: new Date().toISOString(),
                  };
                  session.messages.push(currentAssistantMessage);
                } else {
                  currentAssistantMessage.content = responseText;
                }

                this.emitAgentEvent(sessionId, {
                  type: 'stream',
                  messageId: currentAssistantMessage.id,
                  content: responseText,
                  isComplete: false,
                });
              } else if (block.type === 'tool_use') {
                const toolUse = {
                  name: block.name || 'unknown',
                  input: block.input,
                };
                toolUses.push(toolUse);

                this.emitAgentEvent(sessionId, {
                  type: 'tool_use',
                  tool: toolUse,
                });
              }
            }
          }
        } else if (msg.type === 'result') {
          if (msg.subtype === 'success' && msg.result) {
            if (currentAssistantMessage) {
              currentAssistantMessage.content = msg.result;
              responseText = msg.result;
            }
          }

          this.emitAgentEvent(sessionId, {
            type: 'complete',
            messageId: currentAssistantMessage?.id,
            content: responseText,
            toolUses,
          });
        } else if (msg.type === 'error') {
          // Some providers (like Codex CLI/SaaS or Cursor CLI) surface failures as
          // streamed error messages instead of throwing. Handle these here so the
          // Agent Runner UX matches the Claude/Cursor behavior without changing
          // their provider implementations.

          // Clean error text: strip ANSI escape codes and the redundant "Error: "
          // prefix that CLI providers (especially OpenCode) add to stderr output.
          // The OpenCode provider strips these in normalizeEvent/executeQuery, but
          // we also strip here as a defense-in-depth measure.
          //
          // Without stripping the "Error: " prefix, the wrapping at line ~647
          // (`content: \`Error: ${enhancedText}\``) produces double-prefixed text:
          // "Error: Error: Session not found" — confusing for the user.
          const rawMsgError =
            (typeof msg.error === 'string' && msg.error.trim()) ||
            'Unexpected error from provider during agent execution.';
          let rawErrorText = rawMsgError.replace(/\x1b\[[0-9;]*m/g, '').trim() || rawMsgError;
          // Remove the CLI's "Error: " prefix to prevent double-wrapping
          rawErrorText = rawErrorText.replace(/^Error:\s*/i, '').trim() || rawErrorText;

          const errorInfo = classifyError(new Error(rawErrorText));

          // Detect provider-side session errors and proactively clear the stale
          // sdkSessionId so the next attempt starts a fresh provider session.
          // This handles providers that don't have built-in session recovery
          // (unlike OpenCode which auto-retries without the session flag).
          if (session.sdkSessionId && this.isStaleSessionError(rawErrorText)) {
            this.logger.info(
              `Clearing stale sdkSessionId for session ${sessionId} after provider session error`
            );
            session.sdkSessionId = undefined;
            await this.clearSdkSessionId(sessionId);
          }

          // Keep the provider-supplied text intact (Codex already includes helpful tips),
          // only add a small rate-limit hint when we can detect it.
          const enhancedText = errorInfo.isRateLimit
            ? `${rawErrorText}\n\nTip: It looks like you hit a rate limit. Try waiting a bit or reducing concurrent Agent Runner / Auto Mode tasks.`
            : rawErrorText;

          this.logger.error('Provider error during agent execution:', {
            type: errorInfo.type,
            message: errorInfo.message,
          });

          // Mark session as no longer running so the UI and queue stay in sync
          session.isRunning = false;
          session.abortController = null;

          const errorMessage: Message = {
            id: this.generateId(),
            role: 'assistant',
            content: `Error: ${enhancedText}`,
            timestamp: new Date().toISOString(),
            isError: true,
          };

          session.messages.push(errorMessage);
          await this.saveSession(sessionId, session.messages);

          this.emitAgentEvent(sessionId, {
            type: 'error',
            error: enhancedText,
            message: errorMessage,
          });

          // Don't continue streaming after an error message
          return {
            success: false,
          };
        }
      }

      await this.saveSession(sessionId, session.messages);

      session.isRunning = false;
      session.abortController = null;

      // Process next item in queue after completion
      setImmediate(() => this.processNextInQueue(sessionId));

      return {
        success: true,
        message: currentAssistantMessage,
      };
    } catch (error) {
      if (isAbortError(error)) {
        session.isRunning = false;
        session.abortController = null;
        return { success: false, aborted: true };
      }

      this.logger.error('Error:', error);

      // Strip ANSI escape codes and the "Error: " prefix from thrown error
      // messages so the UI receives clean text without double-prefixing.
      let rawThrownMsg = ((error as Error).message || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
      rawThrownMsg = rawThrownMsg.replace(/^Error:\s*/i, '').trim() || rawThrownMsg;
      const thrownErrorMsg = rawThrownMsg.toLowerCase();

      // Check if the thrown error is a provider-side session error.
      // Clear the stale sdkSessionId so the next retry starts fresh.
      if (session.sdkSessionId && this.isStaleSessionError(rawThrownMsg)) {
        this.logger.info(
          `Clearing stale sdkSessionId for session ${sessionId} after thrown session error`
        );
        session.sdkSessionId = undefined;
        await this.clearSdkSessionId(sessionId);
      }

      session.isRunning = false;
      session.abortController = null;

      const cleanErrorMsg = rawThrownMsg || (error as Error).message;
      const errorMessage: Message = {
        id: this.generateId(),
        role: 'assistant',
        content: `Error: ${cleanErrorMsg}`,
        timestamp: new Date().toISOString(),
        isError: true,
      };

      session.messages.push(errorMessage);
      await this.saveSession(sessionId, session.messages);

      this.emitAgentEvent(sessionId, {
        type: 'error',
        error: cleanErrorMsg,
        message: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Get conversation history
   */
  async getHistory(sessionId: string) {
    const session = await this.ensureSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    return {
      success: true,
      messages: session.messages,
      isRunning: session.isRunning,
    };
  }

  /**
   * Stop current agent execution
   */
  async stopExecution(sessionId: string) {
    const session = await this.ensureSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (session.abortController) {
      session.abortController.abort();
      session.isRunning = false;
      session.abortController = null;
    }

    return { success: true };
  }

  /**
   * Clear conversation history
   */
  async clearSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      session.isRunning = false;
      session.sdkSessionId = undefined; // Clear stale provider session ID to prevent "Session not found" errors
      await this.saveSession(sessionId, []);
    }

    // Clear the sdkSessionId from persisted metadata so it doesn't get
    // reloaded by ensureSession() after a server restart.
    // This prevents "Session not found" errors when the provider-side session
    // no longer exists (e.g., OpenCode CLI sessions expire on disk).
    await this.clearSdkSessionId(sessionId);

    return { success: true };
  }

  // Session management

  async loadSession(sessionId: string): Promise<Message[]> {
    const sessionFile = path.join(this.stateDir, `${sessionId}.json`);

    try {
      const data = (await secureFs.readFile(sessionFile, 'utf-8')) as string;
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async saveSession(sessionId: string, messages: Message[]): Promise<void> {
    const sessionFile = path.join(this.stateDir, `${sessionId}.json`);

    try {
      await secureFs.writeFile(sessionFile, JSON.stringify(messages, null, 2), 'utf-8');
      await this.updateSessionTimestamp(sessionId);
    } catch (error) {
      this.logger.error('Failed to save session:', error);
    }
  }

  async loadMetadata(): Promise<Record<string, SessionMetadata>> {
    try {
      const data = (await secureFs.readFile(this.metadataFile, 'utf-8')) as string;
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async saveMetadata(metadata: Record<string, SessionMetadata>): Promise<void> {
    await secureFs.writeFile(this.metadataFile, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  async updateSessionTimestamp(sessionId: string): Promise<void> {
    const metadata = await this.loadMetadata();
    if (metadata[sessionId]) {
      metadata[sessionId].updatedAt = new Date().toISOString();
      await this.saveMetadata(metadata);
    }
  }

  async listSessions(includeArchived = false): Promise<SessionMetadata[]> {
    const metadata = await this.loadMetadata();
    let sessions = Object.values(metadata);

    if (!includeArchived) {
      sessions = sessions.filter((s) => !s.archived);
    }

    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async createSession(
    name: string,
    projectPath?: string,
    workingDirectory?: string,
    model?: string
  ): Promise<SessionMetadata> {
    const sessionId = this.generateId();
    const metadata = await this.loadMetadata();

    // Determine the effective working directory
    const effectiveWorkingDirectory = workingDirectory || projectPath || process.cwd();
    const resolvedWorkingDirectory = path.resolve(effectiveWorkingDirectory);

    // Validate that the working directory is allowed using centralized validation
    validateWorkingDirectory(resolvedWorkingDirectory);

    // Validate that projectPath is allowed if provided
    if (projectPath) {
      validateWorkingDirectory(projectPath);
    }

    const session: SessionMetadata = {
      id: sessionId,
      name,
      projectPath,
      workingDirectory: resolvedWorkingDirectory,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model,
    };

    metadata[sessionId] = session;
    await this.saveMetadata(metadata);

    return session;
  }

  async setSessionModel(sessionId: string, model: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.model = model;
      await this.updateSession(sessionId, { model });
      return true;
    }
    return false;
  }

  async updateSession(
    sessionId: string,
    updates: Partial<SessionMetadata>
  ): Promise<SessionMetadata | null> {
    const metadata = await this.loadMetadata();
    if (!metadata[sessionId]) return null;

    metadata[sessionId] = {
      ...metadata[sessionId],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.saveMetadata(metadata);
    return metadata[sessionId];
  }

  async archiveSession(sessionId: string): Promise<boolean> {
    const result = await this.updateSession(sessionId, { archived: true });
    return result !== null;
  }

  async unarchiveSession(sessionId: string): Promise<boolean> {
    const result = await this.updateSession(sessionId, { archived: false });
    return result !== null;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const metadata = await this.loadMetadata();
    if (!metadata[sessionId]) return false;

    delete metadata[sessionId];
    await this.saveMetadata(metadata);

    // Delete session file
    try {
      const sessionFile = path.join(this.stateDir, `${sessionId}.json`);
      await secureFs.unlink(sessionFile);
    } catch {
      // File may not exist
    }

    // Clear from memory
    this.sessions.delete(sessionId);

    return true;
  }

  /**
   * Clear the sdkSessionId from persisted metadata.
   *
   * This removes the provider-side session ID so that the next message
   * starts a fresh provider session instead of trying to resume a stale one.
   * Prevents "Session not found" errors from CLI providers like OpenCode
   * when the provider-side session has been deleted or expired.
   */
  async clearSdkSessionId(sessionId: string): Promise<void> {
    const metadata = await this.loadMetadata();
    if (metadata[sessionId] && metadata[sessionId].sdkSessionId) {
      delete metadata[sessionId].sdkSessionId;
      metadata[sessionId].updatedAt = new Date().toISOString();
      await this.saveMetadata(metadata);
    }
  }

  // Queue management methods

  /**
   * Add a prompt to the queue for later execution
   */
  async addToQueue(
    sessionId: string,
    prompt: {
      message: string;
      imagePaths?: string[];
      model?: string;
      thinkingLevel?: ThinkingLevel;
    }
  ): Promise<{ success: boolean; queuedPrompt?: QueuedPrompt; error?: string }> {
    const session = await this.ensureSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const queuedPrompt: QueuedPrompt = {
      id: this.generateId(),
      message: prompt.message,
      imagePaths: prompt.imagePaths,
      model: prompt.model,
      thinkingLevel: prompt.thinkingLevel,
      addedAt: new Date().toISOString(),
    };

    session.promptQueue.push(queuedPrompt);
    await this.saveQueueState(sessionId, session.promptQueue);

    // Emit queue update event
    this.emitAgentEvent(sessionId, {
      type: 'queue_updated',
      queue: session.promptQueue,
    });

    return { success: true, queuedPrompt };
  }

  /**
   * Get the current queue for a session
   */
  async getQueue(
    sessionId: string
  ): Promise<{ success: boolean; queue?: QueuedPrompt[]; error?: string }> {
    const session = await this.ensureSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    return { success: true, queue: session.promptQueue };
  }

  /**
   * Remove a specific prompt from the queue
   */
  async removeFromQueue(
    sessionId: string,
    promptId: string
  ): Promise<{ success: boolean; error?: string }> {
    const session = await this.ensureSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const index = session.promptQueue.findIndex((p) => p.id === promptId);
    if (index === -1) {
      return { success: false, error: 'Prompt not found in queue' };
    }

    session.promptQueue.splice(index, 1);
    await this.saveQueueState(sessionId, session.promptQueue);

    this.emitAgentEvent(sessionId, {
      type: 'queue_updated',
      queue: session.promptQueue,
    });

    return { success: true };
  }

  /**
   * Clear all prompts from the queue
   */
  async clearQueue(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const session = await this.ensureSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    session.promptQueue = [];
    await this.saveQueueState(sessionId, []);

    this.emitAgentEvent(sessionId, {
      type: 'queue_updated',
      queue: [],
    });

    return { success: true };
  }

  /**
   * Save queue state to disk for persistence
   */
  private async saveQueueState(sessionId: string, queue: QueuedPrompt[]): Promise<void> {
    const queueFile = path.join(this.stateDir, `${sessionId}-queue.json`);
    try {
      await secureFs.writeFile(queueFile, JSON.stringify(queue, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error('Failed to save queue state:', error);
    }
  }

  /**
   * Load queue state from disk
   */
  private async loadQueueState(sessionId: string): Promise<QueuedPrompt[]> {
    const queueFile = path.join(this.stateDir, `${sessionId}-queue.json`);
    try {
      const data = (await secureFs.readFile(queueFile, 'utf-8')) as string;
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Process the next item in the queue (called after task completion)
   */
  private async processNextInQueue(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.promptQueue.length === 0) {
      return;
    }

    // Don't process if already running
    if (session.isRunning) {
      return;
    }

    const nextPrompt = session.promptQueue.shift();
    if (!nextPrompt) return;

    await this.saveQueueState(sessionId, session.promptQueue);

    this.emitAgentEvent(sessionId, {
      type: 'queue_updated',
      queue: session.promptQueue,
    });

    try {
      await this.sendMessage({
        sessionId,
        message: nextPrompt.message,
        imagePaths: nextPrompt.imagePaths,
        model: nextPrompt.model,
        thinkingLevel: nextPrompt.thinkingLevel,
      });
    } catch (error) {
      this.logger.error('Failed to process queued prompt:', error);
      this.emitAgentEvent(sessionId, {
        type: 'queue_error',
        error: (error as Error).message,
        promptId: nextPrompt.id,
      });
    }
  }

  /**
   * Emit an event to the agent stream (private, used internally).
   */
  private emitAgentEvent(sessionId: string, data: Record<string, unknown>): void {
    this.events.emit('agent:stream', { sessionId, ...data });
  }

  /**
   * Emit an error event for a session.
   *
   * Public method so that route handlers can surface errors to the UI
   * even when sendMessage() throws before it can emit its own error event
   * (e.g., when the session is not found and no in-memory session exists).
   */
  emitSessionError(sessionId: string, error: string): void {
    this.events.emit('agent:stream', { sessionId, type: 'error', error });
  }

  private async getSystemPrompt(): Promise<string> {
    // Load from settings (no caching - allows hot reload of custom prompts)
    const prompts = await getPromptCustomization(this.settingsService, '[AgentService]');
    return prompts.agent.systemPrompt;
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
