/**
 * Generate backlog plan using Claude AI
 *
 * Model is configurable via phaseModels.backlogPlanningModel in settings
 * (defaults to Sonnet). Can be overridden per-call via model parameter.
 *
 * Includes automatic retry for transient CLI failures (e.g., "Claude Code
 * process exited unexpectedly") to improve reliability.
 */

import type { EventEmitter } from '../../lib/events.js';
import type { Feature, BacklogPlanResult } from '@automaker/types';
import {
  DEFAULT_PHASE_MODELS,
  isCursorModel,
  stripProviderPrefix,
  type ThinkingLevel,
  type SystemPromptPreset,
} from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { getCurrentBranch } from '@automaker/git-utils';
import { FeatureLoader } from '../../services/feature-loader.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { extractJsonWithArray } from '../../lib/json-extractor.js';
import {
  logger,
  setRunningState,
  setRunningDetails,
  getErrorMessage,
  saveBacklogPlan,
} from './common.js';
import type { SettingsService } from '../../services/settings-service.js';
import {
  getAutoLoadClaudeMdSetting,
  getUseClaudeCodeSystemPromptSetting,
  getPromptCustomization,
  getPhaseModelWithOverrides,
} from '../../lib/settings-helpers.js';

/** Maximum number of retry attempts for transient CLI failures */
const MAX_RETRIES = 2;
/** Delay between retries in milliseconds */
const RETRY_DELAY_MS = 2000;

/**
 * Check if an error is retryable (transient CLI process failure)
 */
function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Claude Code process exited') ||
    message.includes('Claude Code process terminated by signal')
  );
}

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
  // Use shared JSON extraction utility for robust parsing
  // extractJsonWithArray validates that 'changes' exists AND is an array
  const parsed = extractJsonWithArray<BacklogPlanResult>(response, 'changes', {
    logger,
  });

  if (parsed) {
    return parsed;
  }

  // If parsing fails, log details and return an empty result
  logger.warn('[BacklogPlan] Failed to parse AI response as JSON');
  logger.warn('[BacklogPlan] Response text length:', response.length);
  logger.warn('[BacklogPlan] Response preview:', response.slice(0, 500));
  if (response.length === 0) {
    logger.error('[BacklogPlan] Response text is EMPTY! No content was extracted from stream.');
  }
  return {
    changes: [],
    summary: 'Failed to parse AI response',
    dependencyUpdates: [],
  };
}

/**
 * Try to parse a valid plan response without fallback behavior.
 * Returns null if parsing fails.
 */
function tryParsePlanResponse(response: string): BacklogPlanResult | null {
  if (!response || response.trim().length === 0) {
    return null;
  }
  return extractJsonWithArray<BacklogPlanResult>(response, 'changes', { logger });
}

/**
 * Choose the most reliable response text between streamed assistant chunks
 * and provider final result payload.
 */
