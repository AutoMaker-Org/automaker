/**
 * Dev Server Service
 *
 * Manages multiple development server processes for git worktrees.
 * Each worktree can have its own dev server running on a unique port.
 *
 * Developers should configure their projects to use the PORT environment variable.
 */

import { spawn, execSync, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import path from "path";
import net from "net";

export interface DevServerInfo {
  worktreePath: string;
  port: number;
  url: string;
  process: ChildProcess | null;
  startedAt: Date;
}

// Port allocation starts at 3001 to avoid conflicts with common dev ports
const BASE_PORT = 3001;
const MAX_PORT = 3099; // Safety limit

class DevServerService {
  private runningServers: Map<string, DevServerInfo> = new Map();
  private allocatedPorts: Set<number> = new Set();

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
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close();
        resolve(true);
      });
      server.listen(port, "127.0.0.1");
    });
  }

  /**
   * Kill any process running on the given port
   */
  private killProcessOnPort(port: number): void {
    try {
      if (process.platform === "win32") {
        // Windows: find and kill process on port
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8" });
        const lines = result.trim().split("\n");
        const pids = new Set<string>();
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") {
            pids.add(pid);
          }
        }
        for (const pid of pids) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
            console.log(`[DevServerService] Killed process ${pid} on port ${port}`);
          } catch {
            // Process may have already exited
          }
        }
      } else {
        // macOS/Linux: use lsof to find and kill process
        try {
          const result = execSync(`lsof -ti:${port}`, { encoding: "utf-8" });
          const pids = result.trim().split("\n").filter(Boolean);
          for (const pid of pids) {
            try {
              execSync(`kill -9 ${pid}`, { stdio: "ignore" });
              console.log(`[DevServerService] Killed process ${pid} on port ${port}`);
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
      console.log(`[DevServerService] No process to kill on port ${port}`);
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
   * Detect the package manager used in a directory
   */
  private detectPackageManager(
    dir: string
  ): "npm" | "yarn" | "pnpm" | "bun" | null {
    if (existsSync(path.join(dir, "bun.lockb"))) return "bun";
    if (existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(path.join(dir, "yarn.lock"))) return "yarn";
    if (existsSync(path.join(dir, "package-lock.json"))) return "npm";
    if (existsSync(path.join(dir, "package.json"))) return "npm"; // Default
    return null;
  }

  /**
   * Get the dev script command for a directory
   */
  private getDevCommand(dir: string): { cmd: string; args: string[] } | null {
    const pm = this.detectPackageManager(dir);
    if (!pm) return null;

    switch (pm) {
      case "bun":
        return { cmd: "bun", args: ["run", "dev"] };
      case "pnpm":
        return { cmd: "pnpm", args: ["run", "dev"] };
      case "yarn":
        return { cmd: "yarn", args: ["dev"] };
      case "npm":
      default:
        return { cmd: "npm", args: ["run", "dev"] };
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
    if (!existsSync(worktreePath)) {
      return {
        success: false,
        error: `Worktree path does not exist: ${worktreePath}`,
      };
    }

    // Check for package.json
    const packageJsonPath = path.join(worktreePath, "package.json");
    if (!existsSync(packageJsonPath)) {
      return {
        success: false,
        error: `No package.json found in: ${worktreePath}`,
      };
    }

    // Get dev command
    const devCommand = this.getDevCommand(worktreePath);
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
        error: error instanceof Error ? error.message : "Port allocation failed",
      };
    }

    // Reserve the port (port was already force-killed in findAvailablePort)
    this.allocatedPorts.add(port);

    // Also kill common related ports (livereload uses 35729 by default)
    // Some dev servers use fixed ports for HMR/livereload regardless of main port
    const commonRelatedPorts = [35729, 35730, 35731];
    for (const relatedPort of commonRelatedPorts) {
      this.killProcessOnPort(relatedPort);
    }

    // Small delay to ensure related ports are freed
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log(
      `[DevServerService] Starting dev server on port ${port}`
    );
    console.log(
      `[DevServerService] Working directory (cwd): ${worktreePath}`
    );
    console.log(
      `[DevServerService] Command: ${devCommand.cmd} ${devCommand.args.join(" ")} with PORT=${port}`
    );

    // Spawn the dev process with PORT environment variable
    const env = {
      ...process.env,
      PORT: String(port),
    };

    const devProcess = spawn(devCommand.cmd, devCommand.args, {
      cwd: worktreePath,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    // Track if process failed early using object to work around TypeScript narrowing
    const status = { error: null as string | null, exited: false };

    // Log output for debugging
    if (devProcess.stdout) {
      devProcess.stdout.on("data", (data: Buffer) => {
        console.log(`[DevServer:${port}] ${data.toString().trim()}`);
      });
    }

    if (devProcess.stderr) {
      devProcess.stderr.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        console.error(`[DevServer:${port}] ${msg}`);
      });
    }

    devProcess.on("error", (error) => {
      console.error(`[DevServerService] Process error:`, error);
      status.error = error.message;
      this.allocatedPorts.delete(port);
      this.runningServers.delete(worktreePath);
    });

    devProcess.on("exit", (code) => {
      console.log(
        `[DevServerService] Process for ${worktreePath} exited with code ${code}`
      );
      status.exited = true;
      this.allocatedPorts.delete(port);
      this.runningServers.delete(worktreePath);
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

    const serverInfo: DevServerInfo = {
      worktreePath,
      port,
      url: `http://localhost:${port}`,
      process: devProcess,
      startedAt: new Date(),
    };

    this.runningServers.set(worktreePath, serverInfo);

    return {
      success: true,
      result: {
        worktreePath,
        port,
        url: `http://localhost:${port}`,
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
      console.log(`[DevServerService] No server record for ${worktreePath}, may have already stopped`);
      return {
        success: true,
        result: {
          worktreePath,
          message: `Dev server already stopped`,
        },
      };
    }

    console.log(`[DevServerService] Stopping dev server for ${worktreePath}`);

    // Kill the process
    if (server.process && !server.process.killed) {
      server.process.kill("SIGTERM");
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
   * Get all allocated ports
   */
  getAllocatedPorts(): number[] {
    return Array.from(this.allocatedPorts);
  }

  /**
   * Stop all running dev servers (for cleanup)
   */
  async stopAll(): Promise<void> {
    console.log(`[DevServerService] Stopping all ${this.runningServers.size} dev servers`);

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
process.on("SIGTERM", async () => {
  if (devServerServiceInstance) {
    await devServerServiceInstance.stopAll();
  }
});

process.on("SIGINT", async () => {
  if (devServerServiceInstance) {
    await devServerServiceInstance.stopAll();
  }
});
