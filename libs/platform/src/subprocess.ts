/**
 * Subprocess management utilities for CLI providers
 */

import { spawn, type ChildProcess } from 'child_process';
import { StringDecoder } from 'string_decoder';

export interface SubprocessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  timeout?: number; // Milliseconds of no output before timeout
  /**
   * Data to write to stdin after process spawns.
   * Use this for passing prompts/content that may contain shell metacharacters.
   * Avoids shell interpretation issues when passing data as CLI arguments.
   */
  stdinData?: string;
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Spawns a subprocess and streams JSONL output line-by-line.
 *
 * Uses direct 'data' event handling with manual line buffering instead of
 * readline's async iterator. The readline async iterator (for await...of on
 * readline.Interface) has a known issue where events batch up rather than
 * being delivered immediately, because it layers events.on() Promises on top
 * of the readline 'line' event emitter. This causes visible delays (20-40s
 * between batches) in CLI providers like Gemini that produce frequent small
 * events. Direct data event handling delivers parsed events to the consumer
 * as soon as they arrive from the pipe.
 */
export async function* spawnJSONLProcess(options: SubprocessOptions): AsyncGenerator<unknown> {
  const { command, args, cwd, env, abortController, timeout = 30000, stdinData } = options;

  const processEnv = {
    ...process.env,
    ...env,
  };

  // Log command without stdin data (which may be large/sensitive)
  console.log(`[SubprocessManager] Spawning: ${command} ${args.join(' ')}`);
  console.log(`[SubprocessManager] Working directory: ${cwd}`);
  if (stdinData) {
    console.log(`[SubprocessManager] Passing ${stdinData.length} bytes via stdin`);
  }

  // On Windows, .cmd files must be run through shell (cmd.exe)
  const needsShell =
    process.platform === 'win32' &&
    (command.toLowerCase().endsWith('.cmd') || command === 'npx' || command === 'npm');

  const childProcess: ChildProcess = spawn(command, args, {
    cwd,
    env: processEnv,
    // Use 'pipe' for stdin when we need to write data, otherwise 'ignore'
    stdio: [stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    shell: needsShell,
  });

  // Write stdin data if provided
  if (stdinData && childProcess.stdin) {
    childProcess.stdin.write(stdinData);
    childProcess.stdin.end();
  }

  let stderrOutput = '';
  let lastOutputTime = Date.now();
  let timeoutHandle: NodeJS.Timeout | null = null;
  let processExited = false;

  // Stream consumer state - declared in outer scope so the abort handler can
  // force the consumer to exit immediately without waiting for stdout to close.
  // CLI tools (especially Gemini CLI) may take a long time to respond to SIGTERM,
  // leaving the feature stuck in 'in_progress' state on the UI.
  let streamEnded = false;
  let notifyConsumer: (() => void) | null = null;

  // Track process exit early so we don't block on an already-exited process
  childProcess.on('exit', () => {
    processExited = true;
  });

  // Collect stderr for error reporting
  if (childProcess.stderr) {
    childProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrOutput += text;
      console.warn(`[SubprocessManager] stderr: ${text}`);
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
        console.error(`[SubprocessManager] Process timeout: no output for ${timeout}ms`);
        childProcess.kill('SIGTERM');
      }
    }, timeout);
  };

  resetTimeout();

  // Setup abort handling with cleanup
  let abortHandler: (() => void) | null = null;
  if (abortController) {
    abortHandler = () => {
      console.log('[SubprocessManager] Abort signal received, killing process');
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      childProcess.kill('SIGTERM');

      // Force stream consumer to exit immediately instead of waiting for
      // the process to close stdout. CLI tools (especially Gemini CLI) may
      // take a long time to respond to SIGTERM while mid-API call.
      streamEnded = true;
      if (notifyConsumer) {
        notifyConsumer();
        notifyConsumer = null;
      }

      // Escalate to SIGKILL after 3 seconds if process hasn't exited.
      // SIGKILL cannot be caught or ignored, guaranteeing termination.
      const killTimer = setTimeout(() => {
        if (!processExited) {
          console.log('[SubprocessManager] Escalated to SIGKILL after SIGTERM timeout');
          try {
            childProcess.kill('SIGKILL');
          } catch {
            // Process may have already exited between the check and kill
          }
        }
      }, 3000);

      // Clean up the kill timer when process exits (don't leak timers)
      childProcess.once('exit', () => {
        clearTimeout(killTimer);
      });
    };
    // Check if already aborted, if so call handler immediately
    if (abortController.signal.aborted) {
      abortHandler();
    } else {
      abortController.signal.addEventListener('abort', abortHandler);
    }
  }

  // Helper to clean up abort listener
  const cleanupAbortListener = () => {
    if (abortController && abortHandler) {
      abortController.signal.removeEventListener('abort', abortHandler);
      abortHandler = null;
    }
  };

  // Parse stdout as JSONL using direct 'data' events with manual line buffering.
  // This avoids the readline async iterator which batches events due to its
  // internal events.on() Promise layering, causing significant delivery delays.
  if (childProcess.stdout) {
    // Queue of parsed events ready to be yielded
    const eventQueue: unknown[] = [];
    // Partial line buffer for incomplete lines across data chunks
    let lineBuffer = '';
    // StringDecoder handles multibyte UTF-8 sequences that may be split across chunks
    const decoder = new StringDecoder('utf8');

    childProcess.stdout.on('data', (chunk: Buffer) => {
      resetTimeout();

      lineBuffer += decoder.write(chunk);
      const lines = lineBuffer.split('\n');
      // Last element is either empty (line ended with \n) or a partial line
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          eventQueue.push(JSON.parse(trimmed));
        } catch (parseError) {
          console.error(`[SubprocessManager] Failed to parse JSONL line: ${trimmed}`, parseError);
          eventQueue.push({
            type: 'error',
            error: `Failed to parse output: ${trimmed}`,
          });
        }
      }

      // Wake up the consumer if it's waiting for events
      if (notifyConsumer && eventQueue.length > 0) {
        notifyConsumer();
        notifyConsumer = null;
      }
    });

    childProcess.stdout.on('end', () => {
      // Flush any remaining bytes from the decoder
      lineBuffer += decoder.end();

      // Process any remaining partial line
      if (lineBuffer.trim()) {
        try {
          eventQueue.push(JSON.parse(lineBuffer.trim()));
        } catch (parseError) {
          console.error(
            `[SubprocessManager] Failed to parse final JSONL line: ${lineBuffer}`,
            parseError
          );
          eventQueue.push({
            type: 'error',
            error: `Failed to parse output: ${lineBuffer}`,
          });
        }
        lineBuffer = '';
      }

      streamEnded = true;
      // Wake up consumer so it can exit the loop
      if (notifyConsumer) {
        notifyConsumer();
        notifyConsumer = null;
      }
    });

    childProcess.stdout.on('error', (error) => {
      console.error('[SubprocessManager] stdout error:', error);
      streamEnded = true;
      if (notifyConsumer) {
        notifyConsumer();
        notifyConsumer = null;
      }
    });

    try {
      // Yield events as they arrive, waiting only when the queue is empty
      while (!streamEnded || eventQueue.length > 0) {
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        } else {
          // Wait for the next data event to push events into the queue
          await new Promise<void>((resolve) => {
            notifyConsumer = resolve;
          });
        }
      }
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      cleanupAbortListener();
    }
  } else {
    // No stdout - still need to cleanup abort listener when process exits
    cleanupAbortListener();
  }

  // Wait for process to exit.
  // If the process already exited (e.g., abort handler killed it while we were
  // draining the stream), resolve immediately to avoid blocking forever.
  const exitCode = await new Promise<number | null>((resolve) => {
    if (processExited) {
      resolve(childProcess.exitCode ?? null);
      return;
    }

    childProcess.on('exit', (code) => {
      console.log(`[SubprocessManager] Process exited with code: ${code}`);
      resolve(code);
    });

    childProcess.on('error', (error) => {
      console.error('[SubprocessManager] Process error:', error);
      resolve(null);
    });
  });

  // Handle non-zero exit codes
  if (exitCode !== 0 && exitCode !== null) {
    const errorMessage = stderrOutput || `Process exited with code ${exitCode}`;
    console.error(`[SubprocessManager] Process failed: ${errorMessage}`);
    yield {
      type: 'error',
      error: errorMessage,
    };
  }

  // Process completed successfully
  if (exitCode === 0 && !stderrOutput) {
    console.log('[SubprocessManager] Process completed successfully');
  }
}

