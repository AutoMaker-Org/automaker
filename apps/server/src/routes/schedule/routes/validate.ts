/**
 * POST /schedule/validate endpoint - Validate a crontab expression
 *
 * Returns whether the crontab is valid and the next run time if valid.
 */

import type { Request, Response } from 'express';
import { CronExpressionParser } from 'cron-parser';
import { createLogger } from '@automaker/utils';

const logger = createLogger('ScheduleValidate');

export interface ValidateRequest {
  crontab: string;
}

export interface ValidateResponse {
  valid: boolean;
  nextRun?: string;
  error?: string;
}

export function createValidateHandler() {
  return (req: Request, res: Response): void => {
    try {
      const { crontab } = req.body as ValidateRequest;

      if (!crontab || typeof crontab !== 'string') {
        res.status(400).json({
          valid: false,
          error: 'Missing or invalid crontab expression',
        } satisfies ValidateResponse);
        return;
      }

      const trimmedCrontab = crontab.trim();

      try {
        const interval = CronExpressionParser.parse(trimmedCrontab, {
          currentDate: new Date(),
        });
        const nextRun = interval.next().toDate();

        res.json({
          valid: true,
          nextRun: nextRun.toISOString(),
        } satisfies ValidateResponse);
      } catch (parseErr) {
        const errorMessage =
          parseErr instanceof Error ? parseErr.message : 'Invalid crontab expression';
        res.json({
          valid: false,
          error: errorMessage,
        } satisfies ValidateResponse);
      }
    } catch (err) {
      logger.error('Error validating crontab:', err);
      res.status(500).json({
        valid: false,
        error: 'Internal server error',
      } satisfies ValidateResponse);
    }
  };
}
