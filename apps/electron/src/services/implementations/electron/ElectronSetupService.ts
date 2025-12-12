/**
 * Electron implementation of ISetupService
 * Wraps window.electronAPI.setup methods and bridges events to EventBus
 */

import type {
  ISetupService,
  CLIStatus,
  PlatformInfo,
  InstallResult,
  AuthClaudeResult,
  AuthCodexResult,
  ApiKeysStatus,
  ConfigureCodexMcpResult,
} from "../../interfaces/ISetupService";
import type { ServiceResult, Subscription } from "../../types";
import type { InstallProgressEvent, AuthProgressEvent } from "../../types/events";
import { eventBus } from "../../core/EventBus";

export class ElectronSetupService implements ISetupService {
  private installProgressUnsubscribe: (() => void) | null = null;
  private authProgressUnsubscribe: (() => void) | null = null;

  async initialize(): Promise<void> {
    // Bridge IPC events to EventBus
    if (window.electronAPI?.setup?.onInstallProgress) {
      this.installProgressUnsubscribe = window.electronAPI.setup.onInstallProgress(
        (event) => {
          eventBus.emit("setup:install-progress", event as InstallProgressEvent);
        }
      );
      console.log(
        "[ElectronSetupService] Subscribed to setup:install-progress events"
      );
    }

    if (window.electronAPI?.setup?.onAuthProgress) {
      this.authProgressUnsubscribe = window.electronAPI.setup.onAuthProgress(
        (event) => {
          eventBus.emit("setup:auth-progress", event as AuthProgressEvent);
        }
      );
      console.log("[ElectronSetupService] Subscribed to setup:auth-progress events");
    }
  }

  dispose(): void {
    if (this.installProgressUnsubscribe) {
      this.installProgressUnsubscribe();
      this.installProgressUnsubscribe = null;
    }
    if (this.authProgressUnsubscribe) {
      this.authProgressUnsubscribe();
      this.authProgressUnsubscribe = null;
    }
    console.log("[ElectronSetupService] Unsubscribed from setup events");
  }

  async getClaudeStatus(): Promise<ServiceResult<CLIStatus>> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.getClaudeStatus();

    if (result.success) {
      return {
        success: true,
        data: {
          installed: result.installed || result.status === "installed",
          status: result.status,
          path: result.path || null,
          version: result.version || null,
          method: result.method,
          auth: result.auth,
        },
      };
    }

    return { success: false, error: result.error || "Failed to get Claude status" };
  }

  async getCodexStatus(): Promise<ServiceResult<CLIStatus>> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.getCodexStatus();

    if (result.success) {
      return {
        success: true,
        data: {
          installed: result.status === "installed" || !!result.path,
          status: result.status,
          path: result.path || null,
          version: result.version || null,
          method: result.method,
          auth: result.auth,
        },
      };
    }

    return { success: false, error: result.error || "Failed to get Codex status" };
  }

  async installClaude(): Promise<ServiceResult<InstallResult>> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.installClaude();

    if (result.success) {
      return {
        success: true,
        data: { message: result.message || "Claude CLI installed successfully" },
      };
    }

    return { success: false, error: result.error || "Failed to install Claude CLI" };
  }

  async installCodex(): Promise<ServiceResult<InstallResult>> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.installCodex();

    if (result.success) {
      return {
        success: true,
        data: { message: result.message || "Codex CLI installed successfully" },
      };
    }

    return { success: false, error: result.error || "Failed to install Codex CLI" };
  }

  async authClaude(): Promise<ServiceResult<AuthClaudeResult>> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.authClaude();

    if (result.success) {
      return {
        success: true,
        data: {
          token: result.token,
          requiresManualAuth: result.requiresManualAuth,
          terminalOpened: result.terminalOpened,
          command: result.command,
          message: result.message,
          output: result.output,
        },
      };
    }

    return { success: false, error: result.error || "Failed to authenticate Claude" };
  }

  async authCodex(apiKey?: string): Promise<ServiceResult<AuthCodexResult>> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.authCodex(apiKey);

    if (result.success) {
      return {
        success: true,
        data: {
          requiresManualAuth: result.requiresManualAuth,
          command: result.command,
        },
      };
    }

    return { success: false, error: result.error || "Failed to authenticate Codex" };
  }

  async storeApiKey(provider: string, apiKey: string): Promise<ServiceResult> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.storeApiKey(provider, apiKey);
    return { success: result.success, error: result.error };
  }

  async getApiKeys(): Promise<ServiceResult<ApiKeysStatus>> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.getApiKeys();

    if (result.success) {
      return {
        success: true,
        data: {
          hasAnthropicKey: result.hasAnthropicKey,
          hasAnthropicOAuthToken: (result as any).hasAnthropicOAuthToken,
          hasOpenAIKey: result.hasOpenAIKey,
          hasGoogleKey: result.hasGoogleKey,
        },
      };
    }

    return { success: false, error: "Failed to get API keys" };
  }

  async configureCodexMcp(
    projectPath: string
  ): Promise<ServiceResult<ConfigureCodexMcpResult>> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.configureCodexMcp(projectPath);

    if (result.success && result.configPath) {
      return {
        success: true,
        data: { configPath: result.configPath },
      };
    }

    return { success: false, error: result.error || "Failed to configure Codex MCP" };
  }

  async getPlatform(): Promise<ServiceResult<PlatformInfo>> {
    if (!window.electronAPI?.setup) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.setup.getPlatform();

    if (result.success) {
      return {
        success: true,
        data: {
          platform: result.platform,
          arch: result.arch,
          homeDir: result.homeDir,
          isWindows: result.isWindows,
          isMac: result.isMac,
          isLinux: result.isLinux,
        },
      };
    }

    return { success: false, error: "Failed to get platform info" };
  }

  onInstallProgress(callback: (event: InstallProgressEvent) => void): Subscription {
    const unsubscribe = eventBus.on("setup:install-progress", callback);
    return { unsubscribe };
  }

  onAuthProgress(callback: (event: AuthProgressEvent) => void): Subscription {
    const unsubscribe = eventBus.on("setup:auth-progress", callback);
    return { unsubscribe };
  }
}
