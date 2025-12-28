/**
 * Shared utilities for reading and parsing ~/.claude/settings.json
 *
 * This file centralizes all logic related to the Claude settings file
 * to avoid code duplication across multiple files.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '@automaker/utils';

const logger = createLogger('ClaudeSettings');

export interface ClaudeSettings {
  env?: Record<string, string>;
  apiKey?: string;
  api_key?: string;
  oauthToken?: string;
  oauth_token?: string;
  primaryApiKey?: string;
}

/**
 * Get the path to ~/.claude/settings.json
 */
export function getSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

/**
 * Load and parse ~/.claude/settings.json
 * Returns null if file doesn't exist or is invalid
 */
export async function loadClaudeSettings(): Promise<ClaudeSettings | null> {
  try {
    const content = await fs.readFile(getSettingsPath(), 'utf-8');
    return JSON.parse(content);
  } catch (error: unknown) {
    // It's fine if the file doesn't exist, but other errors should be logged
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      logger.error('Error reading or parsing ~/.claude/settings.json:', error);
    }
    return null;
  }
}

/**
 * Extract authentication token from settings
 * Checks multiple locations in order of priority:
 * 1. env.ANTHROPIC_AUTH_TOKEN - Claude Code format
 * 2. oauthToken / oauth_token - root-level OAuth tokens
 * 3. apiKey / api_key / primaryApiKey - root-level API keys
 */
export function extractAuthToken(settings: ClaudeSettings): string | null {
  // Check env section (Claude Code format)
  if (settings.env?.ANTHROPIC_AUTH_TOKEN) {
    return settings.env.ANTHROPIC_AUTH_TOKEN;
  }

  // Check for OAuth tokens at root level
  if (settings.oauthToken) {
    return settings.oauthToken;
  }
  if (settings.oauth_token) {
    return settings.oauth_token;
  }

  // Check for API keys at root level
  if (settings.apiKey) {
    return settings.apiKey;
  }
  if (settings.api_key) {
    return settings.api_key;
  }
  if (settings.primaryApiKey) {
    return settings.primaryApiKey;
  }

  return null;
}

/**
 * Check if settings file exists and contains authentication
 */
export async function hasSettingsFileAuth(): Promise<boolean> {
  const settings = await loadClaudeSettings();
  return settings ? extractAuthToken(settings) !== null : false;
}

/**
 * Get auth token from settings file
 */
export async function getSettingsFileToken(): Promise<string | null> {
  const settings = await loadClaudeSettings();
  return settings ? extractAuthToken(settings) : null;
}

/**
 * Get the env section from settings file
 * Returns null if file doesn't exist or has no env section
 */
export async function getSettingsEnv(): Promise<Record<string, string> | null> {
  const settings = await loadClaudeSettings();
  if (!settings) {
    return null;
  }

  // Return the env section if it exists and has content
  if (settings.env && typeof settings.env === 'object' && Object.keys(settings.env).length > 0) {
    return settings.env;
  }

  // Build env from root-level tokens if no env section
  const env: Record<string, string> = {};

  // Check for OAuth tokens at root level
  if (settings.oauthToken) {
    env.ANTHROPIC_API_KEY = settings.oauthToken;
  } else if (settings.oauth_token) {
    env.ANTHROPIC_API_KEY = settings.oauth_token;
  }
  // Check for API keys at root level
  else if (settings.apiKey) {
    env.ANTHROPIC_API_KEY = settings.apiKey;
  } else if (settings.api_key) {
    env.ANTHROPIC_API_KEY = settings.api_key;
  } else if (settings.primaryApiKey) {
    env.ANTHROPIC_API_KEY = settings.primaryApiKey;
  }

  return Object.keys(env).length > 0 ? env : null;
}
