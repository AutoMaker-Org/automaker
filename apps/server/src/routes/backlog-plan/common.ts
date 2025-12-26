/**
 * Common utilities for backlog plan routes
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('BacklogPlan');

// State for tracking running generation
let isRunning = false;
let currentAbortController: AbortController | null = null;

export function getBacklogPlanStatus(): { isRunning: boolean } {
  return { isRunning };
}

export function setRunningState(running: boolean, abortController?: AbortController | null): void {
  isRunning = running;
  if (abortController !== undefined) {
    currentAbortController = abortController;
  }
}

export function getAbortController(): AbortController | null {
  return currentAbortController;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function logError(error: unknown, context: string): void {
  logger.error(`[BacklogPlan] ${context}:`, getErrorMessage(error));
}

export { logger };
