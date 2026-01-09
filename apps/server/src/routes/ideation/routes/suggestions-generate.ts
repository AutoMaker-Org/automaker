/**
 * Generate suggestions route - Returns structured AI suggestions for a prompt
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('ideation:suggestions-generate');

export function createSuggestionsGenerateHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, promptId, category, count } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!promptId) {
        res.status(400).json({ success: false, error: 'promptId is required' });
        return;
      }

      if (!category) {
        res.status(400).json({ success: false, error: 'category is required' });
        return;
      }

      // Default to 10 suggestions, allow 1-20
      const suggestionCount = Math.min(Math.max(count || 10, 1), 20);

      logger.info(`Generating ${suggestionCount} suggestions for prompt: ${promptId}`);

      const suggestions = await ideationService.generateSuggestions(
        projectPath,
        promptId,
        category,
        suggestionCount
      );

      res.json({
        success: true,
        suggestions,
      });
    } catch (error) {
      logError(error, 'Failed to generate suggestions');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
