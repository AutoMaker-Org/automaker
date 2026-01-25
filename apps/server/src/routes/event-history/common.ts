/**
 * Common utilities for event history routes
 */

import { createLogger } from '@automaker/utils';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';

/** Logger instance for event history operations */
export const logger = createLogger('EventHistory');

/**
 * Extract user-friendly error message from error objects
 */
export { getErrorMessageShared as getErrorMessage };

/**
 * Log error with automatic logger binding
 */
export const logError = createLogError(logger);
