const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

let runPtyCommand = null;
try {
  ({ runPtyCommand } = require("./pty-runner"));
} catch (error) {
  console.warn(
    "[ClaudeCliDetector] node-pty unavailable, will fall back to external terminal:",
    error?.message || error
  );
}

const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-_]|\u001b\][^\u0007]*\u0007/g;

const stripAnsi = (text = "") => text.replace(ANSI_REGEX, "");

/**
 * Claude CLI Detector
 *
 * Authentication options:
 * 1. OAuth Token (Subscription): User runs `claude setup-token` and provides the token to the app
 * 2. API Key (Pay-per-use): User provides their Anthropic API key directly
 */
class ClaudeCliDetector {
  /**
   * Check if Claude Code CLI is installed and accessible
   * @returns {Object} { installed: boolean, path: string|null, version: string|null, method: 'cli'|'none' }
   */
  /**
   * Try to get updated PATH from shell config files
   * This helps detect CLI installations that modify shell config but haven't updated the current process PATH
   */
  static getUpdatedPathFromShellConfig() {
    const homeDir = os.homedir();
    const shell = process.env.SHELL || "/bin/bash";
    const shellName = path.basename(shell);

    const configFiles = [];
    if (shellName.includes("zsh")) {
      configFiles.push(path.join(homeDir, ".zshrc"));
      configFiles.push(path.join(homeDir, ".zshenv"));
      configFiles.push(path.join(homeDir, ".zprofile"));
    } else if (shellName.includes("bash")) {
      configFiles.push(path.join(homeDir, ".bashrc"));
      configFiles.push(path.join(homeDir, ".bash_profile"));
      configFiles.push(path.join(homeDir, ".profile"));
    }

    const commonPaths = [
      path.join(homeDir, ".local", "bin"),
      path.join(homeDir, ".cargo", "bin"),
      "/usr/local/bin",
      "/opt/homebrew/bin",
      path.join(homeDir, "bin"),
    ];

    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        try {
          const content = fs.readFileSync(configFile, "utf-8");
          const pathMatches = content.match(
            /export\s+PATH=["']?([^"'\n]+)["']?/g
          );
          if (pathMatches) {
            for (const match of pathMatches) {
              const pathValue = match
                .replace(/export\s+PATH=["']?/, "")
                .replace(/["']?$/, "");
              const paths = pathValue
                .split(":")
                .filter((p) => p && !p.includes("$"));
              commonPaths.push(...paths);
            }
          }
        } catch (error) {
          // Ignore errors reading config files
        }
      }
    }

    return [...new Set(commonPaths)];
  }

  static detectClaudeInstallation() {
    try {
      // Check if 'claude' command is in PATH (Unix)
      if (process.platform !== "win32") {
        try {
          const claudePath = execSync("which claude 2>/dev/null", {
            encoding: "utf-8",
          }).trim();
          if (claudePath) {
            const version = this.getClaudeVersion(claudePath);
            return {
              installed: true,
              path: claudePath,
              version: version,
              method: "cli",
            };
          }
        } catch (error) {
          // CLI not in PATH
        }
      }

      // Check Windows path
      if (process.platform === "win32") {
        try {
          const claudePath = execSync("where claude 2>nul", {
            encoding: "utf-8",
          })
            .trim()
            .split("\n")[0];
          if (claudePath) {
            const version = this.getClaudeVersion(claudePath);
            return {
              installed: true,
              path: claudePath,
              version: version,
              method: "cli",
            };
          }
        } catch (error) {
          // Not found on Windows
        }
      }

      // Check for local installation
      const localClaudePath = path.join(
        os.homedir(),
        ".claude",
        "local",
        "claude"
      );
      if (fs.existsSync(localClaudePath)) {
        const version = this.getClaudeVersion(localClaudePath);
        return {
          installed: true,
          path: localClaudePath,
          version: version,
          method: "cli-local",
        };
      }

      // Check common installation locations
      const commonPaths = this.getUpdatedPathFromShellConfig();
      const binaryNames = ["claude", "claude-code"];

      for (const basePath of commonPaths) {
        for (const binaryName of binaryNames) {
          const claudePath = path.join(basePath, binaryName);
          if (fs.existsSync(claudePath)) {
            try {
              const version = this.getClaudeVersion(claudePath);
              return {
                installed: true,
                path: claudePath,
                version: version,
                method: "cli",
              };
            } catch (error) {
              // File exists but can't get version
            }
          }
        }
      }

      // Try to source shell config and check PATH again (Unix)
      if (process.platform !== "win32") {
        try {
          const shell = process.env.SHELL || "/bin/bash";
          const shellName = path.basename(shell);
          const homeDir = os.homedir();

          let sourceCmd = "";
          if (shellName.includes("zsh")) {
            sourceCmd = `source ${homeDir}/.zshrc 2>/dev/null && which claude`;
          } else if (shellName.includes("bash")) {
            sourceCmd = `source ${homeDir}/.bashrc 2>/dev/null && which claude`;
          }

          if (sourceCmd) {
            const claudePath = execSync(`bash -c "${sourceCmd}"`, {
              encoding: "utf-8",
              timeout: 2000,
            }).trim();
            if (claudePath && claudePath.startsWith("/")) {
              const version = this.getClaudeVersion(claudePath);
              return {
                installed: true,
                path: claudePath,
                version: version,
                method: "cli",
              };
            }
          }
        } catch (error) {
          // Failed to source shell config
        }
      }

      return {
        installed: false,
        path: null,
        version: null,
        method: "none",
      };
    } catch (error) {
      return {
        installed: false,
        path: null,
        version: null,
        method: "none",
        error: error.message,
      };
    }
  }

  /**
   * Get Claude CLI version
   * @param {string} claudePath Path to claude executable
   * @returns {string|null} Version string or null
   */
  static getClaudeVersion(claudePath) {
    try {
      const version = execSync(`"${claudePath}" --version 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      return version || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get authentication status
   * Checks for:
   * 1. OAuth token stored in app's credentials (from `claude setup-token`)
   * 2. API key stored in app's credentials
   * 3. API key in environment variable
   *
   * @param {string} appCredentialsPath Path to app's credentials.json
   * @returns {Object} Authentication status
   */
  static getAuthStatus(appCredentialsPath) {
    const envApiKey = process.env.ANTHROPIC_API_KEY;
    const envOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

    let storedOAuthToken = null;
    let storedApiKey = null;

    if (appCredentialsPath && fs.existsSync(appCredentialsPath)) {
      try {
        const content = fs.readFileSync(appCredentialsPath, "utf-8");
        const credentials = JSON.parse(content);
        storedOAuthToken = credentials.anthropic_oauth_token || null;
        storedApiKey =
          credentials.anthropic || credentials.anthropic_api_key || null;
      } catch (error) {
        // Ignore credential read errors
      }
    }

    // Authentication priority (highest to lowest):
    // 1. Environment OAuth Token (CLAUDE_CODE_OAUTH_TOKEN)
    // 2. Stored OAuth Token (from credentials file)
    // 3. Stored API Key (from credentials file)
    // 4. Environment API Key (ANTHROPIC_API_KEY)
    let authenticated = false;
    let method = "none";

    if (envOAuthToken) {
      authenticated = true;
      method = "oauth_token_env";
    } else if (storedOAuthToken) {
      authenticated = true;
      method = "oauth_token";
    } else if (storedApiKey) {
      authenticated = true;
      method = "api_key";
    } else if (envApiKey) {
      authenticated = true;
      method = "api_key_env";
    }

    return {
      authenticated,
      method,
      hasStoredOAuthToken: !!storedOAuthToken,
      hasStoredApiKey: !!storedApiKey,
      hasEnvApiKey: !!envApiKey,
      hasEnvOAuthToken: !!envOAuthToken,
    };
  }
  /**
   * Get installation info (installation status only, no auth)
   * @returns {Object} Installation info with status property
   */
  static getInstallationInfo() {
    const installation = this.detectClaudeInstallation();
    return {
      status: installation.installed ? "installed" : "not_installed",
      installed: installation.installed,
      path: installation.path,
      version: installation.version,
      method: installation.method,
    };
  }

  /**
   * Get full status including installation and auth
   * @param {string} appCredentialsPath Path to app's credentials.json
   * @returns {Object} Full status
   */
  static getFullStatus(appCredentialsPath) {
    const installation = this.detectClaudeInstallation();
    const auth = this.getAuthStatus(appCredentialsPath);

    return {
      success: true,
      status: installation.installed ? "installed" : "not_installed",
      installed: installation.installed,
      path: installation.path,
      version: installation.version,
      method: installation.method,
      auth,
    };
  }

  /**
   * Get installation info and recommendations
   * @returns {Object} Installation status and recommendations
   */
  static getInstallationInfo() {
    const detection = this.detectClaudeInstallation();

    if (detection.installed) {
      return {
        status: 'installed',
        method: detection.method,
        version: detection.version,
        path: detection.path,
        recommendation: 'Claude Code CLI is ready for ultrathink'
      };
    }

    return {
      status: 'not_installed',
      recommendation: 'Install Claude Code CLI for optimal ultrathink performance',
      installCommands: this.getInstallCommands()
    };
  }

  /**
   * Get installation commands for different platforms
   * @returns {Object} Installation commands
   */
  static getInstallCommands() {
    return {
      macos: "curl -fsSL https://claude.ai/install.sh | bash",
      windows: "irm https://claude.ai/install.ps1 | iex",
      linux: "curl -fsSL https://claude.ai/install.sh | bash",
    };
  }

  /**
   * Install Claude CLI using the official script
   * @param {Function} onProgress Callback for progress updates
   * @returns {Promise<Object>} Installation result
   */
  static async installCli(onProgress) {
    return new Promise((resolve, reject) => {
      const platform = process.platform;
      let command, args;

      if (platform === "win32") {
        command = "powershell";
        args = ["-Command", "irm https://claude.ai/install.ps1 | iex"];
      } else {
        command = "bash";
        args = ["-c", "curl -fsSL https://claude.ai/install.sh | bash"];
      }

      console.log("[ClaudeCliDetector] Installing Claude CLI...");

      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (data) => {
        const text = data.toString();
        output += text;
        if (onProgress) {
          onProgress({ type: "stdout", data: text });
        }
      });

      proc.stderr.on("data", (data) => {
        const text = data.toString();
        errorOutput += text;
        if (onProgress) {
          onProgress({ type: "stderr", data: text });
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          console.log(
            "[ClaudeCliDetector] Installation completed successfully"
          );
          resolve({
            success: true,
            output,
            message: "Claude CLI installed successfully",
          });
        } else {
          console.error(
            "[ClaudeCliDetector] Installation failed with code:",
            code
          );
          reject({
            success: false,
            error: errorOutput || `Installation failed with code ${code}`,
            output,
          });
        }
      });

      proc.on("error", (error) => {
        console.error("[ClaudeCliDetector] Installation error:", error);
        reject({
          success: false,
          error: error.message,
          output,
        });
      });
    });
  }

  /**
   * Get instructions for setup-token command
   * @returns {Object} Setup token instructions
   */
  static getSetupTokenInstructions() {
    const detection = this.detectClaudeInstallation();

    if (!detection.installed) {
      return {
        success: false,
        error: "Claude CLI is not installed. Please install it first.",
        installCommands: this.getInstallCommands(),
      };
    }

    return {
      success: true,
      command: "claude setup-token",
      instructions: [
        "1. Open your terminal",
        "2. Run: claude setup-token",
        "3. Follow the prompts to authenticate",
        "4. Copy the token that is displayed",
        "5. Paste the token in the field below",
      ],
      note: "This token is from your Claude subscription and allows you to use Claude without API charges.",
    };
  }

  /**
   * Extract OAuth token from command output
   * Tries multiple patterns to find the token
   * @param {string} output The command output
   * @returns {string|null} Extracted token or null
   */
  static extractTokenFromOutput(output) {
    // Pattern 1: CLAUDE_CODE_OAUTH_TOKEN=<token> or CLAUDE_CODE_OAUTH_TOKEN: <token>
    const envMatch = output.match(
      /CLAUDE_CODE_OAUTH_TOKEN[=:]\s*["']?([a-zA-Z0-9_\-\.]+)["']?/i
    );
    if (envMatch) return envMatch[1];

    // Pattern 2: "Token: <token>" or "token: <token>"
    const tokenLabelMatch = output.match(
      /\btoken[:\s]+["']?([a-zA-Z0-9_\-\.]{40,})["']?/i
    );
    if (tokenLabelMatch) return tokenLabelMatch[1];

    // Pattern 3: Look for token after success/authenticated message
    const successMatch = output.match(
      /(?:success|authenticated|generated|token is)[^\n]*\n\s*([a-zA-Z0-9_\-\.]{40,})/i
    );
    if (successMatch) return successMatch[1];

    // Pattern 4: Standalone long alphanumeric string on its own line (last resort)
    // This catches tokens that are printed on their own line
    const lines = output.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      // Token should be 40+ chars, alphanumeric with possible hyphens/underscores/dots
      if (/^[a-zA-Z0-9_\-\.]{40,}$/.test(trimmed)) {
        return trimmed;
      }
    }

    return null;
  }

  /**
   * Run claude setup-token command to generate OAuth token
   * Opens an external terminal window since Claude CLI requires TTY for its Ink-based UI
   * @param {Function} onProgress Callback for progress updates
   * @returns {Promise<Object>} Result indicating terminal was opened
   */
  static async runSetupToken(onProgress) {
    const detection = this.detectClaudeInstallation();

    if (!detection.installed) {
      throw {
        success: false,
        error: "Claude CLI is not installed. Please install it first.",
        requiresManualAuth: false,
      };
    }

    const claudePath = detection.path;
    const platform = process.platform;
    const preferPty =
      (platform === "win32" ||
        platform === "darwin" ||
        process.env.CLAUDE_AUTH_FORCE_PTY === "1") &&
      process.env.CLAUDE_AUTH_DISABLE_PTY !== "1";

    const send = (data) => {
      if (onProgress && data) {
        onProgress({ type: "stdout", data });
      }
    };

    if (preferPty && runPtyCommand) {
      try {
        send("Starting in-app terminal session for Claude auth...\n");
        send("If your browser opens, complete sign-in and return here.\n\n");

        const ptyResult = await runPtyCommand(claudePath, ["setup-token"], {
          cols: 120,
          rows: 30,
          onData: (chunk) => send(chunk),
          env: {
            FORCE_COLOR: "1",
          },
        });

        const cleanedOutput = stripAnsi(ptyResult.output || "");
        const token = this.extractTokenFromOutput(cleanedOutput);

        if (ptyResult.success && token) {
          send("\nCaptured token automatically.\n");
          return {
            success: true,
            token,
            requiresManualAuth: false,
            terminalOpened: false,
          };
        }

        if (ptyResult.success && !token) {
          send(
            "\nCLI completed but token was not detected automatically. You can copy it above or retry.\n"
          );
          return {
            success: true,
            requiresManualAuth: true,
            terminalOpened: false,
            error: "Could not capture token automatically",
            output: cleanedOutput,
          };
        }

        send(
          `\nClaude CLI exited with code ${ptyResult.exitCode}. Falling back to manual copy.\n`
        );
        return {
          success: false,
          error: `Claude CLI exited with code ${ptyResult.exitCode}`,
          requiresManualAuth: true,
          output: cleanedOutput,
        };
      } catch (error) {
        console.error("[ClaudeCliDetector] PTY auth failed, falling back:", error);
        send(
          `In-app terminal failed (${error?.message || "unknown error"}). Falling back to external terminal...\n`
        );
      }
    }

    // Fallback: external terminal window
    if (preferPty && !runPtyCommand) {
      send("In-app terminal unavailable (node-pty not loaded).");
    } else if (!preferPty) {
      send("Using system terminal for authentication on this platform.");
    }
    send("Opening system terminal for authentication...\n");

    // Helper function to check if a command exists asynchronously
    const commandExists = (cmd) => {
      return new Promise((resolve) => {
        require("child_process").exec(
          `which ${cmd}`,
          { timeout: 1000 },
          (error) => {
            resolve(!error);
          }
        );
      });
    };

    // For Linux, find available terminal first (async)
    let linuxTerminal = null;
    if (platform !== "win32" && platform !== "darwin") {
      const terminals = [
        ["gnome-terminal", ["--", claudePath, "setup-token"]],
        ["konsole", ["-e", claudePath, "setup-token"]],
        ["xterm", ["-e", claudePath, "setup-token"]],
        ["x-terminal-emulator", ["-e", `${claudePath} setup-token`]],
      ];

      for (const [term, termArgs] of terminals) {
        const exists = await commandExists(term);
        if (exists) {
          linuxTerminal = { command: term, args: termArgs };
          break;
        }
      }
    }

    return new Promise((resolve, reject) => {
      // Open command in external terminal since Claude CLI requires TTY
      let command, args;

      if (platform === "win32") {
        // Windows: Open new cmd window that stays open
        command = "cmd";
        args = ["/c", "start", "cmd", "/k", `"${claudePath}" setup-token`];
      } else if (platform === "darwin") {
        // macOS: Open Terminal.app
        command = "osascript";
        args = [
          "-e",
          `tell application "Terminal" to do script "${claudePath} setup-token"`,
          "-e",
          'tell application "Terminal" to activate',
        ];
      } else {
        // Linux: Use the terminal we found earlier
        if (!linuxTerminal) {
          reject({
            success: false,
            error:
              "Could not find a terminal emulator. Please run 'claude setup-token' manually in your terminal.",
            requiresManualAuth: true,
          });
          return;
        }
        command = linuxTerminal.command;
        args = linuxTerminal.args;
      }

      console.log(
        "[ClaudeCliDetector] Spawning terminal:",
        command,
        args.join(" ")
      );

      const proc = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        shell: platform === "win32",
      });

      proc.unref();

      proc.on("error", (error) => {
        console.error("[ClaudeCliDetector] Failed to open terminal:", error);
        reject({
          success: false,
          error: `Failed to open terminal: ${error.message}`,
          requiresManualAuth: true,
        });
      });

      // Give the terminal a moment to open
      setTimeout(() => {
        send("Terminal window opened!\n\n");
        send("1. Complete the sign-in in your browser\n");
        send("2. Copy the token from the terminal\n");
        send("3. Paste it below\n");

        // Resolve with manual auth required since we can't capture from external terminal
        resolve({
          success: true,
          requiresManualAuth: true,
          terminalOpened: true,
          message:
            "Terminal opened. Complete authentication and paste the token below.",
        });
      }, 500);
    });
  }
}

module.exports = ClaudeCliDetector;
