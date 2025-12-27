/**
 * Generate app_spec.txt from project overview
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import {
  specOutputSchema,
  specToXml,
  getStructuredSpecPromptInstruction,
  type SpecOutput,
} from '../../lib/app-spec-format.js';
import { createLogger } from '@automaker/utils';
import { createSpecGenerationOptions } from '../../lib/sdk-options.js';
import { logAuthStatus } from './common.js';
import { generateFeaturesFromSpec } from './generate-features-from-spec.js';
import { ensureAutomakerDir, getAppSpecPath } from '@automaker/platform';
import type { SettingsService } from '../../services/settings-service.js';
import { getAutoLoadClaudeMdSetting } from '../../lib/settings-helpers.js';

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

  const prompt = `You are helping to define a software project specification.

IMPORTANT: Never ask for clarification or additional information. Use the information provided and make reasonable assumptions to create the best possible specification. If details are missing, infer them based on common patterns and best practices.

Project Overview:
${projectOverview}

${techStackDefaults}

${analysisInstructions}

${getStructuredSpecPromptInstruction()}`;

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

  const options = createSpecGenerationOptions({
    cwd: projectPath,
    abortController,
    autoLoadClaudeMd,
    outputFormat: {
      type: 'json_schema',
      schema: specOutputSchema,
    },
  });

  logger.debug('SDK Options:', JSON.stringify(options, null, 2));
  logger.info('Calling Claude Agent SDK query()...');

  // Log auth status right before the SDK call
  logAuthStatus('Right before SDK query()');

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
  let structuredOutput: SpecOutput | null = null;

  logger.info('Starting to iterate over stream...');

  try {
    for await (const msg of stream) {
      messageCount++;
      logger.info(
        `Stream message #${messageCount}: type=${msg.type}, subtype=${(msg as any).subtype}`
      );

      if (msg.type === 'assistant') {
        const msgAny = msg as any;
        if (msgAny.message?.content) {
          for (const block of msgAny.message.content) {
            if (block.type === 'text') {
              responseText += block.text;
              logger.info(
                `Text block received (${block.text.length} chars), total now: ${responseText.length} chars`
              );
              events.emit('spec-regeneration:event', {
                type: 'spec_regeneration_progress',
                content: block.text,
                projectPath: projectPath,
              });
            } else if (block.type === 'tool_use') {
              logger.info('Tool use:', block.name);
              events.emit('spec-regeneration:event', {
                type: 'spec_tool',
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      } else if (msg.type === 'result' && (msg as any).subtype === 'success') {
        logger.info('Received success result');
        // Check for structured output - this is the reliable way to get spec data
        const resultMsg = msg as any;
        if (resultMsg.structured_output) {
          structuredOutput = resultMsg.structured_output as SpecOutput;
          logger.info('✅ Received structured output');
          logger.debug('Structured output:', JSON.stringify(structuredOutput, null, 2));
        } else {
          logger.warn('⚠️ No structured output in result, will fall back to text parsing');
        }
      } else if (msg.type === 'result') {
        // Handle error result types
        const subtype = (msg as any).subtype;
        logger.info(`Result message: subtype=${subtype}`);
        if (subtype === 'error_max_turns') {
          logger.error('❌ Hit max turns limit!');
        } else if (subtype === 'error_max_structured_output_retries') {
          logger.error('❌ Failed to produce valid structured output after retries');
          throw new Error('Could not produce valid spec output');
        }
      } else if ((msg as { type: string }).type === 'error') {
        logger.error('❌ Received error message from stream:');
        logger.error('Error message:', JSON.stringify(msg, null, 2));
      } else if (msg.type === 'user') {
        // Log user messages (tool results)
        logger.info(`User message (tool result): ${JSON.stringify(msg).substring(0, 500)}`);
      }
    }
  } catch (streamError) {
    logger.error('❌ Error while iterating stream:');
    logger.error('Stream error:', streamError);
    throw streamError;
  }

  logger.info(`Stream iteration complete. Total messages: ${messageCount}`);
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
      // No valid XML structure found in the response text
      // This happens when structured output was expected but not received, and the agent
      // output conversational text instead of XML (e.g., "The project directory appears to be empty...")
      // We should NOT save this conversational text as it's not a valid spec
      logger.error('❌ Response does not contain valid <project_specification> XML structure');
      logger.error(
        'This typically happens when structured output failed and the agent produced conversational text instead of XML'
      );
      throw new Error(
        'Failed to generate spec: No valid XML structure found in response. ' +
          'The response contained conversational text but no <project_specification> tags. ' +
          'Please try again.'
      );
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
