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
import { resolveModelString } from '@automaker/model-resolver';
import { getModelForUseCase } from './sdk-options.js';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@automaker/utils';
import type { ProviderMessage } from '../providers/types.js';

const logger = createLogger('ProviderQuery');

export interface ProviderQueryOptions {
  /** Working directory */
  cwd: string;
  /** Prompt to send */
  prompt: string;
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
  } = options;

  // Resolve the model to use
  const resolvedModel = getModelForUseCase(useCase, explicitModel);
  logger.info(`[ProviderQuery] Using model: ${resolvedModel} for use case: ${useCase}`);

  // Determine the appropriate API key for this model
  let apiKey: string | undefined;
  if (apiKeys) {
    const lowerModel = resolvedModel.toLowerCase();
    if (lowerModel.startsWith('glm-')) {
      apiKey = apiKeys.zai;
    } else if (
      lowerModel.startsWith('claude-') ||
      ['haiku', 'sonnet', 'opus'].includes(lowerModel)
    ) {
      apiKey = apiKeys.anthropic;
    }
    if (apiKey) {
      logger.info(`[ProviderQuery] Using API key from settings for provider`);
    }
  }

  // Get the provider for this model with config
  const provider = ProviderFactory.getProviderForModel(
    resolvedModel,
    apiKey ? { apiKey } : undefined
  );
  const providerName = provider.getName();
  logger.info(`[ProviderQuery] Using provider: ${providerName}`);

  // Build the final prompt
  let finalPrompt = prompt;

  // For non-Claude providers with structured output, modify the prompt
  if (outputFormat && providerName !== 'claude') {
    finalPrompt = buildStructuredOutputPrompt(prompt, outputFormat.schema);
    logger.info('[ProviderQuery] Added structured output instructions to prompt');
  }

  // Build system prompt if autoLoadClaudeMd is enabled (Claude only)
  let systemPrompt: string | undefined;
  if (autoLoadClaudeMd && providerName === 'claude') {
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
    for await (const msg of provider.executeQuery(executeOptions)) {
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
 */
function parseJsonFromText(text: string): unknown | null {
  // Try to find JSON in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Try to find a JSON array
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
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
