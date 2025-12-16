/**
 * Business logic for getting Claude CLI status
 */

import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { getApiKey } from "./common.js";

const execAsync = promisify(exec);

export async function getClaudeStatus() {
  let installed = false;
  let version = "";
  let cliPath = "";
  let method = "none";

  const isWindows = process.platform === "win32";

  // Try to find Claude CLI using platform-specific command
  try {
    // Use 'where' on Windows, 'which' on Unix-like systems
    const findCommand = isWindows ? "where claude" : "which claude";
    const { stdout } = await execAsync(findCommand);
    // 'where' on Windows can return multiple paths - take the first one
    cliPath = stdout.trim().split(/\r?\n/)[0];
    installed = true;
    method = "path";

    // Get version
    try {
      const { stdout: versionOut } = await execAsync("claude --version");
      version = versionOut.trim();
    } catch {
      // Version command might not be available
    }
  } catch {
    // Not in PATH, try common locations based on platform
    const commonPaths = isWindows
      ? (() => {
          const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
          return [
            // Windows-specific paths
            path.join(os.homedir(), ".local", "bin", "claude.exe"),
            path.join(appData, "npm", "claude.cmd"),
            path.join(appData, "npm", "claude"),
            path.join(appData, ".npm-global", "bin", "claude.cmd"),
            path.join(appData, ".npm-global", "bin", "claude"),
          ];
        })()
      : [
          // Unix (Linux/macOS) paths
          path.join(os.homedir(), ".local", "bin", "claude"),
          path.join(os.homedir(), ".claude", "local", "claude"),
          "/usr/local/bin/claude",
          path.join(os.homedir(), ".npm-global", "bin", "claude"),
        ];

    for (const p of commonPaths) {
      try {
        await fs.access(p);
        cliPath = p;
        installed = true;
        method = "local";

        // Get version from this path
        try {
          const { stdout: versionOut } = await execAsync(`"${p}" --version`);
          version = versionOut.trim();
        } catch {
          // Version command might not be available
        }
        break;
      } catch {
        // Not found at this path
      }
    }
  }

  // Check authentication - detect all possible auth methods
  // Note: apiKeys.anthropic_oauth_token stores OAuth tokens from subscription auth
  //       apiKeys.anthropic stores direct API keys for pay-per-use
  let auth = {
    authenticated: false,
    method: "none" as string,
    hasCredentialsFile: false,
    hasToken: false,
    hasStoredOAuthToken: !!getApiKey("anthropic_oauth_token"),
    hasStoredApiKey: !!getApiKey("anthropic"),
    hasEnvApiKey: !!process.env.ANTHROPIC_API_KEY,
    // Additional fields for detailed status
    oauthTokenValid: false,
    apiKeyValid: false,
    hasCliAuth: false,
    hasRecentActivity: false,
  };

  const claudeDir = path.join(os.homedir(), ".claude");

  // Check for recent Claude CLI activity - indicates working authentication
  // The stats-cache.json file is only populated when the CLI is working properly
  const statsCachePath = path.join(claudeDir, "stats-cache.json");
  try {
    const statsContent = await fs.readFile(statsCachePath, "utf-8");
    const stats = JSON.parse(statsContent);

    // Check if there's any activity (which means the CLI is authenticated and working)
    if (stats.dailyActivity && stats.dailyActivity.length > 0) {
      auth.hasRecentActivity = true;
      auth.hasCliAuth = true;
      auth.authenticated = true;
      auth.method = "cli_authenticated";
    }
  } catch {
    // Stats file doesn't exist or is invalid
  }

  // Check for settings.json - indicates CLI has been set up
  const settingsPath = path.join(claudeDir, "settings.json");
  try {
    await fs.access(settingsPath);
    // If settings exist but no activity, CLI might be set up but not authenticated
    if (!auth.hasCliAuth) {
      // Try to check for other indicators of auth
      const sessionsDir = path.join(claudeDir, "projects");
      try {
        const sessions = await fs.readdir(sessionsDir);
        if (sessions.length > 0) {
          auth.hasCliAuth = true;
          auth.authenticated = true;
          auth.method = "cli_authenticated";
        }
      } catch {
        // Sessions directory doesn't exist
      }
    }
  } catch {
    // Settings file doesn't exist
  }

  // Check for credentials file (OAuth tokens from claude login)
  // Note: Claude CLI may use ".credentials.json" (hidden) or "credentials.json" depending on version/platform
  const credentialsPaths = [
    path.join(claudeDir, ".credentials.json"),
    path.join(claudeDir, "credentials.json"),
  ];

  for (const credentialsPath of credentialsPaths) {
    try {
      const credentialsContent = await fs.readFile(credentialsPath, "utf-8");
      const credentials = JSON.parse(credentialsContent);
      auth.hasCredentialsFile = true;

      // Check what type of token is in credentials
      if (credentials.oauth_token || credentials.access_token) {
        auth.hasStoredOAuthToken = true;
        auth.oauthTokenValid = true;
        auth.authenticated = true;
        auth.method = "oauth_token"; // Stored OAuth token from credentials file
      } else if (credentials.api_key) {
        auth.apiKeyValid = true;
        auth.authenticated = true;
        auth.method = "api_key"; // Stored API key in credentials file
      }
      break; // Found and processed credentials file
    } catch {
      // No credentials file at this path or invalid format
    }
  }

  // Environment variables override stored credentials (higher priority)
  if (auth.hasEnvApiKey) {
    auth.authenticated = true;
    auth.apiKeyValid = true;
    auth.method = "api_key_env"; // API key from ANTHROPIC_API_KEY env var
  }

  // In-memory stored OAuth token (from setup wizard - subscription auth)
  if (!auth.authenticated && getApiKey("anthropic_oauth_token")) {
    auth.authenticated = true;
    auth.oauthTokenValid = true;
    auth.method = "oauth_token"; // Stored OAuth token from setup wizard
  }

  // In-memory stored API key (from settings UI - pay-per-use)
  if (!auth.authenticated && getApiKey("anthropic")) {
    auth.authenticated = true;
    auth.apiKeyValid = true;
    auth.method = "api_key"; // Manually stored API key
  }

  return {
    status: installed ? "installed" : "not_installed",
    installed,
    method,
    version,
    path: cliPath,
    auth,
  };
}
