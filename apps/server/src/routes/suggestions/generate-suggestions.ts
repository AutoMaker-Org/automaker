/**
 * Business logic for generating suggestions
 *
 * Model is configurable via phaseModels.suggestionsModel in settings
 * (AI Suggestions in the UI). Supports both Claude and Cursor models.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@automaker/utils';
import {
  DEFAULT_PHASE_MODELS,
  isCursorModel,
  stripProviderPrefix,
  type ThinkingLevel,
} from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { createSuggestionsOptions } from '../../lib/sdk-options.js';
import { extractJsonWithArray } from '../../lib/json-extractor.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { FeatureLoader } from '../../services/feature-loader.js';
import { getAppSpecPath } from '@automaker/platform';
import * as secureFs from '../../lib/secure-fs.js';
import type { SettingsService } from '../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting } from '../../lib/settings-helpers.js';

const logger = createLogger('Suggestions');

/**
 * Extract implemented features from app_spec.txt XML content
 *
 * Note: This uses regex-based parsing which is sufficient for our controlled
 * XML structure. If more complex XML parsing is needed in the future, consider
 * using a library like 'fast-xml-parser' or 'xml2js'.
 */
function extractImplementedFeatures(specContent: string): string[] {
  const features: string[] = [];

  // Match <implemented_features>...</implemented_features> section
  const implementedMatch = specContent.match(
    /<implemented_features>([\s\S]*?)<\/implemented_features>/
  );

  if (implementedMatch) {
    const implementedSection = implementedMatch[1];

    // Extract feature names from <name>...</name> tags using matchAll
    const nameRegex = /<name>(.*?)<\/name>/g;
    const matches = implementedSection.matchAll(nameRegex);

    for (const match of matches) {
      features.push(match[1].trim());
    }
  }

  return features;
}

/**
 * Load existing context (app spec and backlog features) to avoid duplicates
 */
async function loadExistingContext(projectPath: string): Promise<string> {
  let context = '';

  // 1. Read app_spec.txt for implemented features
  try {
    const appSpecPath = getAppSpecPath(projectPath);
    const specContent = (await secureFs.readFile(appSpecPath, 'utf-8')) as string;

    if (specContent && specContent.trim().length > 0) {
      const implementedFeatures = extractImplementedFeatures(specContent);

      if (implementedFeatures.length > 0) {
        context += '\n\n=== ALREADY IMPLEMENTED FEATURES ===\n';
        context += 'These features are already implemented in the codebase:\n';
        context += implementedFeatures.map((feature) => `- ${feature}`).join('\n') + '\n';
      }
    }
  } catch (error) {
    // app_spec.txt doesn't exist or can't be read - that's okay
    logger.debug('No app_spec.txt found or error reading it:', error);
  }

  // 2. Load existing features from backlog
  try {
    const featureLoader = new FeatureLoader();
    const features = await featureLoader.getAll(projectPath);

    if (features.length > 0) {
      context += '\n\n=== EXISTING FEATURES IN BACKLOG ===\n';
      context += 'These features are already planned or in progress:\n';
      context +=
        features
          .map((feature) => {
            const status = feature.status || 'pending';
            const title = feature.title || feature.description?.substring(0, 50) || 'Untitled';
            return `- ${title} (${status})`;
          })
          .join('\n') + '\n';
    }
  } catch (error) {
    // Features directory doesn't exist or can't be read - that's okay
    logger.debug('No features found or error loading them:', error);
  }

  return context;
}

/**
 * JSON Schema for suggestions output
 */
const suggestionsSchema = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          priority: {
            type: 'number',
            minimum: 1,
            maximum: 3,
          },
          reasoning: { type: 'string' },
        },
        required: ['category', 'description', 'priority', 'reasoning'],
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
};

