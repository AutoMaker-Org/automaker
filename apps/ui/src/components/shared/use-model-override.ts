import { useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import type { ModelId, PhaseModelKey, PhaseModelEntry } from '@automaker/types';
import { DEFAULT_PHASE_MODELS } from '@automaker/types';

export interface UseModelOverrideOptions {
  /** Which phase this override is for */
  phase: PhaseModelKey;
  /** Initial override value (optional) */
  initialOverride?: PhaseModelEntry | null;
}

export interface UseModelOverrideResult {
  /** The effective model entry (override or global default) */
  effectiveModelEntry: PhaseModelEntry;
  /** The effective model string (for backward compatibility with APIs that only accept strings) */
  effectiveModel: ModelId;
  /** Whether the model is currently overridden */
  isOverridden: boolean;
  /** Set a model override */
  setOverride: (entry: PhaseModelEntry | null) => void;
  /** Clear the override and use global default */
  clearOverride: () => void;
  /** The global default for this phase */
  globalDefault: PhaseModelEntry;
  /** The current override value (null if not overridden) */
  override: PhaseModelEntry | null;
}

/**
 * Normalize PhaseModelEntry or string to PhaseModelEntry
 * Handles undefined/null gracefully (e.g., when phaseModels from server settings
 * is missing a recently-added phase key)
 */
function normalizeEntry(entry: PhaseModelEntry | string | undefined | null): PhaseModelEntry {
  if (!entry) {
    return { model: 'claude-sonnet' as ModelId };
  }
  if (typeof entry === 'string') {
    return { model: entry as ModelId };
  }
  return entry;
}

/**
 * Hook for managing model overrides per phase
 *
 * Provides a simple way to allow users to override the global phase model
 * for a specific run or context. Now supports PhaseModelEntry with thinking levels.
 *
 * @example
 * ```tsx
 * function EnhanceDialog() {
 *   const { effectiveModelEntry, isOverridden, setOverride, clearOverride } = useModelOverride({
 *     phase: 'enhancementModel',
 *   });
 *
 *   return (
 *     <ModelOverrideTrigger
 *       currentModelEntry={effectiveModelEntry}
 *       onModelChange={setOverride}
 *       phase="enhancementModel"
 *       isOverridden={isOverridden}
 *     />
 *   );
 * }
 * ```
 */
export function useModelOverride({
  phase,
  initialOverride = null,
}: UseModelOverrideOptions): UseModelOverrideResult {
  const { phaseModels } = useAppStore();
  const [override, setOverrideState] = useState<PhaseModelEntry | null>(
    initialOverride ? normalizeEntry(initialOverride) : null
  );

  // Normalize global default to PhaseModelEntry, with fallback to DEFAULT_PHASE_MODELS
  // This handles cases where settings haven't been migrated to include new phase models
  const globalDefault = normalizeEntry(phaseModels[phase] ?? DEFAULT_PHASE_MODELS[phase]);

  const effectiveModelEntry = useMemo(() => {
    return override ?? globalDefault;
  }, [override, globalDefault]);

  const effectiveModel = useMemo(() => {
    return effectiveModelEntry.model;
  }, [effectiveModelEntry]);

  const isOverridden = override !== null;

  const setOverride = useCallback((entry: PhaseModelEntry | null) => {
    setOverrideState(entry ? normalizeEntry(entry) : null);
  }, []);

  const clearOverride = useCallback(() => {
    setOverrideState(null);
  }, []);

  return {
    effectiveModelEntry,
    effectiveModel,
    isOverridden,
    setOverride,
    clearOverride,
    globalDefault,
    override,
  };
}
