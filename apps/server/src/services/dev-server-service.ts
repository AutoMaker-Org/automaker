/**
 * Dev Server Service
 *
 * Manages multiple development server processes for git worktrees.
 * Each worktree can have its own dev server running on a unique port.
 *
 * Developers should configure their projects to use the PORT environment variable.
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import * as secureFs from '../lib/secure-fs.js';
import path from 'path';
import net from 'net';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('DevServerService');

// Maximum scrollback buffer size (characters) - matches TerminalService pattern
const MAX_SCROLLBACK_SIZE = 50000; // ~50KB per dev server

// Timeout (ms) before falling back to the allocated port if URL detection hasn't succeeded.
// This handles cases where the dev server output format is not recognized by any pattern.
const URL_DETECTION_TIMEOUT_MS = 30_000;

// URL patterns for detecting full URLs from dev server output.
// Defined once at module level to avoid reallocation on every call to detectUrlFromOutput.
// Ordered from most specific (framework-specific) to least specific.
const URL_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // Vite / Nuxt / SvelteKit / Astro / Angular CLI format: "Local:  http://..."
  {
    pattern: /(?:Local|Network|External):\s+(https?:\/\/[^\s]+)/i,
    description: 'Vite/Nuxt/SvelteKit/Astro/Angular format',
  },
  // Next.js format: "ready - started server on 0.0.0.0:3000, url: http://localhost:3000"
  // Next.js 14+: "▲ Next.js 14.0.0\n- Local: http://localhost:3000"
  {
    pattern: /(?:ready|started server).*?(?:url:\s*)?(https?:\/\/[^\s,]+)/i,
    description: 'Next.js format',
  },
  // Remix format: "started at http://localhost:3000"
  // Django format: "Starting development server at http://127.0.0.1:8000/"
  // Rails / Puma: "Listening on http://127.0.0.1:3000"
  // Generic: "listening at http://...", "available at http://...", "running at http://..."
  {
    pattern:
      /(?:starting|started|listening|running|available|serving|accessible)\s+(?:at|on)\s+(https?:\/\/[^\s,)]+)/i,
    description: 'Generic "starting/started/listening at" format',
  },
  // PHP built-in server: "Development Server (http://localhost:8000) started"
  {
    pattern: /(?:server|development server)\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/i,
    description: 'PHP server format',
  },
  // Webpack Dev Server: "Project is running at http://localhost:8080/"
  {
    pattern: /(?:project|app|application)\s+(?:is\s+)?running\s+(?:at|on)\s+(https?:\/\/[^\s,]+)/i,
    description: 'Webpack/generic "running at" format',
  },
  // Go / Rust / generic: "Serving on http://...", "Server on http://..."
  {
    pattern: /(?:serving|server)\s+(?:on|at)\s+(https?:\/\/[^\s,]+)/i,
    description: 'Generic "serving on" format',
  },
  // Localhost URL with port (conservative - must be localhost/127.0.0.1/[::]/0.0.0.0)
  // This catches anything that looks like a dev server URL
  {
    pattern: /(https?:\/\/(?:localhost|127\.0\.0\.1|\[::\]|0\.0\.0\.0):\d+\S*)/i,
    description: 'Generic localhost URL with port',
  },
];

// Port-only patterns for detecting port numbers from dev server output
// when a full URL is not present in the output.
// Defined once at module level to avoid reallocation on every call to detectUrlFromOutput.
const PORT_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // "listening on port 3000", "server on port 3000", "started on port 3000"
  {
    pattern: /(?:listening|running|started|serving|available)\s+on\s+port\s+(\d+)/i,
    description: '"listening on port" format',
  },
  // "Port: 3000", "port 3000" (at start of line or after whitespace)
  {
    pattern: /(?:^|\s)port[:\s]+(\d{4,5})(?:\s|$|[.,;])/im,
    description: '"port:" format',
  },
];

// Throttle output to prevent overwhelming WebSocket under heavy load
const OUTPUT_THROTTLE_MS = 4; // ~250fps max update rate for responsive feedback
const OUTPUT_BATCH_SIZE = 4096; // Smaller batches for lower latency

export interface DevServerInfo {
  worktreePath: string;
  /** The port originally reserved by findAvailablePort() – never mutated after startDevServer sets it */
  allocatedPort: number;
  port: number;
  url: string;
  process: ChildProcess | null;
  startedAt: Date;
  // Scrollback buffer for log history (replay on reconnect)
  scrollbackBuffer: string;
  // Pending output to be flushed to subscribers
  outputBuffer: string;
  // Throttle timer for batching output
  flushTimeout: NodeJS.Timeout | null;
  // Flag to indicate server is stopping (prevents output after stop)
  stopping: boolean;
  // Flag to indicate if URL has been detected from output
  urlDetected: boolean;
  // Timer for URL detection timeout fallback
  urlDetectionTimeout: NodeJS.Timeout | null;
}

