/**
 * Agent Service Interface
 * Provides interaction with the Claude agent
 */

import type { ServiceResult, Subscription, IService } from "../types";
import type { StreamEvent } from "../types/events";
import type { Message } from "@/types/electron";

export interface AgentStartResult {
  messages: Message[];
  sessionId: string;
}

export interface AgentHistoryResult {
  messages: Message[];
  isRunning: boolean;
}

export interface IAgentService extends IService {
  /**
   * Start or resume an agent session
   */
  start(
    sessionId: string,
    workingDirectory?: string
  ): Promise<ServiceResult<AgentStartResult>>;

  /**
   * Send a message to the agent
   */
  send(
    sessionId: string,
    message: string,
    workingDirectory?: string,
    imagePaths?: string[]
  ): Promise<ServiceResult>;

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId: string): Promise<ServiceResult<AgentHistoryResult>>;

  /**
   * Stop current agent execution
   */
  stop(sessionId: string): Promise<ServiceResult>;

  /**
   * Clear conversation history for a session
   */
  clear(sessionId: string): Promise<ServiceResult>;

  /**
   * Subscribe to agent stream events
   */
  onStream(callback: (event: StreamEvent) => void): Subscription;
}

// Re-export StreamEvent for convenience
export type { StreamEvent } from "../types/events";
