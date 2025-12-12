/**
 * Mock implementation of ISetupService
 * For web development and testing without Electron
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

export class MockSetupService implements ISetupService {
  async getClaudeStatus(): Promise<ServiceResult<CLIStatus>> {
    console.log("[Mock] Getting Claude status");
    return {
      success: true,
      data: {
        installed: false,
        status: "not_installed",
        path: null,
        version: null,
        auth: {
          authenticated: false,
          method: "none",
          hasCredentialsFile: false,
          hasToken: false,
        },
      },
    };
  }

  async getCodexStatus(): Promise<ServiceResult<CLIStatus>> {
    console.log("[Mock] Getting Codex status");
    return {
      success: true,
      data: {
        installed: false,
        status: "not_installed",
        path: null,
        version: null,
        auth: {
          authenticated: false,
          method: "none",
          hasAuthFile: false,
          hasEnvKey: false,
        },
      },
    };
  }

  async installClaude(): Promise<ServiceResult<InstallResult>> {
    console.log("[Mock] Installing Claude CLI");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      success: false,
      error:
        "CLI installation is only available in the Electron app. Please run the command manually.",
    };
  }

  async installCodex(): Promise<ServiceResult<InstallResult>> {
    console.log("[Mock] Installing Codex CLI");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      success: false,
      error:
        "CLI installation is only available in the Electron app. Please run the command manually.",
    };
  }

  async authClaude(): Promise<ServiceResult<AuthClaudeResult>> {
    console.log("[Mock] Auth Claude CLI");
    return {
      success: true,
      data: {
        requiresManualAuth: true,
        command: "claude login",
      },
    };
  }

  async authCodex(apiKey?: string): Promise<ServiceResult<AuthCodexResult>> {
    console.log("[Mock] Auth Codex CLI", { hasApiKey: !!apiKey });
    if (apiKey) {
      return { success: true, data: {} };
    }
    return {
      success: true,
      data: {
        requiresManualAuth: true,
        command: "codex auth login",
      },
    };
  }

  async storeApiKey(_provider: string, _apiKey: string): Promise<ServiceResult> {
    console.log("[Mock] Storing API key");
    return { success: true };
  }

  async getApiKeys(): Promise<ServiceResult<ApiKeysStatus>> {
    console.log("[Mock] Getting API keys");
    return {
      success: true,
      data: {
        hasAnthropicKey: false,
        hasOpenAIKey: false,
        hasGoogleKey: false,
      },
    };
  }

  async configureCodexMcp(
    projectPath: string
  ): Promise<ServiceResult<ConfigureCodexMcpResult>> {
    console.log("[Mock] Configuring Codex MCP for:", projectPath);
    return {
      success: true,
      data: { configPath: `${projectPath}/.codex/config.toml` },
    };
  }

  async getPlatform(): Promise<ServiceResult<PlatformInfo>> {
    return {
      success: true,
      data: {
        platform: "darwin",
        arch: "arm64",
        homeDir: "/Users/mock",
        isWindows: false,
        isMac: true,
        isLinux: false,
      },
    };
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
