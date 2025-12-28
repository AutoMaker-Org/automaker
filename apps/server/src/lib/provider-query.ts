/**
 * Provider-Agnostic Query Utility
 *
 * Provides a unified interface for querying AI models through the provider system.
 * This replaces direct Claude SDK calls with provider-agnostic implementations.
 *
 * Key features:
 * - Works with any provider (Claude, Z.ai, etc.)
 * - Handles structured output for Claude via SDK
 * - Handles structured output for other providers via prompt engineering + parsing
 * - Compatible with existing message streaming format
 */

import type { EventEmitter } from './events.js';
import { ProviderFactory } from '../providers/provider-factory.js';
import {
  resolveModelString,
  resolveModelWithProviderAvailability,
  type EnabledProviders,
} from '@automaker/model-resolver';
import { getModelForUseCase } from './sdk-options.js';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@automaker/utils';
import type { ProviderMessage } from '../providers/types.js';

const logger = createLogger('ProviderQuery');

export interface ProviderQueryOptions {
  /** Working directory */
  cwd: string;
  /** Prompt to send (can be string for text or array for multimodal input with images) */
  prompt: string | Array<{ type: string; text?: string; source?: object }>;
  /** Model to use (resolved by getModelForUseCase if not provided) */
  model?: string;
  /** Use case for model selection ('spec', 'features', 'suggestions', etc.) */
  useCase?: 'spec' | 'features' | 'suggestions' | 'chat' | 'auto' | 'default';
  /** Max turns for the query */
  maxTurns?: number;
  /** Allowed tools */
  allowedTools?: string[];
  /** Abort controller */
  abortController?: AbortController;
  /** Enable CLAUDE.md auto-loading */
  autoLoadClaudeMd?: boolean;
  /** Structured output schema (for Claude SDK or prompt-based for others) */
  outputFormat?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };
  /** API keys for providers (maps provider name to API key) */
  apiKeys?: {
    anthropic?: string;
    zai?: string;
    google?: string;
    openai?: string;
  };
  /** Enabled providers (controls provider availability) */
  enabledProviders?: EnabledProviders;
  /** System prompt to guide the model's behavior */
  systemPrompt?: string;
}

export interface StructuredOutputInfo {
  schema: Record<string, unknown>;
  prompt: string;
}

/**
 * Build a prompt that encourages JSON output matching a schema
 * Used for providers that don't have native structured output support
 */
export function buildStructuredOutputPrompt(
  basePrompt: string,
  schema: Record<string, unknown>
): string {
  const schemaDescription = describeSchema(schema);
  return `${basePrompt}

IMPORTANT: You must respond with valid JSON that matches this schema:
${schemaDescription}

Your response must be ONLY the JSON object, with no additional text, markdown formatting, or explanation.`;
}

/**
 * Generate a human-readable description of a JSON schema
 */
function describeSchema(schema: Record<string, unknown>, indent = 0): string {
  const prefix = '  '.repeat(indent);
  let description = '';

  if (schema.type === 'object' && schema.properties) {
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const required = (schema.required || []) as string[];

    for (const [key, propSchema] of Object.entries(props)) {
      const isRequired = required.includes(key);
      description += `${prefix}${key}: ${describeProperty(propSchema)}`;
      if (isRequired) description += ' (required)';
      description += '\n';

      if (propSchema.type === 'object' && propSchema.properties) {
        description += `${prefix}  Properties:\n`;
        description += describeSchema(propSchema, indent + 2);
      }
    }
  } else if (schema.type === 'array' && schema.items) {
    const items = schema.items as Record<string, unknown>;
    description += `${prefix}Array of: ${describeProperty(items)}\n`;
    if (items.type === 'object' && items.properties) {
      description += describeSchema(items, indent + 1);
    }
  }

  return description;
}

function describeProperty(prop: Record<string, unknown>): string {
  const type = prop.type as string;
  const description = (prop.description || '') as string;

  let desc = type || 'unknown';
  if (prop.enum) {
    desc += ` (one of: ${(prop.enum as string[]).join(', ')})`;
  }
  if (description) {
    desc += ` - ${description}`;
  }
  return desc;
}

/**
 * Execute a query using the provider system
 *
 * This is a provider-agnostic alternative to Claude SDK's query()
 * that works with any provider through the ProviderFactory.
 */
