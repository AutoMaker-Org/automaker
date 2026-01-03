/**
 * Generate backlog plan using Claude AI
 */

import type { EventEmitter } from '../../lib/events.js';
import type { Feature, BacklogPlanResult, BacklogChange, DependencyUpdate } from '@automaker/types';
import { FeatureLoader } from '../../services/feature-loader.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { logger, setRunningState, getErrorMessage } from './common.js';
import type { SettingsService } from '../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting, getPromptCustomization } from '../../lib/settings-helpers.js';

const featureLoader = new FeatureLoader();

/**
 * Format features for the AI prompt
 */
function formatFeaturesForPrompt(features: Feature[]): string {
  if (features.length === 0) {
    return 'No features in backlog yet.';
  }

  return features
    .map((f) => {
      const deps = f.dependencies?.length ? `Dependencies: [${f.dependencies.join(', ')}]` : '';
      const priority = f.priority !== undefined ? `Priority: ${f.priority}` : '';
      return `- ID: ${f.id}
  Title: ${f.title || 'Untitled'}
  Description: ${f.description}
  Category: ${f.category}
  Status: ${f.status || 'backlog'}
  ${priority}
  ${deps}`.trim();
    })
    .join('\n\n');
}

/**
 * Parse the AI response into a BacklogPlanResult
 */
function parsePlanResponse(response: string): BacklogPlanResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // Try to parse the whole response as JSON
    return JSON.parse(response);
  } catch {
    // If parsing fails, return an empty result
    logger.warn('[BacklogPlan] Failed to parse AI response as JSON');
    return {
      changes: [],
      summary: 'Failed to parse AI response',
      dependencyUpdates: [],
    };
  }
}

/**
 * Generate a backlog modification plan based on user prompt
 */
export async function generateBacklogPlan(
  projectPath: string,
  prompt: string,
  events: EventEmitter,
  abortController: AbortController,
  settingsService?: SettingsService,
  model?: string
): Promise<BacklogPlanResult> {
  try {
    // Load current features
    const features = await featureLoader.getAll(projectPath);

    events.emit('backlog-plan:event', {
      type: 'backlog_plan_progress',
      content: `Loaded ${features.length} features from backlog`,
    });

    // Load prompts from settings
    const prompts = await getPromptCustomization(settingsService, '[BacklogPlan]');

    // Build the system prompt
    const systemPrompt = prompts.backlogPlan.systemPrompt;

    // Build the user prompt from template
    const currentFeatures = formatFeaturesForPrompt(features);
    const userPrompt = prompts.backlogPlan.userPromptTemplate
      .replace('{{currentFeatures}}', currentFeatures)
      .replace('{{userRequest}}', prompt);

    events.emit('backlog-plan:event', {
      type: 'backlog_plan_progress',
      content: 'Generating plan with AI...',
    });

    // Get the model to use
    const effectiveModel = model || 'sonnet';
    const provider = ProviderFactory.getProviderForModel(effectiveModel);

    // Get autoLoadClaudeMd setting
    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      settingsService,
      '[BacklogPlan]'
    );

    // Execute the query
    const stream = provider.executeQuery({
      prompt: userPrompt,
      model: effectiveModel,
      cwd: projectPath,
      systemPrompt,
      maxTurns: 1,
      allowedTools: [], // No tools needed for this
      abortController,
      settingSources: autoLoadClaudeMd ? ['user', 'project'] : undefined,
    });

    let responseText = '';

    for await (const msg of stream) {
      if (abortController.signal.aborted) {
        throw new Error('Generation aborted');
      }

      if (msg.type === 'assistant') {
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              responseText += block.text;
            }
          }
        }
      }
    }

    // Parse the response
    const result = parsePlanResponse(responseText);

    events.emit('backlog-plan:event', {
      type: 'backlog_plan_complete',
      result,
    });

    return result;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error('[BacklogPlan] Generation failed:', errorMessage);

    events.emit('backlog-plan:event', {
      type: 'backlog_plan_error',
      error: errorMessage,
    });

    throw error;
  } finally {
    setRunningState(false, null);
  }
}
