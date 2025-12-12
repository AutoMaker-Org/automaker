/**
 * Electron implementation of IAgentService
 * Wraps window.electronAPI.agent methods and bridges events to EventBus
 */

import type {
  IAgentService,
  AgentStartResult,
  AgentHistoryResult,
} from "../../interfaces/IAgentService";
import type { ServiceResult, Subscription } from "../../types";
import type { StreamEvent } from "../../types/events";
import { eventBus } from "../../core/EventBus";

export class ElectronAgentService implements IAgentService {
  private ipcUnsubscribe: (() => void) | null = null;

  async initialize(): Promise<void> {
    // Bridge IPC events to EventBus
    if (window.electronAPI?.agent?.onStream) {
      this.ipcUnsubscribe = window.electronAPI.agent.onStream((event) => {
        eventBus.emit("agent:stream", event as StreamEvent);
      });
      console.log("[ElectronAgentService] Subscribed to agent:stream events");
    }
  }

  dispose(): void {
    if (this.ipcUnsubscribe) {
      this.ipcUnsubscribe();
      this.ipcUnsubscribe = null;
      console.log("[ElectronAgentService] Unsubscribed from agent:stream events");
    }
  }

  async start(
    sessionId: string,
    workingDirectory?: string
  ): Promise<ServiceResult<AgentStartResult>> {
    if (!window.electronAPI?.agent) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.agent.start(sessionId, workingDirectory);

    if (result.success && result.messages) {
      return {
        success: true,
        data: {
          messages: result.messages,
          sessionId: result.sessionId || sessionId,
        },
      };
    }

    return { success: false, error: result.error || "Failed to start session" };
  }

  async send(
    sessionId: string,
    message: string,
    workingDirectory?: string,
    imagePaths?: string[]
  ): Promise<ServiceResult> {
    if (!window.electronAPI?.agent) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.agent.send(
      sessionId,
      message,
      workingDirectory,
      imagePaths
    );

    return { success: result.success, error: result.error };
  }

  async getHistory(sessionId: string): Promise<ServiceResult<AgentHistoryResult>> {
    if (!window.electronAPI?.agent) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.agent.getHistory(sessionId);

    if (result.success) {
      return {
        success: true,
        data: {
          messages: result.messages || [],
          isRunning: result.isRunning || false,
        },
      };
    }

    return { success: false, error: result.error || "Failed to get history" };
  }

  async stop(sessionId: string): Promise<ServiceResult> {
    if (!window.electronAPI?.agent) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.agent.stop(sessionId);
    return { success: result.success, error: result.error };
  }

  async clear(sessionId: string): Promise<ServiceResult> {
    if (!window.electronAPI?.agent) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.agent.clear(sessionId);
    return { success: result.success, error: result.error };
  }

  onStream(callback: (event: StreamEvent) => void): Subscription {
    const unsubscribe = eventBus.on("agent:stream", callback);
    return { unsubscribe };
  }
}
