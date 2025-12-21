/**
 * Common utilities and state for suggestions routes
 */

import { createLogger } from "@automaker/utils";
import {
  getErrorMessage as getErrorMessageShared,
  createLogError,
} from "../common.js";

const logger = createLogger("Suggestions");

// Shared state for tracking generation status - private
let isRunning = false;
let currentAbortController: AbortController | null = null;

/**
 * Get the current running state
 */
export function getSuggestionsStatus(): {
  isRunning: boolean;
  currentAbortController: AbortController | null;
} {
  return { isRunning, currentAbortController };
}

/**
 * Set the running state and abort controller
 */
export function setRunningState(
  running: boolean,
  controller: AbortController | null = null
): void {
  isRunning = running;
  currentAbortController = controller;
}

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);
