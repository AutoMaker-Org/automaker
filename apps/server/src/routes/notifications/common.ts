/**
 * Common utilities for notification routes
 *
 * Provides logger and error handling utilities shared across all notification endpoints.
 */

import { createLogger } from '@automaker/utils';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';

/** Logger instance for notification-related operations */
export const logger = createLogger('Notifications');

/**
 * Extract user-friendly error message from error objects
 */
export { getErrorMessageShared as getErrorMessage };

/**
 * Log error with automatic logger binding
 */
export const logError = createLogError(logger);
