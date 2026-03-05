/**
 * Shared utilities for automation routes
 */

import type { Request, Response } from 'express';
import type { AutomationScope } from '@automaker/types';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Extract project path from request query or body
 */
export function getProjectPath(req: Request): string | undefined {
  return asNonEmptyString(req.query.projectPath) ?? asNonEmptyString(req.body?.projectPath);
}

/**
 * Extract scope from request query or body
 */
export function getScope(req: Request): AutomationScope | undefined {
  const scope =
    (asNonEmptyString(req.query.scope) as AutomationScope | undefined) ??
    (asNonEmptyString(req.body?.scope) as AutomationScope | undefined);

  if (scope === 'global' || scope === 'project') {
    return scope;
  }

  return undefined;
}

/**
 * Normalize route error responses.
 *
 * Errors whose message contains "already exists" are mapped to 409 Conflict.
 * All other unhandled errors use 500 Internal Server Error.
 */
export function sendRouteError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = /already exists/i.test(message) ? 409 : 500;
  res.status(status).json({ success: false, error: message });
}