export async function* executeProviderQuery(
  options: ProviderQueryOptions
): AsyncGenerator<
  | ProviderMessage
  | { type: 'result'; subtype?: string; structured_output?: unknown; result?: string }
> {
  const {
    cwd,
    prompt,
    model: explicitModel,
    useCase = 'default',
    maxTurns = 100,
    allowedTools,
    abortController,
    autoLoadClaudeMd = false,
    outputFormat,
    apiKeys,
    enabledProviders,
    systemPrompt: providedSystemPrompt,
  } = options;

  // Resolve the model to use
  let resolvedModel = getModelForUseCase(useCase, explicitModel);

  // Apply provider availability check if enabledProviders is provided
  if (enabledProviders) {
    const fallbackModel = resolveModelWithProviderAvailability(
      resolvedModel,
      enabledProviders,
      explicitModel // Use explicit model as fallback if all providers disabled
    );
    if (fallbackModel !== resolvedModel) {
      logger.info(
        `[ProviderQuery] Model substituted due to provider availability: ${resolvedModel} -> ${fallbackModel}`
      );
    }
    resolvedModel = fallbackModel;
  }

  logger.info(`[ProviderQuery] Using model: ${resolvedModel} for use case: ${useCase}`);

  // Determine the provider and API key
  let apiKey: string | undefined;
  if (apiKeys) {
    // Get provider name directly from model string to avoid instantiating twice
    const { getProviderForModel } = await import('@automaker/model-resolver');
    const providerName = getProviderForModel(resolvedModel);
    logger.info(`[ProviderQuery] Using provider: ${providerName}`);

    // Map provider name to API key
    const apiKeyMap: Record<string, string | undefined> = {
      claude: apiKeys.anthropic,
      zai: apiKeys.zai,
      google: apiKeys.google,
      openai: apiKeys.openai,
    };
    apiKey = apiKeyMap[providerName];
    if (apiKey) {
      logger.info(`[ProviderQuery] Using API key from settings for ${providerName}`);
    }
  } else {
    const { getProviderForModel } = await import('@automaker/model-resolver');
    const providerName = getProviderForModel(resolvedModel);
    logger.info(`[ProviderQuery] Using provider: ${providerName}`);
  }

  // Get provider with API key config if available (instantiated only once)
  const providerWithKey = ProviderFactory.getProviderForModel(
    resolvedModel,
    apiKey ? { apiKey } : undefined
  );

  // Build the final prompt
  let finalPrompt = prompt;

  // For non-Claude providers with structured output, modify the prompt
  // Only applies to string prompts, not array prompts (which may contain images)
  if (outputFormat && providerName !== 'claude' && typeof prompt === 'string') {
    finalPrompt = buildStructuredOutputPrompt(prompt, outputFormat.schema);
    logger.info('[ProviderQuery] Added structured output instructions to prompt');
  }

  // Build system prompt: use provided one, or autoLoadClaudeMd for Claude
  let systemPrompt: string | undefined = providedSystemPrompt;
  if (!systemPrompt && autoLoadClaudeMd && providerName === 'claude') {
    systemPrompt =
      'You are an AI programming assistant. Use the available tools to read and analyze code.';
  }

  // Execute via provider
  const executeOptions = {
    prompt: finalPrompt,
    model: resolvedModel,
    cwd,
    maxTurns,
    allowedTools,
    abortController,
    systemPrompt,
  };

  logger.info('[ProviderQuery] Starting provider execution...');

  let fullResponse = '';
  let structuredOutput: unknown = null;

  try {
    for await (const msg of providerWithKey.executeQuery(executeOptions)) {
      // Emit the raw message
      yield msg;

      // Collect text content
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            fullResponse += block.text;
          }
        }
      }

      // Check for structured output in result messages (Claude SDK format)
      if (msg.type === 'result') {
        const resultMsg = msg as { structured_output?: unknown; subtype?: string };
        if (resultMsg.structured_output) {
          structuredOutput = resultMsg.structured_output;
          logger.info('[ProviderQuery] Received structured output from provider');
        }
      }
    }

    // For non-Claude providers, try to parse structured output from text
    if (outputFormat && !structuredOutput && providerName !== 'claude') {
      logger.info('[ProviderQuery] Attempting to parse structured output from text...');
      structuredOutput = parseJsonFromText(fullResponse);
      if (structuredOutput) {
        logger.info('[ProviderQuery] Successfully parsed structured output from text');
        // Emit the structured output in Claude SDK format
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: structuredOutput,
        };
      } else {
        logger.warn('[ProviderQuery] Failed to parse structured output from text');
      }
    }
  } catch (error) {
    logger.error('[ProviderQuery] Error during execution:', error);
    yield {
      type: 'error',
      error: (error as Error).message,
    };
    throw error;
  }

  logger.info(`[ProviderQuery] Query complete. Response length: ${fullResponse.length} chars`);
}

