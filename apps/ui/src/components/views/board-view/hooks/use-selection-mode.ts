import { useState, useCallback, useEffect } from 'react';

interface UseSelectionModeReturn {
  isSelectionMode: boolean;
  selectedFeatureIds: Set<string>;
  selectedCount: number;
  toggleSelectionMode: () => void;
  toggleFeatureSelection: (featureId: string) => void;
  selectAll: (featureIds: string[]) => void;
  clearSelection: () => void;
  isFeatureSelected: (featureId: string) => boolean;
  exitSelectionMode: () => void;
}

export function useSelectionMode(): UseSelectionModeReturn {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(new Set());

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      if (prev) {
        // Exiting selection mode - clear selection
        setSelectedFeatureIds(new Set());
      }
      return !prev;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
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
