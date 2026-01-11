/**
 * GET /connection - Check Linear API connection
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { LinearService } from '../../../services/linear-service.js';

const logger = createLogger('LinearConnection');

export function createCheckConnectionHandler(linearService: LinearService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await linearService.checkConnection();
      res.json(status);
    } catch (error) {
      logger.error('Connection check failed:', error);
      res.status(500).json({
        connected: false,
        error: error instanceof Error ? error.message : 'Connection check failed',
      });
    }
  };
}
