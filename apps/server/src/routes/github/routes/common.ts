/**
 * Common utilities for GitHub routes
 *
 * Re-exports shared utilities from lib/exec-utils so route consumers
 * can continue importing from this module unchanged.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

// Re-export shared utilities from the canonical location
export { extendedPath, execEnv, getErrorMessage, logError } from '../../../lib/exec-utils.js';
