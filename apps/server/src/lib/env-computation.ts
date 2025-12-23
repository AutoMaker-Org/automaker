/**
 * Environment Variable Computation - Helper for injecting per-call env vars
 *
 * Computes environment variables needed for different API endpoints
 * (e.g., Z.AI for GLM models). Used by AutoModeService and AgentService
 * to pass env overrides to providers via providerConfig.env.
 */

import type { Credentials } from '@automaker/types';
import type { Feature } from '@automaker/types';

// Fix TypeScript by defining the Feature type locally with proper typing
interface FeatureWithEndpointConfig {
  implementationEndpointPreset?: 'default' | 'zai' | 'custom';
  implementationEndpointUrl?: string;
}

/**
 * Determine if a model needs Z.AI endpoint environment injection
 *
 * @param model - Model identifier
 * @param endpointPreset - Endpoint preset from feature ('default' | 'zai' | 'custom')
 * @returns true if Z.AI env should be injected
 */
export function needsZaiEndpoint(
  model: string,
  endpointPreset?: 'default' | 'zai' | 'custom'
): boolean {
  const lowerModel = model.toLowerCase();

  // GLM models always use Z.AI
  if (lowerModel.startsWith('glm-')) {
    return true;
  }

  // Explicit Z.AI preset
  if (endpointPreset === 'zai') {
    return true;
  }

  // Custom endpoint preset (user configured custom URL)
  if (endpointPreset === 'custom') {
    return true;
  }

  return false;
}

/**
 * Compute environment variables for Z.AI endpoint
 *
 * @param credentials - Credentials object containing apiKeys
 * @param customUrl - Optional custom endpoint URL
 * @returns Environment variables for Z.AI or null if credentials missing
 */
export function computeZaiEnv(
  credentials: Pick<Credentials, 'apiKeys'>,
  customUrl?: string | undefined
): Record<string, string> | null {
  const { zai } = credentials.apiKeys;

  // Hard-fail if Z.AI key is missing
  if (!zai || zai.trim() === '') {
    console.error('[computeZaiEnv] Z.AI API key is missing or empty');
    return null;
  }

  // Use custom URL if provided, otherwise use default Z.AI endpoint
  const baseUrl = customUrl?.trim() || 'https://api.z.ai/api/anthropic';

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: zai,
    API_TIMEOUT_MS: '3000000', // 50 minutes as recommended by Z.AI
  };

  console.log(`[computeZaiEnv] Injecting Z.AI env: ${baseUrl}`);
  return env;
}

/**
 * Compute environment variables for a model based on feature config
 *
 * @param model - Model identifier
 * @param feature - Feature with endpoint configuration
 * @param credentials - Credentials containing API keys
 * @returns Environment variables to inject, or null if not needed/missing
 */
export function computeModelEnv(
  model: string,
  feature: FeatureWithEndpointConfig,
  credentials: Pick<Credentials, 'apiKeys'>
): Record<string, string> | null {
  const { implementationEndpointPreset, implementationEndpointUrl } = feature;

  // Check if model needs Z.AI endpoint
  if (!needsZaiEndpoint(model, implementationEndpointPreset)) {
    return null;
  }

  // For custom endpoint, use custom URL
  const customUrl =
    implementationEndpointPreset === 'custom' ? implementationEndpointUrl : undefined;

  // Compute Z.AI env
  return computeZaiEnv(credentials, customUrl);
}

/**
 * Get error message when Z.AI credentials are missing
 *
 * @returns User-friendly error message
 */
export function getZaiCredentialsError(): string {
  return (
    'Z.AI API key is required for GLM-4.7 models. ' +
    'Please add your Z.AI API key in Settings → API Keys.'
  );
}

