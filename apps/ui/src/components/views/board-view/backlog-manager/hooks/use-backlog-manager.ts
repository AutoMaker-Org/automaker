import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAppStore, Feature } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { mapWithConcurrency } from '@/lib/concurrent-utils';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('BacklogManager');

/**
 * Error information for failed imports
 */
export interface ImportError {
  filename: string;
  error: string;
}

/**
 * Props for the useBacklogManager hook
 */
interface UseBacklogManagerProps {
  currentProject: { path: string; id: string } | null;
}

/**
 * Return type for the useBacklogManager hook
 */
interface UseBacklogManagerReturn {
  // Backlog features (filtered to status === 'backlog')
  backlogFeatures: Feature[];
  filteredFeatures: Feature[];
  isLoading: boolean;

  // Selection state
  selectedIds: Set<string>;
  selectedCount: number;
  toggleSelection: (featureId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isSelected: (featureId: string) => boolean;

  // Search state
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Category filter state
  selectedCategories: string[];
  setSelectedCategories: (categories: string[]) => void;
  availableCategories: string[];

  // Import errors state
  importErrors: ImportError[];
  setImportErrors: (errors: ImportError[]) => void;
  clearImportErrors: () => void;

  // Bulk operations
  bulkDelete: (featureIds: string[]) => Promise<void>;
  bulkUpdateCategory: (featureIds: string[], category: string) => Promise<void>;

  // Single feature operations
  createFeature: (feature: Partial<Feature>) => Promise<Feature | null>;
  updateFeature: (featureId: string, updates: Partial<Feature>) => Promise<void>;
  deleteFeature: (featureId: string) => Promise<void>;

  // Refresh
  refetchFeatures: () => Promise<void>;
}

/**
 * Hook for managing backlog items with selection, search, filtering,
 * import error tracking, and bulk operations.
 */
export function useBacklogManager({
  currentProject,
}: UseBacklogManagerProps): UseBacklogManagerReturn {
  const { features, setFeatures, updateFeature: storeUpdateFeature, removeFeature } = useAppStore();

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Category filter state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Import errors state
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);

  // Filter features to only backlog items
  const backlogFeatures = useMemo(() => features.filter((f) => f.status === 'backlog'), [features]);

  // Get available categories from backlog features
  const availableCategories = useMemo(
    () =>
      Array.from(
        new Set(backlogFeatures.map((f) => f.category).filter((c): c is string => Boolean(c)))
      ).sort(),
    [backlogFeatures]
  );

  // Apply search and category filters
  const filteredFeatures = useMemo(() => {
    let result = backlogFeatures;

    // Apply search filter (searches title and description)
    if (searchQuery.trim()) {
      const normalizedQuery = searchQuery.toLowerCase().trim();
      result = result.filter((f) => {
        const titleMatch = f.title?.toLowerCase().includes(normalizedQuery);
        const descMatch = f.description?.toLowerCase().includes(normalizedQuery);
        return titleMatch || descMatch;
      });
    }

    // Apply category filter
    if (selectedCategories.length > 0) {
      result = result.filter((f) => selectedCategories.includes(f.category));
    }

    return result;
  }, [backlogFeatures, searchQuery, selectedCategories]);

  // Selection handlers
  const toggleSelection = useCallback((featureId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) {
        next.delete(featureId);
      } else {
        next.add(featureId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredFeatures.map((f) => f.id)));
  }, [filteredFeatures]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((featureId: string) => selectedIds.has(featureId), [selectedIds]);

  // Clear import errors
  const clearImportErrors = useCallback(() => {
    setImportErrors([]);
  }, []);

