/**
 * POST /enhance-prompt endpoint - Enhance user input text
 *
 * Uses the provider abstraction to enhance text based on the specified
 * enhancement mode. Works with any configured provider (Claude, Cursor, etc.).
 * Supports modes: improve, technical, simplify, acceptance, ux-reviewer
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { resolveModelString } from '@automaker/model-resolver';
import { CLAUDE_MODEL_MAP, type ThinkingLevel } from '@automaker/types';
import { getAppSpecPath } from '@automaker/platform';
import { simpleQuery } from '../../../providers/simple-query-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getPromptCustomization, getProviderByModelId } from '../../../lib/settings-helpers.js';
import { FeatureLoader } from '../../../services/feature-loader.js';
import * as secureFs from '../../../lib/secure-fs.js';
import {
  buildUserPrompt,
  isValidEnhancementMode,
  type EnhancementMode,
} from '../../../lib/enhancement-prompts.js';
import {
  extractTechnologyStack,
  extractXmlElements,
  extractXmlSection,
  unescapeXml,
} from '../../../lib/xml-extractor.js';

const logger = createLogger('EnhancePrompt');

/**
 * Request body for the enhance endpoint
 */
interface EnhanceRequestBody {
  /** The original text to enhance */
  originalText: string;
  /** The enhancement mode to apply */
  enhancementMode: string;
  /** Optional model override */
  model?: string;
  /** Optional thinking level for Claude models */
  thinkingLevel?: ThinkingLevel;
  /** Optional project path for per-project Claude API profile */
  projectPath?: string;
}

/**
 * Success response from the enhance endpoint
 */
interface EnhanceSuccessResponse {
  success: true;
  enhancedText: string;
}

/**
 * Error response from the enhance endpoint
 */
interface EnhanceErrorResponse {
  success: false;
  error: string;
}

async function buildProjectContext(projectPath: string): Promise<string | null> {
  const contextBlocks: string[] = [];

  try {
    const appSpecPath = getAppSpecPath(projectPath);
    const specContent = (await secureFs.readFile(appSpecPath, 'utf-8')) as string;

    const projectName = extractXmlSection(specContent, 'project_name');
    const overview = extractXmlSection(specContent, 'overview');
    const techStack = extractTechnologyStack(specContent);
    const coreSection = extractXmlSection(specContent, 'core_capabilities');
    const coreCapabilities = coreSection ? extractXmlElements(coreSection, 'capability') : [];

    const summaryLines: string[] = [];
    if (projectName) {
      summaryLines.push(`Name: ${unescapeXml(projectName.trim())}`);
    }
    if (overview) {
      summaryLines.push(`Overview: ${unescapeXml(overview.trim())}`);
    }
    if (techStack.length > 0) {
      summaryLines.push(`Tech Stack: ${techStack.join(', ')}`);
    }
    if (coreCapabilities.length > 0) {
      summaryLines.push(`Core Capabilities: ${coreCapabilities.slice(0, 10).join(', ')}`);
    }

    if (summaryLines.length > 0) {
      contextBlocks.push(`PROJECT CONTEXT:\n${summaryLines.map((line) => `- ${line}`).join('\n')}`);
    }
  } catch (error) {
    logger.debug('No app_spec.txt context available for enhancement', error);
  }

  try {
    const featureLoader = new FeatureLoader();
    const features = await featureLoader.getAll(projectPath);
    const featureTitles = features
      .map((feature) => feature.title || feature.name || feature.id)
      .filter((title) => Boolean(title));

    if (featureTitles.length > 0) {
      const listed = featureTitles.slice(0, 30).map((title) => `- ${title}`);
      contextBlocks.push(
        `EXISTING FEATURES (avoid duplicates):\n${listed.join('\n')}${
          featureTitles.length > 30 ? '\n- ...' : ''
        }`
      );
    }
  } catch (error) {
    logger.debug('Failed to load existing features for enhancement context', error);
  }

  if (contextBlocks.length === 0) {
    return null;
  }

  return contextBlocks.join('\n\n');
}

/**
 * Create the enhance request handler
 *
 * @param settingsService - Optional settings service for loading custom prompts
 * @returns Express request handler for text enhancement
 */
