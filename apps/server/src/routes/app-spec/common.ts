/**
 * Common utilities and state management for spec regeneration
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('SpecRegeneration');
const ANTHROPIC_API_KEY_ENV = 'ANTHROPIC_API_KEY';
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';

// Shared state for tracking generation status - private
let isRunning = false;
let currentAbortController: AbortController | null = null;

/**
 * Get the current running state
 */
export function getSpecRegenerationStatus(): {
  isRunning: boolean;
  currentAbortController: AbortController | null;
} {
  return { isRunning, currentAbortController };
}

/**
 * Set the running state and abort controller
 */
export function setRunningState(running: boolean, controller: AbortController | null = null): void {
  isRunning = running;
  currentAbortController = controller;
}

/**
 * Helper to log authentication status
 */
export function logAuthStatus(context: string): void {
  const hasAnthropicKey = !!process.env[ANTHROPIC_API_KEY_ENV];
  const hasOpenAIKey = !!process.env[OPENAI_API_KEY_ENV];

  logger.info(`${context} - Auth Status:`);
  logger.info(
    `  ANTHROPIC_API_KEY: ${
      hasAnthropicKey
        ? 'SET (' + process.env[ANTHROPIC_API_KEY_ENV]?.substring(0, 20) + '...)'
        : 'NOT SET'
    }`
  );
  logger.info(
    `  OPENAI_API_KEY: ${
      hasOpenAIKey
        ? 'SET (' + process.env[OPENAI_API_KEY_ENV]?.substring(0, 20) + '...)'
        : 'NOT SET'
    }`
  );

  if (!hasAnthropicKey && !hasOpenAIKey) {
    logger.warn('WARNING: No authentication configured! Provider calls will fail.');
  }
}

/**
 * Log error details consistently
 */
export function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`);
  logger.error('Error name:', (error as any)?.name);
  logger.error('Error message:', (error as Error)?.message);
  logger.error('Error stack:', (error as Error)?.stack);
  logger.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
}

import { getErrorMessage as getErrorMessageShared } from '../common.js';

// Re-export shared utility
export { getErrorMessageShared as getErrorMessage };
