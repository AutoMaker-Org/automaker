/**
 * Middleware to enforce Content-Type: application/json for request bodies
 *
 * This security middleware prevents malicious requests by requiring proper
 * Content-Type headers for all POST, PUT, and PATCH requests.
 *
 * Rejecting requests without proper Content-Type helps prevent:
 * - CSRF attacks via form submissions (which use application/x-www-form-urlencoded)
 * - Content-type confusion attacks
 * - Malformed request exploitation
 */

import type { Request, Response, NextFunction } from 'express';

// HTTP methods that typically include request bodies
const METHODS_REQUIRING_JSON = ['POST', 'PUT', 'PATCH'];

/**
 * Middleware that requires Content-Type: application/json for POST/PUT/PATCH requests
 *
 * Returns 415 Unsupported Media Type if:
 * - The request method is POST, PUT, or PATCH
 * - AND the Content-Type header is missing or not application/json
 *
 * Allows requests to pass through if:
 * - The request method is GET, DELETE, OPTIONS, HEAD, etc.
 * - OR the Content-Type is properly set to application/json (with optional charset)
 */
export function requireJsonContentType(req: Request, res: Response, next: NextFunction): void {
  // Skip validation for methods that don't require a body
  if (!METHODS_REQUIRING_JSON.includes(req.method)) {
    next();
    return;
  }

  const contentType = req.headers['content-type'];

  // Check if Content-Type header exists and contains application/json
  // Allows for charset parameter: "application/json; charset=utf-8"
  if (!contentType || !contentType.toLowerCase().includes('application/json')) {
    res.status(415).json({
      success: false,
      error: 'Unsupported Media Type',
      message: 'Content-Type header must be application/json',
    });
    return;
  }

  next();
}
