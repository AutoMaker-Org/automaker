/**
 * Re-export PhaseModelSelector in compact mode for use in agent chat view.
 * This ensures we have a single source of truth for model selection logic.
 */

import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import type { PhaseModelEntry } from '@automaker/types';

// Re-export types for convenience
export type { PhaseModelEntry };

interface AgentModelSelectorProps {
  /** Current model selection (model + optional thinking level) */
  value: PhaseModelEntry;
  /** Callback when model is selected */
  onChange: (entry: PhaseModelEntry) => void;
  /** Disabled state */
  disabled?: boolean;
}

export function AgentModelSelector({ value, onChange, disabled }: AgentModelSelectorProps) {
  return (
    <PhaseModelSelector value={value} onChange={onChange} disabled={disabled} compact align="end" />
  );
}
