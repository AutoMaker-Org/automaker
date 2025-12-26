/**
 * Business logic for generating suggestions
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@automaker/utils';
import { createSuggestionsOptions } from '../../lib/sdk-options.js';
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
  settingsService?: SettingsService
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

  const options = createSuggestionsOptions({
    cwd: projectPath,
    abortController,
    autoLoadClaudeMd,
    outputFormat: {
      type: 'json_schema',
      schema: suggestionsSchema,
    },
  });

  const stream = query({ prompt, options });
  let responseText = '';
  let structuredOutput: { suggestions: Array<Record<string, unknown>> } | null = null;

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
      // Fallback: try to parse from text (for backwards compatibility)
      logger.warn('No structured output received, attempting to parse from text');
      const jsonMatch = responseText.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
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
