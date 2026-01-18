import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ModelAlias, ModelProvider } from '@/store/app-store';
import { CODEX_MODEL_CONFIG_MAP, codexModelHasThinking } from '@automaker/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Determine if the current model supports extended thinking controls
 * Note: This is for Claude's "thinking levels" only, not Codex's "reasoning effort"
 *
 * Rules:
 * - Claude models: support thinking (sonnet-4.5-thinking, opus-4.5-thinking, etc.)
 * - Cursor models: NO thinking controls (handled internally by Cursor CLI)
 * - Codex models: NO thinking controls (they use reasoningEffort instead)
 */
export function modelSupportsThinking(_model?: ModelAlias | string): boolean {
  if (!_model) return true;

  // Cursor models - don't show thinking controls
  if (_model.startsWith('cursor-')) {
    return false;
  }

  // Codex models - use reasoningEffort, not thinkingLevel
  if (_model.startsWith('codex-')) {
    return false;
  }

  // Bare gpt- models (legacy) - assume Codex, no thinking controls
  if (_model.startsWith('gpt-')) {
    return false;
  }

  // All Claude models support thinking
  return true;
}

/**
 * Determine the provider from a model string
 * Mirrors the logic in apps/server/src/providers/provider-factory.ts
 */
export function getProviderFromModel(model?: string): ModelProvider {
  if (!model) return 'claude';

  // Check for Cursor models (cursor- prefix)
  if (model.startsWith('cursor-') || model.startsWith('cursor:')) {
    return 'cursor';
  }

  // Check for Codex/OpenAI models (codex- prefix, gpt- prefix, or o-series)
  if (
    model.startsWith('codex-') ||
    model.startsWith('codex:') ||
    model.startsWith('gpt-') ||
    /^o\d/.test(model)
  ) {
    return 'codex';
  }

  // Default to Claude
  return 'claude';
}

/**
 * Get display name for a model
 */
export function getModelDisplayName(model: ModelAlias | string): string {
  const displayNames: Record<string, string> = {
    haiku: 'Claude Haiku',
    sonnet: 'Claude Sonnet',
    opus: 'Claude Opus',
    // Codex models
    'codex-gpt-5.2': 'GPT-5.2',
    'codex-gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
    'codex-gpt-5.1-codex': 'GPT-5.1 Codex',
    'codex-gpt-5.1-codex-mini': 'GPT-5.1 Codex Mini',
    'codex-gpt-5.1': 'GPT-5.1',
    // Cursor models (common ones)
    'cursor-auto': 'Cursor Auto',
    'cursor-composer-1': 'Composer 1',
    'cursor-gpt-5.2': 'GPT-5.2',
    'cursor-gpt-5.1': 'GPT-5.1',
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
 * Sanitize a string for use in data-testid attributes.
 * Creates a deterministic, URL-safe identifier from any input string.
 *
 * Transformations:
 * - Convert to lowercase
 * - Replace spaces with hyphens
 * - Remove all non-alphanumeric characters (except hyphens)
 * - Collapse multiple consecutive hyphens into a single hyphen
 * - Trim leading/trailing hyphens
 *
 * @param name - The string to sanitize (e.g., project name, feature title)
 * @returns A sanitized string safe for CSS selectors and test IDs
 *
 * @example
 * sanitizeForTestId("My Awesome Project!") // "my-awesome-project"
 * sanitizeForTestId("test-project-123")    // "test-project-123"
 * sanitizeForTestId("  Foo  Bar  ")        // "foo-bar"
 */
export function sanitizeForTestId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a UUID v4 string.
 *
 * Uses crypto.randomUUID() when available (secure contexts: HTTPS or localhost).
 * Falls back to crypto.getRandomValues() for non-secure contexts (e.g., Docker via HTTP).
 *
 * @returns A RFC 4122 compliant UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateUUID(): string {
  // Use native randomUUID if available (secure contexts: HTTPS or localhost)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback using crypto.getRandomValues() (works in all modern browsers, including non-secure contexts)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version (4) and variant (RFC 4122) bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC 4122

    // Convert to hex string with proper UUID format
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last resort fallback using Math.random() - less secure but ensures functionality
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
