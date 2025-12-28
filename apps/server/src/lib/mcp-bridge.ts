/**
 * MCP Bridge Layer
 *
 * Bridges the orchestrator services to MCP tools available in Claude Code.
 * This layer provides a unified interface for calling MCP tools while
 * handling availability checks and error scenarios.
 *
 * When running in Claude Code, the bridge can access MCP tools directly.
 * When running standalone, it provides graceful fallback behavior.
 */

import type { EventEmitter } from './events.js';

/**
 * Result from an MCP tool call
 */
export interface MCPToolCallResult {
  /** Whether the tool call was successful */
  success: boolean;
  /** Data returned by the tool */
  data?: unknown;
  /** Error message if the call failed */
  error?: string;
}

/**
 * Options for MCP tool calls
 */
export interface MCPToolCallOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Whether to throw on error (default: false) */
  throwOnError?: boolean;
}

/**
 * MCP Bridge Error
 */
export class MCPBridgeError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'MCPBridgeError';
  }
}

/**
 * MCP Bridge
 *
 * Provides access to MCP tools from within the Claude Code environment.
 */
export class MCPBridge {
  private events: EventEmitter;
  private toolCallStats: Map<string, number> = new Map();

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Check if MCP tools are available (running in Claude Code)
   */
  isAvailable(): boolean {
    // In Claude Code, MCP tools are available via the tool calling interface
    // We check for the presence of the global tool interface
    return (
      typeof (globalThis as any).callTool === 'function' ||
      typeof (globalThis as any).__MCP_TOOLS__ !== 'undefined'
    );
  }

  /**
   * Call an MCP tool by name
   *
   * @param toolName - The name of the MCP tool to call (e.g., 'mcp__vibe_kanban__list_projects')
   * @param params - Parameters to pass to the tool
   * @param options - Additional options for the tool call
   * @returns Result from the tool call
   */
  async callTool(
    toolName: string,
    params: Record<string, unknown>,
    options?: MCPToolCallOptions
  ): Promise<MCPToolCallResult> {
    const startTime = Date.now();

    // Track tool call stats
    this.toolCallStats.set(toolName, (this.toolCallStats.get(toolName) || 0) + 1);

    // Emit event for tool call
    this.events.emit('mcp:tool-call', {
      toolName,
      params,
      timestamp: new Date().toISOString(),
    });

    if (!this.isAvailable()) {
      const error = 'MCP tools not available - must run in Claude Code environment';
      this.events.emit('mcp:tool-error', {
        toolName,
        error,
        timestamp: new Date().toISOString(),
      });

      if (options?.throwOnError) {
        throw new MCPBridgeError(error, 'MCP_UNAVAILABLE');
      }

      return {
        success: false,
        error,
      };
    }

    try {
      // The actual implementation will delegate to the global tool interface
      // when running in Claude Code
      const result = await this.invokeMCPTool(toolName, params, options);

      // Emit success event
      this.events.emit('mcp:tool-success', {
        toolName,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || 'Unknown error';

      this.events.emit('mcp:tool-error', {
        toolName,
        error: errorMessage,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      if (options?.throwOnError) {
        throw new MCPBridgeError(
          `MCP tool call failed: ${errorMessage}`,
          'TOOL_CALL_FAILED',
          error
        );
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Invoke the actual MCP tool
   *
   * This method is called when the bridge is available in Claude Code.
   * The actual tool invocation will be handled by the Claude Code runtime.
   *
   * Note: This is a placeholder implementation that logs the tool call.
   * In production, Claude Code will inject the actual tool calling logic.
   */
  private async invokeMCPTool(
    toolName: string,
    params: Record<string, unknown>,
    options?: MCPToolCallOptions
  ): Promise<MCPToolCallResult> {
    // Log the tool call for debugging
    console.log(`[MCPBridge] Calling tool: ${toolName}`, params);

    // In Claude Code, this would invoke the actual MCP tool
    // For now, we provide a placeholder that can be replaced
    // with the actual tool invocation logic when running in Claude Code

    // Check if there's a global tool invoker
    const globalInvoke = (globalThis as any).__MCP_INVOKE__;
    if (typeof globalInvoke === 'function') {
      try {
        const timeout = options?.timeout || 30000;
        const result = await Promise.race([
          globalInvoke(toolName, params),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Tool call timeout')), timeout)
          ),
        ]);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }

    // Placeholder: Return success with null data
    // This allows the orchestrator to continue even when MCP tools aren't fully wired
    console.warn(
      `[MCPBridge] No global MCP invoker found, returning placeholder result for ${toolName}`
    );

    return {
      success: true,
      data: null,
    };
  }

  /**
   * Get statistics about tool calls
   */
  getStats(): { toolName: string; calls: number }[] {
    return Array.from(this.toolCallStats.entries()).map(([toolName, calls]) => ({
      toolName,
      calls,
    }));
  }

  /**
   * Reset tool call statistics
   */
  resetStats(): void {
    this.toolCallStats.clear();
  }
}

/**
 * Global MCP bridge instance
 */
let globalBridge: MCPBridge | null = null;

/**
 * Get the global MCP bridge instance
 *
 * @param events - Event emitter (required for first-time initialization)
 * @returns The MCP bridge instance
 */
export function getMCPBridge(events?: EventEmitter): MCPBridge {
  if (!globalBridge) {
    if (!events) {
      throw new MCPBridgeError(
        'Events emitter required for first-time MCP bridge initialization',
        'NO_EVENTS'
      );
    }
    globalBridge = new MCPBridge(events);
  }
  return globalBridge;
}

/**
 * Reset the global MCP bridge instance
 *
 * This is primarily useful for testing.
 */
export function resetMCPBridge(): void {
  if (globalBridge) {
    globalBridge.resetStats();
  }
  globalBridge = null;
}
