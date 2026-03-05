/**
 * Route: Webhook trigger endpoint
 *
 * POST /api/automation/webhook/:automationId
 * Triggers an automation via webhook (HTTP endpoint)
 *
 * Headers:
 * - X-Automation-Token: Secret token for authentication (if configured)
 *
 * Notes:
 * - Supports GET, POST, PUT, PATCH methods
 * - Method can be restricted per-automation via trigger.methods config
 * - Rate limited to 60 requests per minute per IP address
 */

import { Router, type Request, type Response } from 'express';
import type { AutomationSchedulerService } from '../../../services/automation-scheduler-service.js';
import { sendRouteError } from '../common.js';

/** All HTTP methods supported for webhook triggers */
const SUPPORTED_WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

type SupportedMethod = (typeof SUPPORTED_WEBHOOK_METHODS)[number];

/** Rate limiting configuration */
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // requests per window per IP
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple in-memory rate limiter.
 * Returns true if the request should be allowed, false if rate limited.
 */
function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    // New window
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - entry.count,
    resetAt: entry.resetAt,
  };
}

/** Clean up expired rate limit entries periodically */
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

export function createWebhookRoute(scheduler: AutomationSchedulerService): Router {
  const router = Router();

  const handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      // Apply rate limiting
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
      const rateLimit = checkRateLimit(clientIp);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
      res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000));

      if (!rateLimit.allowed) {
        res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
        });
        return;
      }

      const { automationId } = req.params;
      const token = req.headers['x-automation-token'] as string | undefined;
      const requestMethod = req.method.toUpperCase();

      // Validate automationId is present
      if (!automationId?.trim()) {
        res.status(400).json({ success: false, error: 'automationId is required' });
        return;
      }

      // Get payload from body (POST/PUT/PATCH) or query (GET)
      const payload = req.body || req.query;

      const result = await scheduler.handleWebhookTrigger(
        automationId,
        {
          payload,
          method: requestMethod,
          headers: {
            'content-type': req.headers['content-type'],
            'user-agent': req.headers['user-agent'],
          },
        },
        token
      );

      if (result.success) {
        res.json({
          success: true,
          message: 'Automation triggered successfully',
          runId: result.scheduledRunId,
        });
      } else {
        // Map structured error codes to HTTP status codes
        let status = 400;
        if (result.errorCode === 'INVALID_TOKEN') status = 401;
        else if (result.errorCode === 'NOT_FOUND') status = 404;
        else if (result.errorCode === 'METHOD_NOT_ALLOWED') status = 405;
        res.status(status).json({ success: false, error: result.error });
      }
    } catch (error) {
      sendRouteError(res, error);
    }
  };

  // Register handlers for supported HTTP methods
  for (const method of SUPPORTED_WEBHOOK_METHODS) {
    const lowerMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch';
    router[lowerMethod](`/webhook/:automationId`, handleWebhook);
  }

  return router;
}
