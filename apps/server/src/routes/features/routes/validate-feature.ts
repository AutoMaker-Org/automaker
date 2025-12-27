/**
 * Validate feature route - Uses AI agent to check if a feature is already implemented
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { AgentService } from '../../../services/agent-service.js';
import { getErrorMessage, logError } from '../common.js';
import type { Feature } from '@automaker/types';

interface ValidateFeatureRequest {
  projectPath: string;
  featureId: string;
}

export function createValidateFeatureHandler(
  featureLoader: FeatureLoader,
  agentService: AgentService
) {
  return async (req: Request, res: Response) => {
    let sessionId: string | undefined;

    try {
      const { projectPath, featureId }: ValidateFeatureRequest = req.body;

      // Load the feature
      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        return res.status(404).json({
          success: false,
          error: 'Feature not found',
        });
      }

      // Create a validation prompt
      const validationPrompt = `Your task is to review this feature and the existing codebase and determine whether or not it has been fully/partially/not implemented.

Feature Details:
- Title: ${feature.title}
- Category: ${feature.category}
- Description: ${feature.description}

Please analyze the codebase and provide your assessment in the following format (plain text, no markdown):

ASSESSMENT: [FULLY_IMPLEMENTED|PARTIALLY_IMPLEMENTED|NOT_IMPLEMENTED]
REASONING: [Brief explanation of your decision]
EVIDENCE: [Specific code/files that support your assessment]

Be thorough in your analysis. Check for:
- Related components, functions, or classes
- Test files
- Configuration changes
- Documentation updates
- Any other relevant implementation details

If the feature is FULLY_IMPLEMENTED, it should be complete and ready for approval.
If PARTIALLY_IMPLEMENTED, explain what's missing.
If NOT_IMPLEMENTED, explain why you believe this feature hasn't been addressed.`;

      // Create a temporary session for validation
      let session;
      try {
        // First create the session metadata
        session = await agentService.createSession(
          `Feature Validation: ${feature.title}`,
          projectPath,
          projectPath
        );

        // Track session ID for cleanup
        sessionId = session.id;

        // Then initialize the conversation session in memory
        await agentService.startConversation({
          sessionId: session.id,
          workingDirectory: projectPath,
        });
      } catch (sessionError) {
        logError(sessionError, 'Failed to create agent session');
        return res.status(500).json({
          success: false,
          error: getErrorMessage(sessionError) || 'Failed to create agent session',
        });
      }

      // Send the validation prompt to the agent
      let result;
      try {
        result = await agentService.sendMessage({
          sessionId: session.id,
          message: validationPrompt,
          workingDirectory: projectPath,
        });
      } catch (messageError) {
        logError(messageError, 'Failed to send message to agent');

        // Clean up the session if it exists
        if (sessionId) {
          try {
            await agentService.deleteSession(sessionId);
          } catch (cleanupError) {
            logError(cleanupError, 'Failed to cleanup session after message error');
          }
        }

        return res.status(500).json({
          success: false,
          error: getErrorMessage(messageError) || 'Failed to send message to agent',
        });
      }

      if (!result.success) {
        // Clean up the session
        if (sessionId) {
          try {
            await agentService.deleteSession(sessionId);
          } catch (cleanupError) {
            logError(cleanupError, 'Failed to cleanup session after failed result');
          }
        }

        return res.status(500).json({
          success: false,
          error: 'Failed to validate feature',
        });
      }

      // Parse the agent response with improved regex
      const response = result.message?.content || '';
      console.log('[ValidateFeature] Raw AI Response:', response);

      // Improved regex patterns to handle edge cases
      const assessmentMatch = response.match(
        /ASSESSMENT:\s*\*{0,2}(FULLY_IMPLEMENTED|PARTIALLY_IMPLEMENTED|NOT_IMPLEMENTED)\*{0,2}/im
      );
      const reasoningMatch = response.match(
        /REASONING:\s*\*{0,2}([^\n*]+(?:\n[^\n*]+)*?)\*(?=\n[A-Z]+:|$)/im
      );
      const evidenceMatch = response.match(/EVIDENCE:\s*\*{0,2}([\s\S]*?)(?=\n\n[A-Z]+:|$)/im);

      console.log('[ValidateFeature] Regex matches:');
      console.log('  - Assessment match:', assessmentMatch);
      console.log('  - Reasoning match:', reasoningMatch);
      console.log('  - Evidence match:', evidenceMatch);

      // Extract values with better fallbacks
      const assessment = assessmentMatch?.[1]?.trim() || 'NOT_IMPLEMENTED';
      const reasoning = reasoningMatch?.[1]?.trim() || 'Unable to determine reasoning';
      const evidence = evidenceMatch?.[1]?.trim() || 'No specific evidence provided';

      console.log('[ValidateFeature] Extracted values:');
      console.log('  - Assessment:', assessment);
      console.log('  - Reasoning:', reasoning);
      console.log('  - Evidence:', evidence?.substring(0, 200) + '...');

      // Clean up the session
      if (sessionId) {
        try {
          await agentService.deleteSession(sessionId);
        } catch (cleanupError) {
          logError(cleanupError, 'Failed to cleanup session after successful validation');
        }
      }

      return res.json({
        success: true,
        validation: {
          assessment: assessment as
            | 'FULLY_IMPLEMENTED'
            | 'PARTIALLY_IMPLEMENTED'
            | 'NOT_IMPLEMENTED',
          reasoning,
          evidence,
          fullResponse: response,
        },
      });
    } catch (error) {
      logError(error, 'Unexpected error in validate feature handler');

      // Ensure session cleanup on any thrown exception
      if (sessionId) {
        try {
          await agentService.deleteSession(sessionId);
        } catch (cleanupError) {
          logError(cleanupError, 'Failed to cleanup session in outer catch');
        }
      }

      return res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
