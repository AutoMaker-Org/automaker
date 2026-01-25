/**
 * Common utilities for backlog plan routes
 */

import { createLogger } from '@automaker/utils';
import { ensureAutomakerDir, getAutomakerDir } from '@automaker/platform';
import * as secureFs from '../../lib/secure-fs.js';
import path from 'path';
import type { BacklogPlanResult } from '@automaker/types';

const logger = createLogger('BacklogPlan');

// State for tracking running generation
let isRunning = false;
let currentAbortController: AbortController | null = null;
let runningDetails: {
  projectPath: string;
  prompt: string;
  model?: string;
  startedAt: string;
} | null = null;

const BACKLOG_PLAN_FILENAME = 'backlog-plan.json';

export interface StoredBacklogPlan {
  savedAt: string;
  prompt: string;
  model?: string;
  result: BacklogPlanResult;
}

export function getBacklogPlanStatus(): { isRunning: boolean } {
  return { isRunning };
}

export function setRunningState(running: boolean, abortController?: AbortController | null): void {
  isRunning = running;
  if (!running) {
    runningDetails = null;
  }
  if (abortController !== undefined) {
    currentAbortController = abortController;
  }
}

export function setRunningDetails(
  details: {
    projectPath: string;
    prompt: string;
    model?: string;
    startedAt: string;
  } | null
): void {
  runningDetails = details;
}

export function getRunningDetails(): {
  projectPath: string;
  prompt: string;
  model?: string;
  startedAt: string;
} | null {
  return runningDetails;
}

function getBacklogPlanPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), BACKLOG_PLAN_FILENAME);
}

export async function saveBacklogPlan(projectPath: string, plan: StoredBacklogPlan): Promise<void> {
  await ensureAutomakerDir(projectPath);
  const filePath = getBacklogPlanPath(projectPath);
  await secureFs.writeFile(filePath, JSON.stringify(plan, null, 2), 'utf-8');
}

export async function loadBacklogPlan(projectPath: string): Promise<StoredBacklogPlan | null> {
  try {
    const filePath = getBacklogPlanPath(projectPath);
    const raw = await secureFs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw as string) as StoredBacklogPlan;
    if (!Array.isArray(parsed?.result?.changes)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearBacklogPlan(projectPath: string): Promise<void> {
  try {
    const filePath = getBacklogPlanPath(projectPath);
    await secureFs.unlink(filePath);
  } catch {
    // ignore missing file
  }
}

export function getAbortController(): AbortController | null {
  return currentAbortController;
}

/**
 * Map SDK/CLI errors to user-friendly messages
 */
export function mapBacklogPlanError(rawMessage: string): string {
  // Claude Code spawn failures
  if (
    rawMessage.includes('Failed to spawn Claude Code process') ||
    rawMessage.includes('spawn node ENOENT') ||
    rawMessage.includes('Claude Code executable not found') ||
    rawMessage.includes('Claude Code native binary not found')
  ) {
    return 'Claude CLI could not be launched. Make sure the Claude CLI is installed and available in PATH, or check that Node.js is correctly installed. Try running "which claude" or "claude --version" in your terminal to verify.';
  }

  // Claude Code process crash
  if (rawMessage.includes('Claude Code process exited')) {
    return 'Claude exited unexpectedly. Try again. If it keeps happening, re-run `claude login` or update your API key in Setup.';
  }

  // Rate limiting
  if (rawMessage.toLowerCase().includes('rate limit') || rawMessage.includes('429')) {
    return 'Rate limited. Please wait a moment and try again.';
  }

  // Network errors
  if (
    rawMessage.toLowerCase().includes('network') ||
    rawMessage.toLowerCase().includes('econnrefused') ||
    rawMessage.toLowerCase().includes('timeout')
  ) {
    return 'Network error. Check your internet connection and try again.';
  }

  // Authentication errors
  if (
    rawMessage.toLowerCase().includes('not authenticated') ||
    rawMessage.toLowerCase().includes('unauthorized') ||
    rawMessage.includes('401')
  ) {
    return 'Authentication failed. Please check your API key or run `claude login` to authenticate.';
  }

  // Return original message for unknown errors
  return rawMessage;
}

export function getErrorMessage(error: unknown): string {
  let rawMessage: string;
  if (error instanceof Error) {
    rawMessage = error.message;
  } else {
    rawMessage = String(error);
  }
  return mapBacklogPlanError(rawMessage);
}

export function logError(error: unknown, context: string): void {
  logger.error(`[BacklogPlan] ${context}:`, getErrorMessage(error));
}

export { logger };
