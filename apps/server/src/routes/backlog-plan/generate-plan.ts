/**
 * Generate backlog plan using Claude AI
 */

import type { EventEmitter } from '../../lib/events.js';
import type { Feature, BacklogPlanResult, BacklogChange, DependencyUpdate } from '@automaker/types';
import { FeatureLoader } from '../../services/feature-loader.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { logger, setRunningState, getErrorMessage } from './common.js';
import type { SettingsService } from '../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting } from '../../lib/settings-helpers.js';

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

    // Build the system prompt
    const systemPrompt = `You are an AI assistant helping to modify a software project's feature backlog.
You will be given the current list of features and a user request to modify the backlog.

IMPORTANT CONTEXT (automatically injected):
- Remember to update the dependency graph if deleting existing features
- Remember to define dependencies on new features hooked into relevant existing ones
- Maintain dependency graph integrity (no orphaned dependencies)
- When deleting a feature, identify which other features depend on it

Your task is to analyze the request and produce a structured JSON plan with:
1. Features to ADD (include title, description, category, and dependencies)
2. Features to UPDATE (specify featureId and the updates)
3. Features to DELETE (specify featureId)
4. A summary of the changes
5. Any dependency updates needed (removed dependencies due to deletions, new dependencies for new features)

Respond with ONLY a JSON object in this exact format:
\`\`\`json
{
  "changes": [
    {
      "type": "add",
      "feature": {
        "title": "Feature title",
        "description": "Feature description",
        "category": "Category name",
        "dependencies": ["existing-feature-id"],
        "priority": 1
      },
      "reason": "Why this feature should be added"
    },
    {
      "type": "update",
      "featureId": "existing-feature-id",
      "feature": {
        "title": "Updated title"
      },
      "reason": "Why this feature should be updated"
    },
    {
      "type": "delete",
      "featureId": "feature-id-to-delete",
      "reason": "Why this feature should be deleted"
    }
  ],
  "summary": "Brief overview of all proposed changes",
  "dependencyUpdates": [
    {
      "featureId": "feature-that-depended-on-deleted",
      "removedDependencies": ["deleted-feature-id"],
      "addedDependencies": []
    }
  ]
}
\`\`\``;

    // Build the user prompt
    const userPrompt = `Current Features in Backlog:
${formatFeaturesForPrompt(features)}

---

User Request: ${prompt}

Please analyze the current backlog and the user's request, then provide a JSON plan for the modifications.`;

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
