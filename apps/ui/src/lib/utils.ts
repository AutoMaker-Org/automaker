import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AgentModel } from '@/store/app-store';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Determine if the current model supports extended thinking controls
 */
export function modelSupportsThinking(_model?: AgentModel | string): boolean {
  // All Claude models support thinking
  return true;
}

/**
 * Get display name for a model
 */
export function getModelDisplayName(model: AgentModel | string): string {
  const displayNames: Record<string, string> = {
    haiku: 'Claude Haiku',
    sonnet: 'Claude Sonnet',
    opus: 'Claude Opus',
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

/**
 * Get the owner/repo display name from a GitHub repository URL.
 *
 * @param url - A repository URL (common GitHub formats like `https://github.com/owner/repo`, `git@github.com:owner/repo.git`, or `github.com/owner/repo`)
 * @returns The `owner/repo` string when the URL is a GitHub repository, otherwise `'upstream'`
 */
export function getRepoDisplayName(url: string): string {
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
  return match ? match[1] : 'upstream';
}