import { useMemo } from 'react';
import { Feature } from '@/store/app-store';

export interface GraphFilterState {
  searchQuery: string;
  selectedCategories: string[];
  selectedStatuses: string[];
  isNegativeFilter: boolean;
}

// Available status filter values
export const STATUS_FILTER_OPTIONS = [
  'running',
  'paused',
  'backlog',
  'waiting_approval',
  'verified',
] as const;

export type StatusFilterValue = (typeof STATUS_FILTER_OPTIONS)[number];

export interface GraphFilterResult {
  matchedNodeIds: Set<string>;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  availableCategories: string[];
  hasActiveFilter: boolean;
}

/**
 * Traverses up the dependency tree to find all ancestors of a node
 */
function getAncestors(
  featureId: string,
  featureMap: Map<string, Feature>,
  visited: Set<string>
): void {
  if (visited.has(featureId)) return;
  visited.add(featureId);

  const feature = featureMap.get(featureId);
  if (!feature?.dependencies) return;

  const deps = feature.dependencies as string[] | undefined;
  if (!deps) return;

  for (const depId of deps) {
    if (featureMap.has(depId)) {
      getAncestors(depId, featureMap, visited);
    }
  }
}

/**
 * Traverses down to find all descendants (features that depend on this one)
 */
function getDescendants(
  featureId: string,
  dependentsMap: Map<string, string[]>,
  visited: Set<string>
): void {
  if (visited.has(featureId)) return;
  visited.add(featureId);

  const dependents = dependentsMap.get(featureId);
  if (!dependents || dependents.length === 0) return;

  for (const dependentId of dependents) {
    getDescendants(dependentId, dependentsMap, visited);
  }
}

function buildDependentsMap(features: Feature[]): Map<string, string[]> {
  const dependentsMap = new Map<string, string[]>();

  for (const feature of features) {
    const deps = feature.dependencies as string[] | undefined;
    if (!deps || deps.length === 0) continue;

    for (const depId of deps) {
      const existing = dependentsMap.get(depId);
      if (existing) {
        existing.push(feature.id);
      } else {
        dependentsMap.set(depId, [feature.id]);
      }
    }
  }

  return dependentsMap;
}

/**
 * Gets all edges in the highlighted path
 */
function getHighlightedEdges(highlightedNodeIds: Set<string>, features: Feature[]): Set<string> {
  const edges = new Set<string>();

  for (const feature of features) {
    if (!highlightedNodeIds.has(feature.id)) continue;
    const deps = feature.dependencies as string[] | undefined;
    if (!deps) continue;

    for (const depId of deps) {
      if (highlightedNodeIds.has(depId)) {
        edges.add(`${depId}->${feature.id}`);
      }
    }
  }

  return edges;
}

/**
 * Gets the effective status of a feature (accounting for running state)
 * Treats completed (archived) as verified
 */
function getEffectiveStatus(feature: Feature, runningTaskIds: Set<string>): StatusFilterValue {
  if (feature.status === 'in_progress') {
    return runningTaskIds.has(feature.id) ? 'running' : 'paused';
  }
  // Treat completed (archived) as verified
  if (feature.status === 'completed') {
    return 'verified';
  }
  return feature.status as StatusFilterValue;
}

/**
 * Hook to calculate graph filter results based on search query, categories, statuses, and filter mode
 */
export function useGraphFilter(
  features: Feature[],
  filterState: GraphFilterState,
  runningAutoTasks: string[] = []
): GraphFilterResult {
  const { searchQuery, selectedCategories, selectedStatuses, isNegativeFilter } = filterState;

  return useMemo(() => {
    // Extract all unique categories
    const availableCategories = Array.from(
      new Set(features.map((f) => f.category).filter(Boolean))
    ).sort();

    const normalizedQuery = searchQuery.toLowerCase().trim();
    const runningTaskIds = new Set(runningAutoTasks);
    const hasSearchQuery = normalizedQuery.length > 0;
    const hasCategoryFilter = selectedCategories.length > 0;
    const hasStatusFilter = selectedStatuses.length > 0;
    const hasActiveFilter =
      hasSearchQuery || hasCategoryFilter || hasStatusFilter || isNegativeFilter;

    // If no filters active, return empty sets (show all nodes normally)
    if (!hasActiveFilter) {
      return {
        matchedNodeIds: new Set<string>(),
        highlightedNodeIds: new Set<string>(),
        highlightedEdgeIds: new Set<string>(),
        availableCategories,
        hasActiveFilter: false,
      };
    }

    // Find directly matched nodes
    const matchedNodeIds = new Set<string>();
    const featureMap = new Map(features.map((f) => [f.id, f]));
    const dependentsMap = buildDependentsMap(features);

    for (const feature of features) {
      let matchesSearch = true;
      let matchesCategory = true;
      let matchesStatus = true;

      // Check search query match (title or description)
      if (hasSearchQuery) {
        const titleMatch = feature.title?.toLowerCase().includes(normalizedQuery);
        const descMatch = feature.description?.toLowerCase().includes(normalizedQuery);
        matchesSearch = titleMatch || descMatch;
      }

      // Check category match
      if (hasCategoryFilter) {
        matchesCategory = selectedCategories.includes(feature.category);
      }

      // Check status match
      if (hasStatusFilter) {
        const effectiveStatus = getEffectiveStatus(feature, runningTaskIds);
        matchesStatus = selectedStatuses.includes(effectiveStatus);
      }

      // All conditions must be true for a match
      if (matchesSearch && matchesCategory && matchesStatus) {
        matchedNodeIds.add(feature.id);
      }
    }

    // Apply negative filter if enabled (invert the matched set)
    let effectiveMatchedIds: Set<string>;
    if (isNegativeFilter) {
      effectiveMatchedIds = new Set(
        features.filter((f) => !matchedNodeIds.has(f.id)).map((f) => f.id)
      );
    } else {
      effectiveMatchedIds = matchedNodeIds;
    }

    // Calculate full path (ancestors + descendants) for highlighted nodes
    const highlightedNodeIds = new Set<string>();

    for (const id of effectiveMatchedIds) {
      // Add the matched node itself
      highlightedNodeIds.add(id);

      // Add all ancestors (dependencies)
      getAncestors(id, featureMap, highlightedNodeIds);

      // Add all descendants (dependents)
      getDescendants(id, dependentsMap, highlightedNodeIds);
    }

    // Get edges in the highlighted path
    const highlightedEdgeIds = getHighlightedEdges(highlightedNodeIds, features);

    return {
      matchedNodeIds: effectiveMatchedIds,
      highlightedNodeIds,
      highlightedEdgeIds,
      availableCategories,
      hasActiveFilter: true,
    };
  }, [
    features,
    searchQuery,
    selectedCategories,
    selectedStatuses,
    isNegativeFilter,
    runningAutoTasks,
  ]);
}
