/**
 * GET / endpoint - Basic health check
 */

import type { Request, Response } from 'express';
import { getVersion } from '../../../lib/version.js';

export function createIndexHandler() {
  return (_req: Request, res: Response): void => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: getVersion(),
    });
  };
}
