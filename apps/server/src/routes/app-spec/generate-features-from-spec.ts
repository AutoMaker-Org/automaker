/**
 * Generate features from existing app_spec.txt
 *
 * Model is configurable via phaseModels.featureGenerationModel in settings
 * (defaults to Sonnet for balanced speed and quality).
 */

import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@automaker/utils';
import { DEFAULT_PHASE_MODELS, supportsStructuredOutput, isCodexModel } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { streamingQuery } from '../../providers/simple-query-service.js';
import { parseAndCreateFeatures } from './parse-and-create-features.js';
import { extractJsonWithArray } from '../../lib/json-extractor.js';
import { getAppSpecPath } from '@automaker/platform';
import type { SettingsService } from '../../services/settings-service.js';
import {
  getAutoLoadClaudeMdSetting,
  getPromptCustomization,
  getPhaseModelWithOverrides,
} from '../../lib/settings-helpers.js';
import { FeatureLoader } from '../../services/feature-loader.js';

const logger = createLogger('SpecRegeneration');

const DEFAULT_MAX_FEATURES = 50;

/**
 * Timeout for Codex models when generating features (5 minutes).
 * Codex models are slower and need more time to generate 50+ features.
 */
const _CODEX_FEATURE_GENERATION_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Type for extracted features JSON response
 */
interface FeaturesExtractionResult {
  features: Array<{
    id: string;
    category?: string;
    title: string;
    description: string;
    priority?: number;
    complexity?: 'simple' | 'moderate' | 'complex';
    dependencies?: string[];
  }>;
}

/**
 * JSON schema for features output format (Claude/Codex structured output)
 */
const featuresOutputSchema = {
  type: 'object',
  properties: {
    features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique feature identifier (kebab-case)' },
          category: { type: 'string', description: 'Feature category' },
          title: { type: 'string', description: 'Short, descriptive title' },
          description: { type: 'string', description: 'Detailed feature description' },
          priority: {
            type: 'number',
            description: 'Priority level: 1 (highest) to 5 (lowest)',
          },
          complexity: {
            type: 'string',
            enum: ['simple', 'moderate', 'complex'],
            description: 'Implementation complexity',
          },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of features this depends on',
          },
        },
        required: ['id', 'title', 'description'],
      },
    },
  },
  required: ['features'],
} as const;

