/**
 * Mock implementation of IAgentService
 * For web development and testing without Electron
 */

import type {
  IAgentService,
  AgentStartResult,
  AgentHistoryResult,
} from "../../interfaces/IAgentService";
import type { ServiceResult, Subscription } from "../../types";
import type { StreamEvent } from "../../types/events";
import type { Message } from "@/types/electron";
import { eventBus } from "../../core/EventBus";

// Mock state
let mockMessages: Record<string, Message[]> = {};
let mockIsProcessing: Record<string, boolean> = {};

export class MockAgentService implements IAgentService {
  async start(
    sessionId: string,
    _workingDirectory?: string
  ): Promise<ServiceResult<AgentStartResult>> {
    console.log("[MockAgentService] Starting session:", sessionId);

    if (!mockMessages[sessionId]) {
      mockMessages[sessionId] = [];
    }

    return {
      success: true,
      data: {
        messages: mockMessages[sessionId],
        sessionId,
      },
    };
  }

  async send(
    sessionId: string,
    message: string,
    _workingDirectory?: string,
    _imagePaths?: string[]
  ): Promise<ServiceResult> {
    console.log("[MockAgentService] Sending message:", { sessionId, message });

    mockIsProcessing[sessionId] = true;

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    mockMessages[sessionId] = [...(mockMessages[sessionId] || []), userMessage];

    // Emit user message event
    eventBus.emit("agent:stream", {
      type: "message",
      sessionId,
      message: userMessage,
    });

    // Simulate assistant response after a delay
    setTimeout(() => {
      const responseId = `msg-${Date.now()}`;

      // Emit streaming response
      eventBus.emit("agent:stream", {
        type: "stream",
        sessionId,
        messageId: responseId,
        content: "This is a mock response. ",
        isComplete: false,
      });

      setTimeout(() => {
        const fullContent =
          "This is a mock response. The agent is running in mock mode for web development.";

        eventBus.emit("agent:stream", {
          type: "stream",
          sessionId,
          messageId: responseId,
          content: fullContent,
          isComplete: true,
        });

        // Add to messages
        const assistantMessage: Message = {
          id: responseId,
          role: "assistant",
          content: fullContent,
          timestamp: new Date().toISOString(),
        };
        mockMessages[sessionId] = [
          ...(mockMessages[sessionId] || []),
          assistantMessage,
        ];

        // Emit complete event
        eventBus.emit("agent:stream", {
          type: "complete",
          sessionId,
          messageId: responseId,
          content: fullContent,
        });

        mockIsProcessing[sessionId] = false;
      }, 500);
    }, 300);

    return { success: true };
  }

  async getHistory(sessionId: string): Promise<ServiceResult<AgentHistoryResult>> {
    return {
      success: true,
      data: {
        messages: mockMessages[sessionId] || [],
        isRunning: mockIsProcessing[sessionId] || false,
      },
    };
  }

  async stop(sessionId: string): Promise<ServiceResult> {
    console.log("[MockAgentService] Stopping session:", sessionId);
    mockIsProcessing[sessionId] = false;
    return { success: true };
  }

  async clear(sessionId: string): Promise<ServiceResult> {
    console.log("[MockAgentService] Clearing session:", sessionId);
    mockMessages[sessionId] = [];
    return { success: true };
  }

  onStream(callback: (event: StreamEvent) => void): Subscription {
    const unsubscribe = eventBus.on("agent:stream", callback);
    return { unsubscribe };
  }
}
