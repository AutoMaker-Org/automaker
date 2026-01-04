/**
 * Subprocess manager utilities for JSONL streaming CLIs
 */

import { spawn } from 'child_process';

export interface SubprocessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  timeout?: number; // Milliseconds of no output before timing out
  startupTimeout?: number; // Milliseconds to wait for first output before timing out
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function spawnProcess(options: SubprocessOptions): Promise<SubprocessResult> {
  const { command, args, cwd, env, abortController } = options;
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  let aborted = false;
  if (abortController) {
    abortController.signal.addEventListener('abort', () => {
      aborted = true;
      child.kill('SIGTERM');
    });
    if (abortController.signal.aborted) {
      aborted = true;
      child.kill('SIGTERM');
    }
  }

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('close', (code) => resolve(code ?? null));
    child.on('error', (err) => reject(err));
  });

  if (aborted) {
    return { stdout, stderr, exitCode };
  }

  return { stdout, stderr, exitCode };
}

export async function* spawnJSONLProcess(options: SubprocessOptions): AsyncGenerator<unknown> {
  const { command, args, cwd, env, abortController, timeout = 30000, startupTimeout } = options;
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  let spawnError: Error | null = null;
  let aborted = false;
  let timedOut = false;
  let lastOutput = Date.now();
  let hasOutput = false;
  const startTime = Date.now();
  const effectiveStartupTimeout = startupTimeout ?? timeout;

  child.on('error', (err) => {
    spawnError = err;
  });

  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
    // Treat stderr activity as output to avoid false idle timeouts.
    lastOutput = Date.now();
    hasOutput = true;
  });

  child.stdout?.on('data', () => {
    lastOutput = Date.now();
    hasOutput = true;
  });

  let timeoutTimer: NodeJS.Timeout | null = null;
  if (timeout > 0 || effectiveStartupTimeout > 0) {
    const intervalMs = Math.min(Math.max(timeout, effectiveStartupTimeout), 1000);
    timeoutTimer = setInterval(() => {
      const now = Date.now();
      if (!hasOutput) {
        if (effectiveStartupTimeout > 0 && now - startTime > effectiveStartupTimeout) {
          timedOut = true;
          child.kill('SIGTERM');
        }
        return;
      }

      if (timeout > 0 && now - lastOutput > timeout) {
        timedOut = true;
        child.kill('SIGTERM');
      }
    }, intervalMs);
  }

  if (abortController) {
    abortController.signal.addEventListener('abort', () => {
      aborted = true;
      child.kill('SIGTERM');
    });
    if (abortController.signal.aborted) {
      aborted = true;
      child.kill('SIGTERM');
    }
  }

  const exitCodePromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.on('close', (code, signal) => resolve({ code: code ?? null, signal: signal ?? null }));
    }
  );

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: child.stdout as NodeJS.ReadableStream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      lastOutput = Date.now();
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        yield parsed;
      } catch (error) {
        console.warn('[SubprocessManager] Failed to parse JSONL line:', trimmed.slice(0, 200));
      }
    }
  } finally {
    rl.close();
    if (timeoutTimer) {
      clearInterval(timeoutTimer);
    }
  }

  const { code, signal } = await exitCodePromise;

  if (spawnError) {
    throw spawnError;
  }

  if (aborted) {
    throw new Error('Process aborted');
  }

  if (timedOut) {
    const timeoutMs = hasOutput ? timeout : effectiveStartupTimeout;
    const detail = hasOutput ? 'without output' : 'without any output';
    throw new Error(`Process timed out after ${timeoutMs}ms ${detail}`);
  }

  if (code && code !== 0) {
    const suffix = signal ? ` (signal: ${signal})` : '';
    throw new Error(stderr || `Process exited with code ${code}${suffix}`);
  }
}
