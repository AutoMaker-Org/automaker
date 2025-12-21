/**
 * Common utilities and state for terminal routes
 */

import { createLogger } from "@automaker/utils";
import type { Request, Response, NextFunction } from "express";
import { getTerminalService } from "../../services/terminal-service.js";

const logger = createLogger("Terminal");

// Read env variables lazily to ensure dotenv has loaded them
function getTerminalPassword(): string | undefined {
  return process.env.TERMINAL_PASSWORD;
}

function getTerminalEnabledConfig(): boolean {
  return process.env.TERMINAL_ENABLED !== "false"; // Enabled by default
}

// In-memory session tokens (would use Redis in production) - private
const validTokens: Map<string, { createdAt: Date; expiresAt: Date }> =
  new Map();
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Add a token to the valid tokens map
 */
export function addToken(
  token: string,
  data: { createdAt: Date; expiresAt: Date }
): void {
  validTokens.set(token, data);
}

/**
 * Delete a token from the valid tokens map
 */
export function deleteToken(token: string): void {
  validTokens.delete(token);
}

/**
 * Get token data for a given token
 */
export function getTokenData(
  token: string
): { createdAt: Date; expiresAt: Date } | undefined {
  return validTokens.get(token);
}

/**
 * Generate a secure random token
 */
export function generateToken(): string {
  return `term-${Date.now()}-${Math.random()
    .toString(36)
    .substr(2, 15)}${Math.random().toString(36).substr(2, 15)}`;
}

/**
 * Clean up expired tokens
 */
export function cleanupExpiredTokens(): void {
  const now = new Date();
  validTokens.forEach((data, token) => {
    if (data.expiresAt < now) {
      validTokens.delete(token);
    }
  });
}

// Clean up expired tokens every 5 minutes
setInterval(cleanupExpiredTokens, 5 * 60 * 1000);

/**
 * Validate a terminal session token
 */
export function validateTerminalToken(token: string | undefined): boolean {
  if (!token) return false;

  const tokenData = validTokens.get(token);
  if (!tokenData) return false;

  if (tokenData.expiresAt < new Date()) {
    validTokens.delete(token);
    return false;
  }

  return true;
}

/**
 * Check if terminal requires password
 */
export function isTerminalPasswordRequired(): boolean {
  return !!getTerminalPassword();
}

/**
 * Check if terminal is enabled
 */
export function isTerminalEnabled(): boolean {
  return getTerminalEnabledConfig();
}

/**
 * Terminal authentication middleware
 * Checks for valid session token if password is configured
 */
export function terminalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check if terminal is enabled
  if (!getTerminalEnabledConfig()) {
    res.status(403).json({
      success: false,
      error: "Terminal access is disabled",
    });
    return;
  }

  // If no password configured, allow all requests
  if (!getTerminalPassword()) {
    next();
    return;
  }

  // Check for session token
  const token =
    (req.headers["x-terminal-token"] as string) || (req.query.token as string);

  if (!validateTerminalToken(token)) {
    res.status(401).json({
      success: false,
      error: "Terminal authentication required",
      passwordRequired: true,
    });
    return;
  }

  next();
}

export function getTerminalPasswordConfig(): string | undefined {
  return getTerminalPassword();
}

export function getTerminalEnabledConfigValue(): boolean {
  return getTerminalEnabledConfig();
}

export function getTokenExpiryMs(): number {
  return TOKEN_EXPIRY_MS;
}

import {
  getErrorMessage as getErrorMessageShared,
  createLogError,
} from "../common.js";

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);
