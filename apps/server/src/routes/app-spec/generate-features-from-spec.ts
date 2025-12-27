/**
 * Generate features from existing app_spec.txt
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@automaker/utils';
import { createFeatureGenerationOptions } from '../../lib/sdk-options.js';
import { logAuthStatus } from './common.js';
import { parseAndCreateFeatures } from './parse-and-create-features.js';
import { getAppSpecPath } from '@automaker/platform';
import type { SettingsService } from '../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting } from '../../lib/settings-helpers.js';

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

  const prompt = `Based on this project specification:

${spec}

Generate a prioritized list of implementable features. For each feature provide:

1. **id**: A unique lowercase-hyphenated identifier
2. **category**: Functional category (e.g., "Core", "UI", "API", "Authentication", "Database")
3. **title**: Short descriptive title
4. **description**: What this feature does (2-3 sentences)
5. **priority**: 1 (high), 2 (medium), or 3 (low)
6. **complexity**: "simple", "moderate", or "complex"
7. **dependencies**: Array of feature IDs this depends on (can be empty)

Format as JSON:
{
  "features": [
    {
      "id": "feature-id",
      "category": "Feature Category",
      "title": "Feature Title",
      "description": "What it does",
      "priority": 1,
      "complexity": "moderate",
      "dependencies": []
    }
  ]
}

Generate ${featureCount} features that build on each other logically.

IMPORTANT: Do not ask for clarification. The specification is provided above. Generate the JSON immediately.`;

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

  const options = createFeatureGenerationOptions({
    cwd: projectPath,
    abortController,
    autoLoadClaudeMd,
  });

  logger.debug('SDK Options:', JSON.stringify(options, null, 2));
  logger.info('Calling Claude Agent SDK query() for features...');

  logAuthStatus('Right before SDK query() for features');

  let stream;
  try {
    stream = query({ prompt, options });
    logger.debug('query() returned stream successfully');
  } catch (queryError) {
    logger.error('❌ query() threw an exception:');
    logger.error('Error:', queryError);
    throw queryError;
  }

  let responseText = '';
  let messageCount = 0;

  logger.debug('Starting to iterate over feature stream...');

  try {
    for await (const msg of stream) {
      messageCount++;
      logger.debug(
        `Feature stream message #${messageCount}:`,
        JSON.stringify({ type: msg.type, subtype: (msg as any).subtype }, null, 2)
      );

      if (msg.type === 'assistant' && msg.message.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            responseText += block.text;
            logger.debug(`Feature text block received (${block.text.length} chars)`);
            events.emit('spec-regeneration:event', {
              type: 'spec_regeneration_progress',
              content: block.text,
              projectPath: projectPath,
            });
          }
        }
      } else if (msg.type === 'result' && (msg as any).subtype === 'success') {
        logger.debug('Received success result for features');
        responseText = (msg as any).result || responseText;
      } else if ((msg as { type: string }).type === 'error') {
        logger.error('❌ Received error message from feature stream:');
        logger.error('Error message:', JSON.stringify(msg, null, 2));
      }
    }
  } catch (streamError) {
    logger.error('❌ Error while iterating feature stream:');
    logger.error('Stream error:', streamError);
    throw streamError;
  }

  logger.info(`Feature stream complete. Total messages: ${messageCount}`);
  logger.info(`Feature response length: ${responseText.length} chars`);
  logger.info('========== FULL RESPONSE TEXT ==========');
  logger.info(responseText);
  logger.info('========== END RESPONSE TEXT ==========');

  await parseAndCreateFeatures(projectPath, responseText, events);

  logger.debug('========== generateFeaturesFromSpec() completed ==========');
}
