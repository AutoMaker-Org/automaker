/**
 * Permission enforcement utilities for Cursor provider
 */

import type { CursorCliConfigFile } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('PermissionEnforcer');

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a tool call is allowed based on permissions
 */
export function checkToolCallPermission(
  toolCall: any,
  permissions: CursorCliConfigFile | null
): PermissionCheckResult {
  if (!permissions || !permissions.permissions) {
    // If no permissions are configured, allow everything (backward compatibility)
    return { allowed: true };
  }

  const { allow = [], deny = [] } = permissions.permissions;

  // Check shell tool calls
  if (toolCall.shellToolCall?.args?.command) {
    const command = toolCall.shellToolCall.args.command;
    const toolName = `Shell(${extractCommandName(command)})`;

    // Check deny list first (deny takes precedence)
    for (const denyRule of deny) {
      if (matchesRule(toolName, denyRule)) {
        return {
          allowed: false,
          reason: `Operation blocked by permission rule: ${denyRule}`,
        };
      }
    }

    // Then check allow list
    for (const allowRule of allow) {
      if (matchesRule(toolName, allowRule)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `Operation not in allow list: ${toolName}`,
    };
  }

  // Check read tool calls
  if (toolCall.readToolCall?.args?.path) {
    const path = toolCall.readToolCall.args.path;
    const toolName = `Read(${path})`;

    // Check deny list first
    for (const denyRule of deny) {
      if (matchesRule(toolName, denyRule)) {
        return {
          allowed: false,
          reason: `Read operation blocked by permission rule: ${denyRule}`,
        };
      }
    }

    // Then check allow list
    for (const allowRule of allow) {
      if (matchesRule(toolName, allowRule)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `Read operation not in allow list: ${toolName}`,
    };
  }

  // Check write tool calls
  if (toolCall.writeToolCall?.args?.path) {
    const path = toolCall.writeToolCall.args.path;
    const toolName = `Write(${path})`;

    // Check deny list first
    for (const denyRule of deny) {
      if (matchesRule(toolName, denyRule)) {
        return {
          allowed: false,
          reason: `Write operation blocked by permission rule: ${denyRule}`,
        };
      }
    }

    // Then check allow list
    for (const allowRule of allow) {
      if (matchesRule(toolName, allowRule)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `Write operation not in allow list: ${toolName}`,
    };
  }

  // For other tool types, allow by default for now
  return { allowed: true };
}

/**
 * Extract the base command name from a shell command
 */
function extractCommandName(command: string): string {
  // Remove leading spaces and get the first word
  const trimmed = command.trim();
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord || 'unknown';
}

/**
 * Check if a tool name matches a permission rule
 */
function matchesRule(toolName: string, rule: string): boolean {
  // Exact match
  if (toolName === rule) {
    return true;
  }

  // Wildcard patterns
  if (rule.includes('*')) {
    const regex = new RegExp(rule.replace(/\*/g, '.*'));
    return regex.test(toolName);
  }

  // Prefix match for shell commands (e.g., "Shell(git)" matches "Shell(git status)")
  if (rule.startsWith('Shell(') && toolName.startsWith('Shell(')) {
    const ruleCommand = rule.slice(6, -1); // Remove "Shell(" and ")"
    const toolCommand = extractCommandName(toolName.slice(6, -1)); // Remove "Shell(" and ")"
    return toolCommand.startsWith(ruleCommand);
  }

  return false;
}

/**
 * Log permission violations
 */
export function logPermissionViolation(toolCall: any, reason: string, sessionId?: string): void {
  const sessionIdStr = sessionId ? ` [${sessionId}]` : '';

  if (toolCall.shellToolCall?.args?.command) {
    logger.warn(
      `Permission violation${sessionIdStr}: Shell command blocked - ${toolCall.shellToolCall.args.command} (${reason})`
    );
  } else if (toolCall.readToolCall?.args?.path) {
    logger.warn(
      `Permission violation${sessionIdStr}: Read operation blocked - ${toolCall.readToolCall.args.path} (${reason})`
    );
  } else if (toolCall.writeToolCall?.args?.path) {
    logger.warn(
      `Permission violation${sessionIdStr}: Write operation blocked - ${toolCall.writeToolCall.args.path} (${reason})`
    );
  } else {
    logger.warn(`Permission violation${sessionIdStr}: Tool call blocked (${reason})`, { toolCall });
  }
}
