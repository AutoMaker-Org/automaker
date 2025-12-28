/**
 * Additional validation endpoints for status, stop, and retrieving stored validations
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type { IssueValidationEvent } from '@automaker/types';
import {
  isValidationRunning,
  getValidationStatus,
  getRunningValidations,
  abortValidation,
  getErrorMessage,
  logError,
  logger,
} from './validation-common.js';
import {
  readValidation,
  getAllValidations,
  getValidationWithFreshness,
  deleteValidation,
  markValidationViewed,
} from '../../../lib/validation-storage.js';

/**
 * POST /validation-status - Check if validation is running for an issue
 */
export function createValidationStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber?: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If issueNumber provided, check specific issue
      if (issueNumber !== undefined) {
        const status = getValidationStatus(projectPath, issueNumber);
        res.json({
          success: true,
          isRunning: status?.isRunning ?? false,
          startedAt: status?.startedAt?.toISOString(),
        });
        return;
      }

      // Otherwise, return all running validations for the project
      const runningIssues = getRunningValidations(projectPath);
      res.json({
        success: true,
        runningIssues,
      });
    } catch (error) {
      logError(error, 'Validation status check failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /validation-stop - Cancel a running validation
 */
export function createValidationStopHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      const wasAborted = abortValidation(projectPath, issueNumber);

      if (wasAborted) {
        logger.info(`Validation for issue #${issueNumber} was stopped`);
        res.json({
          success: true,
          message: `Validation for issue #${issueNumber} has been stopped`,
        });
      } else {
        res.json({
          success: false,
          error: `No validation is running for issue #${issueNumber}`,
        });
      }
    } catch (error) {
      logError(error, 'Validation stop failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /validations - Get stored validations for a project
 */
export function createGetValidationsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber?: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If issueNumber provided, get specific validation with freshness info
      if (issueNumber !== undefined) {
        const result = await getValidationWithFreshness(projectPath, issueNumber);

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
      const validations = await getAllValidations(projectPath);

      res.json({
        success: true,
        validations,
      });
    } catch (error) {
      logError(error, 'Get validations failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /validation-delete - Delete a stored validation
 */
export function createDeleteValidationHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      const deleted = await deleteValidation(projectPath, issueNumber);

      res.json({
        success: true,
        deleted,
      });
    } catch (error) {
      logError(error, 'Delete validation failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /validation-mark-viewed - Mark a validation as viewed by the user
 */
export function createMarkViewedHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber } = req.body as {
        projectPath: string;
        issueNumber: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      const success = await markValidationViewed(projectPath, issueNumber);

      if (success) {
        // Emit event so UI can update the unviewed count
        const viewedEvent: IssueValidationEvent = {
          type: 'issue_validation_viewed',
          issueNumber,
          projectPath,
        };
        events.emit('issue-validation:event', viewedEvent);
      }

      res.json({ success });
    } catch (error) {
      logError(error, 'Mark validation viewed failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
