/**
 * GET /prompts - Get all guided prompts
 * GET /prompts/:category - Get prompts for a specific category
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import type { IdeaCategory } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createPromptsHandler(ideationService: IdeationService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const prompts = ideationService.getAllPrompts();
      const categories = ideationService.getPromptCategories();
      res.json({ success: true, prompts, categories });
    } catch (error) {
      logError(error, 'Get prompts failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createPromptsByCategoryHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { category } = req.params as { category: string };

      const validCategories = ideationService.getPromptCategories().map((c) => c.id);
      if (!validCategories.includes(category as IdeaCategory)) {
        res.status(400).json({ success: false, error: 'Invalid category' });
        return;
      }

      const prompts = ideationService.getPromptsByCategory(category as IdeaCategory);
      res.json({ success: true, prompts });
    } catch (error) {
      logError(error, 'Get prompts by category failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
