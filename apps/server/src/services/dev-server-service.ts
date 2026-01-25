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

// Throttle output to prevent overwhelming WebSocket under heavy load
const OUTPUT_THROTTLE_MS = 4; // ~250fps max update rate for responsive feedback
const OUTPUT_BATCH_SIZE = 4096; // Smaller batches for lower latency

export interface DevServerInfo {
  worktreePath: string;
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
   * Handle incoming stdout/stderr data from dev server process
   * Buffers data for scrollback replay and schedules throttled emission
   */
  private handleProcessOutput(server: DevServerInfo, data: Buffer): void {
    // Skip output if server is stopping
    if (server.stopping) {
      return;
    }

    const content = data.toString();

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
    } catch (error) {
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
   * Start a dev server for a worktree
   */
  async startDevServer(
    projectPath: string,
    worktreePath: string
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

    // Check for package.json
    const packageJsonPath = path.join(worktreePath, 'package.json');
    if (!(await this.fileExists(packageJsonPath))) {
      return {
        success: false,
        error: `No package.json found in: ${worktreePath}`,
      };
    }

    // Get dev command
    const devCommand = await this.getDevCommand(worktreePath);
    if (!devCommand) {
      return {
        success: false,
        error: `Could not determine dev command for: ${worktreePath}`,
      };
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
      port,
      url: `http://${hostname}:${port}`,
      process: devProcess,
      startedAt: new Date(),
      scrollbackBuffer: '',
      outputBuffer: '',
      flushTimeout: null,
      stopping: false,
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

      // Emit stopped event (only if not already stopping - prevents duplicate events)
      if (this.emitter && !serverInfo.stopping) {
        this.emitter.emit('dev-server:stopped', {
          worktreePath,
          port,
          exitCode,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }

      this.allocatedPorts.delete(port);
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

    // Free the port
    this.allocatedPorts.delete(server.port);
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
   */
  listDevServers(): {
    success: boolean;
    result: {
      servers: Array<{
        worktreePath: string;
        port: number;
        url: string;
      }>;
    };
  } {
    const servers = Array.from(this.runningServers.values()).map((s) => ({
      worktreePath: s.worktreePath,
      port: s.port,
      url: s.url,
    }));

    return {
      success: true,
      result: { servers },
    };
  }

  /**
   * Check if a worktree has a running dev server
   */
  isRunning(worktreePath: string): boolean {
    return this.runningServers.has(worktreePath);
  }

  /**
   * Get info for a specific worktree's dev server
   */
  getServerInfo(worktreePath: string): DevServerInfo | undefined {
    return this.runningServers.get(worktreePath);
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
