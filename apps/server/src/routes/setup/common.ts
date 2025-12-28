/**
 * Common utilities and state for setup routes
 */

import { createLogger } from '@automaker/utils';
import path from 'path';
import fs from 'fs/promises';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';

const logger = createLogger('Setup');

// Storage for API keys (in-memory cache) - private
const apiKeys: Record<string, string> = {};

/**
 * Provider registry - maps provider names to their environment variable keys
 * Add new providers here to enable API key storage/retrieval
 */
interface ProviderConfig {
  envKey: string;
  aliases: string[];
}

export const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    aliases: ['anthropic_oauth_token'], // These map to the same env key
  },
  zai: {
    envKey: 'ZAI_API_KEY',
    aliases: [],
  },
};

export type SupportedProvider = keyof typeof PROVIDER_REGISTRY;

/**
 * Check if a provider is supported
 */
export function isSupportedProvider(provider: string): provider is SupportedProvider {
  return provider in PROVIDER_REGISTRY;
}

/**
 * Get the environment variable key for a provider
 */
export function getProviderEnvKey(provider: string): string | null {
  // Check direct match
  if (provider in PROVIDER_REGISTRY) {
    return PROVIDER_REGISTRY[provider as SupportedProvider].envKey;
  }
  // Check aliases
  for (const [name, config] of Object.entries(PROVIDER_REGISTRY)) {
    if (config.aliases.includes(provider)) {
      return PROVIDER_REGISTRY[name as SupportedProvider].envKey;
    }
  }
  return null;
}

/**
 * Get an API key for a provider
 */
export function getApiKey(provider: string): string | undefined {
  return apiKeys[provider];
}

/**
 * Set an API key for a provider
 */
export function setApiKey(provider: string, key: string): void {
  apiKeys[provider] = key;
}

/**
 * Get all API keys (for read-only access)
 */
export function getAllApiKeys(): Record<string, string> {
  return { ...apiKeys };
}

/**
 * Helper to persist API keys to .env file
 */
export async function persistApiKeyToEnv(key: string, value: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');

  try {
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch {
      // .env file doesn't exist, we'll create it
    }

    // Parse existing env content
    const lines = envContent.split('\n');
    const keyRegex = new RegExp(`^${key}=`);
    let found = false;
    const newLines = lines.map((line) => {
      if (keyRegex.test(line)) {
        found = true;
        return `${key}=${value}`;
      }
      return line;
    });

    if (!found) {
      // Add the key at the end
      newLines.push(`${key}=${value}`);
    }

    await fs.writeFile(envPath, newLines.join('\n'));
    logger.info(`[Setup] Persisted ${key} to .env file`);
  } catch (error) {
    logger.error(`[Setup] Failed to persist ${key} to .env:`, error);
    throw error;
  }
}

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);
