import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AgentModel } from '@/store/app-store';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Determine if the current model supports extended thinking controls
 */
export function modelSupportsThinking(model?: AgentModel | string): boolean {
  if (!model) return true; // Default for safety
  const modelStr = model.toString();
  // Claude models support extended thinking
  const claudeModels = ['haiku', 'sonnet', 'opus', 'claude-haiku', 'claude-sonnet', 'claude-opus'];
  // All Zai GLM models support thinking mode (glm-4.5-air, glm-4.6, glm-4.6v, glm-4.7)
  const zaiModels = ['glm', 'glm-4.5-air', 'glm-4.6', 'glm-4.6v', 'glm-4.7'];
  return (
    claudeModels.some((m) => modelStr.includes(m)) ||
    zaiModels.includes(modelStr) ||
    zaiModels.some((m) => modelStr.includes(m))
  );
}

/**
 * Get display name for a model
 */
export function getModelDisplayName(model: AgentModel | string): string {
  const displayNames: Record<string, string> = {
    haiku: 'Claude Haiku',
    sonnet: 'Claude Sonnet',
    opus: 'Claude Opus',
    'glm-4.7': 'GLM-4.7',
    'glm-4.6v': 'GLM-4.6v',
    'glm-4.6': 'GLM-4.6',
    'glm-4.5-air': 'GLM-4.5-Air',
    glm: 'GLM-4.5-Air',
  };
  return displayNames[model] || model;
}

/**
 * Truncate a description string with ellipsis
 */
export function truncateDescription(description: string, maxLength = 50): string {
  if (description.length <= maxLength) {
    return description;
  }
  return `${description.slice(0, maxLength)}...`;
}

/**
 * Normalize a file path to use forward slashes consistently.
 * This is important for cross-platform compatibility (Windows uses backslashes).
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Compare two paths for equality, handling cross-platform differences.
 * Normalizes both paths to forward slashes before comparison.
 */
export function pathsEqual(p1: string | undefined | null, p2: string | undefined | null): boolean {
  if (!p1 || !p2) return p1 === p2;
  return normalizePath(p1) === normalizePath(p2);
}

/**
 * Detect if running on macOS.
 * Checks Electron process.platform first, then falls back to navigator APIs.
 */
export const isMac =
  typeof process !== 'undefined' && process.platform === 'darwin'
    ? true
    : typeof navigator !== 'undefined' &&
      (/Mac/.test(navigator.userAgent) ||
        (navigator.platform ? navigator.platform.toLowerCase().includes('mac') : false));