export async function generateFeaturesFromSpec(
  projectPath: string,
  events: EventEmitter,
  abortController: AbortController,
  maxFeatures?: number,
  settingsService?: SettingsService
): Promise<void> {
  const featureCount = maxFeatures ?? DEFAULT_MAX_FEATURES;
  logger.debug('========== generateFeaturesFromSpec() started ==========');
  logger.debug('projectPath:', projectPath);
  logger.debug('maxFeatures:', featureCount);

  // Read existing spec from .automaker directory
  const specPath = getAppSpecPath(projectPath);
  let spec: string;

  logger.debug('Reading spec from:', specPath);

  try {
    spec = (await secureFs.readFile(specPath, 'utf-8')) as string;
    logger.info(`Spec loaded successfully (${spec.length} chars)`);
    logger.info(`Spec preview (first 500 chars): ${spec.substring(0, 500)}`);
    logger.info(`Spec preview (last 500 chars): ${spec.substring(spec.length - 500)}`);
  } catch (readError) {
    logger.error('❌ Failed to read spec file:', readError);
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_error',
      error: 'No project spec found. Generate spec first.',
      projectPath: projectPath,
    });
    return;
  }

  // Get customized prompts from settings
  const prompts = await getPromptCustomization(settingsService, '[FeatureGeneration]');

  // Load existing features to prevent duplicates
  const featureLoader = new FeatureLoader();
  const existingFeatures = await featureLoader.getAll(projectPath);

  logger.info(`Found ${existingFeatures.length} existing features to exclude from generation`);

  // Build existing features context for the prompt
  let existingFeaturesContext = '';
  if (existingFeatures.length > 0) {
    const featuresList = existingFeatures
      .map(
        (f) =>
          `- "${f.title}" (ID: ${f.id}): ${f.description?.substring(0, 100) || 'No description'}`
      )
      .join('\n');
    existingFeaturesContext = `

## EXISTING FEATURES (DO NOT REGENERATE THESE)

The following ${existingFeatures.length} features already exist in the project. You MUST NOT generate features that duplicate or overlap with these:

${featuresList}

CRITICAL INSTRUCTIONS:
- DO NOT generate any features with the same or similar titles as the existing features listed above
- DO NOT generate features that cover the same functionality as existing features
- ONLY generate NEW features that are not yet in the system
- If a feature from the roadmap already exists, skip it entirely
- Generate unique feature IDs that do not conflict with existing IDs: ${existingFeatures.map((f) => f.id).join(', ')}
`;
  }

  const prompt = `Based on this project specification:

${spec}
${existingFeaturesContext}
${prompts.appSpec.generateFeaturesFromSpecPrompt}

Generate ${featureCount} NEW features that build on each other logically. Remember: ONLY generate features that DO NOT already exist.`;

  logger.info('========== PROMPT BEING SENT ==========');
  logger.info(`Prompt length: ${prompt.length} chars`);
  logger.info(`Prompt preview (first 1000 chars):\n${prompt.substring(0, 1000)}`);
  logger.info('========== END PROMPT PREVIEW ==========');

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: 'Analyzing spec and generating features...\n',
    projectPath: projectPath,
  });

  // Load autoLoadClaudeMd setting
  const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
    projectPath,
    settingsService,
    '[FeatureGeneration]'
  );

  // Get model from phase settings with provider info
  const {
    phaseModel: phaseModelEntry,
    provider,
    credentials,
  } = settingsService
    ? await getPhaseModelWithOverrides(
        'featureGenerationModel',
        settingsService,
        projectPath,
        '[FeatureGeneration]'
      )
    : {
        phaseModel: DEFAULT_PHASE_MODELS.featureGenerationModel,
        provider: undefined,
        credentials: undefined,
      };
  const { model, thinkingLevel, reasoningEffort } = resolvePhaseModel(phaseModelEntry);

  logger.info('Using model:', model, provider ? `via provider: ${provider.name}` : 'direct API');

  // Codex models need extended timeout for generating many features.
  // Use 'xhigh' reasoning effort to get 5-minute timeout (300s base * 1.0x = 300s).
  // The Codex provider has a special 5-minute base timeout for feature generation.
  const isCodex = isCodexModel(model);
  const effectiveReasoningEffort = isCodex ? 'xhigh' : reasoningEffort;

  if (isCodex) {
    logger.info('Codex model detected - using extended timeout (5 minutes for feature generation)');
  }
  if (effectiveReasoningEffort) {
    logger.info('Reasoning effort:', effectiveReasoningEffort);
  }

  // Determine if we should use structured output based on model type
  const useStructuredOutput = supportsStructuredOutput(model);
  logger.info(
    `Structured output mode: ${useStructuredOutput ? 'enabled (Claude/Codex)' : 'disabled (using JSON instructions)'}`
  );

  // Build the final prompt - for non-Claude/Codex models, include explicit JSON instructions
  let finalPrompt = prompt;
  if (!useStructuredOutput) {
    finalPrompt = `${prompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. Return the JSON in your response only.
2. After analyzing the spec, respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
3. The JSON must have this exact structure:
{
  "features": [
    {
      "id": "unique-feature-id",
      "category": "Category Name",
      "title": "Short Feature Title",
      "description": "Detailed description of the feature",
      "priority": 1,
      "complexity": "simple|moderate|complex",
      "dependencies": ["other-feature-id"]
    }
  ]
}

4. Feature IDs must be unique, lowercase, kebab-case (e.g., "user-authentication", "data-export")
5. Priority ranges from 1 (highest) to 5 (lowest)
6. Complexity must be one of: "simple", "moderate", "complex"
7. Dependencies is an array of feature IDs that must be completed first (can be empty)

Your entire response should be valid JSON starting with { and ending with }. No text before or after.`;
  }

  // Use streamingQuery with event callbacks
  const result = await streamingQuery({
    prompt: finalPrompt,
    model,
    cwd: projectPath,
    maxTurns: 250,
    allowedTools: ['Read', 'Glob', 'Grep'],
    abortController,
    thinkingLevel,
    reasoningEffort: effectiveReasoningEffort, // Extended timeout for Codex models
    readOnly: true, // Feature generation only reads code, doesn't write
    settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
    claudeCompatibleProvider: provider, // Pass provider for alternative endpoint configuration
    credentials, // Pass credentials for resolving 'credentials' apiKeySource
    outputFormat: useStructuredOutput
      ? {
          type: 'json_schema',
          schema: featuresOutputSchema,
        }
      : undefined,
    onText: (text) => {
      logger.debug(`Feature text block received (${text.length} chars)`);
      events.emit('spec-regeneration:event', {
        type: 'spec_regeneration_progress',
        content: text,
        projectPath: projectPath,
      });
    },
  });

  // Get response content - prefer structured output if available
  let contentForParsing: string;

  if (result.structured_output) {
    // Use structured output from Claude/Codex models
    logger.info('✅ Received structured output from model');
    contentForParsing = JSON.stringify(result.structured_output);
    logger.debug('Structured output:', contentForParsing);
  } else {
    // Use text response (for non-Claude/Codex models or fallback)
    // Pre-extract JSON to handle conversational text that may surround the JSON response
    // This follows the same pattern used in generate-spec.ts and validate-issue.ts
    const rawText = result.text;
    logger.info(`Feature stream complete.`);
    logger.info(`Feature response length: ${rawText.length} chars`);
    logger.info('========== FULL RESPONSE TEXT ==========');
    logger.info(rawText);
    logger.info('========== END RESPONSE TEXT ==========');

    // Pre-extract JSON from response - handles conversational text around the JSON
    const extracted = extractJsonWithArray<FeaturesExtractionResult>(rawText, 'features', {
      logger,
    });
    if (extracted) {
      contentForParsing = JSON.stringify(extracted);
      logger.info('✅ Pre-extracted JSON from text response');
    } else {
      // If pre-extraction fails, we know the next step will also fail.
      // Throw an error here to avoid redundant parsing and make the failure point clearer.
      logger.error(
        '❌ Could not extract features JSON from model response. Full response text was:\n' +
          rawText
      );
      const errorMessage =
        'Failed to parse features from model response: No valid JSON with a "features" array found.';
      events.emit('spec-regeneration:event', {
        type: 'spec_regeneration_error',
        error: errorMessage,
        projectPath: projectPath,
      });
      throw new Error(errorMessage);
    }
  }

  await parseAndCreateFeatures(projectPath, contentForParsing, events, settingsService);

  logger.debug('========== generateFeaturesFromSpec() completed ==========');
}