export function createEnhanceHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { originalText, enhancementMode, model, thinkingLevel, projectPath } =
        req.body as EnhanceRequestBody;

      // Validate required fields
      if (!originalText || typeof originalText !== 'string') {
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'originalText is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      if (!enhancementMode || typeof enhancementMode !== 'string') {
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'enhancementMode is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate text is not empty
      const trimmedText = originalText.trim();
      if (trimmedText.length === 0) {
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'originalText cannot be empty',
        };
        res.status(400).json(response);
        return;
      }

      // Validate and normalize enhancement mode
      const normalizedMode = enhancementMode.toLowerCase();
      const validMode: EnhancementMode = isValidEnhancementMode(normalizedMode)
        ? normalizedMode
        : 'improve';

      logger.info(`Enhancing text with mode: ${validMode}, length: ${trimmedText.length} chars`);

      // Load enhancement prompts from settings (merges custom + defaults)
      const prompts = await getPromptCustomization(settingsService, '[EnhancePrompt]');

      // Get the system prompt for this mode from merged prompts
      const systemPromptMap: Record<EnhancementMode, string> = {
        improve: prompts.enhancement.improveSystemPrompt,
        technical: prompts.enhancement.technicalSystemPrompt,
        simplify: prompts.enhancement.simplifySystemPrompt,
        acceptance: prompts.enhancement.acceptanceSystemPrompt,
        'ux-reviewer': prompts.enhancement.uxReviewerSystemPrompt,
      };
      const systemPrompt = systemPromptMap[validMode];

      logger.debug(`Using ${validMode} system prompt (length: ${systemPrompt.length} chars)`);

      // Build the user prompt with few-shot examples
      const userPrompt = buildUserPrompt(validMode, trimmedText, true);
      const projectContext = projectPath ? await buildProjectContext(projectPath) : null;
      if (projectContext) {
        logger.debug('Including project context in enhancement prompt');
      }

      // Check if the model is a provider model (like "GLM-4.5-Air")
      // If so, get the provider config and resolved Claude model
      let claudeCompatibleProvider: import('@automaker/types').ClaudeCompatibleProvider | undefined;
      let providerResolvedModel: string | undefined;
      let credentials = await settingsService?.getCredentials();

      if (model && settingsService) {
        const providerResult = await getProviderByModelId(
          model,
          settingsService,
          '[EnhancePrompt]'
        );
        if (providerResult.provider) {
          claudeCompatibleProvider = providerResult.provider;
          providerResolvedModel = providerResult.resolvedModel;
          credentials = providerResult.credentials;
          logger.info(
            `Using provider "${providerResult.provider.name}" for model "${model}"` +
              (providerResolvedModel ? ` -> resolved to "${providerResolvedModel}"` : '')
          );
        }
      }

      // Resolve the model for API call.
      // CRITICAL: For custom providers (GLM, MiniMax), pass the provider's model ID (e.g. "GLM-4.7")
      // to the API, NOT the resolved Claude model - otherwise we get "model not found"
      const modelForApi = claudeCompatibleProvider
        ? model
        : providerResolvedModel || resolveModelString(model, CLAUDE_MODEL_MAP.sonnet);

      logger.debug(`Using model: ${modelForApi}`);

      // Use simpleQuery - provider abstraction handles routing to correct provider
      // The system prompt is combined with user prompt since some providers
      // don't have a separate system prompt concept
      const result = await simpleQuery({
        prompt: [systemPrompt, projectContext, userPrompt].filter(Boolean).join('\n\n'),
        model: modelForApi,
        cwd: process.cwd(), // Enhancement doesn't need a specific working directory
        maxTurns: 1,
        allowedTools: [],
        thinkingLevel,
        readOnly: true, // Prompt enhancement only generates text, doesn't write files
        credentials, // Pass credentials for resolving 'credentials' apiKeySource
        claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
      });

      const enhancedText = result.text;

      if (!enhancedText || enhancedText.trim().length === 0) {
        logger.warn('Received empty response from AI');
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'Failed to generate enhanced text - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Enhancement complete, output length: ${enhancedText.length} chars`);

      const response: EnhanceSuccessResponse = {
        success: true,
        enhancedText: enhancedText.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Enhancement failed:', errorMessage);

      const response: EnhanceErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