/**
 * Try to parse JSON from text that may contain conversational content
 * Improved implementation that avoids ReDoS and properly handles nested structures
 */
export function parseJsonFromText(text: string, schema?: Record<string, unknown>): unknown | null {
  // First try to parse the entire text as JSON
  try {
    const parsed = JSON.parse(text);
    if (schema) {
      return validateAgainstSchema(parsed, schema) ? parsed : null;
    }
    return parsed;
  } catch {
    // Not pure JSON, continue to extraction
  }

  // Try to find a complete JSON object by matching braces
  const objectResult = extractJsonBraces(text);
  if (objectResult) {
    try {
      const parsed = JSON.parse(objectResult);
      if (schema) {
        return validateAgainstSchema(parsed, schema) ? parsed : null;
      }
      return parsed;
    } catch {
      // Invalid JSON, continue
    }
  }

  // Try to find a JSON array
  const arrayResult = extractJsonBrackets(text);
  if (arrayResult) {
    try {
      const parsed = JSON.parse(arrayResult);
      if (schema) {
        return validateAgainstSchema(parsed, schema) ? parsed : null;
      }
      return parsed;
    } catch {
      // Invalid JSON
    }
  }

  return null;
}

/**
 * Extract a complete JSON object from text by matching braces
 * This avoids the ReDoS vulnerability of regex /\{[\s\S]*\}/
 */
function extractJsonBraces(text: string): string | null {
  let startPos = text.indexOf('{');
  if (startPos === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startPos; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          // Found complete object
          return text.substring(startPos, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Extract a complete JSON array from text by matching brackets
 */
function extractJsonBrackets(text: string): string | null {
  let startPos = text.indexOf('[');
  if (startPos === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startPos; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '[') {
        depth++;
      } else if (char === ']') {
        depth--;
        if (depth === 0) {
          // Found complete array
          return text.substring(startPos, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Basic schema validation for parsed JSON
 * This is a lightweight validation - for full validation, consider using jsonschema package
 */
function validateAgainstSchema(data: unknown, schema: Record<string, unknown>): boolean {
  if (!schema) return true;

  const schemaType = schema.type as string;

  // Type validation
  if (schemaType === 'object') {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return false;
    }

    // Check required properties
    const required = schema.required as string[] | undefined;
    if (required && Array.isArray(required)) {
      const dataObj = data as Record<string, unknown>;
      for (const prop of required) {
        if (!(prop in dataObj)) {
          return false;
        }
      }
    }

    // Check properties
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties) {
      const dataObj = data as Record<string, unknown>;
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in dataObj) {
          if (!validateAgainstSchema(dataObj[key], propSchema)) {
            return false;
          }
        }
      }
    }
  }

  if (schemaType === 'array') {
    if (!Array.isArray(data)) {
      return false;
    }

    const itemsSchema = schema.items as Record<string, unknown> | undefined;
    if (itemsSchema) {
      for (const item of data) {
        if (!validateAgainstSchema(item, itemsSchema)) {
          return false;
        }
      }
    }
  }

  if (schemaType === 'string') {
    if (typeof data !== 'string') {
      return false;
    }
  }

  if (schemaType === 'number') {
    if (typeof data !== 'number') {
      return false;
    }
  }

  if (schemaType === 'boolean') {
    if (typeof data !== 'boolean') {
      return false;
    }
  }

  // Enum validation
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) {
      return false;
    }
  }

  return true;
}

/**
 * Create provider-agnostic options for spec generation
 * Replaces createSpecGenerationOptions for provider-agnostic use
 */
export function createProviderQueryOptions(
  config: Omit<ProviderQueryOptions, 'prompt'>
): Pick<ProviderQueryOptions, 'model' | 'maxTurns' | 'allowedTools' | 'cwd'> {
  const resolvedModel = getModelForUseCase(config.useCase || 'default', config.model);

  return {
    model: resolvedModel,
    maxTurns: config.maxTurns || 100,
    allowedTools: config.allowedTools,
    cwd: config.cwd,
  };
}
