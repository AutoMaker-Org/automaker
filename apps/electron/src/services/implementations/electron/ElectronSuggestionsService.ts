/**
 * Electron implementation of ISuggestionsService
 * Wraps window.electronAPI.suggestions methods and bridges events to EventBus
 */

import type {
  ISuggestionsService,
  SuggestionType,
  SuggestionsStatus,
} from "../../interfaces/ISuggestionsService";
import type { ServiceResult, Subscription } from "../../types";
import type { SuggestionsEvent } from "../../types/events";
import { eventBus } from "../../core/EventBus";

export class ElectronSuggestionsService implements ISuggestionsService {
  private ipcUnsubscribe: (() => void) | null = null;

  async initialize(): Promise<void> {
    // Bridge IPC events to EventBus
    if (window.electronAPI?.suggestions?.onEvent) {
      this.ipcUnsubscribe = window.electronAPI.suggestions.onEvent((event) => {
        eventBus.emit("suggestions:event", event as SuggestionsEvent);
      });
      console.log("[ElectronSuggestionsService] Subscribed to suggestions:event events");
    }
  }

  dispose(): void {
    if (this.ipcUnsubscribe) {
      this.ipcUnsubscribe();
      this.ipcUnsubscribe = null;
      console.log("[ElectronSuggestionsService] Unsubscribed from suggestions:event events");
    }
  }

  async generate(
    projectPath: string,
    suggestionType?: SuggestionType
  ): Promise<ServiceResult> {
    if (!window.electronAPI?.suggestions) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.suggestions.generate(
      projectPath,
      suggestionType
    );

    return { success: result.success, error: result.error };
  }

  async stop(): Promise<ServiceResult> {
    if (!window.electronAPI?.suggestions) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.suggestions.stop();
    return { success: result.success, error: result.error };
  }

  async status(): Promise<ServiceResult<SuggestionsStatus>> {
    if (!window.electronAPI?.suggestions) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.suggestions.status();

    if (result.success) {
      return {
        success: true,
        data: { isRunning: result.isRunning || false },
      };
    }

    return { success: false, error: result.error || "Failed to get status" };
  }

  onEvent(callback: (event: SuggestionsEvent) => void): Subscription {
    const unsubscribe = eventBus.on("suggestions:event", callback);
    return { unsubscribe };
  }
}
