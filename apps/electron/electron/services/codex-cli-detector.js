const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Codex CLI Detector - Checks if OpenAI Codex CLI is installed
 *
 * Codex CLI is OpenAI's agent CLI tool that allows users to use
 * GPT-5.1 Codex models (gpt-5.1-codex-max, gpt-5.1-codex, etc.)
 * for code generation and agentic tasks.
 */
class CodexCliDetector {
  /**
   * Get the path to Codex config directory
   * @returns {string} Path to .codex directory
   */
  static getConfigDir() {
    return path.join(os.homedir(), '.codex');
  }

  /**
   * Get the path to Codex auth file
   * @returns {string} Path to auth.json
   */
  static getAuthPath() {
    return path.join(this.getConfigDir(), 'auth.json');
  }

  /**
   * Check Codex authentication status
   * @returns {Object} Authentication status
   */
  static checkAuth() {
    try {
      const authPath = this.getAuthPath();
      const envApiKey = process.env.OPENAI_API_KEY;

      // Try to verify authentication using codex CLI command if available
      try {
        const detection = this.detectCodexInstallation();
        if (detection.installed) {
          try {
            const statusOutput = execSync(`"${detection.path || 'codex'}" login status 2>/dev/null`, {
              encoding: 'utf-8',
              timeout: 5000
            });

            if (statusOutput && (statusOutput.includes('Logged in') || statusOutput.includes('Authenticated'))) {
              return {
                authenticated: true,
                method: 'cli_verified',
                hasAuthFile: fs.existsSync(authPath),
                hasEnvKey: !!envApiKey,
                authPath
              };
            }
          } catch (statusError) {
            // status command failed, continue with file-based check
          }
        }
      } catch (verifyError) {
        // CLI verification failed, continue with file-based check
      }

      // Check if auth file exists
      if (fs.existsSync(authPath)) {
        let auth = null;
        try {
          const content = fs.readFileSync(authPath, 'utf-8');
          auth = JSON.parse(content);

          // Check for token object structure
          if (auth.token && typeof auth.token === 'object') {
            const token = auth.token;
            if (token.Id_token || token.access_token || token.refresh_token || token.id_token) {
              return {
                authenticated: true,
                method: 'cli_tokens',
                hasAuthFile: true,
                hasEnvKey: !!envApiKey,
                authPath
              };
            }
          }

          // Check for tokens at root level
          if (auth.access_token || auth.refresh_token || auth.Id_token || auth.id_token) {
            return {
              authenticated: true,
              method: 'cli_tokens',
              hasAuthFile: true,
              hasEnvKey: !!envApiKey,
              authPath
            };
          }

          // Check for API key fields
          if (auth.api_key || auth.openai_api_key || auth.apiKey) {
            return {
              authenticated: true,
              method: 'auth_file',
              hasAuthFile: true,
              hasEnvKey: !!envApiKey,
              authPath
            };
          }
        } catch (error) {
          return {
            authenticated: false,
            method: 'none',
            hasAuthFile: false,
            hasEnvKey: !!envApiKey,
            authPath
          };
        }

        if (!auth) {
          return {
            authenticated: false,
            method: 'none',
            hasAuthFile: true,
            hasEnvKey: !!envApiKey,
            authPath
          };
        }

        const keys = Object.keys(auth);
        if (keys.length > 0) {
          const hasTokens = keys.some(key =>
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('refresh') ||
            (auth[key] && typeof auth[key] === 'object' && (
              auth[key].access_token || auth[key].refresh_token || auth[key].Id_token || auth[key].id_token
            ))
          );

          if (hasTokens) {
            return {
              authenticated: true,
              method: 'cli_tokens',
              hasAuthFile: true,
              hasEnvKey: !!envApiKey,
              authPath
            };
          }

          // File exists and has content - check if it's tokens or API key
          const likelyTokens = keys.some(key => key.toLowerCase().includes('token') || key.toLowerCase().includes('refresh'));
          return {
            authenticated: true,
            method: likelyTokens ? 'cli_tokens' : 'auth_file',
            hasAuthFile: true,
            hasEnvKey: !!envApiKey,
            authPath
          };
        }
      }

      // Check environment variable
      if (envApiKey) {
        return {
          authenticated: true,
          method: 'env_var',
          hasAuthFile: false,
          hasEnvKey: true,
          authPath
        };
      }

      return {
        authenticated: false,
        method: 'none',
        hasAuthFile: false,
        hasEnvKey: false,
        authPath
      };
    } catch (error) {
      return {
        authenticated: false,
        method: 'none',
        error: error.message
      };
    }
  }
  /**
   * Check if Codex CLI is installed and accessible
   * @returns {Object} { installed: boolean, path: string|null, version: string|null, method: 'cli'|'npm'|'brew'|'none' }
   */
  static detectCodexInstallation() {
    try {
      // Method 1: Check if 'codex' command is in PATH
      try {
        const codexPath = execSync('which codex 2>/dev/null', { encoding: 'utf-8' }).trim();
        if (codexPath) {
          const version = this.getCodexVersion(codexPath);
          return {
            installed: true,
            path: codexPath,
            version: version,
            method: 'cli'
          };
        }
      } catch (error) {
        // CLI not in PATH, continue checking other methods
      }

      // Method 2: Check for npm global installation
      try {
        const npmListOutput = execSync('npm list -g @openai/codex --depth=0 2>/dev/null', { encoding: 'utf-8' });
        if (npmListOutput && npmListOutput.includes('@openai/codex')) {
          // Get the path from npm bin
          const npmBinPath = execSync('npm bin -g', { encoding: 'utf-8' }).trim();
          const codexPath = path.join(npmBinPath, 'codex');
          const version = this.getCodexVersion(codexPath);
          return {
            installed: true,
            path: codexPath,
            version: version,
            method: 'npm'
          };
        }
      } catch (error) {
        // npm global not found
      }

      // Method 3: Check for Homebrew installation on macOS
      if (process.platform === 'darwin') {
        try {
          const brewList = execSync('brew list --formula 2>/dev/null', { encoding: 'utf-8' });
          if (brewList.includes('codex')) {
            const brewPrefixOutput = execSync('brew --prefix codex 2>/dev/null', { encoding: 'utf-8' }).trim();
            const codexPath = path.join(brewPrefixOutput, 'bin', 'codex');
            const version = this.getCodexVersion(codexPath);
            return {
              installed: true,
              path: codexPath,
              version: version,
              method: 'brew'
            };
          }
        } catch (error) {
          // Homebrew not found or codex not installed via brew
        }
      }

      // Method 4: Check Windows path
      if (process.platform === 'win32') {
        try {
          const codexPath = execSync('where codex 2>nul', { encoding: 'utf-8' }).trim().split('\n')[0];
          if (codexPath) {
            const version = this.getCodexVersion(codexPath);
            return {
              installed: true,
              path: codexPath,
              version: version,
              method: 'cli'
            };
          }
        } catch (error) {
          // Not found on Windows
        }
      }

      // Method 5: Check common installation paths
      const commonPaths = [
        path.join(os.homedir(), '.local', 'bin', 'codex'),
        path.join(os.homedir(), '.npm-global', 'bin', 'codex'),
        '/usr/local/bin/codex',
        '/opt/homebrew/bin/codex',
      ];

      for (const checkPath of commonPaths) {
        if (fs.existsSync(checkPath)) {
          const version = this.getCodexVersion(checkPath);
          return {
            installed: true,
            path: checkPath,
            version: version,
            method: 'cli'
          };
        }
      }

      // Method 6: Check if OPENAI_API_KEY is set (can use Codex API directly)
      if (process.env.OPENAI_API_KEY) {
        return {
          installed: false,
          path: null,
          version: null,
          method: 'api-key-only',
          hasApiKey: true
        };
      }

      return {
        installed: false,
        path: null,
        version: null,
        method: 'none'
      };
    } catch (error) {
      // Error detecting Codex installation
      return {
        installed: false,
        path: null,
        version: null,
        method: 'none',
        error: error.message
      };
    }
  }

