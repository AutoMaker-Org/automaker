/**
 * Auth routes - Login, logout, and status endpoints
 *
 * Security model:
 * - Web mode: User enters API key (shown on server console) to get HTTP-only session cookie
 * - Electron mode: Uses X-API-Key header (handled automatically via IPC)
 *
 * The session cookie is:
 * - HTTP-only: JavaScript cannot read it (protects against XSS)
 * - SameSite=Strict: Only sent for same-site requests (protects against CSRF)
 *
 * Mounted at /api/auth in the main server (BEFORE auth middleware).
 */

import { Router } from 'express';
import type { Request } from 'express';
import {
  validateApiKey,
  createSession,
  invalidateSession,
  getSessionCookieOptions,
  getSessionCookieName,
  isRequestAuthenticated,
  createWsConnectionToken,
} from '../../lib/auth.js';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_ATTEMPTS = 5; // Max 5 attempts per window

// Check if we're in test mode - disable rate limiting for E2E tests
const isTestMode = process.env.AUTOMAKER_MOCK_AGENT === 'true';

// In-memory rate limit tracking (resets on server restart)
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

// Clean up old rate limit entries periodically (every 5 minutes)
setInterval(
  () => {
    const now = Date.now();
    loginAttempts.forEach((data, ip) => {
      if (now - data.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        loginAttempts.delete(ip);
      }
    });
  },
  5 * 60 * 1000
);

/**
 * Get client IP address from request
 * Handles X-Forwarded-For header for reverse proxy setups
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can be a comma-separated list; take the first (original client)
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return forwardedIp.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Check if an IP is rate limited
 * Returns { limited: boolean, retryAfter?: number }
 */
function checkRateLimit(ip: string): { limited: boolean; retryAfter?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);

  if (!attempt) {
    return { limited: false };
  }

  // Check if window has expired
  if (now - attempt.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(ip);
    return { limited: false };
  }

  // Check if over limit
  if (attempt.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - attempt.windowStart)) / 1000);
    return { limited: true, retryAfter };
  }

  return { limited: false };
}

/**
 * Record a login attempt for rate limiting
 */
function recordLoginAttempt(ip: string): void {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);

  if (!attempt || now - attempt.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Start new window
    loginAttempts.set(ip, { count: 1, windowStart: now });
  } else {
    // Increment existing window
    attempt.count++;
  }
}

/**
 * Create auth routes
 *
 * @returns Express Router with auth endpoints
 */
export function createAuthRoutes(): Router {
  const router = Router();

  /**
   * GET /api/auth/status
   *
   * Returns whether the current request is authenticated.
   * Used by the UI to determine if login is needed.
   */
  router.get('/status', (req, res) => {
    const authenticated = isRequestAuthenticated(req);
    res.json({
      success: true,
      authenticated,
      required: true,
    });
  });

  /**
   * POST /api/auth/login
   *
   * Validates the API key and sets a session cookie.
   * Body: { apiKey: string }
   *
   * Rate limited to 5 attempts per minute per IP to prevent brute force attacks.
   */
  router.post('/login', async (req, res) => {
    const clientIp = getClientIp(req);

    // Skip rate limiting in test mode to allow parallel E2E tests
    if (!isTestMode) {
      // Check rate limit before processing
      const rateLimit = checkRateLimit(clientIp);
      if (rateLimit.limited) {
        res.status(429).json({
          success: false,
          error: 'Too many login attempts. Please try again later.',
          retryAfter: rateLimit.retryAfter,
        });
        return;
      }
    }

    const { apiKey } = req.body as { apiKey?: string };

    if (!apiKey) {
      res.status(400).json({
        success: false,
        error: 'API key is required.',
      });
      return;
    }

    // Record this attempt (only for actual API key validation attempts, skip in test mode)
    if (!isTestMode) {
      recordLoginAttempt(clientIp);
    }

    if (!validateApiKey(apiKey)) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key.',
      });
      return;
    }

    // Create session and set cookie
    const sessionToken = await createSession();
    const cookieOptions = getSessionCookieOptions();
    const cookieName = getSessionCookieName();

    res.cookie(cookieName, sessionToken, cookieOptions);
    res.json({
      success: true,
      message: 'Logged in successfully.',
      // Return token for explicit header-based auth (works around cross-origin cookie issues)
      token: sessionToken,
    });
  });

  /**
   * GET /api/auth/token
   *
   * Generates a short-lived WebSocket connection token if the user has a valid session.
   * This token is used for initial WebSocket handshake authentication and expires in 5 minutes.
   * The token is NOT the session cookie value - it's a separate, short-lived token.
   */
  router.get('/token', (req, res) => {
    // Validate the session is still valid (via cookie, API key, or session token header)
    if (!isRequestAuthenticated(req)) {
      res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
      return;
    }

    // Generate a new short-lived WebSocket connection token
    const wsToken = createWsConnectionToken();

    res.json({
      success: true,
      token: wsToken,
      expiresIn: 300, // 5 minutes in seconds
    });
  });

  /**
   * POST /api/auth/logout
   *
   * Clears the session cookie and invalidates the session.
   */
  router.post('/logout', async (req, res) => {
    const cookieName = getSessionCookieName();
    const sessionToken = req.cookies?.[cookieName] as string | undefined;

    if (sessionToken) {
      await invalidateSession(sessionToken);
    }

    // Clear the cookie
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  });

  return router;
}