  // Refetch features from API
  const refetchFeatures = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api.features) {
        logger.error('Features API not available');
        return;
      }

      const result = await api.features.getAll(currentProject.path);

      if (result.success && result.features) {
        const featuresWithIds = result.features.map((f: any, index: number) => ({
          ...f,
          id: f.id || `feature-${index}-${Date.now()}`,
          status: f.status || 'backlog',
          model: f.model || 'opus',
          thinkingLevel: f.thinkingLevel || 'none',
        }));
        setFeatures(featuresWithIds);
      }
    } catch (error) {
      logger.error('Failed to refetch features:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, setFeatures]);

  // Create a new feature
  const createFeature = useCallback(
    async (feature: Partial<Feature>): Promise<Feature | null> => {
      if (!currentProject) return null;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          return null;
        }

        const newFeature: Feature = {
          id: `feature-${Date.now()}`,
          title: feature.title ?? '',
          description: feature.description ?? '',
          category: feature.category ?? '',
          status: 'backlog',
          steps: feature.steps ?? [],
          ...feature,
        } as Feature;

        const result = await api.features.create(currentProject.path, newFeature);
        if (result.success && result.feature) {
          storeUpdateFeature(result.feature.id, result.feature);
          return result.feature;
        }
        return null;
      } catch (error) {
        logger.error('Failed to create feature:', error);
        throw error;
      }
    },
    [currentProject, storeUpdateFeature]
  );

  // Update a feature
  const updateFeature = useCallback(
    async (featureId: string, updates: Partial<Feature>) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          return;
        }

        const result = await api.features.update(currentProject.path, featureId, updates);
        if (result.success && result.feature) {
          storeUpdateFeature(result.feature.id, result.feature);
        }
      } catch (error) {
        logger.error('Failed to update feature:', error);
        throw error;
      }
    },
    [currentProject, storeUpdateFeature]
  );

  // Delete a single feature
  const deleteFeature = useCallback(
    async (featureId: string) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api.features) {
          logger.error('Features API not available');
          return;
        }

        await api.features.delete(currentProject.path, featureId);
        removeFeature(featureId);
      } catch (error) {
        logger.error('Failed to delete feature:', error);
        throw error;
      }
    },
    [currentProject, removeFeature]
  );

  // Bulk delete features with concurrency cap of 5
  const bulkDelete = useCallback(
    async (featureIds: string[]) => {
      if (!currentProject || featureIds.length === 0) return;

      const api = getElectronAPI();
      if (!api.features) {
        logger.error('Features API not available');
        return;
      }

      logger.info(`Bulk deleting ${featureIds.length} features with concurrency cap of 5`);

      const results = await mapWithConcurrency(
        featureIds,
        async (id) => {
          await api.features!.delete(currentProject.path, id);
          return id;
        },
        5 // Concurrency limit
      );

      // Remove successfully deleted features from store
      const deletedIds: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          deletedIds.push(featureIds[index]);
        } else {
          logger.error(`Failed to delete feature ${featureIds[index]}:`, result.reason);
        }
      });

      // Update store by removing deleted features
      deletedIds.forEach((id) => removeFeature(id));

      // Clear selection for deleted items
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });

      logger.info(`Successfully deleted ${deletedIds.length}/${featureIds.length} features`);
    },
    [currentProject, removeFeature]
  );

  // Bulk update category with concurrency cap of 5
  const bulkUpdateCategory = useCallback(
    async (featureIds: string[], category: string) => {
      if (!currentProject || featureIds.length === 0) return;

      const api = getElectronAPI();
      if (!api.features) {
        logger.error('Features API not available');
        return;
      }

      logger.info(`Bulk updating category to "${category}" for ${featureIds.length} features`);

      const results = await mapWithConcurrency(
        featureIds,
        async (id) => {
          const result = await api.features!.update(currentProject.path, id, { category });
          return { id, feature: result.feature };
        },
        5 // Concurrency limit
      );

      // Update store for successful updates
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.feature) {
          storeUpdateFeature(result.value.id, result.value.feature);
        } else if (result.status === 'rejected') {
          logger.error(
            `Failed to update category for feature ${featureIds[index]}:`,
            result.reason
          );
        }
      });

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      logger.info(
        `Successfully updated category for ${successCount}/${featureIds.length} features`
      );
    },
    [currentProject, storeUpdateFeature]
  );

  // Clean up selection when features change (remove selected IDs that no longer exist)
  useEffect(() => {
    const backlogIds = new Set(backlogFeatures.map((f) => f.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (backlogIds.has(id)) {
          next.add(id);
        }
      });
      // Only update if there's a change
      if (next.size !== prev.size) {
        return next;
      }
      return prev;
    });
  }, [backlogFeatures]);

  // Handle Escape key to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIds.size > 0) {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds.size, clearSelection]);

  return {
    // Backlog features
    backlogFeatures,
    filteredFeatures,
    isLoading,

    // Selection
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,

    // Search
    searchQuery,
    setSearchQuery,

    // Category filter
    selectedCategories,
    setSelectedCategories,
    availableCategories,

    // Import errors
    importErrors,
    setImportErrors,
    clearImportErrors,

    // Bulk operations
    bulkDelete,
    bulkUpdateCategory,

    // Single feature operations
    createFeature,
    updateFeature,
    deleteFeature,

    // Refresh
    refetchFeatures,
  };
}