  /**
   * Get Codex CLI version from executable path
   * @param {string} codexPath Path to codex executable
   * @returns {string|null} Version string or null
   */
  static getCodexVersion(codexPath) {
    try {
      const version = execSync(`"${codexPath}" --version 2>/dev/null`, { encoding: 'utf-8' }).trim();
      return version || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get installation info and recommendations
   * @returns {Object} Installation status and recommendations
   */
  static getInstallationInfo() {
    const detection = this.detectCodexInstallation();

    if (detection.installed) {
      return {
        status: 'installed',
        method: detection.method,
        version: detection.version,
        path: detection.path,
        recommendation: detection.method === 'cli'
          ? 'Using Codex CLI - ready for GPT-5.1 Codex models'
          : `Using Codex CLI via ${detection.method} - ready for GPT-5.1 Codex models`
      };
    }

    // Not installed but has API key
    if (detection.method === 'api-key-only') {
      return {
        status: 'api_key_only',
        method: 'api-key-only',
        recommendation: 'OPENAI_API_KEY detected but Codex CLI not installed. Install Codex CLI for full agentic capabilities.',
        installCommands: this.getInstallCommands()
      };
    }

    return {
      status: 'not_installed',
      recommendation: 'Install OpenAI Codex CLI to use GPT-5.1 Codex models for agentic tasks',
      installCommands: this.getInstallCommands()
    };
  }

  /**
   * Get installation commands for different platforms
   * @returns {Object} Installation commands by platform
   */
  static getInstallCommands() {
    return {
      npm: 'npm install -g @openai/codex@latest',
      macos: 'brew install codex',
      linux: 'npm install -g @openai/codex@latest',
      windows: 'npm install -g @openai/codex@latest'
    };
  }

  /**
   * Check if Codex CLI supports a specific model
   * @param {string} model Model name to check
   * @returns {boolean} Whether the model is supported
   */
  static isModelSupported(model) {
    const supportedModels = [
      'gpt-5.1-codex-max',
      'gpt-5.1-codex',
      'gpt-5.1-codex-mini',
      'gpt-5.1'
    ];
    return supportedModels.includes(model);
  }

  /**
   * Get default model for Codex CLI
   * @returns {string} Default model name
   */
  static getDefaultModel() {
    return 'gpt-5.1-codex-max';
  }

  /**
   * Get comprehensive installation info including auth status
   * @returns {Object} Full status object
   */
  static getFullStatus() {
    const installation = this.detectCodexInstallation();
    const auth = this.checkAuth();
    const info = this.getInstallationInfo();

    return {
      ...info,
      auth,
      installation
    };
  }

  /**
   * Install Codex CLI using npm
   * @param {Function} onProgress Callback for progress updates
   * @returns {Promise<Object>} Installation result
   */
  static async installCli(onProgress) {
    return new Promise((resolve, reject) => {
      const command = 'npm';
      const args = ['install', '-g', '@openai/codex@latest'];

      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (onProgress) {
          onProgress({ type: 'stdout', data: text });
        }
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        // npm often outputs progress to stderr
        if (onProgress) {
          onProgress({ type: 'stderr', data: text });
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            output,
            message: 'Codex CLI installed successfully'
          });
        } else {
          reject({
            success: false,
            error: errorOutput || `Installation failed with code ${code}`,
            output
          });
        }
      });

      proc.on('error', (error) => {
        reject({
          success: false,
          error: error.message,
          output
        });
      });
    });
  }

  /**
   * Authenticate Codex CLI - opens browser for OAuth or stores API key
   * @param {string} apiKey Optional API key to store
   * @param {Function} onProgress Callback for progress updates
   * @returns {Promise<Object>} Authentication result
   */
  static async authenticate(apiKey, onProgress) {
    return new Promise((resolve, reject) => {
      const detection = this.detectCodexInstallation();

      if (!detection.installed) {
        reject({
          success: false,
          error: 'Codex CLI is not installed'
        });
        return;
      }

      const codexPath = detection.path || 'codex';

      if (apiKey) {
        // Store API key directly using codex auth command
        const proc = spawn(codexPath, ['auth', 'login', '--api-key', apiKey], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false
        });

        let output = '';
        let errorOutput = '';

        proc.stdout.on('data', (data) => {
          const text = data.toString();
          output += text;
          if (onProgress) {
            onProgress({ type: 'stdout', data: text });
          }
        });

        proc.stderr.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          if (onProgress) {
            onProgress({ type: 'stderr', data: text });
          }
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              output,
              message: 'Codex CLI authenticated successfully'
            });
          } else {
            reject({
              success: false,
              error: errorOutput || `Authentication failed with code ${code}`,
              output
            });
          }
        });

        proc.on('error', (error) => {
          reject({
            success: false,
            error: error.message,
            output
          });
        });
      } else {
        // Require manual authentication
        if (onProgress) {
          onProgress({
            type: 'info',
            data: 'Please run the following command in your terminal to authenticate:\n\ncodex auth login\n\nThen return here to continue setup.'
          });
        }

        resolve({
          success: true,
          requiresManualAuth: true,
          command: `${codexPath} auth login`,
          message: 'Please authenticate Codex CLI manually'
        });
      }
    });
  }
}

module.exports = CodexCliDetector;
