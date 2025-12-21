/**
 * Subprocess management utilities for CLI providers
 */

import { spawn, type ChildProcess } from "child_process";
import readline from "readline";

export interface SubprocessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  timeout?: number; // Milliseconds of no output before timeout
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Spawns a subprocess and streams JSONL output line-by-line
 */
export async function* spawnJSONLProcess(
  options: SubprocessOptions
): AsyncGenerator<unknown> {
  const { command, args, cwd, env, abortController, timeout = 30000 } = options;

  const processEnv = {
    ...process.env,
    ...env,
  };

  console.log(`[SubprocessManager] Spawning: ${command} ${args.slice(0, -1).join(" ")}`);
  console.log(`[SubprocessManager] Working directory: ${cwd}`);

  const childProcess: ChildProcess = spawn(command, args, {
    cwd,
    env: processEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderrOutput = "";
  let lastOutputTime = Date.now();
  let timeoutHandle: NodeJS.Timeout | null = null;

  // Collect stderr for error reporting
  if (childProcess.stderr) {
    childProcess.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderrOutput += text;
      console.error(`[SubprocessManager] stderr: ${text}`);
    });
  }

  // Setup timeout detection
  const resetTimeout = () => {
    lastOutputTime = Date.now();
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    timeoutHandle = setTimeout(() => {
      const elapsed = Date.now() - lastOutputTime;
      if (elapsed >= timeout) {
        console.error(
          `[SubprocessManager] Process timeout: no output for ${timeout}ms`
        );
        childProcess.kill("SIGTERM");
      }
    }, timeout);
  };

  resetTimeout();

  // Setup abort handling
  if (abortController) {
    abortController.signal.addEventListener("abort", () => {
      console.log("[SubprocessManager] Abort signal received, killing process");
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      childProcess.kill("SIGTERM");
    });
  }

  // Parse stdout as JSONL (one JSON object per line)
  if (childProcess.stdout) {
    const rl = readline.createInterface({
      input: childProcess.stdout,
      crlfDelay: Infinity,
    });

    try {
      for await (const line of rl) {
        resetTimeout();

        if (!line.trim()) continue;

        try {
          const parsed = JSON.parse(line);
          yield parsed;
        } catch (parseError) {
          console.error(
            `[SubprocessManager] Failed to parse JSONL line: ${line}`,
            parseError
          );
          // Yield error but continue processing
          yield {
            type: "error",
            error: `Failed to parse output: ${line}`,
          };
        }
      }
    } catch (error) {
      console.error("[SubprocessManager] Error reading stdout:", error);
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  // Wait for process to exit
  const exitCode = await new Promise<number | null>((resolve) => {
    childProcess.on("exit", (code) => {
      console.log(`[SubprocessManager] Process exited with code: ${code}`);
      resolve(code);
    });

    childProcess.on("error", (error) => {
      console.error("[SubprocessManager] Process error:", error);
      resolve(null);
    });
  });

  // Handle non-zero exit codes
  if (exitCode !== 0 && exitCode !== null) {
    const errorMessage = stderrOutput || `Process exited with code ${exitCode}`;
    console.error(`[SubprocessManager] Process failed: ${errorMessage}`);
    yield {
      type: "error",
      error: errorMessage,
    };
  }

  // Process completed successfully
  if (exitCode === 0 && !stderrOutput) {
    console.log("[SubprocessManager] Process completed successfully");
  }
}

/**
 * Spawns a subprocess and collects all output
 */
export async function spawnProcess(
  options: SubprocessOptions
): Promise<SubprocessResult> {
  const { command, args, cwd, env, abortController } = options;

  const processEnv = {
    ...process.env,
    ...env,
  };

  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd,
      env: processEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (childProcess.stdout) {
      childProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
    }

    // Setup abort handling
    if (abortController) {
      abortController.signal.addEventListener("abort", () => {
        childProcess.kill("SIGTERM");
        reject(new Error("Process aborted"));
      });
    }

    childProcess.on("exit", (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });

    childProcess.on("error", (error) => {
      reject(error);
    });
  });
}