export async function generateSuggestions(
  projectPath: string,
  suggestionType: string,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService,
  modelOverride?: string,
  thinkingLevelOverride?: ThinkingLevel
): Promise<void> {
  const typePrompts: Record<string, string> = {
    features: 'Analyze this project and suggest new features that would add value.',
    refactoring: 'Analyze this project and identify refactoring opportunities.',
    security: 'Analyze this project for security vulnerabilities and suggest fixes.',
    performance: 'Analyze this project for performance issues and suggest optimizations.',
  };

  // Load existing context to avoid duplicates
  const existingContext = await loadExistingContext(projectPath);

  const prompt = `${typePrompts[suggestionType] || typePrompts.features}
${existingContext}

${existingContext ? '\nIMPORTANT: Do NOT suggest features that are already implemented or already in the backlog above. Focus on NEW ideas that complement what already exists.\n' : ''}
Look at the codebase and provide 3-5 concrete suggestions.

For each suggestion, provide:
1. A category (e.g., "User Experience", "Security", "Performance")
2. A clear description of what to implement
3. Priority (1=high, 2=medium, 3=low)
4. Brief reasoning for why this would help

The response will be automatically formatted as structured JSON.`;

  // Don't send initial message - let the agent output speak for itself
  // The first agent message will be captured as an info entry

  // Load autoLoadClaudeMd setting
  const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
    projectPath,
    settingsService,
    '[Suggestions]'
  );

  // Get model from phase settings (AI Suggestions = suggestionsModel)
  // Use override if provided, otherwise fall back to settings
  const settings = await settingsService?.getGlobalSettings();
  let model: string;
  let thinkingLevel: ThinkingLevel | undefined;

  if (modelOverride) {
    // Use explicit override - resolve the model string
    const resolved = resolvePhaseModel({
      model: modelOverride,
      thinkingLevel: thinkingLevelOverride,
    });
    model = resolved.model;
    thinkingLevel = resolved.thinkingLevel;
  } else {
    // Use settings-based model
    const phaseModelEntry =
      settings?.phaseModels?.suggestionsModel || DEFAULT_PHASE_MODELS.suggestionsModel;
    const resolved = resolvePhaseModel(phaseModelEntry);
    model = resolved.model;
    thinkingLevel = resolved.thinkingLevel;
  }

  logger.info('[Suggestions] Using model:', model);

  let responseText = '';
  let structuredOutput: { suggestions: Array<Record<string, unknown>> } | null = null;

  // Route to appropriate provider based on model type
  if (isCursorModel(model)) {
    // Use Cursor provider for Cursor models
    logger.info('[Suggestions] Using Cursor provider');

    const provider = ProviderFactory.getProviderForModel(model);
    // Strip provider prefix - providers expect bare model IDs
    const bareModel = stripProviderPrefix(model);

    // For Cursor, include the JSON schema in the prompt with clear instructions
    const cursorPrompt = `${prompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. Return the JSON in your response only.
2. After analyzing the project, respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
3. The JSON must match this exact schema:

${JSON.stringify(suggestionsSchema, null, 2)}

Your entire response should be valid JSON starting with { and ending with }. No text before or after.`;

    for await (const msg of provider.executeQuery({
      prompt: cursorPrompt,
      model: bareModel,
      cwd: projectPath,
      maxTurns: 250,
      allowedTools: ['Read', 'Glob', 'Grep'],
      abortController,
      readOnly: true, // Suggestions only reads code, doesn't write
    })) {
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            responseText += block.text;
            events.emit('suggestions:event', {
              type: 'suggestions_progress',
              content: block.text,
            });
          } else if (block.type === 'tool_use') {
            events.emit('suggestions:event', {
              type: 'suggestions_tool',
              tool: block.name,
              input: block.input,
            });
          }
        }
      } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
        // Use result if it's a final accumulated message (from Cursor provider)
        logger.info('[Suggestions] Received result from Cursor, length:', msg.result.length);
        logger.info('[Suggestions] Previous responseText length:', responseText.length);
        if (msg.result.length > responseText.length) {
          logger.info('[Suggestions] Using Cursor result (longer than accumulated text)');
          responseText = msg.result;
        } else {
          logger.info('[Suggestions] Keeping accumulated text (longer than Cursor result)');
        }
      }
    }
  } else {
    // Use Claude SDK for Claude models
    logger.info('[Suggestions] Using Claude SDK');

    const options = createSuggestionsOptions({
      cwd: projectPath,
      abortController,
      autoLoadClaudeMd,
      model, // Pass the model from settings
      thinkingLevel, // Pass thinking level for extended thinking
      outputFormat: {
        type: 'json_schema',
        schema: suggestionsSchema,
      },
    });

    const stream = query({ prompt, options });

    for await (const msg of stream) {
      if (msg.type === 'assistant' && msg.message.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            responseText += block.text;
            events.emit('suggestions:event', {
              type: 'suggestions_progress',
              content: block.text,
            });
          } else if (block.type === 'tool_use') {
            events.emit('suggestions:event', {
              type: 'suggestions_tool',
              tool: block.name,
              input: block.input,
            });
          }
        }
      } else if (msg.type === 'result' && msg.subtype === 'success') {
        // Check for structured output
        const resultMsg = msg as any;
        if (resultMsg.structured_output) {
          structuredOutput = resultMsg.structured_output as {
            suggestions: Array<Record<string, unknown>>;
          };
          logger.debug('Received structured output:', structuredOutput);
        }
      } else if (msg.type === 'result') {
        const resultMsg = msg as any;
        if (resultMsg.subtype === 'error_max_structured_output_retries') {
          logger.error('Failed to produce valid structured output after retries');
          throw new Error('Could not produce valid suggestions output');
        } else if (resultMsg.subtype === 'error_max_turns') {
          logger.error('Hit max turns limit before completing suggestions generation');
          logger.warn(`Response text length: ${responseText.length} chars`);
          // Still try to parse what we have
        }
      }
    }
  }

  // Use structured output if available, otherwise fall back to parsing text
  try {
    if (structuredOutput && structuredOutput.suggestions) {
      // Use structured output directly
      events.emit('suggestions:event', {
        type: 'suggestions_complete',
        suggestions: structuredOutput.suggestions.map((s: Record<string, unknown>, i: number) => ({
          ...s,
          id: s.id || `suggestion-${Date.now()}-${i}`,
        })),
      });
    } else {
      // Fallback: try to parse from text using shared extraction utility
      logger.warn('No structured output received, attempting to parse from text');
      const parsed = extractJsonWithArray<{ suggestions: Array<Record<string, unknown>> }>(
        responseText,
        'suggestions',
        { logger }
      );
      if (parsed && parsed.suggestions) {
        events.emit('suggestions:event', {
          type: 'suggestions_complete',
          suggestions: parsed.suggestions.map((s: Record<string, unknown>, i: number) => ({
            ...s,
            id: s.id || `suggestion-${Date.now()}-${i}`,
          })),
        });
      } else {
        throw new Error('No valid JSON found in response');
      }
    }
  } catch (error) {
    // Log the parsing error for debugging
    logger.error('Failed to parse suggestions JSON from AI response:', error);
    // Return generic suggestions if parsing fails
    events.emit('suggestions:event', {
      type: 'suggestions_complete',
      suggestions: [
        {
          id: `suggestion-${Date.now()}-0`,
          category: 'Analysis',
          description: 'Review the AI analysis output for insights',
          priority: 1,
          reasoning: 'The AI provided analysis but suggestions need manual review',
        },
      ],
    });
  }
}
