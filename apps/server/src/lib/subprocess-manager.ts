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
    lastOutput = Date.now();
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
  const { command, args, cwd, env, abortController, timeout = 30000 } = options;
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

  child.on('error', (err) => {
    spawnError = err;
  });

  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.stdout?.on('data', () => {
    lastOutput = Date.now();
  });

  let timeoutTimer: NodeJS.Timeout | null = null;
  if (timeout > 0) {
    timeoutTimer = setInterval(
      () => {
        if (Date.now() - lastOutput > timeout) {
          timedOut = true;
          child.kill('SIGTERM');
        }
      },
      Math.min(timeout, 1000)
    );
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
    throw new Error(`Process timed out after ${timeout}ms without output`);
  }

  if (code && code !== 0) {
    const suffix = signal ? ` (signal: ${signal})` : '';
    throw new Error(stderr || `Process exited with code ${code}${suffix}`);
  }
}
