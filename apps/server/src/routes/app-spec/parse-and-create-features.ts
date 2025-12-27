/**
 * Parse agent response and create feature files
 */

import path from 'path';
import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@automaker/utils';
import { getFeaturesDir } from '@automaker/platform';

const logger = createLogger('SpecRegeneration');

/**
 * Clean and sanitize LLM-generated JSON
 * Handles common issues like trailing commas, comments, etc.
 */
function cleanJson(jsonString: string): string {
  let cleaned = jsonString.trim();

  // Remove trailing commas before closing brackets/braces
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // Remove single-line comments (// ...)
  cleaned = cleaned.replace(/\/\/.*$/gm, '');

  // Remove multi-line comments (/* ... */)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  return cleaned;
}

export async function parseAndCreateFeatures(
  projectPath: string,
  content: string,
  events: EventEmitter
): Promise<void> {
  logger.info('========== parseAndCreateFeatures() started ==========');
  logger.info(`Content length: ${content.length} chars`);
  logger.info('========== CONTENT RECEIVED FOR PARSING ==========');
  logger.info(content);
  logger.info('========== END CONTENT ==========');

  try {
    // Extract JSON from response
    logger.info('Extracting JSON from response...');
    logger.info(`Looking for pattern: /{[\\s\\S]*"features"[\\s\\S]*}/`);
    const jsonMatch = content.match(/\{[\s\S]*"features"[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('❌ No valid JSON found in response');
      logger.error('Full content received:');
      logger.error(content);
      throw new Error('No valid JSON found in response');
    }

    logger.info(`JSON match found (${jsonMatch[0].length} chars)`);

    // Clean the JSON to handle common LLM issues
    const cleanedJson = cleanJson(jsonMatch[0]);
    logger.info('========== MATCHED JSON (cleaned) ==========');
    logger.info(cleanedJson.substring(0, 2000) + (cleanedJson.length > 2000 ? '...' : ''));
    logger.info('========== END MATCHED JSON ==========');

    const parsed = JSON.parse(cleanedJson);
    logger.info(`Parsed ${parsed.features?.length || 0} features`);
    logger.info('Parsed features:', JSON.stringify(parsed.features, null, 2));

    const featuresDir = getFeaturesDir(projectPath);
    await secureFs.mkdir(featuresDir, { recursive: true });

    const createdFeatures: Array<{ id: string; title: string }> = [];

    for (const feature of parsed.features) {
      logger.debug('Creating feature:', feature.id);
      const featureDir = path.join(featuresDir, feature.id);
      await secureFs.mkdir(featureDir, { recursive: true });

      const featureData = {
        id: feature.id,
        category: feature.category || 'Uncategorized',
        title: feature.title,
        description: feature.description,
        status: 'backlog', // Features go to backlog - user must manually start them
        priority: feature.priority || 2,
        complexity: feature.complexity || 'moderate',
        dependencies: feature.dependencies || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await secureFs.writeFile(
        path.join(featureDir, 'feature.json'),
        JSON.stringify(featureData, null, 2)
      );

      createdFeatures.push({ id: feature.id, title: feature.title });
    }

    logger.info(`✓ Created ${createdFeatures.length} features successfully`);

    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_complete',
      message: `Spec regeneration complete! Created ${createdFeatures.length} features.`,
      projectPath: projectPath,
    });
  } catch (error) {
    logger.error('❌ parseAndCreateFeatures() failed:');
    logger.error('Error:', error);
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_error',
      error: (error as Error).message,
      projectPath: projectPath,
    });
  }

  logger.debug('========== parseAndCreateFeatures() completed ==========');
}
