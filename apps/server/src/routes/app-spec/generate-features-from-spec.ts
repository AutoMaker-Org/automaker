/**
 * Generate features from existing app_spec.txt
 *
 * Model is configurable via phaseModels.featureGenerationModel in settings
 * (defaults to Sonnet for balanced speed and quality).
 */

import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@automaker/utils';
import { DEFAULT_PHASE_MODELS } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { streamingQuery } from '../../providers/simple-query-service.js';
import { parseAndCreateFeatures } from './parse-and-create-features.js';
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
  const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

  logger.info('Using model:', model, provider ? `via provider: ${provider.name}` : 'direct API');

  // Use streamingQuery with event callbacks
  const result = await streamingQuery({
    prompt,
    model,
    cwd: projectPath,
    maxTurns: 250,
    allowedTools: ['Read', 'Glob', 'Grep'],
    abortController,
    thinkingLevel,
    readOnly: true, // Feature generation only reads code, doesn't write
    settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
    claudeCompatibleProvider: provider, // Pass provider for alternative endpoint configuration
    credentials, // Pass credentials for resolving 'credentials' apiKeySource
    onText: (text) => {
      logger.debug(`Feature text block received (${text.length} chars)`);
      events.emit('spec-regeneration:event', {
        type: 'spec_regeneration_progress',
        content: text,
        projectPath: projectPath,
      });
    },
  });

  const responseText = result.text;

  logger.info(`Feature stream complete.`);
  logger.info(`Feature response length: ${responseText.length} chars`);
  logger.info('========== FULL RESPONSE TEXT ==========');
  logger.info(responseText);
  logger.info('========== END RESPONSE TEXT ==========');

  await parseAndCreateFeatures(projectPath, responseText, events);

  logger.debug('========== generateFeaturesFromSpec() completed ==========');
}
