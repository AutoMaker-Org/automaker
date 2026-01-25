/**
 * Common utilities and state management for spec regeneration
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('SpecRegeneration');

// Types for running generation
export type GenerationType = 'spec_regeneration' | 'feature_generation' | 'sync';

interface RunningGeneration {
  isRunning: boolean;
  type: GenerationType;
  startedAt: string;
}

// Shared state for tracking generation status - scoped by project path
const runningProjects = new Map<string, RunningGeneration>();
const abortControllers = new Map<string, AbortController>();

/**
 * Get the running state for a specific project
 */
export function getSpecRegenerationStatus(projectPath?: string): {
  isRunning: boolean;
  currentAbortController: AbortController | null;
  projectPath?: string;
  type?: GenerationType;
  startedAt?: string;
} {
  if (projectPath) {
    const generation = runningProjects.get(projectPath);
    return {
      isRunning: generation?.isRunning || false,
      currentAbortController: abortControllers.get(projectPath) || null,
      projectPath,
      type: generation?.type,
      startedAt: generation?.startedAt,
    };
  }
  // Fallback: check if any project is running (for backward compatibility)
  const isAnyRunning = Array.from(runningProjects.values()).some((g) => g.isRunning);
  return { isRunning: isAnyRunning, currentAbortController: null };
}

/**
 * Get the project path that is currently running (if any)
 */
export function getRunningProjectPath(): string | null {
  for (const [path, running] of runningProjects.entries()) {
    if (running) return path;
  }
  return null;
}

/**
 * Set the running state and abort controller for a specific project
 */
export function setRunningState(
  projectPath: string,
  running: boolean,
  controller: AbortController | null = null,
  type: GenerationType = 'spec_regeneration'
): void {
  if (running) {
    runningProjects.set(projectPath, {
      isRunning: true,
      type,
      startedAt: new Date().toISOString(),
    });
    if (controller) {
      abortControllers.set(projectPath, controller);
    }
  } else {
    runningProjects.delete(projectPath);
    abortControllers.delete(projectPath);
  }
}

/**
 * Get all running spec/feature generations for the running agents view
 */
export function getAllRunningGenerations(): Array<{
  projectPath: string;
  type: GenerationType;
  startedAt: string;
}> {
  const results: Array<{
    projectPath: string;
    type: GenerationType;
    startedAt: string;
  }> = [];

  for (const [projectPath, generation] of runningProjects.entries()) {
    if (generation.isRunning) {
      results.push({
        projectPath,
        type: generation.type,
        startedAt: generation.startedAt,
      });
    }
  }

  return results;
}

/**
 * Helper to log authentication status
 */
export function logAuthStatus(context: string): void {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  logger.info(`${context} - Auth Status:`);
  logger.info(
    `  ANTHROPIC_API_KEY: ${
      hasApiKey ? 'SET (' + process.env.ANTHROPIC_API_KEY?.substring(0, 20) + '...)' : 'NOT SET'
    }`
  );

  if (!hasApiKey) {
    logger.warn('⚠️  WARNING: No authentication configured! SDK will fail.');
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
