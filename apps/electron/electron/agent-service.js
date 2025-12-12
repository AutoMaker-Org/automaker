const { query, AbortError } = require("@anthropic-ai/claude-agent-sdk");
const path = require("path");
const fs = require("fs/promises");

/**
 * Agent Service - Runs Claude agents in the Electron main process
 * This service survives Next.js restarts and maintains conversation state
 */
class AgentService {
  constructor() {
    this.sessions = new Map(); // sessionId -> { messages, isRunning, abortController }
    this.stateDir = null; // Will be set when app is ready
  }

  /**
   * Initialize the service with app data directory
   */
  async initialize(appDataPath) {
    this.stateDir = path.join(appDataPath, "agent-sessions");
    this.metadataFile = path.join(appDataPath, "sessions-metadata.json");
    await fs.mkdir(this.stateDir, { recursive: true });
  }

  /**
   * Start or resume a conversation
   */
  async startConversation({ sessionId, workingDirectory }) {

    // Initialize session if it doesn't exist
    if (!this.sessions.has(sessionId)) {
      const messages = await this.loadSession(sessionId);

      this.sessions.set(sessionId, {
        messages,
        isRunning: false,
        abortController: null,
        workingDirectory: workingDirectory || process.cwd(),
      });
    }

    const session = this.sessions.get(sessionId);
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
    sendToRenderer,
  }) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.isRunning) {
      throw new Error("Agent is already processing a message");
    }

    // Read images from temp files and convert to base64 for storage
    const images = [];
    if (imagePaths && imagePaths.length > 0) {
      const fs = require("fs/promises");
      const path = require("path");

      for (const imagePath of imagePaths) {
        try {
          const imageBuffer = await fs.readFile(imagePath);
          const base64Data = imageBuffer.toString("base64");

          // Determine media type from file extension
          const ext = path.extname(imagePath).toLowerCase();
          const mimeTypeMap = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
          };
          const mediaType = mimeTypeMap[ext] || "image/png";

          images.push({
            data: base64Data,
            mimeType: mediaType,
            filename: path.basename(imagePath),
          });

          console.log(
            `[AgentService] Loaded image from ${imagePath} for storage`
          );
        } catch (error) {
          console.error(
            `[AgentService] Failed to load image from ${imagePath}:`,
            error
          );
        }
      }
    }

    // Add user message to conversation with base64 images
    const userMessage = {
      id: this.generateId(),
      role: "user",
      content: message,
      images: images.length > 0 ? images : undefined,
      timestamp: new Date().toISOString(),
    };

    session.messages.push(userMessage);
    session.isRunning = true;
    session.abortController = new AbortController();

    // Send initial user message to renderer
    sendToRenderer({
      type: "message",
      message: userMessage,
    });

    // Save state with base64 images
    await this.saveSession(sessionId, session.messages);

    try {
      // Configure Claude Agent SDK options
      const options = {
        // model: "claude-sonnet-4-20250514",
        model: "claude-opus-4-5-20251101",
        systemPrompt: this.getSystemPrompt(),
        maxTurns: 20,
        cwd: workingDirectory || session.workingDirectory,
        allowedTools: [
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "Bash",
          "WebSearch",
          "WebFetch",
        ],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: session.abortController,
      };

      // Build prompt content with text and images
      let promptContent = message;

      // If there are images, create a content array
      if (imagePaths && imagePaths.length > 0) {
        const contentBlocks = [];

        // Add text block
        if (message && message.trim()) {
          contentBlocks.push({
            type: "text",
            text: message,
          });
        }

        // Add image blocks
        const fs = require("fs");
        for (const imagePath of imagePaths) {
          try {
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Data = imageBuffer.toString("base64");
            const ext = path.extname(imagePath).toLowerCase();
            const mimeTypeMap = {
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".png": "image/png",
              ".gif": "image/gif",
              ".webp": "image/webp",
            };
            const mediaType = mimeTypeMap[ext] || "image/png";

            contentBlocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            });
          } catch (error) {
            console.error(
              `[AgentService] Failed to load image ${imagePath}:`,
              error
            );
          }
        }

        // Use content blocks if we have images
        if (
          contentBlocks.length > 1 ||
          (contentBlocks.length === 1 && contentBlocks[0].type === "image")
        ) {
          promptContent = contentBlocks;
        }
      }

      // Build payload for the SDK
      const promptPayload = Array.isArray(promptContent)
        ? (async function* () {
            yield {
              type: "user",
              session_id: "",
              message: {
                role: "user",
                content: promptContent,
              },
              parent_tool_use_id: null,
            };
          })()
        : promptContent;

      // Send the query via the SDK (conversation state handled by the SDK)
      const stream = query({ prompt: promptPayload, options });

      let currentAssistantMessage = null;
      let responseText = "";
      const toolUses = [];

      // Stream responses from the SDK
      for await (const msg of stream) {
        if (msg.type === "assistant") {
          if (msg.message.content) {
            for (const block of msg.message.content) {
              if (block.type === "text") {
                responseText += block.text;

                // Create or update assistant message
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

                // Stream to renderer
                sendToRenderer({
                  type: "stream",
                  messageId: currentAssistantMessage.id,
                  content: responseText,
                  isComplete: false,
                });
              } else if (block.type === "tool_use") {
                const toolUse = {
                  name: block.name,
                  input: block.input,
                };
                toolUses.push(toolUse);

                // Send tool use notification
                sendToRenderer({
                  type: "tool_use",
                  tool: toolUse,
                });
              }
            }
          }
        } else if (msg.type === "result") {
          if (msg.subtype === "success" && msg.result) {
            // Use the final result
            if (currentAssistantMessage) {
              currentAssistantMessage.content = msg.result;
              responseText = msg.result;
            }
          }

          // Send completion
          sendToRenderer({
            type: "complete",
            messageId: currentAssistantMessage?.id,
            content: responseText,
            toolUses,
          });
        }
      }

      // Save final state
      await this.saveSession(sessionId, session.messages);

      session.isRunning = false;
      session.abortController = null;

      return {
        success: true,
        message: currentAssistantMessage,
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        // Query aborted
        session.isRunning = false;
        session.abortController = null;
        return { success: false, aborted: true };
      }

      console.error("[AgentService] Error:", error);

      session.isRunning = false;
      session.abortController = null;

      // Add error message
      const errorMessage = {
        id: this.generateId(),
        role: "assistant",
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
        isError: true,
      };

      session.messages.push(errorMessage);
      await this.saveSession(sessionId, session.messages);

      sendToRenderer({
        type: "error",
        error: error.message,
        message: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Get conversation history
   */
  getHistory(sessionId) {
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
  async stopExecution(sessionId) {
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
  async clearSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      session.isRunning = false;
      await this.saveSession(sessionId, []);
    }

    return { success: true };
  }

  /**
   * Load session from disk
   */
  async loadSession(sessionId) {
    if (!this.stateDir) return [];

    const sessionFile = path.join(this.stateDir, `${sessionId}.json`);

    try {
      const data = await fs.readFile(sessionFile, "utf-8");
      const parsed = JSON.parse(data);
      console.log(
        `[AgentService] Loaded ${parsed.length} messages for ${sessionId}`
      );
      return parsed;
    } catch (error) {
      // Session doesn't exist yet
      return [];
    }
  }

  /**
   * Save session to disk
   */
  async saveSession(sessionId, messages) {
    if (!this.stateDir) return;

    const sessionFile = path.join(this.stateDir, `${sessionId}.json`);

    try {
      await fs.writeFile(
        sessionFile,
        JSON.stringify(messages, null, 2),
        "utf-8"
      );
      console.log(
        `[AgentService] Saved ${messages.length} messages for ${sessionId}`
      );

      // Update timestamp
      await this.updateSessionTimestamp(sessionId);
    } catch (error) {
      console.error("[AgentService] Failed to save session:", error);
    }
  }

  /**
   * Get system prompt
   */
  getSystemPrompt() {
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
- Execute tests and builds

IMPORTANT: When making file changes, be aware that the Next.js development server may restart.
This is normal and expected. Your conversation state is preserved across these restarts.`;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Load all session metadata
   */
  async loadMetadata() {
    if (!this.metadataFile) return {};

    try {
      const data = await fs.readFile(this.metadataFile, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      return {};
    }
  }

  /**
   * Save session metadata
   */
  async saveMetadata(metadata) {
    if (!this.metadataFile) return;

    try {
      await fs.writeFile(
        this.metadataFile,
        JSON.stringify(metadata, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error("[AgentService] Failed to save metadata:", error);
    }
  }

  /**
   * List all sessions
   */
  async listSessions({ includeArchived = false } = {}) {
    const metadata = await this.loadMetadata();
    const sessions = [];

    for (const [sessionId, meta] of Object.entries(metadata)) {
      if (!includeArchived && meta.isArchived) continue;

      const messages = await this.loadSession(sessionId);
      const lastMessage = messages[messages.length - 1];

      sessions.push({
        id: sessionId,
        name: meta.name || sessionId,
        projectPath: meta.projectPath || "",
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        messageCount: messages.length,
        isArchived: meta.isArchived || false,
        tags: meta.tags || [],
        preview: lastMessage?.content.substring(0, 100) || "",
      });
    }

    // Sort by most recently updated
    sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return sessions;
  }

  /**
   * Create a new session
   */
  async createSession({ name, projectPath, workingDirectory }) {
    const sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 11)}`;

    const metadata = await this.loadMetadata();
    metadata[sessionId] = {
      name,
      projectPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isArchived: false,
      tags: [],
    };

    await this.saveMetadata(metadata);

    this.sessions.set(sessionId, {
      messages: [],
      isRunning: false,
      abortController: null,
      workingDirectory: workingDirectory || projectPath,
    });

    await this.saveSession(sessionId, []);

    return {
      success: true,
      sessionId,
      session: metadata[sessionId],
    };
  }

  /**
   * Update session metadata
   */
  async updateSession({ sessionId, name, tags }) {
    const metadata = await this.loadMetadata();

    if (!metadata[sessionId]) {
      return { success: false, error: "Session not found" };
    }

    if (name !== undefined) metadata[sessionId].name = name;
    if (tags !== undefined) metadata[sessionId].tags = tags;
    metadata[sessionId].updatedAt = new Date().toISOString();

    await this.saveMetadata(metadata);

    return { success: true };
  }

  /**
   * Archive a session
   */
  async archiveSession(sessionId) {
    const metadata = await this.loadMetadata();

    if (!metadata[sessionId]) {
      return { success: false, error: "Session not found" };
    }

    metadata[sessionId].isArchived = true;
    metadata[sessionId].updatedAt = new Date().toISOString();

    await this.saveMetadata(metadata);

    return { success: true };
  }

  /**
   * Unarchive a session
   */
  async unarchiveSession(sessionId) {
    const metadata = await this.loadMetadata();

    if (!metadata[sessionId]) {
      return { success: false, error: "Session not found" };
    }

    metadata[sessionId].isArchived = false;
    metadata[sessionId].updatedAt = new Date().toISOString();

    await this.saveMetadata(metadata);

    return { success: true };
  }

  /**
   * Delete a session permanently
   */
  async deleteSession(sessionId) {
    const metadata = await this.loadMetadata();

    if (!metadata[sessionId]) {
      return { success: false, error: "Session not found" };
    }

    // Remove from metadata
    delete metadata[sessionId];
    await this.saveMetadata(metadata);

    // Remove from memory
    this.sessions.delete(sessionId);

    // Delete session file
    const sessionFile = path.join(this.stateDir, `${sessionId}.json`);
    try {
      await fs.unlink(sessionFile);
    } catch (error) {
      console.warn("[AgentService] Failed to delete session file:", error);
    }

    return { success: true };
  }

  /**
   * Update session metadata when messages change
   */
  async updateSessionTimestamp(sessionId) {
    const metadata = await this.loadMetadata();

    if (metadata[sessionId]) {
      metadata[sessionId].updatedAt = new Date().toISOString();
      await this.saveMetadata(metadata);
    }
  }
}

// Export singleton instance
module.exports = new AgentService();
