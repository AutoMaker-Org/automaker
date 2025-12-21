/**
 * Common utilities for settings routes
 *
 * Provides logger and error handling utilities shared across all settings endpoints.
 * Re-exports error handling helpers from the parent routes module.
 */

import { createLogger } from "@automaker/utils";
import {
  getErrorMessage as getErrorMessageShared,
  createLogError,
} from "../common.js";

/** Logger instance for settings-related operations */
export const logger = createLogger("Settings");

/**
 * Extract user-friendly error message from error objects
 *
 * Re-exported from parent routes common module for consistency.
 */
export { getErrorMessageShared as getErrorMessage };

/**
 * Log error with automatic logger binding
 *
 * Convenience function for logging errors with the Settings logger.
 */
export const logError = createLogError(logger);
