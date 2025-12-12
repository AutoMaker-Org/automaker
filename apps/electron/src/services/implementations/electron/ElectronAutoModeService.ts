/**
 * Electron implementation of IAutoModeService
 * Wraps window.electronAPI.autoMode methods and bridges events to EventBus
 */

import type {
  IAutoModeService,
  AutoModeStatus,
  AutoModeStopResult,
  AutoModeRunResult,
  AutoModeContextResult,
  AutoModeAnalyzeResult,
} from "../../interfaces/IAutoModeService";
import type { ServiceResult, Subscription } from "../../types";
import type { AutoModeEvent } from "../../types/events";
import { eventBus } from "../../core/EventBus";

export class ElectronAutoModeService implements IAutoModeService {
  private ipcUnsubscribe: (() => void) | null = null;

  async initialize(): Promise<void> {
    // Bridge IPC events to EventBus
    if (window.electronAPI?.autoMode?.onEvent) {
      this.ipcUnsubscribe = window.electronAPI.autoMode.onEvent((event) => {
        eventBus.emit("auto-mode:event", event as AutoModeEvent);
      });
      console.log("[ElectronAutoModeService] Subscribed to auto-mode:event events");
    }
  }

  dispose(): void {
    if (this.ipcUnsubscribe) {
      this.ipcUnsubscribe();
      this.ipcUnsubscribe = null;
      console.log("[ElectronAutoModeService] Unsubscribed from auto-mode:event events");
    }
  }

  async start(projectPath: string, maxConcurrency?: number): Promise<ServiceResult> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.start(projectPath, maxConcurrency);
    return { success: result.success, error: result.error };
  }

  async stop(projectPath: string): Promise<ServiceResult<AutoModeStopResult>> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.stop(projectPath);

    if (result.success) {
      return {
        success: true,
        data: { runningFeatures: result.runningFeatures || 0 },
      };
    }

    return { success: false, error: result.error || "Failed to stop auto mode" };
  }

  async stopFeature(featureId: string): Promise<ServiceResult> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.stopFeature(featureId);
    return { success: result.success, error: result.error };
  }

  async status(projectPath?: string): Promise<ServiceResult<AutoModeStatus>> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.status(projectPath);

    if (result.success) {
      return {
        success: true,
        data: {
          isRunning: result.isRunning || result.autoLoopRunning || false,
          autoLoopRunning: result.autoLoopRunning || false,
          currentFeatureId: result.currentFeatureId || null,
          runningFeatures: result.runningFeatures || [],
          runningProjects: result.runningProjects,
          runningCount: result.runningCount || 0,
        },
      };
    }

    return { success: false, error: result.error || "Failed to get status" };
  }

  async runFeature(
    projectPath: string,
    featureId: string,
    useWorktrees?: boolean
  ): Promise<ServiceResult<AutoModeRunResult>> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.runFeature(
      projectPath,
      featureId,
      useWorktrees
    );

    if (result.success) {
      return { success: true, data: { passes: result.passes || false } };
    }

    return { success: false, error: result.error || "Failed to run feature" };
  }

  async verifyFeature(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<AutoModeRunResult>> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.verifyFeature(
      projectPath,
      featureId
    );

    if (result.success) {
      return { success: true, data: { passes: result.passes || false } };
    }

    return { success: false, error: result.error || "Failed to verify feature" };
  }

  async resumeFeature(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<AutoModeRunResult>> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.resumeFeature(
      projectPath,
      featureId
    );

    if (result.success) {
      return { success: true, data: { passes: result.passes || false } };
    }

    return { success: false, error: result.error || "Failed to resume feature" };
  }

  async contextExists(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<AutoModeContextResult>> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.contextExists(
      projectPath,
      featureId
    );

    if (result.success) {
      return { success: true, data: { exists: result.exists || false } };
    }

    return { success: false, error: result.error || "Failed to check context" };
  }

  async analyzeProject(
    projectPath: string
  ): Promise<ServiceResult<AutoModeAnalyzeResult>> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.analyzeProject(projectPath);

    if (result.success) {
      return { success: true, data: { message: result.message || "" } };
    }

    return { success: false, error: result.error || "Failed to analyze project" };
  }

  async followUpFeature(
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[]
  ): Promise<ServiceResult> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.followUpFeature(
      projectPath,
      featureId,
      prompt,
      imagePaths
    );

    return { success: result.success, error: result.error };
  }

  async commitFeature(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult> {
    if (!window.electronAPI?.autoMode) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.autoMode.commitFeature(
      projectPath,
      featureId
    );

    return { success: result.success, error: result.error };
  }

  onEvent(callback: (event: AutoModeEvent) => void): Subscription {
    const unsubscribe = eventBus.on("auto-mode:event", callback);
    return { unsubscribe };
  }
}
