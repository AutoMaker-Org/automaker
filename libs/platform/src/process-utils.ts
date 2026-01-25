/**
 * Cross-platform process utilities
 *
 * Provides utilities for managing process trees, particularly important on Windows
 * where child processes spawned via 'cmd /c' don't automatically terminate when
 * the parent process is killed.
 */

import treeKill from 'tree-kill';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Kill an entire process tree (parent + all children)
 *
 * On Windows, processes spawned via 'cmd /c' create process trees where killing
 * the parent doesn't kill children. This uses tree-kill to terminate the entire tree.
 *
 * @param pid - Process ID to kill
 * @param signal - Signal to send (default: 'SIGTERM', or 'SIGKILL' on Windows)
 * @returns Promise that resolves when kill is attempted
 *
 * @example
 * ```typescript
 * // Kill MCP server process tree
 * const transport = new StdioClientTransport(...);
 * await killProcessTree(transport.pid);
 * ```
 */
export async function killProcessTree(
  pid: number,
  signal: string = IS_WINDOWS ? 'SIGKILL' : 'SIGTERM'
): Promise<void> {
  return new Promise((resolve) => {
    treeKill(pid, signal, (err) => {
      if (err) {
        // Process may have already exited, which is fine
        // Log at debug level only
        if (process.env.DEBUG) {
          console.debug(`[process-utils] tree-kill error (may be expected): ${err.message}`);
        }
      }
      resolve();
    });
  });
}

/**
 * Wait for a process to exit with timeout
 *
 * Useful after calling killProcessTree to verify the process actually terminated.
 *
 * @param pid - Process ID to wait for
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns Promise that resolves to true if process exited, false if timeout
 *
 * @example
 * ```typescript
 * await killProcessTree(pid);
 * const exited = await waitForProcessExit(pid, 5000);
 * if (!exited) {
 *   console.warn('Process did not exit within timeout');
 * }
 * ```
 */
export async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 100; // Check every 100ms

  while (Date.now() - startTime < timeoutMs) {
    try {
      // process.kill(pid, 0) returns true if process exists, throws if it doesn't
      process.kill(pid, 0);
      // Process still exists, wait and check again
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    } catch {
      // Process doesn't exist - it has exited
      return true;
    }
  }

  // Timeout reached, process still running
  return false;
}

/**
 * Force kill a process tree with escalation
 *
 * First tries SIGTERM, then escalates to SIGKILL if process doesn't exit.
 * On Windows, always uses SIGKILL (force) since SIGTERM isn't reliably supported.
 *
 * @param pid - Process ID to kill
 * @param gracePeriodMs - Time to wait for graceful exit before force kill (default: 3000)
 * @returns Promise that resolves when process is terminated or timeout reached
 *
 * @example
 * ```typescript
 * // Gracefully terminate with escalation
 * await forceKillProcessTree(pid, 5000);
 * ```
 */
export async function forceKillProcessTree(pid: number, gracePeriodMs = 3000): Promise<void> {
  // On Windows, just force kill immediately
  if (IS_WINDOWS) {
    await killProcessTree(pid, 'SIGKILL');
    return;
  }

  // On Unix, try graceful termination first
  await killProcessTree(pid, 'SIGTERM');

  // Wait for graceful exit
  const exited = await waitForProcessExit(pid, gracePeriodMs);

  if (!exited) {
    // Escalate to force kill
    await killProcessTree(pid, 'SIGKILL');
  }
}
