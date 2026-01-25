/**
 * Sync spec with current codebase and feature state
 *
 * Updates the spec file based on:
 * - Completed Automaker features
 * - Code analysis for tech stack and implementations
 * - Roadmap phase status updates
 */

import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@automaker/utils';
import { DEFAULT_PHASE_MODELS } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { streamingQuery } from '../../providers/simple-query-service.js';
import { getAppSpecPath } from '@automaker/platform';
import type { SettingsService } from '../../services/settings-service.js';
import {
  getAutoLoadClaudeMdSetting,
  getPhaseModelWithOverrides,
} from '../../lib/settings-helpers.js';
import { FeatureLoader } from '../../services/feature-loader.js';
import {
  extractImplementedFeatures,
  extractTechnologyStack,
  extractRoadmapPhases,
  updateImplementedFeaturesSection,
  updateTechnologyStack,
  updateRoadmapPhaseStatus,
  type ImplementedFeature,
  type RoadmapPhase,
} from '../../lib/xml-extractor.js';
import { getNotificationService } from '../../services/notification-service.js';

const logger = createLogger('SpecSync');

/**
 * Result of a sync operation
 */
export interface SyncResult {
  techStackUpdates: {
    added: string[];
    removed: string[];
  };
  implementedFeaturesUpdates: {
    addedFromFeatures: string[];
    removed: string[];
  };
  roadmapUpdates: Array<{ phaseName: string; newStatus: string }>;
  summary: string;
}

/**
 * Sync the spec with current codebase and feature state
 */
