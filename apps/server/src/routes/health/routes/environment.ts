/**
 * GET /environment endpoint - Environment information including containerization status
 *
 * This endpoint is unauthenticated so the UI can check it on startup
 * before login to determine if sandbox risk warnings should be shown.
 */

import type { Request, Response } from 'express';

export interface EnvironmentResponse {
  isContainerized: boolean;
}

export function createEnvironmentHandler() {
  return (_req: Request, res: Response): void => {
    res.json({
      isContainerized: process.env.IS_CONTAINERIZED === 'true',
    } satisfies EnvironmentResponse);
  };
}
