/**
 * Agent Service - Runs AI agents via provider architecture
 * Manages conversation sessions and streams responses via WebSocket
 */

import path from "path";
import * as secureFs from "../lib/secure-fs.js";
import type { EventEmitter } from "../lib/events.js";
import type { ExecuteOptions } from "@automaker/types";
import {
  readImageAsBase64,
  buildPromptWithImages,
  isAbortError,
} from "@automaker/utils";
import { ProviderFactory } from "../providers/provider-factory.js";
import { createChatOptions } from "../lib/sdk-options.js";
import { isPathAllowed, PathNotAllowedError } from "@automaker/platform";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: Array<{
    data: string;
    mimeType: string;
    filename: string;
  }>;
  timestamp: string;
  isError?: boolean;
}

interface Session {
  messages: Message[];
  isRunning: boolean;
  abortController: AbortController | null;
  workingDirectory: string;
  model?: string;
  sdkSessionId?: string; // Claude SDK session ID for conversation continuity
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

  constructor(dataDir: string, events: EventEmitter) {
    this.stateDir = path.join(dataDir, "agent-sessions");
    this.metadataFile = path.join(dataDir, "sessions-metadata.json");
    this.events = events;
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

      // Validate that the working directory is allowed
      if (!isPathAllowed(resolvedWorkingDirectory)) {
        throw new Error(
          `Working directory ${effectiveWorkingDirectory} is not allowed`
        );
      }

      this.sessions.set(sessionId, {
        messages,
        isRunning: false,
        abortController: null,
        workingDirectory: resolvedWorkingDirectory,
        sdkSessionId: sessionMetadata?.sdkSessionId, // Load persisted SDK session ID
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
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.isRunning) {
      throw new Error("Agent is already processing a message");
    }

    // Update session model if provided
    if (model) {
      session.model = model;
      await this.updateSession(sessionId, { model });
    }

    // Read images and convert to base64
    const images: Message["images"] = [];
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
          console.error(
            `[AgentService] Failed to load image ${imagePath}:`,
            error
          );
        }
      }
    }

    // Add user message
    const userMessage: Message = {
      id: this.generateId(),
      role: "user",
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

    // Emit user message event
    this.emitAgentEvent(sessionId, {
      type: "message",
      message: userMessage,
    });

    await this.saveSession(sessionId, session.messages);

    try {
      // Build SDK options using centralized configuration
      const sdkOptions = createChatOptions({
        cwd: workingDirectory || session.workingDirectory,
        model: model,
        sessionModel: session.model,
        systemPrompt: this.getSystemPrompt(),
        abortController: session.abortController!,
      });

      // Extract model, maxTurns, and allowedTools from SDK options
      const effectiveModel = sdkOptions.model!;
      const maxTurns = sdkOptions.maxTurns;
      const allowedTools = sdkOptions.allowedTools as string[] | undefined;

      // Get provider for this model
      const provider = ProviderFactory.getProviderForModel(effectiveModel);

      console.log(
        `[AgentService] Using provider "${provider.getName()}" for model "${effectiveModel}"`
      );

      // Build options for provider
      const options: ExecuteOptions = {
        prompt: "", // Will be set below based on images
        model: effectiveModel,
        cwd: workingDirectory || session.workingDirectory,
        systemPrompt: this.getSystemPrompt(),
        maxTurns: maxTurns,
        allowedTools: allowedTools,
        abortController: session.abortController!,
        conversationHistory:
          conversationHistory.length > 0 ? conversationHistory : undefined,
        sdkSessionId: session.sdkSessionId, // Pass SDK session ID for resuming
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
      let responseText = "";
      const toolUses: Array<{ name: string; input: unknown }> = [];

      for await (const msg of stream) {
        // Capture SDK session ID from any message and persist it
        if (msg.session_id && !session.sdkSessionId) {
          session.sdkSessionId = msg.session_id;
          console.log(
            `[AgentService] Captured SDK session ID: ${msg.session_id}`
          );
          // Persist the SDK session ID to ensure conversation continuity across server restarts
          await this.updateSession(sessionId, { sdkSessionId: msg.session_id });
        }

        if (msg.type === "assistant") {
          if (msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === "text") {
                responseText += block.text;

                if (!currentAssistantMessage) {
                  currentAssistantMessage = {
                    id: this.generateId(),
                    role: "assistant",
                    content: responseText,
                    timestamp: new Date().toISOString(),
                  };
                  session.messages.push(currentAssistantMessage);
                } else {
                  currentAssistantMessage.content = responseText;
                }

                this.emitAgentEvent(sessionId, {
                  type: "stream",
                  messageId: currentAssistantMessage.id,
                  content: responseText,
                  isComplete: false,
                });
              } else if (block.type === "tool_use") {
                const toolUse = {
                  name: block.name || "unknown",
                  input: block.input,
                };
                toolUses.push(toolUse);

                this.emitAgentEvent(sessionId, {
                  type: "tool_use",
                  tool: toolUse,
                });
              }
            }
          }
        } else if (msg.type === "result") {
          if (msg.subtype === "success" && msg.result) {
            if (currentAssistantMessage) {
              currentAssistantMessage.content = msg.result;
              responseText = msg.result;
            }
          }

          this.emitAgentEvent(sessionId, {
            type: "complete",
            messageId: currentAssistantMessage?.id,
            content: responseText,
            toolUses,
          });
        }
      }

      await this.saveSession(sessionId, session.messages);

      session.isRunning = false;
      session.abortController = null;

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

      console.error("[AgentService] Error:", error);

      session.isRunning = false;
      session.abortController = null;

      const errorMessage: Message = {
        id: this.generateId(),
        role: "assistant",
        content: `Error: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
        isError: true,
      };

      session.messages.push(errorMessage);
      await this.saveSession(sessionId, session.messages);

      this.emitAgentEvent(sessionId, {
        type: "error",
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
      return { success: false, error: "Session not found" };
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
      return { success: false, error: "Session not found" };
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
      const data = (await secureFs.readFile(sessionFile, "utf-8")) as string;
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async saveSession(sessionId: string, messages: Message[]): Promise<void> {
    const sessionFile = path.join(this.stateDir, `${sessionId}.json`);

    try {
      await secureFs.writeFile(
        sessionFile,
        JSON.stringify(messages, null, 2),
        "utf-8"
      );
      await this.updateSessionTimestamp(sessionId);
    } catch (error) {
      console.error("[AgentService] Failed to save session:", error);
    }
  }

  async loadMetadata(): Promise<Record<string, SessionMetadata>> {
    try {
      const data = (await secureFs.readFile(
        this.metadataFile,
        "utf-8"
      )) as string;
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async saveMetadata(metadata: Record<string, SessionMetadata>): Promise<void> {
    await secureFs.writeFile(
      this.metadataFile,
      JSON.stringify(metadata, null, 2),
      "utf-8"
    );
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
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
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
    const effectiveWorkingDirectory =
      workingDirectory || projectPath || process.cwd();
    const resolvedWorkingDirectory = path.resolve(effectiveWorkingDirectory);

    // Validate that the working directory is allowed
    if (!isPathAllowed(resolvedWorkingDirectory)) {
      throw new PathNotAllowedError(effectiveWorkingDirectory);
    }

    // Validate that projectPath is allowed if provided
    if (projectPath) {
      const resolvedProjectPath = path.resolve(projectPath);
      if (!isPathAllowed(resolvedProjectPath)) {
        throw new PathNotAllowedError(projectPath);
      }
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

  private emitAgentEvent(
    sessionId: string,
    data: Record<string, unknown>
  ): void {
    this.events.emit("agent:stream", { sessionId, ...data });
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
