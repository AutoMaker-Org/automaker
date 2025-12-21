/**
 * Middleware for validating path parameters against ALLOWED_ROOT_DIRECTORY
 * Provides a clean, reusable way to validate paths without repeating the same
 * try-catch block in every route handler
 */

import type { Request, Response, NextFunction } from "express";
import { validatePath, PathNotAllowedError } from "@automaker/platform";

/**
 * Creates a middleware that validates specified path parameters in req.body
 * @param paramNames - Names of parameters to validate (e.g., 'projectPath', 'worktreePath')
 * @example
 * router.post('/create', validatePathParams('projectPath'), handler);
 * router.post('/delete', validatePathParams('projectPath', 'worktreePath'), handler);
 * router.post('/send', validatePathParams('workingDirectory?', 'imagePaths[]'), handler);
 *
 * Special syntax:
 * - 'paramName?' - Optional parameter (only validated if present)
 * - 'paramName[]' - Array parameter (validates each element)
 */
export function validatePathParams(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const paramName of paramNames) {
        // Handle optional parameters (paramName?)
        if (paramName.endsWith("?")) {
          const actualName = paramName.slice(0, -1);
          const value = req.body[actualName];
          if (value) {
            validatePath(value);
          }
          continue;
        }

        // Handle array parameters (paramName[])
        if (paramName.endsWith("[]")) {
          const actualName = paramName.slice(0, -2);
          const values = req.body[actualName];
          if (Array.isArray(values) && values.length > 0) {
            for (const value of values) {
              validatePath(value);
            }
          }
          continue;
        }

        // Handle regular parameters
        const value = req.body[paramName];
        if (value) {
          validatePath(value);
        }
      }

      next();
    } catch (error) {
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
        return;
      }

      // Re-throw unexpected errors
      throw error;
    }
  };
}
