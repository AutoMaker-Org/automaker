/**
 * POST /add-suggestion - Add an analysis suggestion to the board as a feature
 *
 * This endpoint converts an AnalysisSuggestion to a Feature using the
 * IdeationService's mapIdeaCategoryToFeatureCategory for consistent category mapping.
 * This ensures a single source of truth for the conversion logic.
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { AnalysisSuggestion } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createAddSuggestionHandler(
  ideationService: IdeationService,
  featureLoader: FeatureLoader
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, suggestion } = req.body as {
        projectPath: string;
        suggestion: AnalysisSuggestion;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!suggestion) {
        res.status(400).json({ success: false, error: 'suggestion is required' });
        return;
      }

      if (!suggestion.title) {
        res.status(400).json({ success: false, error: 'suggestion.title is required' });
        return;
      }

      if (!suggestion.category) {
        res.status(400).json({ success: false, error: 'suggestion.category is required' });
        return;
      }

      // Build description with rationale if provided
      const description = suggestion.rationale
        ? `${suggestion.description}\n\n**Rationale:** ${suggestion.rationale}`
        : suggestion.description;

      // Use the service's category mapping for consistency
      const featureCategory = ideationService.mapSuggestionCategoryToFeatureCategory(
        suggestion.category
      );

      // Create the feature
      const feature = await featureLoader.create(projectPath, {
        title: suggestion.title,
        description,
        category: featureCategory,
        status: 'backlog',
      });

      res.json({ success: true, featureId: feature.id });
    } catch (error) {
      logError(error, 'Add suggestion to board failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
