/**
 * Agent Service - Runs AI agents via provider architecture
 * Manages conversation sessions and streams responses via WebSocket
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import type { ExecuteOptions } from '@automaker/types';
import {
  readImageAsBase64,
  buildPromptWithImages,
  isAbortError,
  loadContextFiles,
} from '@automaker/utils';
import { ProviderFactory } from '../providers/provider-factory.js';
import { createChatOptions, validateWorkingDirectory } from '../lib/sdk-options.js';
import { PathNotAllowedError } from '@automaker/platform';
import type { SettingsService } from './settings-service.js';
import {
  getAutoLoadClaudeMdSetting,
  getEnableSandboxModeSetting,
  filterClaudeMdFromContext,
  getMCPServersFromSettings,
  getMCPPermissionSettings,
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
  addedAt: string;
}

interface Session {
  messages: Message[];
  isRunning: boolean;
  abortController: AbortController | null;
  workingDirectory: string;
  model?: string;
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
   * Start or resume a conversation
   */
  async startConversation({
    sessionId,
    workingDirectory,
  }: {
    sessionId: string;
    workingDirectory?: string;
  }) {
    if (!this.sessions.has(sessionId)) {
      const messages = await this.loadSession(sessionId);
      const metadata = await this.loadMetadata();
      const sessionMetadata = metadata[sessionId];

      // Determine the effective working directory
      const effectiveWorkingDirectory = workingDirectory || process.cwd();
      const resolvedWorkingDirectory = path.resolve(effectiveWorkingDirectory);

      // Validate that the working directory is allowed using centralized validation
      validateWorkingDirectory(resolvedWorkingDirectory);

      // Load persisted queue
      const promptQueue = await this.loadQueueState(sessionId);

      this.sessions.set(sessionId, {
        messages,
        isRunning: false,
        abortController: null,
        workingDirectory: resolvedWorkingDirectory,
        sdkSessionId: sessionMetadata?.sdkSessionId, // Load persisted SDK session ID
        promptQueue,
      });
    }

    const session = this.sessions.get(sessionId)!;
    return {
      success: true,
      messages: session.messages,
      sessionId,
    };
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
  }: {
    sessionId: string;
    message: string;
    workingDirectory?: string;
    imagePaths?: string[];
    model?: string;
  }) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error('[AgentService] ERROR: Session not found:', sessionId);
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.isRunning) {
      console.error('[AgentService] ERROR: Agent already running for session:', sessionId);
      throw new Error('Agent is already processing a message');
    }

    // Update session model if provided
    if (model) {
      session.model = model;
      await this.updateSession(sessionId, { model });
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
          console.error(`[AgentService] Failed to load image ${imagePath}:`, error);
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

      // Load enableSandboxMode setting (global setting only)
      const enableSandboxMode = await getEnableSandboxModeSetting(
        this.settingsService,
        '[AgentService]'
      );

      // Load MCP servers from settings (global setting only)
      const mcpServers = await getMCPServersFromSettings(this.settingsService, '[AgentService]');

      // Load MCP permission settings (global setting only)
      const mcpPermissions = await getMCPPermissionSettings(this.settingsService, '[AgentService]');

      // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.)
      const contextResult = await loadContextFiles({
        projectPath: effectiveWorkDir,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      });

      // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
      // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
      const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

      // Build combined system prompt with base prompt and context files
      const baseSystemPrompt = this.getSystemPrompt();
      const combinedSystemPrompt = contextFilesPrompt
        ? `${contextFilesPrompt}\n\n${baseSystemPrompt}`
        : baseSystemPrompt;

      // Build SDK options using centralized configuration
      const sdkOptions = createChatOptions({
        cwd: effectiveWorkDir,
        model: model,
        sessionModel: session.model,
        systemPrompt: combinedSystemPrompt,
        abortController: session.abortController!,
        autoLoadClaudeMd,
        enableSandboxMode,
        mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
        mcpAutoApproveTools: mcpPermissions.mcpAutoApproveTools,
        mcpUnrestrictedTools: mcpPermissions.mcpUnrestrictedTools,
      });

      // Extract model, maxTurns, and allowedTools from SDK options
      const effectiveModel = sdkOptions.model!;
      const maxTurns = sdkOptions.maxTurns;
      const allowedTools = sdkOptions.allowedTools as string[] | undefined;

      // Get provider for this model
      const provider = ProviderFactory.getProviderForModel(effectiveModel);

      // Build options for provider
      const options: ExecuteOptions = {
        prompt: '', // Will be set below based on images
        model: effectiveModel,
        cwd: effectiveWorkDir,
        systemPrompt: sdkOptions.systemPrompt,
        maxTurns: maxTurns,
        allowedTools: allowedTools,
        abortController: session.abortController!,
        conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
        settingSources: sdkOptions.settingSources,
        sandbox: sdkOptions.sandbox, // Pass sandbox configuration
        sdkSessionId: session.sdkSessionId, // Pass SDK session ID for resuming
        mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined, // Pass MCP servers configuration
        mcpAutoApproveTools: mcpPermissions.mcpAutoApproveTools, // Pass MCP auto-approve setting
        mcpUnrestrictedTools: mcpPermissions.mcpUnrestrictedTools, // Pass MCP unrestricted tools setting
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
        // Capture SDK session ID from any message and persist it
        if (msg.session_id && !session.sdkSessionId) {
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

      console.error('[AgentService] Error:', error);

      session.isRunning = false;
      session.abortController = null;

      const errorMessage: Message = {
        id: this.generateId(),
        role: 'assistant',
        content: `Error: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
        isError: true,
      };

      session.messages.push(errorMessage);
      await this.saveSession(sessionId, session.messages);

      this.emitAgentEvent(sessionId, {
        type: 'error',
        error: (error as Error).message,
        message: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Get conversation history
   */
  getHistory(sessionId: string) {
    const session = this.sessions.get(sessionId);
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
    const session = this.sessions.get(sessionId);
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
      await this.saveSession(sessionId, []);
    }

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
      console.error('[AgentService] Failed to save session:', error);
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

  // Queue management methods

  /**
   * Add a prompt to the queue for later execution
   */
  async addToQueue(
    sessionId: string,
    prompt: { message: string; imagePaths?: string[]; model?: string }
  ): Promise<{ success: boolean; queuedPrompt?: QueuedPrompt; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const queuedPrompt: QueuedPrompt = {
      id: this.generateId(),
      message: prompt.message,
      imagePaths: prompt.imagePaths,
      model: prompt.model,
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
  getQueue(sessionId: string): { success: boolean; queue?: QueuedPrompt[]; error?: string } {
    const session = this.sessions.get(sessionId);
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
    const session = this.sessions.get(sessionId);
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
    const session = this.sessions.get(sessionId);
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
      console.error('[AgentService] Failed to save queue state:', error);
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
      });
    } catch (error) {
      console.error('[AgentService] Failed to process queued prompt:', error);
      this.emitAgentEvent(sessionId, {
        type: 'queue_error',
        error: (error as Error).message,
        promptId: nextPrompt.id,
      });
    }
  }

  private emitAgentEvent(sessionId: string, data: Record<string, unknown>): void {
    this.events.emit('agent:stream', { sessionId, ...data });
  }

  private getSystemPrompt(): string {
    return `You are an AI assistant helping users build software. You are part of the Automaker application,
which is designed to help developers plan, design, and implement software projects autonomously.

**Feature Storage:**
Features are stored in .automaker/features/{id}/feature.json - each feature has its own folder.
Use the UpdateFeatureStatus tool to manage features, not direct file edits.

Your role is to:
- Help users define their project requirements and specifications
- Ask clarifying questions to better understand their needs
- Suggest technical approaches and architectures
- Guide them through the development process
- Be conversational and helpful
- Write, edit, and modify code files as requested
- Execute commands and tests
- Search and analyze the codebase

When discussing projects, help users think through:
- Core functionality and features
- Technical stack choices
- Data models and architecture
- User experience considerations
- Testing strategies

You have full access to the codebase and can:
- Read files to understand existing code
- Write new files
- Edit existing files
- Run bash commands
- Search for code patterns
- Execute tests and builds`;
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