function selectBestResponseText(accumulatedText: string, providerResultText: string): string {
  const hasAccumulated = accumulatedText.trim().length > 0;
  const hasProviderResult = providerResultText.trim().length > 0;

  if (!hasProviderResult) {
    return accumulatedText;
  }
  if (!hasAccumulated) {
    return providerResultText;
  }

  const accumulatedParsed = tryParsePlanResponse(accumulatedText);
  const providerParsed = tryParsePlanResponse(providerResultText);

  if (providerParsed && !accumulatedParsed) {
    logger.info('[BacklogPlan] Using provider result (parseable JSON)');
    return providerResultText;
  }
  if (accumulatedParsed && !providerParsed) {
    logger.info('[BacklogPlan] Keeping accumulated text (parseable JSON)');
    return accumulatedText;
  }

  if (providerResultText.length > accumulatedText.length) {
    logger.info('[BacklogPlan] Using provider result (longer content)');
    return providerResultText;
  }

  logger.info('[BacklogPlan] Keeping accumulated text (longer content)');
  return accumulatedText;
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
  model?: string,
  branchName?: string
): Promise<BacklogPlanResult> {
  try {
    // Load current features
    const allFeatures = await featureLoader.getAll(projectPath);

    // Filter features by branch if specified (worktree-scoped backlog)
    let features: Feature[];
    if (branchName) {
      // Determine the primary branch so unassigned features show for the main worktree
      let primaryBranch: string | null = null;
      try {
        primaryBranch = await getCurrentBranch(projectPath);
      } catch {
        // If git fails, fall back to 'main' so unassigned features are visible
        // when branchName matches a common default branch name
        primaryBranch = 'main';
      }
      const isMainBranch = branchName === primaryBranch;

      features = allFeatures.filter((f) => {
        if (!f.branchName) {
          // Unassigned features belong to the main/primary worktree
          return isMainBranch;
        }
        return f.branchName === branchName;
      });
      logger.info(
        `[BacklogPlan] Filtered to ${features.length}/${allFeatures.length} features for branch: ${branchName}`
      );
    } else {
      features = allFeatures;
    }

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

    // Get the model to use from settings or provided override with provider info
    let effectiveModel = model;
    let thinkingLevel: ThinkingLevel | undefined;
    let claudeCompatibleProvider: import('@automaker/types').ClaudeCompatibleProvider | undefined;
    let credentials: import('@automaker/types').Credentials | undefined;

    if (effectiveModel) {
      // Use explicit override - resolve model alias and get credentials
      const resolved = resolvePhaseModel({ model: effectiveModel });
      effectiveModel = resolved.model;
      thinkingLevel = resolved.thinkingLevel;
      credentials = await settingsService?.getCredentials();
    } else if (settingsService) {
      // Use settings-based model with provider info
      const phaseResult = await getPhaseModelWithOverrides(
        'backlogPlanningModel',
        settingsService,
        projectPath,
        '[BacklogPlan]'
      );
      const resolved = resolvePhaseModel(phaseResult.phaseModel);
      effectiveModel = resolved.model;
      thinkingLevel = resolved.thinkingLevel;
      claudeCompatibleProvider = phaseResult.provider;
      credentials = phaseResult.credentials;
    } else {
      // Fallback to defaults
      const resolved = resolvePhaseModel(DEFAULT_PHASE_MODELS.backlogPlanningModel);
      effectiveModel = resolved.model;
      thinkingLevel = resolved.thinkingLevel;
    }
    logger.info(
      '[BacklogPlan] Using model:',
      effectiveModel,
      claudeCompatibleProvider ? `via provider: ${claudeCompatibleProvider.name}` : 'direct API'
    );

    const provider = ProviderFactory.getProviderForModel(effectiveModel);
    // Strip provider prefix - providers expect bare model IDs
    const bareModel = stripProviderPrefix(effectiveModel);

    // Get autoLoadClaudeMd and useClaudeCodeSystemPrompt settings
    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      settingsService,
      '[BacklogPlan]'
    );
    const useClaudeCodeSystemPrompt = await getUseClaudeCodeSystemPromptSetting(
      projectPath,
      settingsService,
      '[BacklogPlan]'
    );

    // For Cursor models, we need to combine prompts with explicit instructions
    // because Cursor doesn't support systemPrompt separation like Claude SDK
    let finalPrompt = userPrompt;
    let finalSystemPrompt: string | SystemPromptPreset | undefined = systemPrompt;
    let finalSettingSources: Array<'user' | 'project' | 'local'> | undefined;

    if (isCursorModel(effectiveModel)) {
      logger.info('[BacklogPlan] Using Cursor model - adding explicit no-file-write instructions');
      finalPrompt = `${systemPrompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. Return the JSON in your response only.
2. DO NOT use Write, Edit, or any file modification tools.
3. Respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
4. Your entire response should be valid JSON starting with { and ending with }.
5. No text before or after the JSON object.

${userPrompt}`;
      finalSystemPrompt = undefined; // System prompt is now embedded in the user prompt
    } else if (useClaudeCodeSystemPrompt) {
      // Use claude_code preset for Claude models so the SDK subprocess
      // authenticates via CLI OAuth or API key the same way all other SDK calls do.
      finalSystemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: systemPrompt,
      };
    }
    // Include settingSources when autoLoadClaudeMd is enabled
    if (autoLoadClaudeMd) {
      finalSettingSources = ['user', 'project'];
    }

    // Execute the query with retry logic for transient CLI failures
    const queryOptions = {
      prompt: finalPrompt,
      model: bareModel,
      cwd: projectPath,
      systemPrompt: finalSystemPrompt,
      maxTurns: 1,
      tools: [] as string[], // Disable all built-in tools - plan generation only needs text output
      abortController,
      settingSources: finalSettingSources,
      thinkingLevel, // Pass thinking level for extended thinking
      claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
      credentials, // Pass credentials for resolving 'credentials' apiKeySource
    };

    let responseText = '';
    let bestResponseText = ''; // Preserve best response across all retry attempts
    let recoveredResult: BacklogPlanResult | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (abortController.signal.aborted) {
        throw new Error('Generation aborted');
      }

      if (attempt > 0) {
        logger.info(
          `[BacklogPlan] Retry attempt ${attempt}/${MAX_RETRIES} after transient failure`
        );
        events.emit('backlog-plan:event', {
          type: 'backlog_plan_progress',
          content: `Retrying... (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
        });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }

      let accumulatedText = '';
      let providerResultText = '';

      try {
        const stream = provider.executeQuery(queryOptions);

        for await (const msg of stream) {
          if (abortController.signal.aborted) {
            throw new Error('Generation aborted');
          }

          if (msg.type === 'assistant') {
            if (msg.message?.content) {
              for (const block of msg.message.content) {
                if (block.type === 'text') {
                  accumulatedText += block.text;
                }
              }
            }
          } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
            providerResultText = msg.result;
            logger.info(
              '[BacklogPlan] Received result from provider, length:',
              providerResultText.length
            );
            logger.info('[BacklogPlan] Accumulated response length:', accumulatedText.length);
          }
        }

        responseText = selectBestResponseText(accumulatedText, providerResultText);

        // If we got here, the stream completed successfully
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        responseText = selectBestResponseText(accumulatedText, providerResultText);

        // Preserve the best response text across all attempts so that if a retry
        // crashes immediately (empty response), we can still recover from an earlier attempt
        bestResponseText = selectBestResponseText(bestResponseText, responseText);

        // Claude SDK can occasionally exit non-zero after emitting a complete response.
        // If we already have valid JSON, recover instead of failing the entire planning flow.
        if (isRetryableError(error)) {
          const parsed = tryParsePlanResponse(bestResponseText);
          if (parsed) {
            logger.warn(
              '[BacklogPlan] Recovered from transient CLI exit using accumulated valid response'
            );
            recoveredResult = parsed;
            lastError = null;
            break;
          }

          // On final retryable failure, degrade gracefully if we have text from any attempt.
          if (attempt >= MAX_RETRIES && bestResponseText.trim().length > 0) {
            logger.warn(
              '[BacklogPlan] Final retryable CLI failure with non-empty response, attempting fallback parse'
            );
            recoveredResult = parsePlanResponse(bestResponseText);
            lastError = null;
            break;
          }
        }

        // Only retry on transient CLI failures, not on user aborts or other errors
        if (!isRetryableError(error) || attempt >= MAX_RETRIES) {
          throw error;
        }

        logger.warn(
          `[BacklogPlan] Transient CLI failure (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${errorMessage}`
        );
      }
    }

    // If we exhausted retries, throw the last error
    if (lastError) {
      throw lastError;
    }

    // Parse the response
    const result = recoveredResult ?? parsePlanResponse(responseText);

    await saveBacklogPlan(projectPath, {
      savedAt: new Date().toISOString(),
      prompt,
      model: effectiveModel,
      result,
    });

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
    setRunningDetails(null);
  }
}