// Port allocation starts at 3001 to avoid conflicts with common dev ports
const BASE_PORT = 3001;
const MAX_PORT = 3099; // Safety limit

// Common livereload ports that may need cleanup when stopping dev servers
const LIVERELOAD_PORTS = [35729, 35730, 35731] as const;

class DevServerService {
  private runningServers: Map<string, DevServerInfo> = new Map();
  private allocatedPorts: Set<number> = new Set();
  private emitter: EventEmitter | null = null;

  /**
   * Set the event emitter for streaming log events
   * Called during service initialization with the global event emitter
   */
  setEventEmitter(emitter: EventEmitter): void {
    this.emitter = emitter;
  }

  /**
   * Prune a stale server entry whose process has exited without cleanup.
   * Clears any pending timers, removes the port from allocatedPorts, deletes
   * the entry from runningServers, and emits the "dev-server:stopped" event
   * so all callers consistently notify the frontend when pruning entries.
   *
   * @param worktreePath - The key used in runningServers
   * @param server - The DevServerInfo entry to prune
   */
  private pruneStaleServer(worktreePath: string, server: DevServerInfo): void {
    if (server.flushTimeout) clearTimeout(server.flushTimeout);
    if (server.urlDetectionTimeout) clearTimeout(server.urlDetectionTimeout);
    // Use allocatedPort (immutable) to free the reserved slot; server.port may have
    // been mutated by detectUrlFromOutput to reflect the actual detected port.
    this.allocatedPorts.delete(server.allocatedPort);
    this.runningServers.delete(worktreePath);
    if (this.emitter) {
      this.emitter.emit('dev-server:stopped', {
        worktreePath,
        port: server.port, // Report the externally-visible (detected) port
        exitCode: server.process?.exitCode ?? null,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Append data to scrollback buffer with size limit enforcement
   * Evicts oldest data when buffer exceeds MAX_SCROLLBACK_SIZE
   */
  private appendToScrollback(server: DevServerInfo, data: string): void {
    server.scrollbackBuffer += data;
    if (server.scrollbackBuffer.length > MAX_SCROLLBACK_SIZE) {
      server.scrollbackBuffer = server.scrollbackBuffer.slice(-MAX_SCROLLBACK_SIZE);
    }
  }

  /**
   * Flush buffered output to WebSocket subscribers
   * Sends batched output to prevent overwhelming clients under heavy load
   */
  private flushOutput(server: DevServerInfo): void {
    // Skip flush if server is stopping or buffer is empty
    if (server.stopping || server.outputBuffer.length === 0) {
      server.flushTimeout = null;
      return;
    }

    let dataToSend = server.outputBuffer;
    if (dataToSend.length > OUTPUT_BATCH_SIZE) {
      // Send in batches if buffer is large
      dataToSend = server.outputBuffer.slice(0, OUTPUT_BATCH_SIZE);
      server.outputBuffer = server.outputBuffer.slice(OUTPUT_BATCH_SIZE);
      // Schedule another flush for remaining data
      server.flushTimeout = setTimeout(() => this.flushOutput(server), OUTPUT_THROTTLE_MS);
    } else {
      server.outputBuffer = '';
      server.flushTimeout = null;
    }

    // Emit output event for WebSocket streaming
    if (this.emitter) {
      this.emitter.emit('dev-server:output', {
        worktreePath: server.worktreePath,
        content: dataToSend,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Strip ANSI escape codes from a string
   * Dev server output often contains color codes that can interfere with URL detection
   */
  private stripAnsi(str: string): string {
    // Matches ANSI escape sequences: CSI sequences, OSC sequences, and simple escapes
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B(?:\[[0-9;]*[a-zA-Z]|\].*?(?:\x07|\x1B\\)|\[[?]?[0-9;]*[hl])/g, '');
  }

  /**
   * Extract port number from a URL string.
   * Returns the explicit port if present, or null if no port is specified.
   * Default protocol ports (80/443) are intentionally NOT returned to avoid
   * overwriting allocated dev server ports with protocol defaults.
   */
  private extractPortFromUrl(url: string): number | null {
    try {
      const parsed = new URL(url);
      if (parsed.port) {
        return parseInt(parsed.port, 10);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Detect actual server URL from output
   * Parses stdout/stderr for common URL patterns from dev servers.
   *
   * Supports detection of URLs from:
   * - Vite: "Local:   http://localhost:5173/"
   * - Next.js: "ready - started server on 0.0.0.0:3000, url: http://localhost:3000"
   * - Nuxt: "Local:    http://localhost:3000/"
   * - Remix: "started at http://localhost:3000"
   * - Astro: "Local    http://localhost:4321/"
   * - SvelteKit: "Local:   http://localhost:5173/"
   * - CRA/Webpack: "On Your Network: http://192.168.1.1:3000"
   * - Angular: "Local:   http://localhost:4200/"
   * - Express/Fastify/Koa: "Server listening on port 3000"
   * - Django: "Starting development server at http://127.0.0.1:8000/"
   * - Rails: "Listening on http://127.0.0.1:3000"
   * - PHP: "Development Server (http://localhost:8000) started"
   * - Generic: Any localhost URL with a port
   */
  private detectUrlFromOutput(server: DevServerInfo, content: string): void {
    // Skip if URL already detected
    if (server.urlDetected) {
      return;
    }

    // Strip ANSI escape codes to prevent color codes from breaking regex matching
    const cleanContent = this.stripAnsi(content);

    // Phase 1: Try to detect a full URL from output
    // Patterns are defined at module level (URL_PATTERNS) and reused across calls
    for (const { pattern, description } of URL_PATTERNS) {
      const match = cleanContent.match(pattern);
      if (match && match[1]) {
        let detectedUrl = match[1].trim();
        // Remove trailing punctuation that might have been captured
        detectedUrl = detectedUrl.replace(/[.,;:!?)\]}>]+$/, '');

        if (detectedUrl.startsWith('http://') || detectedUrl.startsWith('https://')) {
          // Normalize 0.0.0.0 to localhost for browser accessibility
          detectedUrl = detectedUrl.replace(
            /\/\/0\.0\.0\.0(:\d+)?/,
            (_, port) => `//localhost${port || ''}`
          );
          // Normalize [::] to localhost for browser accessibility
          detectedUrl = detectedUrl.replace(
            /\/\/\[::\](:\d+)?/,
            (_, port) => `//localhost${port || ''}`
          );
          // Normalize [::1] (IPv6 loopback) to localhost for browser accessibility
          detectedUrl = detectedUrl.replace(
            /\/\/\[::1\](:\d+)?/,
            (_, port) => `//localhost${port || ''}`
          );

          server.url = detectedUrl;
          server.urlDetected = true;

          // Clear the URL detection timeout since we found the URL
          if (server.urlDetectionTimeout) {
            clearTimeout(server.urlDetectionTimeout);
            server.urlDetectionTimeout = null;
          }

          // Update the port to match the detected URL's actual port
          const detectedPort = this.extractPortFromUrl(detectedUrl);
          if (detectedPort && detectedPort !== server.port) {
            logger.info(
              `Port mismatch: allocated ${server.port}, detected ${detectedPort} from ${description}`
            );
            server.port = detectedPort;
          }

          logger.info(`Detected server URL via ${description}: ${detectedUrl}`);

          // Emit URL update event
          if (this.emitter) {
            this.emitter.emit('dev-server:url-detected', {
              worktreePath: server.worktreePath,
              url: detectedUrl,
              port: server.port,
              timestamp: new Date().toISOString(),
            });
          }
          return;
        }
      }
    }

    // Phase 2: Try to detect just a port number from output (no full URL)
    // Some servers only print "listening on port 3000" without a full URL
    // Patterns are defined at module level (PORT_PATTERNS) and reused across calls
    for (const { pattern, description } of PORT_PATTERNS) {
      const match = cleanContent.match(pattern);
      if (match && match[1]) {
        const detectedPort = parseInt(match[1], 10);
        // Sanity check: port should be in a reasonable range
        if (detectedPort > 0 && detectedPort <= 65535) {
          const detectedUrl = `http://localhost:${detectedPort}`;
          server.url = detectedUrl;
          server.urlDetected = true;

          // Clear the URL detection timeout since we found the port
          if (server.urlDetectionTimeout) {
            clearTimeout(server.urlDetectionTimeout);
            server.urlDetectionTimeout = null;
          }

          if (detectedPort !== server.port) {
            logger.info(
              `Port mismatch: allocated ${server.port}, detected ${detectedPort} from ${description}`
            );
            server.port = detectedPort;
          }

          logger.info(`Detected server port via ${description}: ${detectedPort} → ${detectedUrl}`);

          // Emit URL update event
          if (this.emitter) {
            this.emitter.emit('dev-server:url-detected', {
              worktreePath: server.worktreePath,
              url: detectedUrl,
              port: server.port,
              timestamp: new Date().toISOString(),
            });
          }
          return;
        }
      }
    }
  }

  /**
   * Handle incoming stdout/stderr data from dev server process
   * Buffers data for scrollback replay and schedules throttled emission
   */
  private handleProcessOutput(server: DevServerInfo, data: Buffer): void {
    // Skip output if server is stopping
    if (server.stopping) {
      return;
    }

    const content = data.toString();

    // Try to detect actual server URL from output
    this.detectUrlFromOutput(server, content);

    // Append to scrollback buffer for replay on reconnect
    this.appendToScrollback(server, content);

    // Buffer output for throttled live delivery
    server.outputBuffer += content;

    // Schedule flush if not already scheduled
    if (!server.flushTimeout) {
      server.flushTimeout = setTimeout(() => this.flushOutput(server), OUTPUT_THROTTLE_MS);
    }

    // Also log for debugging (existing behavior)
    logger.debug(`[Port${server.port}] ${content.trim()}`);
  }

  /**
   * Check if a port is available (not in use by system or by us)
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    // First check if we've already allocated it
    if (this.allocatedPorts.has(port)) {
      return false;
    }

    // Then check if the system has it in use
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Kill any process running on the given port
   */
  private killProcessOnPort(port: number): void {
    try {
      if (process.platform === 'win32') {
        // Windows: find and kill process on port
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
        const lines = result.trim().split('\n');
        const pids = new Set<string>();
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            pids.add(pid);
          }
        }
        for (const pid of pids) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            logger.debug(`Killed process ${pid} on port ${port}`);
          } catch {
            // Process may have already exited
          }
        }
      } else {
        // macOS/Linux: use lsof to find and kill process
        try {
          const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' });
          const pids = result.trim().split('\n').filter(Boolean);
          for (const pid of pids) {
            try {
              execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
              logger.debug(`Killed process ${pid} on port ${port}`);
            } catch {
              // Process may have already exited
            }
          }
        } catch {
          // No process found on port, which is fine
        }
      }
    } catch {
      // Ignore errors - port might not have any process
      logger.debug(`No process to kill on port ${port}`);
    }
  }

  /**
   * Find the next available port, killing any process on it first
   */
  private async findAvailablePort(): Promise<number> {
    let port = BASE_PORT;

    while (port <= MAX_PORT) {
      // Skip ports we've already allocated internally
      if (this.allocatedPorts.has(port)) {
        port++;
        continue;
      }

      // Force kill any process on this port before checking availability
      // This ensures we can claim the port even if something stale is holding it
      this.killProcessOnPort(port);

      // Small delay to let the port be released
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now check if it's available
      if (await this.isPortAvailable(port)) {
        return port;
      }
      port++;
    }

    throw new Error(`No available ports found between ${BASE_PORT} and ${MAX_PORT}`);
  }

  /**
   * Helper to check if a file exists using secureFs
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await secureFs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect the package manager used in a directory
   */
  private async detectPackageManager(dir: string): Promise<'npm' | 'yarn' | 'pnpm' | 'bun' | null> {
    if (await this.fileExists(path.join(dir, 'bun.lockb'))) return 'bun';
    if (await this.fileExists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await this.fileExists(path.join(dir, 'yarn.lock'))) return 'yarn';
    if (await this.fileExists(path.join(dir, 'package-lock.json'))) return 'npm';
    if (await this.fileExists(path.join(dir, 'package.json'))) return 'npm'; // Default
    return null;
  }

  /**
   * Get the dev script command for a directory
   */
  private async getDevCommand(dir: string): Promise<{ cmd: string; args: string[] } | null> {
    const pm = await this.detectPackageManager(dir);
    if (!pm) return null;

    switch (pm) {
      case 'bun':
        return { cmd: 'bun', args: ['run', 'dev'] };
      case 'pnpm':
        return { cmd: 'pnpm', args: ['run', 'dev'] };
      case 'yarn':
        return { cmd: 'yarn', args: ['dev'] };
      case 'npm':
      default:
        return { cmd: 'npm', args: ['run', 'dev'] };
    }
  }

  /**
   * Parse a custom command string into cmd and args
   * Handles quoted strings with spaces (e.g., "my command" arg1 arg2)
   */
  private parseCustomCommand(command: string): { cmd: string; args: string[] } {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (inQuote) {
        if (char === quoteChar) {
          inQuote = false;
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        inQuote = true;
        quoteChar = char;
      } else if (char === ' ') {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    const [cmd, ...args] = tokens;
    return { cmd: cmd || '', args };
  }

  /**
   * Start a dev server for a worktree
   * @param projectPath - The project root path
   * @param worktreePath - The worktree directory path
   * @param customCommand - Optional custom command to run instead of auto-detected dev command
   */
  async startDevServer(
    projectPath: string,
    worktreePath: string,
    customCommand?: string
  ): Promise<{
    success: boolean;
    result?: {
      worktreePath: string;
      port: number;
      url: string;
      message: string;
    };
    error?: string;
  }> {
    // Check if already running
    if (this.runningServers.has(worktreePath)) {
      const existing = this.runningServers.get(worktreePath)!;
      return {
        success: true,
        result: {
          worktreePath: existing.worktreePath,
          port: existing.port,
          url: existing.url,
          message: `Dev server already running on port ${existing.port}`,
        },
      };
    }

    // Verify the worktree exists
    if (!(await this.fileExists(worktreePath))) {
      return {
        success: false,
        error: `Worktree path does not exist: ${worktreePath}`,
      };
    }

    // Determine the dev command to use
    let devCommand: { cmd: string; args: string[] };

    // Normalize custom command: trim whitespace and treat empty strings as undefined
    const normalizedCustomCommand = customCommand?.trim();

    if (normalizedCustomCommand) {
      // Use the provided custom command
      devCommand = this.parseCustomCommand(normalizedCustomCommand);
      if (!devCommand.cmd) {
        return {
          success: false,
          error: 'Invalid custom command: command cannot be empty',
        };
      }
      logger.debug(`Using custom command: ${normalizedCustomCommand}`);
    } else {
      // Check for package.json when auto-detecting
      const packageJsonPath = path.join(worktreePath, 'package.json');
      if (!(await this.fileExists(packageJsonPath))) {
        return {
          success: false,
          error: `No package.json found in: ${worktreePath}`,
        };
      }

      // Get dev command from package manager detection
      const detectedCommand = await this.getDevCommand(worktreePath);
      if (!detectedCommand) {
        return {
          success: false,
          error: `Could not determine dev command for: ${worktreePath}`,
        };
      }
      devCommand = detectedCommand;
    }

    // Find available port
    let port: number;
    try {
      port = await this.findAvailablePort();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Port allocation failed',
      };
    }

    // Reserve the port (port was already force-killed in findAvailablePort)
    this.allocatedPorts.add(port);

    // Also kill common related ports (livereload, etc.)
    // Some dev servers use fixed ports for HMR/livereload regardless of main port
    for (const relatedPort of LIVERELOAD_PORTS) {
      this.killProcessOnPort(relatedPort);
    }

    // Small delay to ensure related ports are freed
    await new Promise((resolve) => setTimeout(resolve, 100));

    logger.info(`Starting dev server on port ${port}`);
    logger.debug(`Working directory (cwd): ${worktreePath}`);
    logger.debug(`Command: ${devCommand.cmd} ${devCommand.args.join(' ')} with PORT=${port}`);

    // Spawn the dev process with PORT environment variable
    // FORCE_COLOR enables colored output even when not running in a TTY
    const env = {
      ...process.env,
      PORT: String(port),
      FORCE_COLOR: '1',
      // Some tools use these additional env vars for color detection
      COLORTERM: 'truecolor',
      TERM: 'xterm-256color',
    };

    const devProcess = spawn(devCommand.cmd, devCommand.args, {
      cwd: worktreePath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Track if process failed early using object to work around TypeScript narrowing
    const status = { error: null as string | null, exited: false };

    // Create server info early so we can reference it in handlers
    // We'll add it to runningServers after verifying the process started successfully
    const hostname = process.env.HOSTNAME || 'localhost';
    const serverInfo: DevServerInfo = {
      worktreePath,
      allocatedPort: port, // Immutable: records which port we reserved; never changed after this point
      port,
      url: `http://${hostname}:${port}`, // Initial URL, may be updated by detectUrlFromOutput
      process: devProcess,
      startedAt: new Date(),
      scrollbackBuffer: '',
      outputBuffer: '',
      flushTimeout: null,
      stopping: false,
      urlDetected: false, // Will be set to true when actual URL is detected from output
      urlDetectionTimeout: null, // Will be set after server starts successfully
    };

    // Capture stdout with buffer management and event emission
    if (devProcess.stdout) {
      devProcess.stdout.on('data', (data: Buffer) => {
        this.handleProcessOutput(serverInfo, data);
      });
    }

    // Capture stderr with buffer management and event emission
    if (devProcess.stderr) {
      devProcess.stderr.on('data', (data: Buffer) => {
        this.handleProcessOutput(serverInfo, data);
      });
    }

    // Helper to clean up resources and emit stop event
    const cleanupAndEmitStop = (exitCode: number | null, errorMessage?: string) => {
      if (serverInfo.flushTimeout) {
        clearTimeout(serverInfo.flushTimeout);
        serverInfo.flushTimeout = null;
      }

      // Clear URL detection timeout to prevent stale fallback emission
      if (serverInfo.urlDetectionTimeout) {
        clearTimeout(serverInfo.urlDetectionTimeout);
        serverInfo.urlDetectionTimeout = null;
      }

      // Emit stopped event (only if not already stopping - prevents duplicate events)
      if (this.emitter && !serverInfo.stopping) {
        this.emitter.emit('dev-server:stopped', {
          worktreePath,
          port: serverInfo.port, // Use the detected port (may differ from allocated port if detectUrlFromOutput updated it)
          exitCode,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }

      this.allocatedPorts.delete(serverInfo.allocatedPort);
      this.runningServers.delete(worktreePath);
    };

    devProcess.on('error', (error) => {
      logger.error(`Process error:`, error);
      status.error = error.message;
      cleanupAndEmitStop(null, error.message);
    });

    devProcess.on('exit', (code) => {
      logger.info(`Process for ${worktreePath} exited with code ${code}`);
      status.exited = true;
      cleanupAndEmitStop(code);
    });

    // Wait a moment to see if the process fails immediately
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (status.error) {
      return {
        success: false,
        error: `Failed to start dev server: ${status.error}`,
      };
    }

    if (status.exited) {
      return {
        success: false,
        error: `Dev server process exited immediately. Check server logs for details.`,
      };
    }

    // Server started successfully - add to running servers map
    this.runningServers.set(worktreePath, serverInfo);

    // Emit started event for WebSocket subscribers
    if (this.emitter) {
      this.emitter.emit('dev-server:started', {
        worktreePath,
        port,
        url: serverInfo.url,
        timestamp: new Date().toISOString(),
      });
    }

    // Set up URL detection timeout fallback.
    // If URL detection hasn't succeeded after URL_DETECTION_TIMEOUT_MS, check if
    // the allocated port is actually in use (server probably started successfully)
    // and emit a url-detected event with the allocated port as fallback.
    // Also re-scan the scrollback buffer in case the URL was printed before
    // our patterns could match (e.g., it was split across multiple data chunks).
    serverInfo.urlDetectionTimeout = setTimeout(() => {
      serverInfo.urlDetectionTimeout = null;

      // Only run fallback if server is still running and URL wasn't detected
      if (serverInfo.stopping || serverInfo.urlDetected || !this.runningServers.has(worktreePath)) {
        return;
      }

      // Re-scan the entire scrollback buffer for URL patterns
      // This catches cases where the URL was split across multiple output chunks
      logger.info(`URL detection timeout for ${worktreePath}, re-scanning scrollback buffer`);
      this.detectUrlFromOutput(serverInfo, serverInfo.scrollbackBuffer);

      // If still not detected after full rescan, use the allocated port as fallback
      if (!serverInfo.urlDetected) {
        logger.info(`URL detection fallback: using allocated port ${port} for ${worktreePath}`);
        const fallbackUrl = `http://${hostname}:${port}`;
        serverInfo.url = fallbackUrl;
        serverInfo.urlDetected = true;

        if (this.emitter) {
          this.emitter.emit('dev-server:url-detected', {
            worktreePath,
            url: fallbackUrl,
            port,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }, URL_DETECTION_TIMEOUT_MS);

    return {
      success: true,
      result: {
        worktreePath,
        port,
        url: `http://${hostname}:${port}`,
        message: `Dev server started on port ${port}`,
      },
    };
  }

  /**
   * Stop a dev server for a worktree
   */
  async stopDevServer(worktreePath: string): Promise<{
    success: boolean;
    result?: { worktreePath: string; message: string };
    error?: string;
  }> {
    const server = this.runningServers.get(worktreePath);

    // If we don't have a record of this server, it may have crashed/exited on its own
    // Return success so the frontend can clear its state
    if (!server) {
      logger.debug(`No server record for ${worktreePath}, may have already stopped`);
      return {
        success: true,
        result: {
          worktreePath,
          message: `Dev server already stopped`,
        },
      };
    }

    logger.info(`Stopping dev server for ${worktreePath}`);

    // Mark as stopping to prevent further output events
    server.stopping = true;

    // Clean up flush timeout to prevent memory leaks
    if (server.flushTimeout) {
      clearTimeout(server.flushTimeout);
      server.flushTimeout = null;
    }

    // Clean up URL detection timeout
    if (server.urlDetectionTimeout) {
      clearTimeout(server.urlDetectionTimeout);
      server.urlDetectionTimeout = null;
    }

    // Clear any pending output buffer
    server.outputBuffer = '';

    // Emit stopped event immediately so UI updates right away
    if (this.emitter) {
      this.emitter.emit('dev-server:stopped', {
        worktreePath,
        port: server.port,
        exitCode: null, // Will be populated by exit handler if process exits normally
        timestamp: new Date().toISOString(),
      });
    }

    // Kill the process
    if (server.process && !server.process.killed) {
      server.process.kill('SIGTERM');
    }

    // Free the originally-reserved port slot (allocatedPort is immutable and always
    // matches what was added to allocatedPorts in startDevServer; server.port may
    // have been updated by detectUrlFromOutput to the actual detected port).
    this.allocatedPorts.delete(server.allocatedPort);
    this.runningServers.delete(worktreePath);

    return {
      success: true,
      result: {
        worktreePath,
        message: `Stopped dev server on port ${server.port}`,
      },
    };
  }

  /**
   * List all running dev servers
   * Also verifies that each server's process is still alive, removing stale entries
   */
  listDevServers(): {
    success: boolean;
    result: {
      servers: Array<{
        worktreePath: string;
        port: number;
        url: string;
        urlDetected: boolean;
        startedAt: string;
      }>;
    };
  } {
    // Prune any servers whose process has died without us being notified
    // This handles edge cases where the process exited but the 'exit' event was missed
    const stalePaths: string[] = [];
    for (const [worktreePath, server] of this.runningServers) {
      // Check if exitCode is a number (not null/undefined) - indicates process has exited
      if (server.process && typeof server.process.exitCode === 'number') {
        logger.info(
          `Pruning stale server entry for ${worktreePath} (process exited with code ${server.process.exitCode})`
        );
        stalePaths.push(worktreePath);
      }
    }
    for (const stalePath of stalePaths) {
      const server = this.runningServers.get(stalePath);
      if (server) {
        // Delegate to the shared helper so timers, ports, and the stopped event
        // are all handled consistently with isRunning and getServerInfo.
        this.pruneStaleServer(stalePath, server);
      }
    }

    const servers = Array.from(this.runningServers.values()).map((s) => ({
      worktreePath: s.worktreePath,
      port: s.port,
      url: s.url,
      urlDetected: s.urlDetected,
      startedAt: s.startedAt.toISOString(),
    }));

    return {
      success: true,
      result: { servers },
    };
  }

  /**
   * Check if a worktree has a running dev server.
   * Also prunes stale entries where the process has exited.
   */
  isRunning(worktreePath: string): boolean {
    const server = this.runningServers.get(worktreePath);
    if (!server) return false;
    // Prune stale entry if the process has exited
    if (server.process && typeof server.process.exitCode === 'number') {
      this.pruneStaleServer(worktreePath, server);
      return false;
    }
    return true;
  }

  /**
   * Get info for a specific worktree's dev server.
   * Also prunes stale entries where the process has exited.
   */
  getServerInfo(worktreePath: string): DevServerInfo | undefined {
    const server = this.runningServers.get(worktreePath);
    if (!server) return undefined;
    // Prune stale entry if the process has exited
    if (server.process && typeof server.process.exitCode === 'number') {
      this.pruneStaleServer(worktreePath, server);
      return undefined;
    }
    return server;
  }

  /**
   * Get buffered logs for a worktree's dev server
   * Returns the scrollback buffer containing historical log output
   * Used by the API to serve logs to clients on initial connection
   */
  getServerLogs(worktreePath: string): {
    success: boolean;
    result?: {
      worktreePath: string;
      port: number;
      url: string;
      logs: string;
      startedAt: string;
    };
    error?: string;
  } {
    const server = this.runningServers.get(worktreePath);

    if (!server) {
      return {
        success: false,
        error: `No dev server running for worktree: ${worktreePath}`,
      };
    }

    // Prune stale entry if the process has been killed or has exited
    if (server.process && (server.process.killed || server.process.exitCode != null)) {
      this.pruneStaleServer(worktreePath, server);
      return {
        success: false,
        error: `No dev server running for worktree: ${worktreePath}`,
      };
    }

    return {
      success: true,
      result: {
        worktreePath: server.worktreePath,
        port: server.port,
        url: server.url,
        logs: server.scrollbackBuffer,
        startedAt: server.startedAt.toISOString(),
      },
    };
  }

  /**
   * Get all allocated ports
   */
  getAllocatedPorts(): number[] {
    return Array.from(this.allocatedPorts);
  }

  /**
   * Stop all running dev servers (for cleanup)
   */
  async stopAll(): Promise<void> {
    logger.info(`Stopping all ${this.runningServers.size} dev servers`);

    for (const [worktreePath] of this.runningServers) {
      await this.stopDevServer(worktreePath);
    }
  }
}

// Singleton instance
let devServerServiceInstance: DevServerService | null = null;

export function getDevServerService(): DevServerService {
  if (!devServerServiceInstance) {
    devServerServiceInstance = new DevServerService();
  }
  return devServerServiceInstance;
}

// Cleanup on process exit
process.on('SIGTERM', async () => {
  if (devServerServiceInstance) {
    await devServerServiceInstance.stopAll();
  }
});

process.on('SIGINT', async () => {
  if (devServerServiceInstance) {
    await devServerServiceInstance.stopAll();
  }
});
