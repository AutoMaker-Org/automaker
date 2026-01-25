/**
 * Model ID Migration Utilities
 *
 * Provides functions to migrate legacy model IDs to the canonical prefixed format.
 * This ensures backward compatibility when loading settings from older versions.
 */

import type { CursorModelId, LegacyCursorModelId } from './cursor-models.js';
import { LEGACY_CURSOR_MODEL_MAP, CURSOR_MODEL_MAP } from './cursor-models.js';
import type { OpencodeModelId, LegacyOpencodeModelId } from './opencode-models.js';
import { LEGACY_OPENCODE_MODEL_MAP, OPENCODE_MODEL_CONFIG_MAP } from './opencode-models.js';
import type { ClaudeCanonicalId } from './model.js';
import { LEGACY_CLAUDE_ALIAS_MAP, CLAUDE_CANONICAL_MAP, CLAUDE_MODEL_MAP } from './model.js';
import type { PhaseModelEntry } from './settings.js';

/**
 * Check if a string is a legacy Cursor model ID (without prefix)
 */
export function isLegacyCursorModelId(id: string): id is LegacyCursorModelId {
  return id in LEGACY_CURSOR_MODEL_MAP;
}

/**
 * Check if a string is a legacy OpenCode model ID (with slash format)
 */
export function isLegacyOpencodeModelId(id: string): id is LegacyOpencodeModelId {
  return id in LEGACY_OPENCODE_MODEL_MAP;
}

/**
 * Check if a string is a legacy Claude alias (short name without prefix)
 */
export function isLegacyClaudeAlias(id: string): boolean {
  return id in LEGACY_CLAUDE_ALIAS_MAP;
}

/**
 * Migrate a single model ID to canonical format
 *
 * Handles:
 * - Legacy Cursor IDs (e.g., 'auto' -> 'cursor-auto')
 * - Legacy OpenCode IDs (e.g., 'opencode/big-pickle' -> 'opencode-big-pickle')
 * - Legacy Claude aliases (e.g., 'sonnet' -> 'claude-sonnet')
 * - Already-canonical IDs are passed through unchanged
 *
 * @param legacyId - The model ID to migrate
 * @returns The canonical model ID
 */
export function migrateModelId(legacyId: string | undefined | null): string {
  if (!legacyId) {
    return legacyId as string;
  }

  // Already has cursor- prefix and is in the map - it's canonical
  if (legacyId.startsWith('cursor-') && legacyId in CURSOR_MODEL_MAP) {
    return legacyId;
  }

  // Legacy Cursor model ID (without prefix)
  if (isLegacyCursorModelId(legacyId)) {
    return LEGACY_CURSOR_MODEL_MAP[legacyId];
  }

  // Already has opencode- prefix - it's canonical
  if (legacyId.startsWith('opencode-') && legacyId in OPENCODE_MODEL_CONFIG_MAP) {
    return legacyId;
  }

  // Legacy OpenCode model ID (with slash format)
  if (isLegacyOpencodeModelId(legacyId)) {
    return LEGACY_OPENCODE_MODEL_MAP[legacyId];
  }

  // Already has claude- prefix and is in canonical map
  if (legacyId.startsWith('claude-') && legacyId in CLAUDE_CANONICAL_MAP) {
    return legacyId;
  }

  // Legacy Claude alias (short name)
  if (isLegacyClaudeAlias(legacyId)) {
    return LEGACY_CLAUDE_ALIAS_MAP[legacyId];
  }

  // Unknown or already canonical - pass through
  return legacyId;
}

/**
 * Migrate an array of Cursor model IDs to canonical format
 *
 * @param ids - Array of legacy or canonical Cursor model IDs
 * @returns Array of canonical Cursor model IDs
 */
export function migrateCursorModelIds(ids: string[]): CursorModelId[] {
  if (!ids || !Array.isArray(ids)) {
    return [];
  }

  return ids.map((id) => {
    // Already canonical
    if (id.startsWith('cursor-') && id in CURSOR_MODEL_MAP) {
      return id as CursorModelId;
    }

    // Legacy ID
    if (isLegacyCursorModelId(id)) {
      return LEGACY_CURSOR_MODEL_MAP[id];
    }

    // Unknown - assume it might be a valid cursor model with prefix
    if (id.startsWith('cursor-')) {
      return id as CursorModelId;
    }

    // Add prefix if not present
    return `cursor-${id}` as CursorModelId;
  });
}

/**
 * Migrate an array of OpenCode model IDs to canonical format
 *
 * @param ids - Array of legacy or canonical OpenCode model IDs
 * @returns Array of canonical OpenCode model IDs
 */
export function migrateOpencodeModelIds(ids: string[]): OpencodeModelId[] {
  if (!ids || !Array.isArray(ids)) {
    return [];
  }

  return ids.map((id) => {
    // Already canonical (dash format)
    if (id.startsWith('opencode-') && id in OPENCODE_MODEL_CONFIG_MAP) {
      return id as OpencodeModelId;
    }

    // Legacy ID (slash format)
    if (isLegacyOpencodeModelId(id)) {
      return LEGACY_OPENCODE_MODEL_MAP[id];
    }

    // Convert slash to dash format for unknown models
    if (id.startsWith('opencode/')) {
      return id.replace('opencode/', 'opencode-') as OpencodeModelId;
    }

    // Add prefix if not present
    if (!id.startsWith('opencode-')) {
      return `opencode-${id}` as OpencodeModelId;
    }

    return id as OpencodeModelId;
  });
}

/**
 * Migrate a PhaseModelEntry to use canonical model IDs
 *
 * @param entry - The phase model entry to migrate
 * @returns Migrated phase model entry with canonical model ID
 */
export function migratePhaseModelEntry(
  entry: PhaseModelEntry | string | undefined | null
): PhaseModelEntry {
  // Handle null/undefined
  if (!entry) {
    return { model: 'claude-sonnet' }; // Default
  }

  // Handle legacy string format
  if (typeof entry === 'string') {
    return { model: migrateModelId(entry) };
  }

  // Handle PhaseModelEntry object
  return {
    ...entry,
    model: migrateModelId(entry.model),
  };
}

/**
 * Get the bare model ID for CLI calls (strip provider prefix)
 *
 * When calling provider CLIs, we need to strip the provider prefix:
 * - 'cursor-auto' -> 'auto' (for Cursor CLI)
 * - 'cursor-composer-1' -> 'composer-1' (for Cursor CLI)
 * - 'opencode-big-pickle' -> 'big-pickle' (for OpenCode CLI)
 *
 * Note: GPT models via Cursor keep the gpt- part: 'cursor-gpt-5.2' -> 'gpt-5.2'
 *
 * @param modelId - The canonical model ID with provider prefix
 * @returns The bare model ID for CLI usage
 */
export function getBareModelIdForCli(modelId: string): string {
  if (!modelId) return modelId;

  // Cursor models
  if (modelId.startsWith('cursor-')) {
    const bareId = modelId.slice(7); // Remove 'cursor-'
    // For GPT models, keep the gpt- prefix since that's what the CLI expects
    // e.g., 'cursor-gpt-5.2' -> 'gpt-5.2'
    return bareId;
  }

  // OpenCode models - strip prefix
  if (modelId.startsWith('opencode-')) {
    return modelId.slice(9); // Remove 'opencode-'
  }

  // Codex models - strip prefix
  if (modelId.startsWith('codex-')) {
    return modelId.slice(6); // Remove 'codex-'
  }

  // Claude and other models - pass through
  return modelId;
}
