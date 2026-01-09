/**
 * POST /convert - Convert an idea to a feature
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type { IdeationService } from '../../../services/ideation-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { ConvertToFeatureOptions } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createConvertHandler(
  events: EventEmitter,
  ideationService: IdeationService,
  featureLoader: FeatureLoader
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, ideaId, keepIdea, column, dependencies, tags } = req.body as {
        projectPath: string;
        ideaId: string;
      } & ConvertToFeatureOptions;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!ideaId) {
        res.status(400).json({ success: false, error: 'ideaId is required' });
        return;
      }

      // Convert idea to feature structure
      const featureData = await ideationService.convertToFeature(projectPath, ideaId);

      // Apply any options from the request
      if (column) {
        featureData.status = column;
      }
      if (dependencies && dependencies.length > 0) {
        featureData.dependencies = dependencies;
      }
      if (tags && tags.length > 0) {
        featureData.tags = tags;
      }

      // Create the feature using FeatureLoader
      const feature = await featureLoader.create(projectPath, featureData);

      // Delete the idea unless keepIdea is explicitly true
      if (!keepIdea) {
        await ideationService.deleteIdea(projectPath, ideaId);

        // Emit idea deleted event
        events.emit('ideation:idea-deleted', {
          projectPath,
          ideaId,
        });
      }

      // Emit idea converted event to notify frontend
      events.emit('ideation:idea-converted', {
        projectPath,
        ideaId,
        featureId: feature.id,
        keepIdea: !!keepIdea,
      });

      // Return featureId as expected by the frontend API interface
      res.json({ success: true, featureId: feature.id });
    } catch (error) {
      logError(error, 'Convert to feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
