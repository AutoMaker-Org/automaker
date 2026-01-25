/**
 * Generate app_spec.txt from project overview
 *
 * Model is configurable via phaseModels.specGenerationModel in settings
 * (defaults to Opus for high-quality specification generation).
 */

import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import { specOutputSchema, specToXml, type SpecOutput } from '../../lib/app-spec-format.js';
import { createLogger } from '@automaker/utils';
import { DEFAULT_PHASE_MODELS, isCursorModel } from '@automaker/types';
import { resolvePhaseModel } from '@automaker/model-resolver';
import { extractJson } from '../../lib/json-extractor.js';
import { streamingQuery } from '../../providers/simple-query-service.js';
import { generateFeaturesFromSpec } from './generate-features-from-spec.js';
import { ensureAutomakerDir, getAppSpecPath } from '@automaker/platform';
import type { SettingsService } from '../../services/settings-service.js';
import {
  getAutoLoadClaudeMdSetting,
  getPromptCustomization,
  getPhaseModelWithOverrides,
} from '../../lib/settings-helpers.js';

const logger = createLogger('SpecRegeneration');

export async function generateSpec(
  projectPath: string,
  projectOverview: string,
  events: EventEmitter,
  abortController: AbortController,
  generateFeatures?: boolean,
  analyzeProject?: boolean,
  maxFeatures?: number,
  settingsService?: SettingsService
): Promise<void> {
  logger.info('========== generateSpec() started ==========');
  logger.info('projectPath:', projectPath);
  logger.info('projectOverview length:', `${projectOverview.length} chars`);
  logger.info('projectOverview preview:', projectOverview.substring(0, 300));
  logger.info('generateFeatures:', generateFeatures);
  logger.info('analyzeProject:', analyzeProject);
  logger.info('maxFeatures:', maxFeatures);

  // Get customized prompts from settings
  const prompts = await getPromptCustomization(settingsService, '[SpecRegeneration]');

  // Build the prompt based on whether we should analyze the project
  let analysisInstructions = '';
  let techStackDefaults = '';

  if (analyzeProject !== false) {
    // Default to true - analyze the project
    analysisInstructions = `Based on this overview, analyze the project directory (if it exists) using the Read, Glob, and Grep tools to understand:
- Existing technologies and frameworks
- Project structure and architecture
- Current features and capabilities
- Code patterns and conventions`;
  } else {
    // Use default tech stack
    techStackDefaults = `Default Technology Stack:
- Framework: TanStack Start (React-based full-stack framework)
- Database: PostgreSQL with Drizzle ORM
- UI Components: shadcn/ui
- Styling: Tailwind CSS
- Frontend: React

Use these technologies as the foundation for the specification.`;
  }

  const prompt = `${prompts.appSpec.generateSpecSystemPrompt}

Project Overview:
${projectOverview}

${techStackDefaults}

${analysisInstructions}

${prompts.appSpec.structuredSpecInstructions}`;

  logger.info('========== PROMPT BEING SENT ==========');
  logger.info(`Prompt length: ${prompt.length} chars`);
  logger.info(`Prompt preview (first 500 chars):\n${prompt.substring(0, 500)}`);
  logger.info('========== END PROMPT PREVIEW ==========');

  events.emit('spec-regeneration:event', {
    type: 'spec_progress',
    content: 'Starting spec generation...\n',
  });

  // Load autoLoadClaudeMd setting
  const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
    projectPath,
    settingsService,
    '[SpecRegeneration]'
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
        '[SpecRegeneration]'
      )
    : {
        phaseModel: DEFAULT_PHASE_MODELS.specGenerationModel,
        provider: undefined,
        credentials: undefined,
      };
  const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

  logger.info('Using model:', model, provider ? `via provider: ${provider.name}` : 'direct API');

  let responseText = '';
  let structuredOutput: SpecOutput | null = null;

  // Determine if we should use structured output (Claude supports it, Cursor doesn't)
  const useStructuredOutput = !isCursorModel(model);

  // Build the final prompt - for Cursor, include JSON schema instructions
  let finalPrompt = prompt;
  if (!useStructuredOutput) {
    finalPrompt = `${prompt}

CRITICAL INSTRUCTIONS:
1. DO NOT write any files. DO NOT create any files like "project_specification.json".
2. After analyzing the project, respond with ONLY a JSON object - no explanations, no markdown, just raw JSON.
3. The JSON must match this exact schema:

${JSON.stringify(specOutputSchema, null, 2)}

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
    readOnly: true, // Spec generation only reads code, we write the spec ourselves
    settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
    claudeCompatibleProvider: provider, // Pass provider for alternative endpoint configuration
    credentials, // Pass credentials for resolving 'credentials' apiKeySource
    outputFormat: useStructuredOutput
      ? {
          type: 'json_schema',
          schema: specOutputSchema,
        }
      : undefined,
    onText: (text) => {
      responseText += text;
      logger.info(
        `Text block received (${text.length} chars), total now: ${responseText.length} chars`
      );
      events.emit('spec-regeneration:event', {
        type: 'spec_regeneration_progress',
        content: text,
        projectPath: projectPath,
      });
    },
    onToolUse: (tool, input) => {
      logger.info('Tool use:', tool);
      events.emit('spec-regeneration:event', {
        type: 'spec_tool',
        tool,
        input,
      });
    },
  });

  // Get structured output if available
  if (result.structured_output) {
    structuredOutput = result.structured_output as unknown as SpecOutput;
    logger.info('✅ Received structured output');
    logger.debug('Structured output:', JSON.stringify(structuredOutput, null, 2));
  } else if (!useStructuredOutput && responseText) {
    // For non-Claude providers, parse JSON from response text
    structuredOutput = extractJson<SpecOutput>(responseText, { logger });
  }

  logger.info(`Stream iteration complete.`);
  logger.info(`Response text length: ${responseText.length} chars`);

  // Determine XML content to save
  let xmlContent: string;

  if (structuredOutput) {
    // Use structured output - convert JSON to XML
    logger.info('✅ Using structured output for XML generation');
    xmlContent = specToXml(structuredOutput);
    logger.info(`Generated XML from structured output: ${xmlContent.length} chars`);
  } else {
    // Fallback: Extract XML content from response text
    // Claude might include conversational text before/after
    // See: https://github.com/AutoMaker-Org/automaker/issues/149
    logger.warn('⚠️ No structured output, falling back to text parsing');
    logger.info('========== FINAL RESPONSE TEXT ==========');
    logger.info(responseText || '(empty)');
    logger.info('========== END RESPONSE TEXT ==========');

    if (!responseText || responseText.trim().length === 0) {
      throw new Error('No response text and no structured output - cannot generate spec');
    }

    const xmlStart = responseText.indexOf('<project_specification>');
    const xmlEnd = responseText.lastIndexOf('</project_specification>');

    if (xmlStart !== -1 && xmlEnd !== -1) {
      // Extract just the XML content, discarding any conversational text before/after
      xmlContent = responseText.substring(xmlStart, xmlEnd + '</project_specification>'.length);
      logger.info(`Extracted XML content: ${xmlContent.length} chars (from position ${xmlStart})`);
    } else {
      // No XML found, try JSON extraction
      logger.warn('⚠️ No XML tags found, attempting JSON extraction...');
      const extractedJson = extractJson<SpecOutput>(responseText, { logger });

      if (
        extractedJson &&
        typeof extractedJson.project_name === 'string' &&
        typeof extractedJson.overview === 'string' &&
        Array.isArray(extractedJson.technology_stack) &&
        Array.isArray(extractedJson.core_capabilities) &&
        Array.isArray(extractedJson.implemented_features)
      ) {
        logger.info('✅ Successfully extracted JSON from response text');
        xmlContent = specToXml(extractedJson);
        logger.info(`✅ Converted extracted JSON to XML: ${xmlContent.length} chars`);
      } else {
        // Neither XML nor valid JSON found
        logger.error('❌ Response does not contain valid XML or JSON structure');
        logger.error(
          'This typically happens when structured output failed and the agent produced conversational text instead of structured output'
        );
        throw new Error(
          'Failed to generate spec: No valid XML or JSON structure found in response. ' +
            'The response contained conversational text but no <project_specification> tags or valid JSON. ' +
            'Please try again.'
        );
      }
    }
  }

  // Save spec to .automaker directory
  await ensureAutomakerDir(projectPath);
  const specPath = getAppSpecPath(projectPath);

  logger.info('Saving spec to:', specPath);
  logger.info(`Content to save (${xmlContent.length} chars)`);

  await secureFs.writeFile(specPath, xmlContent);

  // Verify the file was written
  const savedContent = await secureFs.readFile(specPath, 'utf-8');
  logger.info(`Verified saved file: ${savedContent.length} chars`);
  if (savedContent.length === 0) {
    logger.error('❌ File was saved but is empty!');
  }

  logger.info('Spec saved successfully');

  // Emit spec completion event
  if (generateFeatures) {
    // If features will be generated, emit intermediate completion
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_progress',
      content: '[Phase: spec_complete] Spec created! Generating features...\n',
      projectPath: projectPath,
    });
  } else {
    // If no features, emit final completion
    events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_complete',
      message: 'Spec regeneration complete!',
      projectPath: projectPath,
    });
  }

  // If generate features was requested, generate them from the spec
  if (generateFeatures) {
    logger.info('Starting feature generation from spec...');
    // Create a new abort controller for feature generation
    const featureAbortController = new AbortController();
    try {
      await generateFeaturesFromSpec(
        projectPath,
        events,
        featureAbortController,
        maxFeatures,
        settingsService
      );
      // Final completion will be emitted by generateFeaturesFromSpec -> parseAndCreateFeatures
    } catch (featureError) {
      logger.error('Feature generation failed:', featureError);
      // Don't throw - spec generation succeeded, feature generation is optional
      events.emit('spec-regeneration:event', {
        type: 'spec_regeneration_error',
        error: (featureError as Error).message || 'Feature generation failed',
        projectPath: projectPath,
      });
    }
  }

  logger.debug('========== generateSpec() completed ==========');
}
