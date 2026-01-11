/**
 * Linear validation endpoints - status, stop, get, delete, and mark viewed
 *
 * Mirrors GitHub validation endpoints but uses string-based identifier (e.g., "ALE-1")
 * instead of numeric issueNumber.
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type { LinearValidationEvent } from '@automaker/types';
import {
  isLinearValidationRunning,
  getRunningLinearValidations,
  abortLinearValidation,
} from './validate-issue.js';
import {
  readLinearValidation,
  getAllLinearValidations,
  getLinearValidationWithFreshness,
  deleteLinearValidation,
  markLinearValidationViewed,
} from '../../../lib/linear-validation-storage.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('LinearValidationEndpoints');

/**
 * POST /validation-status - Check if validation is running for a Linear issue
 */
export function createLinearValidationStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, identifier } = req.body as {
        projectPath: string;
        identifier?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If identifier provided, check specific issue
      if (identifier) {
        const isRunning = isLinearValidationRunning(projectPath, identifier);
        res.json({
          success: true,
          isRunning,
        });
        return;
      }

      // Otherwise, return all running validations for the project
      const runningIdentifiers = getRunningLinearValidations(projectPath);
      res.json({
        success: true,
        runningIdentifiers,
      });
    } catch (error) {
      logger.error('Validation status check failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * POST /validation-stop - Cancel a running Linear validation
 */
export function createLinearValidationStopHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, identifier } = req.body as {
        projectPath: string;
        identifier: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!identifier || typeof identifier !== 'string') {
        res.status(400).json({
          success: false,
          error: 'identifier is required and must be a string',
        });
        return;
      }

      const wasAborted = abortLinearValidation(projectPath, identifier);

      if (wasAborted) {
        logger.info(`Validation for Linear issue ${identifier} was stopped`);
        res.json({
          success: true,
          message: `Validation for issue ${identifier} has been stopped`,
        });
      } else {
        res.json({
          success: false,
          error: `No validation is running for issue ${identifier}`,
        });
      }
    } catch (error) {
      logger.error('Validation stop failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * POST /validations - Get stored validations for a project
 */
export function createGetLinearValidationsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, identifier } = req.body as {
        projectPath: string;
        identifier?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If identifier provided, get specific validation with freshness info
      if (identifier) {
        const result = await getLinearValidationWithFreshness(projectPath, identifier);

        if (!result) {
          res.json({
            success: true,
            validation: null,
          });
          return;
        }

        res.json({
          success: true,
          validation: result.validation,
          isStale: result.isStale,
        });
        return;
      }

      // Otherwise, get all validations for the project
      const validations = await getAllLinearValidations(projectPath);

      res.json({
        success: true,
        validations,
      });
    } catch (error) {
      logger.error('Get validations failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * POST /validation-delete - Delete a stored Linear validation
 */
export function createDeleteLinearValidationHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, identifier } = req.body as {
        projectPath: string;
        identifier: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!identifier || typeof identifier !== 'string') {
        res.status(400).json({
          success: false,
          error: 'identifier is required and must be a string',
        });
        return;
      }

      const deleted = await deleteLinearValidation(projectPath, identifier);

      res.json({
        success: true,
        deleted,
      });
    } catch (error) {
      logger.error('Delete validation failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * POST /validation-mark-viewed - Mark a Linear validation as viewed by the user
 */
export function createLinearMarkViewedHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, identifier, issueId } = req.body as {
        projectPath: string;
        identifier: string;
        issueId: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!identifier || typeof identifier !== 'string') {
        res.status(400).json({
          success: false,
          error: 'identifier is required and must be a string',
        });
        return;
      }

      const success = await markLinearValidationViewed(projectPath, identifier);

      if (success) {
        // Emit event so UI can update the unviewed count
        const viewedEvent: LinearValidationEvent = {
          type: 'linear_validation_viewed',
          issueId: issueId || identifier,
          identifier,
          projectPath,
        };
        events.emit('linear-validation:event', viewedEvent);
      }

      res.json({ success });
    } catch (error) {
      logger.error('Mark validation viewed failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
