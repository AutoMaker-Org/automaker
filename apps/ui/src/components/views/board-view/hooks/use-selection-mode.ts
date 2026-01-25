import { useState, useCallback, useEffect } from 'react';

export type SelectionTarget = 'backlog' | 'waiting_approval' | null;

interface UseSelectionModeReturn {
  isSelectionMode: boolean;
  selectionTarget: SelectionTarget;
  selectedFeatureIds: Set<string>;
  selectedCount: number;
  toggleSelectionMode: (target?: SelectionTarget) => void;
  toggleFeatureSelection: (featureId: string) => void;
  selectAll: (featureIds: string[]) => void;
  clearSelection: () => void;
  isFeatureSelected: (featureId: string) => boolean;
  exitSelectionMode: () => void;
}

export function useSelectionMode(): UseSelectionModeReturn {
  const [selectionTarget, setSelectionTarget] = useState<SelectionTarget>(null);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(new Set());

  const isSelectionMode = selectionTarget !== null;

  const toggleSelectionMode = useCallback((target: SelectionTarget = 'backlog') => {
    setSelectionTarget((prev) => {
      if (prev === target) {
        // Exiting selection mode - clear selection
        setSelectedFeatureIds(new Set());
        return null;
      }
      // Switching to a different target or entering selection mode
      setSelectedFeatureIds(new Set());
      return target;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionTarget(null);
    setSelectedFeatureIds(new Set());
  }, []);

  const toggleFeatureSelection = useCallback((featureId: string) => {
    setSelectedFeatureIds((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) {
        next.delete(featureId);
      } else {
        next.add(featureId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((featureIds: string[]) => {
    setSelectedFeatureIds(new Set(featureIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFeatureIds(new Set());
  }, []);

  const isFeatureSelected = useCallback(
    (featureId: string) => selectedFeatureIds.has(featureId),
    [selectedFeatureIds]
  );

  // Handle Escape key to exit selection mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSelectionMode) {
        exitSelectionMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelectionMode, exitSelectionMode]);

  return {
    isSelectionMode,
    selectionTarget,
    selectedFeatureIds,
    selectedCount: selectedFeatureIds.size,
    toggleSelectionMode,
    toggleFeatureSelection,
    selectAll,
    clearSelection,
    isFeatureSelected,
    exitSelectionMode,
  };
}
