/**
 * GET / endpoint - Get all running agents
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { getBacklogPlanStatus, getRunningDetails } from '../../backlog-plan/common.js';
import { getAllRunningGenerations } from '../../app-spec/common.js';
import path from 'path';
import { getErrorMessage, logError } from '../common.js';

export function createIndexHandler(autoModeService: AutoModeService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const runningAgents = [...(await autoModeService.getRunningAgents())];
      const backlogPlanStatus = getBacklogPlanStatus();
      const backlogPlanDetails = getRunningDetails();

      if (backlogPlanStatus.isRunning && backlogPlanDetails) {
        runningAgents.push({
          featureId: `backlog-plan:${backlogPlanDetails.projectPath}`,
          projectPath: backlogPlanDetails.projectPath,
          projectName: path.basename(backlogPlanDetails.projectPath),
          isAutoMode: false,
          title: 'Backlog plan',
          description: backlogPlanDetails.prompt,
        });
      }

      // Add spec/feature generation tasks
      const specGenerations = getAllRunningGenerations();
      for (const generation of specGenerations) {
        let title: string;
        let description: string;

        switch (generation.type) {
          case 'feature_generation':
            title = 'Generating features from spec';
            description = 'Creating features from the project specification';
            break;
          case 'sync':
            title = 'Syncing spec with code';
            description = 'Updating spec from codebase and completed features';
            break;
          default:
            title = 'Regenerating spec';
            description = 'Analyzing project and generating specification';
        }

        runningAgents.push({
          featureId: `spec-generation:${generation.projectPath}`,
          projectPath: generation.projectPath,
          projectName: path.basename(generation.projectPath),
          isAutoMode: false,
          title,
          description,
        });
      }

      res.json({
        success: true,
        runningAgents,
        totalCount: runningAgents.length,
      });
    } catch (error) {
      logError(error, 'Get running agents failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
