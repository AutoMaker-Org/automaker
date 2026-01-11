/**
 * POST /import - Import Linear issues as Features
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { LinearImportOptions, LinearImportResult, Feature } from '@automaker/types';
import type { LinearService } from '../../../services/linear-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';

const logger = createLogger('LinearImport');

// Map Linear priority (0-4) to feature priority (1-5)
const PRIORITY_MAP: Record<number, number> = {
  0: 3, // none -> medium
  1: 1, // urgent -> highest
  2: 2, // high -> high
  3: 3, // medium -> medium
  4: 4, // low -> low
};

export function createImportIssuesHandler(
  linearService: LinearService,
  featureLoader: FeatureLoader
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, options } = req.body as {
        projectPath: string;
        options: LinearImportOptions;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!options?.issueIds?.length) {
        res.status(400).json({
          success: false,
          error: 'options.issueIds is required and must not be empty',
        });
        return;
      }

      const results: LinearImportResult = {
        success: true,
        importedCount: 0,
        features: [],
        errors: [],
      };

      for (const issueId of options.issueIds) {
        try {
          // Fetch full issue details
          const issueResult = await linearService.getIssue(issueId);
          if (!issueResult.success || !issueResult.issue) {
            results.errors?.push({
              linearIssueId: issueId,
              error: issueResult.error || 'Issue not found',
            });
            continue;
          }

          const issue = issueResult.issue;

          // Build feature description
          let description = '';
          if (options.linkBackToLinear) {
            description += `**Linear Issue:** [${issue.identifier}](${issue.url})\n\n`;
          }
          if (options.includeDescription && issue.description) {
            description += issue.description;
          }
          if (!description) {
            description = issue.title;
          }

          // Determine category
          let category = 'From Linear';
          if (options.includeLabelsAsCategory && issue.labels.length > 0) {
            category = issue.labels[0].name;
          }

          // Create feature data
          const featureData: Partial<Feature> = {
            title: issue.title,
            description,
            category,
            status: options.targetStatus === 'in-progress' ? 'in-progress' : 'backlog',
            priority: PRIORITY_MAP[issue.priority] ?? 3,
            // Source tracking
            source: 'linear',
            linearIssueId: issue.id,
            linearIdentifier: issue.identifier,
            linearUrl: issue.url,
          };

          // Create feature using FeatureLoader
          const created = await featureLoader.create(projectPath, featureData);

          results.features?.push({
            featureId: created.id,
            linearIssueId: issue.id,
            linearIdentifier: issue.identifier,
          });
          results.importedCount++;
          logger.info(`Imported ${issue.identifier} as feature ${created.id}`);
        } catch (error) {
          logger.error(`Failed to import issue ${issueId}:`, error);
          results.errors?.push({
            linearIssueId: issueId,
            error: error instanceof Error ? error.message : 'Import failed',
          });
        }
      }

      results.success = results.importedCount > 0;
      res.json(results);
    } catch (error) {
      logger.error('Import issues failed:', error);
      res.status(500).json({
        success: false,
        importedCount: 0,
        error: error instanceof Error ? error.message : 'Import failed',
      });
    }
  };
}
