/**
 * Electron implementation of ISpecRegenerationService
 * Wraps window.electronAPI.specRegeneration methods and bridges events to EventBus
 */

import type {
  ISpecRegenerationService,
  SpecRegenerationStatus,
} from "../../interfaces/ISpecRegenerationService";
import type { ServiceResult, Subscription } from "../../types";
import type { SpecRegenerationEvent } from "../../types/events";
import { eventBus } from "../../core/EventBus";

export class ElectronSpecRegenerationService implements ISpecRegenerationService {
  private ipcUnsubscribe: (() => void) | null = null;

  async initialize(): Promise<void> {
    // Bridge IPC events to EventBus
    if (window.electronAPI?.specRegeneration?.onEvent) {
      this.ipcUnsubscribe = window.electronAPI.specRegeneration.onEvent((event) => {
        eventBus.emit("spec-regeneration:event", event as SpecRegenerationEvent);
      });
      console.log(
        "[ElectronSpecRegenerationService] Subscribed to spec-regeneration:event events"
      );
    }
  }

  dispose(): void {
    if (this.ipcUnsubscribe) {
      this.ipcUnsubscribe();
      this.ipcUnsubscribe = null;
      console.log(
        "[ElectronSpecRegenerationService] Unsubscribed from spec-regeneration:event events"
      );
    }
  }

  async create(
    projectPath: string,
    projectOverview: string,
    generateFeatures?: boolean
  ): Promise<ServiceResult> {
    if (!window.electronAPI?.specRegeneration) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.specRegeneration.create(
      projectPath,
      projectOverview,
      generateFeatures
    );

    return { success: result.success, error: result.error };
  }

  async generate(
    projectPath: string,
    projectDefinition: string
  ): Promise<ServiceResult> {
    if (!window.electronAPI?.specRegeneration) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.specRegeneration.generate(
      projectPath,
      projectDefinition
    );

    return { success: result.success, error: result.error };
  }

  async generateFeatures(projectPath: string): Promise<ServiceResult> {
    if (!window.electronAPI?.specRegeneration) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.specRegeneration.generateFeatures(
      projectPath
    );

    return { success: result.success, error: result.error };
  }

  async stop(): Promise<ServiceResult> {
    if (!window.electronAPI?.specRegeneration) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.specRegeneration.stop();
    return { success: result.success, error: result.error };
  }

  async status(): Promise<ServiceResult<SpecRegenerationStatus>> {
    if (!window.electronAPI?.specRegeneration) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.specRegeneration.status();

    if (result.success) {
      return {
        success: true,
        data: {
          isRunning: result.isRunning || false,
          currentPhase: result.currentPhase,
        },
      };
    }

    return { success: false, error: result.error || "Failed to get status" };
  }

  onEvent(callback: (event: SpecRegenerationEvent) => void): Subscription {
    const unsubscribe = eventBus.on("spec-regeneration:event", callback);
    return { unsubscribe };
  }
}
