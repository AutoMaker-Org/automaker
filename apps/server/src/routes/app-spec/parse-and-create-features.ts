/**
 * Parse agent response and create feature files
 */

import path from 'path';
import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger, atomicWriteJson, DEFAULT_BACKUP_COUNT } from '@automaker/utils';
import { getFeaturesDir } from '@automaker/platform';
import { extractJsonWithArray } from '../../lib/json-extractor.js';
import { getNotificationService } from '../../services/notification-service.js';

const logger = createLogger('SpecRegeneration');

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
    // Extract JSON from response using shared utility
    logger.info('Extracting JSON from response using extractJsonWithArray...');

    interface FeaturesResponse {
      features: Array<{
        id: string;
        category?: string;
        title: string;
        description: string;
        priority?: number;
        complexity?: string;
        dependencies?: string[];
      }>;
    }

    const parsed = extractJsonWithArray<FeaturesResponse>(content, 'features', { logger });

    if (!parsed || !parsed.features) {
      logger.error('❌ No valid JSON with "features" array found in response');
      logger.error('Full content received:');
      logger.error(content);
      throw new Error('No valid JSON found in response');
    }

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

      // Use atomic write with backup support for crash protection
      await atomicWriteJson(path.join(featureDir, 'feature.json'), featureData, {
        backupCount: DEFAULT_BACKUP_COUNT,
      });

      createdFeatures.push({ id: feature.id, title: feature.title });
    }

    logger.info(`✓ Created ${createdFeatures.length} features successfully`);

    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_complete',
      message: `Spec regeneration complete! Created ${createdFeatures.length} features.`,
      projectPath: projectPath,
    });

    // Create notification for spec generation completion
    const notificationService = getNotificationService();
    await notificationService.createNotification({
      type: 'spec_regeneration_complete',
      title: 'Spec Generation Complete',
      message: `Created ${createdFeatures.length} features from the project specification.`,
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
