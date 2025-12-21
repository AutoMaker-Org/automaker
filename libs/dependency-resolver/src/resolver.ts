/**
 * Dependency Resolution Utility
 *
 * Provides topological sorting and dependency analysis for features.
 * Uses a modified Kahn's algorithm that respects both dependencies and priorities.
 */

import type { Feature } from '@automaker/types';

export interface DependencyResolutionResult {
  orderedFeatures: Feature[];       // Features in dependency-aware order
  circularDependencies: string[][]; // Groups of IDs forming cycles
  missingDependencies: Map<string, string[]>; // featureId -> missing dep IDs
  blockedFeatures: Map<string, string[]>;     // featureId -> blocking dep IDs (incomplete dependencies)
}

/**
 * Resolves feature dependencies using topological sort with priority-aware ordering.
 *
 * Algorithm:
 * 1. Build dependency graph and detect missing/blocked dependencies
 * 2. Apply Kahn's algorithm for topological sort
 * 3. Within same dependency level, sort by priority (1=high, 2=medium, 3=low)
 * 4. Detect circular dependencies for features that can't be ordered
 *
 * @param features - Array of features to order
 * @returns Resolution result with ordered features and dependency metadata
 */
export function resolveDependencies(features: Feature[]): DependencyResolutionResult {
  const featureMap = new Map<string, Feature>(features.map(f => [f.id, f]));
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>(); // dependencyId -> [dependentIds]
  const missingDependencies = new Map<string, string[]>();
  const blockedFeatures = new Map<string, string[]>();

  // Initialize graph structures
  for (const feature of features) {
    inDegree.set(feature.id, 0);
    adjacencyList.set(feature.id, []);
  }

  // Build dependency graph and detect missing/blocked dependencies
  for (const feature of features) {
    const deps = feature.dependencies || [];
    for (const depId of deps) {
      if (!featureMap.has(depId)) {
        // Missing dependency - track it
        if (!missingDependencies.has(feature.id)) {
          missingDependencies.set(feature.id, []);
        }
        missingDependencies.get(feature.id)!.push(depId);
      } else {
        // Valid dependency - add edge to graph
        adjacencyList.get(depId)!.push(feature.id);
        inDegree.set(feature.id, (inDegree.get(feature.id) || 0) + 1);

        // Check if dependency is incomplete (blocking)
        const depFeature = featureMap.get(depId)!;
        if (depFeature.status !== 'completed' && depFeature.status !== 'verified') {
          if (!blockedFeatures.has(feature.id)) {
            blockedFeatures.set(feature.id, []);
          }
          blockedFeatures.get(feature.id)!.push(depId);
        }
      }
    }
  }

  // Kahn's algorithm with priority-aware selection
  const queue: Feature[] = [];
  const orderedFeatures: Feature[] = [];

  // Helper to sort features by priority (lower number = higher priority)
  const sortByPriority = (a: Feature, b: Feature) =>
    (a.priority ?? 2) - (b.priority ?? 2);

  // Start with features that have no dependencies (in-degree 0)
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(featureMap.get(id)!);
    }
  }

  // Sort initial queue by priority
  queue.sort(sortByPriority);

  // Process features in topological order
  while (queue.length > 0) {
    // Take highest priority feature from queue
    const current = queue.shift()!;
    orderedFeatures.push(current);

    // Process features that depend on this one
    for (const dependentId of adjacencyList.get(current.id) || []) {
      const currentDegree = inDegree.get(dependentId);
      if (currentDegree === undefined) {
        throw new Error(`In-degree not initialized for feature ${dependentId}`);
      }
      const newDegree = currentDegree - 1;
      inDegree.set(dependentId, newDegree);

      if (newDegree === 0) {
        queue.push(featureMap.get(dependentId)!);
        // Re-sort queue to maintain priority order
        queue.sort(sortByPriority);
      }
    }
  }

  // Detect circular dependencies (features not in output = part of cycle)
  const circularDependencies: string[][] = [];
  const processedIds = new Set(orderedFeatures.map(f => f.id));

  if (orderedFeatures.length < features.length) {
    // Find cycles using DFS
    const remaining = features.filter(f => !processedIds.has(f.id));
    const cycles = detectCycles(remaining, featureMap);
    circularDependencies.push(...cycles);

    // Add remaining features at end (part of cycles)
    orderedFeatures.push(...remaining);
  }

  return {
    orderedFeatures,
    circularDependencies,
    missingDependencies,
    blockedFeatures
  };
}

/**
 * Detects circular dependencies using depth-first search
 *
 * @param features - Features that couldn't be topologically sorted (potential cycles)
 * @param featureMap - Map of all features by ID
 * @returns Array of cycles, where each cycle is an array of feature IDs
 */
function detectCycles(
  features: Feature[],
  featureMap: Map<string, Feature>
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const currentPath: string[] = [];

  function dfs(featureId: string): boolean {
    visited.add(featureId);
    recursionStack.add(featureId);
    currentPath.push(featureId);

    const feature = featureMap.get(featureId);
    if (feature) {
      for (const depId of feature.dependencies || []) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          // Found cycle - extract it
          const cycleStart = currentPath.indexOf(depId);
          cycles.push(currentPath.slice(cycleStart));
          return true;
        }
      }
    }

    currentPath.pop();
    recursionStack.delete(featureId);
    return false;
  }

  for (const feature of features) {
    if (!visited.has(feature.id)) {
      dfs(feature.id);
    }
  }

  return cycles;
}

/**
 * Checks if a feature's dependencies are satisfied (all complete or verified)
 *
 * @param feature - Feature to check
 * @param allFeatures - All features in the project
 * @returns true if all dependencies are satisfied, false otherwise
 */
export function areDependenciesSatisfied(
  feature: Feature,
  allFeatures: Feature[]
): boolean {
  if (!feature.dependencies || feature.dependencies.length === 0) {
    return true; // No dependencies = always ready
  }

  return feature.dependencies.every((depId: string) => {
    const dep = allFeatures.find(f => f.id === depId);
    return dep && (dep.status === 'completed' || dep.status === 'verified');
  });
}

/**
 * Gets the blocking dependencies for a feature (dependencies that are incomplete)
 *
 * @param feature - Feature to check
 * @param allFeatures - All features in the project
 * @returns Array of feature IDs that are blocking this feature
 */
export function getBlockingDependencies(
  feature: Feature,
  allFeatures: Feature[]
): string[] {
  if (!feature.dependencies || feature.dependencies.length === 0) {
    return [];
  }

  return feature.dependencies.filter((depId: string) => {
    const dep = allFeatures.find(f => f.id === depId);
    return dep && dep.status !== 'completed' && dep.status !== 'verified';
  });
}