export async function syncSpec(
  projectPath: string,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService
): Promise<SyncResult> {
  logger.info('========== syncSpec() started ==========');
  logger.info('projectPath:', projectPath);

  const result: SyncResult = {
    techStackUpdates: { added: [], removed: [] },
    implementedFeaturesUpdates: { addedFromFeatures: [], removed: [] },
    roadmapUpdates: [],
    summary: '',
  };

  // Read existing spec
  const specPath = getAppSpecPath(projectPath);
  let specContent: string;

  try {
    specContent = (await secureFs.readFile(specPath, 'utf-8')) as string;
    logger.info(`Spec loaded successfully (${specContent.length} chars)`);
  } catch (readError) {
    logger.error('Failed to read spec file:', readError);
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_error',
      error: 'No project spec found. Create or regenerate spec first.',
      projectPath,
    });
    throw new Error('No project spec found');
  }

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: '[Phase: sync] Starting spec sync...\n',
    projectPath,
  });

  // Extract current state from spec
  const currentImplementedFeatures = extractImplementedFeatures(specContent);
  const currentTechStack = extractTechnologyStack(specContent);
  const currentRoadmapPhases = extractRoadmapPhases(specContent);

  logger.info(`Current spec has ${currentImplementedFeatures.length} implemented features`);
  logger.info(`Current spec has ${currentTechStack.length} technologies`);
  logger.info(`Current spec has ${currentRoadmapPhases.length} roadmap phases`);

  // Load completed Automaker features
  const featureLoader = new FeatureLoader();
  const allFeatures = await featureLoader.getAll(projectPath);
  const completedFeatures = allFeatures.filter(
    (f) => f.status === 'completed' || f.status === 'verified'
  );

  logger.info(`Found ${completedFeatures.length} completed/verified features in Automaker`);

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: `Found ${completedFeatures.length} completed features to sync...\n`,
    projectPath,
  });

  // Build new implemented features list from completed Automaker features
  const newImplementedFeatures: ImplementedFeature[] = [];
  const existingNames = new Set(currentImplementedFeatures.map((f) => f.name.toLowerCase()));

  for (const feature of completedFeatures) {
    const name = feature.title || `Feature: ${feature.id}`;
    if (!existingNames.has(name.toLowerCase())) {
      newImplementedFeatures.push({
        name,
        description: feature.description || '',
      });
      result.implementedFeaturesUpdates.addedFromFeatures.push(name);
    }
  }

  // Merge: keep existing + add new from completed features
  const mergedFeatures = [...currentImplementedFeatures, ...newImplementedFeatures];

  // Update spec with merged features
  if (result.implementedFeaturesUpdates.addedFromFeatures.length > 0) {
    specContent = updateImplementedFeaturesSection(specContent, mergedFeatures);
    logger.info(
      `Added ${result.implementedFeaturesUpdates.addedFromFeatures.length} features to spec`
    );
  }

  // Analyze codebase for tech stack updates using AI
  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: 'Analyzing codebase for technology updates...\n',
    projectPath,
  });

  const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
    projectPath,
    settingsService,
    '[SpecSync]'
  );

  // Get model from phase settings with provider info
  const {
    phaseModel: phaseModelEntry,
    provider,
    credentials,
  } = settingsService
    ? await getPhaseModelWithOverrides(
        'specGenerationModel',
        settingsService,
        projectPath,
        '[SpecSync]'
      )
    : {
        phaseModel: DEFAULT_PHASE_MODELS.specGenerationModel,
        provider: undefined,
        credentials: undefined,
      };
  const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

  logger.info('Using model:', model, provider ? `via provider: ${provider.name}` : 'direct API');

  // Use AI to analyze tech stack
  const techAnalysisPrompt = `Analyze this project and return ONLY a JSON object with the current technology stack.

Current known technologies: ${currentTechStack.join(', ')}

Look at package.json, config files, and source code to identify:
- Frameworks (React, Vue, Express, etc.)
- Languages (TypeScript, JavaScript, Python, etc.)
- Build tools (Vite, Webpack, etc.)
- Databases (PostgreSQL, MongoDB, etc.)
- Key libraries and tools

Return ONLY this JSON format, no other text:
{
  "technologies": ["Technology 1", "Technology 2", ...]
}`;

  try {
    const techResult = await streamingQuery({
      prompt: techAnalysisPrompt,
      model,
      cwd: projectPath,
      maxTurns: 10,
      allowedTools: ['Read', 'Glob', 'Grep'],
      abortController,
      thinkingLevel,
      readOnly: true,
      settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
      claudeCompatibleProvider: provider, // Pass provider for alternative endpoint configuration
      credentials, // Pass credentials for resolving 'credentials' apiKeySource
      onText: (text) => {
        logger.debug(`Tech analysis text: ${text.substring(0, 100)}`);
      },
    });

    // Parse tech stack from response
    const jsonMatch = techResult.text.match(/\{[\s\S]*"technologies"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.technologies)) {
        const newTechStack = parsed.technologies as string[];

        // Calculate differences
        const currentSet = new Set(currentTechStack.map((t) => t.toLowerCase()));
        const newSet = new Set(newTechStack.map((t) => t.toLowerCase()));

        for (const tech of newTechStack) {
          if (!currentSet.has(tech.toLowerCase())) {
            result.techStackUpdates.added.push(tech);
          }
        }

        for (const tech of currentTechStack) {
          if (!newSet.has(tech.toLowerCase())) {
            result.techStackUpdates.removed.push(tech);
          }
        }

        // Update spec with new tech stack if there are changes
        if (
          result.techStackUpdates.added.length > 0 ||
          result.techStackUpdates.removed.length > 0
        ) {
          specContent = updateTechnologyStack(specContent, newTechStack);
          logger.info(
            `Updated tech stack: +${result.techStackUpdates.added.length}, -${result.techStackUpdates.removed.length}`
          );
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to analyze tech stack:', error);
    // Continue with other sync operations
  }

  // Update roadmap phase statuses based on completed features
  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_progress',
    content: 'Checking roadmap phase statuses...\n',
    projectPath,
  });

  // For each phase, check if all its features are completed
  // This is a heuristic - we check if the phase name appears in any feature titles/descriptions
  for (const phase of currentRoadmapPhases) {
    if (phase.status === 'completed') continue; // Already completed

    // Check if this phase should be marked as completed
    // A phase is considered complete if we have completed features that mention it
    const phaseNameLower = phase.name.toLowerCase();
    const relatedCompletedFeatures = completedFeatures.filter(
      (f) =>
        f.title?.toLowerCase().includes(phaseNameLower) ||
        f.description?.toLowerCase().includes(phaseNameLower) ||
        f.category?.toLowerCase().includes(phaseNameLower)
    );

    // If we have related completed features and the phase is still pending/in_progress,
    // update it to in_progress or completed based on feature count
    if (relatedCompletedFeatures.length > 0 && phase.status !== 'completed') {
      const newStatus = 'in_progress';
      specContent = updateRoadmapPhaseStatus(specContent, phase.name, newStatus);
      result.roadmapUpdates.push({ phaseName: phase.name, newStatus });
      logger.info(`Updated phase "${phase.name}" to ${newStatus}`);
    }
  }

  // Save updated spec
  await secureFs.writeFile(specPath, specContent, 'utf-8');
  logger.info('Spec saved successfully');

  // Build summary
  const summaryParts: string[] = [];
  if (result.implementedFeaturesUpdates.addedFromFeatures.length > 0) {
    summaryParts.push(
      `Added ${result.implementedFeaturesUpdates.addedFromFeatures.length} implemented features`
    );
  }
  if (result.techStackUpdates.added.length > 0) {
    summaryParts.push(`Added ${result.techStackUpdates.added.length} technologies`);
  }
  if (result.techStackUpdates.removed.length > 0) {
    summaryParts.push(`Removed ${result.techStackUpdates.removed.length} technologies`);
  }
  if (result.roadmapUpdates.length > 0) {
    summaryParts.push(`Updated ${result.roadmapUpdates.length} roadmap phases`);
  }

  result.summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'Spec is already up to date';

  // Create notification
  const notificationService = getNotificationService();
  await notificationService.createNotification({
    type: 'spec_regeneration_complete',
    title: 'Spec Sync Complete',
    message: result.summary,
    projectPath,
  });

  events.emit('spec-regeneration:event', {
    type: 'spec_regeneration_complete',
    message: `Spec sync complete! ${result.summary}`,
    projectPath,
  });

  logger.info('========== syncSpec() completed ==========');
  logger.info('Summary:', result.summary);

  return result;
}
