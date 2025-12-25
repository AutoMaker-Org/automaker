/**
 * Rate limiting utilities for API security
 *
 * Provides rate limiters to prevent abuse and brute force attacks.
 */

import type { Request, Response, NextFunction } from 'express';

// Rate limit function type
type RateLimitFunction = (
  options: unknown
) => (req: Request, res: Response, next: NextFunction) => void;

// Temporary: Make rate limiting optional due to missing dependency
let rateLimitFn: RateLimitFunction;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  rateLimitFn = require('express-rate-limit');
} catch {
  console.warn('[rate-limiter] express-rate-limit not installed, rate limiting disabled');
  rateLimitFn = () => (req: Request, res: Response, next: NextFunction) => next();
}

// ============================================================================
// Standard API Rate Limiter
// ============================================================================

/**
 * Standard API rate limiter
 *
 * Limits each IP to 100 requests per 15-minute window.
 * Suitable for general API endpoints.
 */
export const apiLimiter = rateLimitFn({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// ============================================================================
// Health Endpoint Rate Limiter
// ============================================================================

/**
 * Health endpoint rate limiter
 *
 * Limits each IP to 10 requests per 1-minute window.
 * Prevents health endpoint abuse while allowing monitoring.
 */
export const healthLimiter = rateLimitFn({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    success: false,
    error: 'Too many health check requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Strict Rate Limiter (for sensitive operations)
// ============================================================================

/**
 * Strict rate limiter for sensitive operations
 *
 * Limits each IP to 5 requests per 1-minute window.
 * Use for authentication, settings changes, etc.
 */
export const strictLimiter = rateLimitFn({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Beads-specific Rate Limiter
// ============================================================================

/**
 * Beads API rate limiter
 *
 * Limits each IP to 200 requests per 15-minute window.
 * Beads operations can be frequent, so we allow more requests.
 */
export const beadsLimiter = rateLimitFn({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