/**
 * Spawns a subprocess and collects all output
 */
export async function spawnProcess(options: SubprocessOptions): Promise<SubprocessResult> {
  const { command, args, cwd, env, abortController, stdinData } = options;

  const processEnv = {
    ...process.env,
    ...env,
  };

  return new Promise((resolve, reject) => {
    // On Windows, .cmd files must be run through shell (cmd.exe)
    const needsShell =
      process.platform === 'win32' &&
      (command.toLowerCase().endsWith('.cmd') || command === 'npx' || command === 'npm');

    const childProcess = spawn(command, args, {
      cwd,
      env: processEnv,
      stdio: [stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      shell: needsShell,
    });

    if (stdinData && childProcess.stdin) {
      childProcess.stdin.write(stdinData);
      childProcess.stdin.end();
    }

    let stdout = '';
    let stderr = '';

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    // Setup abort handling with cleanup
    let abortHandler: (() => void) | null = null;
    const cleanupAbortListener = () => {
      if (abortController && abortHandler) {
        abortController.signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
    };

    if (abortController) {
      abortHandler = () => {
        cleanupAbortListener();
        childProcess.kill('SIGTERM');

        // Escalate to SIGKILL after 3 seconds if process hasn't exited
        const killTimer = setTimeout(() => {
          try {
            childProcess.kill('SIGKILL');
          } catch {
            // Process may have already exited
          }
        }, 3000);
        childProcess.once('exit', () => clearTimeout(killTimer));

        reject(new Error('Process aborted'));
      };
      abortController.signal.addEventListener('abort', abortHandler);
    }

    childProcess.on('exit', (code) => {
      cleanupAbortListener();
      resolve({ stdout, stderr, exitCode: code });
    });

    childProcess.on('error', (error) => {
      cleanupAbortListener();
      reject(error);
    });
  });
}
