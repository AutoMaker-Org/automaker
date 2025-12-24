import { describe, it, expect } from 'vitest';
import {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingDependencies,
  wouldCreateCircularDependency,
  dependencyExists,
} from '../src/resolver';
import type { Feature } from '@automaker/types';

// Helper to create test features
function createFeature(
  id: string,
  options: {
    dependencies?: string[];
    status?: string;
    priority?: number;
  } = {}
): Feature {
  return {
    id,
    category: 'test',
    description: `Feature ${id}`,
    dependencies: options.dependencies,
    status: options.status || 'pending',
    priority: options.priority,
  };
}

describe('resolver.ts', () => {
  describe('resolveDependencies', () => {
    it('should handle features with no dependencies', () => {
      const features = [createFeature('A'), createFeature('B'), createFeature('C')];

      const result = resolveDependencies(features);

      expect(result.orderedFeatures).toHaveLength(3);
      expect(result.circularDependencies).toEqual([]);
      expect(result.missingDependencies.size).toBe(0);
      expect(result.blockedFeatures.size).toBe(0);
    });

    it('should order features with linear dependencies', () => {
      const features = [
        createFeature('C', { dependencies: ['B'] }),
        createFeature('A'),
        createFeature('B', { dependencies: ['A'] }),
      ];

      const result = resolveDependencies(features);

      const ids = result.orderedFeatures.map((f) => f.id);
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
      expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'));
      expect(result.circularDependencies).toEqual([]);
    });

    it('should respect priority within same dependency level', () => {
      const features = [
        createFeature('Low', { priority: 3 }),
        createFeature('High', { priority: 1 }),
        createFeature('Medium', { priority: 2 }),
      ];

      const result = resolveDependencies(features);

      const ids = result.orderedFeatures.map((f) => f.id);
      expect(ids).toEqual(['High', 'Medium', 'Low']);
    });

    it('should use default priority 2 when not specified', () => {
      const features = [
        createFeature('NoPriority'),
        createFeature('HighPriority', { priority: 1 }),
        createFeature('LowPriority', { priority: 3 }),
      ];

      const result = resolveDependencies(features);

      const ids = result.orderedFeatures.map((f) => f.id);
      expect(ids.indexOf('HighPriority')).toBeLessThan(ids.indexOf('NoPriority'));
      expect(ids.indexOf('NoPriority')).toBeLessThan(ids.indexOf('LowPriority'));
    });

    it('should respect dependencies over priority', () => {
      const features = [
        createFeature('B', { dependencies: ['A'], priority: 1 }), // High priority but depends on A
        createFeature('A', { priority: 3 }), // Low priority but no dependencies
      ];

      const result = resolveDependencies(features);

      const ids = result.orderedFeatures.map((f) => f.id);
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
    });

    it('should detect circular dependencies (simple cycle)', () => {
      const features = [
        createFeature('A', { dependencies: ['B'] }),
        createFeature('B', { dependencies: ['A'] }),
      ];

      const result = resolveDependencies(features);

      expect(result.circularDependencies).toHaveLength(1);
      expect(result.circularDependencies[0]).toContain('A');
      expect(result.circularDependencies[0]).toContain('B');
      expect(result.orderedFeatures).toHaveLength(2); // All features still included
    });

    it('should detect circular dependencies (3-way cycle)', () => {
      const features = [
        createFeature('A', { dependencies: ['C'] }),
        createFeature('B', { dependencies: ['A'] }),
        createFeature('C', { dependencies: ['B'] }),
      ];

      const result = resolveDependencies(features);

      expect(result.circularDependencies.length).toBeGreaterThan(0);
      const allCycleIds = result.circularDependencies.flat();
      expect(allCycleIds).toContain('A');
      expect(allCycleIds).toContain('B');
      expect(allCycleIds).toContain('C');
    });

    it('should detect missing dependencies', () => {
      const features = [createFeature('A', { dependencies: ['NonExistent'] }), createFeature('B')];

      const result = resolveDependencies(features);

      expect(result.missingDependencies.has('A')).toBe(true);
      expect(result.missingDependencies.get('A')).toContain('NonExistent');
    });

    it('should detect blocked features (incomplete dependencies)', () => {
      const features = [
        createFeature('A', { status: 'pending' }),
        createFeature('B', { dependencies: ['A'], status: 'pending' }),
      ];

      const result = resolveDependencies(features);

      expect(result.blockedFeatures.has('B')).toBe(true);
      expect(result.blockedFeatures.get('B')).toContain('A');
    });

    it('should not mark features as blocked if dependencies are completed', () => {
      const features = [
        createFeature('A', { status: 'completed' }),
        createFeature('B', { dependencies: ['A'], status: 'pending' }),
      ];

      const result = resolveDependencies(features);

      expect(result.blockedFeatures.has('B')).toBe(false);
    });

    it('should not mark features as blocked if dependencies are verified', () => {
      const features = [
        createFeature('A', { status: 'verified' }),
        createFeature('B', { dependencies: ['A'], status: 'pending' }),
      ];

      const result = resolveDependencies(features);

      expect(result.blockedFeatures.has('B')).toBe(false);
    });

    it('should handle complex dependency graph', () => {
      const features = [
        createFeature('E', { dependencies: ['C', 'D'] }),
        createFeature('D', { dependencies: ['B'] }),
        createFeature('C', { dependencies: ['A', 'B'] }),
        createFeature('B'),
        createFeature('A'),
      ];

      const result = resolveDependencies(features);

      const ids = result.orderedFeatures.map((f) => f.id);

      // A and B have no dependencies - can be first or second
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
      expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'));
      expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));

      // C depends on A and B
      expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('E'));

      // D depends on B
      expect(ids.indexOf('D')).toBeLessThan(ids.indexOf('E'));

      expect(result.circularDependencies).toEqual([]);
    });

    it('should handle multiple missing dependencies', () => {
      const features = [createFeature('A', { dependencies: ['X', 'Y', 'Z'] })];

      const result = resolveDependencies(features);

      expect(result.missingDependencies.get('A')).toEqual(['X', 'Y', 'Z']);
    });

    it('should handle empty feature list', () => {
      const result = resolveDependencies([]);

      expect(result.orderedFeatures).toEqual([]);
      expect(result.circularDependencies).toEqual([]);
      expect(result.missingDependencies.size).toBe(0);
      expect(result.blockedFeatures.size).toBe(0);
    });

    it('should handle features with both missing and existing dependencies', () => {
      const features = [
        createFeature('A'),
        createFeature('B', { dependencies: ['A', 'NonExistent'] }),
      ];

      const result = resolveDependencies(features);

      expect(result.missingDependencies.get('B')).toContain('NonExistent');
      const ids = result.orderedFeatures.map((f) => f.id);
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
    });
  });

  describe('areDependenciesSatisfied', () => {
    it('should return true for feature with no dependencies', () => {
      const feature = createFeature('A');
      const allFeatures = [feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(true);
    });

    it('should return true for feature with empty dependencies array', () => {
      const feature = createFeature('A', { dependencies: [] });
      const allFeatures = [feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(true);
    });

    it('should return true when all dependencies are completed', () => {
      const dep = createFeature('Dep', { status: 'completed' });
      const feature = createFeature('A', { dependencies: ['Dep'] });
      const allFeatures = [dep, feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(true);
    });

    it('should return true when all dependencies are verified', () => {
      const dep = createFeature('Dep', { status: 'verified' });
      const feature = createFeature('A', { dependencies: ['Dep'] });
      const allFeatures = [dep, feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(true);
    });

    it('should return false when any dependency is pending', () => {
      const dep = createFeature('Dep', { status: 'pending' });
      const feature = createFeature('A', { dependencies: ['Dep'] });
      const allFeatures = [dep, feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(false);
    });

    it('should return false when any dependency is running', () => {
      const dep = createFeature('Dep', { status: 'running' });
      const feature = createFeature('A', { dependencies: ['Dep'] });
      const allFeatures = [dep, feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(false);
    });

    it('should return false when dependency is missing', () => {
      const feature = createFeature('A', { dependencies: ['NonExistent'] });
      const allFeatures = [feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(false);
    });

    it('should check all dependencies', () => {
      const dep1 = createFeature('Dep1', { status: 'completed' });
      const dep2 = createFeature('Dep2', { status: 'pending' });
      const feature = createFeature('A', { dependencies: ['Dep1', 'Dep2'] });
      const allFeatures = [dep1, dep2, feature];

      expect(areDependenciesSatisfied(feature, allFeatures)).toBe(false);
    });
  });

  describe('getBlockingDependencies', () => {
    it('should return empty array for feature with no dependencies', () => {
      const feature = createFeature('A');
      const allFeatures = [feature];

      expect(getBlockingDependencies(feature, allFeatures)).toEqual([]);
    });

    it('should return empty array when all dependencies are completed', () => {
      const dep = createFeature('Dep', { status: 'completed' });
      const feature = createFeature('A', { dependencies: ['Dep'] });
      const allFeatures = [dep, feature];

      expect(getBlockingDependencies(feature, allFeatures)).toEqual([]);
    });

    it('should return empty array when all dependencies are verified', () => {
      const dep = createFeature('Dep', { status: 'verified' });
      const feature = createFeature('A', { dependencies: ['Dep'] });
      const allFeatures = [dep, feature];

      expect(getBlockingDependencies(feature, allFeatures)).toEqual([]);
    });

    it('should return pending dependencies', () => {
      const dep = createFeature('Dep', { status: 'pending' });
      const feature = createFeature('A', { dependencies: ['Dep'] });
      const allFeatures = [dep, feature];

      expect(getBlockingDependencies(feature, allFeatures)).toEqual(['Dep']);
    });

    it('should return running dependencies', () => {
      const dep = createFeature('Dep', { status: 'running' });
      const feature = createFeature('A', { dependencies: ['Dep'] });
      const allFeatures = [dep, feature];

      expect(getBlockingDependencies(feature, allFeatures)).toEqual(['Dep']);
    });

    it('should return failed dependencies', () => {
      const dep = createFeature('Dep', { status: 'failed' });
      const feature = createFeature('A', { dependencies: ['Dep'] });
      const allFeatures = [dep, feature];

      expect(getBlockingDependencies(feature, allFeatures)).toEqual(['Dep']);
    });

    it('should return all incomplete dependencies', () => {
      const dep1 = createFeature('Dep1', { status: 'pending' });
      const dep2 = createFeature('Dep2', { status: 'completed' });
      const dep3 = createFeature('Dep3', { status: 'running' });
      const feature = createFeature('A', { dependencies: ['Dep1', 'Dep2', 'Dep3'] });
      const allFeatures = [dep1, dep2, dep3, feature];

      const blocking = getBlockingDependencies(feature, allFeatures);
      expect(blocking).toContain('Dep1');
      expect(blocking).toContain('Dep3');
      expect(blocking).not.toContain('Dep2');
    });
  });

  describe('wouldCreateCircularDependency', () => {
    it('should return false for features with no existing dependencies', () => {
      const features = [createFeature('A'), createFeature('B')];

      // Making B depend on A should not create a cycle
      expect(wouldCreateCircularDependency(features, 'A', 'B')).toBe(false);
    });

    it('should return false for valid linear dependency chain', () => {
      // A <- B <- C (C depends on B, B depends on A)
      const features = [
        createFeature('A'),
        createFeature('B', { dependencies: ['A'] }),
        createFeature('C', { dependencies: ['B'] }),
      ];

      // Making D depend on C should not create a cycle
      const featuresWithD = [...features, createFeature('D')];
      expect(wouldCreateCircularDependency(featuresWithD, 'C', 'D')).toBe(false);
    });

    it('should detect direct circular dependency (A -> B -> A)', () => {
      // B depends on A
      const features = [createFeature('A'), createFeature('B', { dependencies: ['A'] })];

      // Making A depend on B would create: A -> B -> A (cycle!)
      // sourceId = B (prerequisite), targetId = A (will depend on B)
      // This creates a cycle because B already depends on A
      expect(wouldCreateCircularDependency(features, 'B', 'A')).toBe(true);
    });

    it('should detect transitive circular dependency (A -> B -> C -> A)', () => {
      // C depends on B, B depends on A
      const features = [
        createFeature('A'),
        createFeature('B', { dependencies: ['A'] }),
        createFeature('C', { dependencies: ['B'] }),
      ];

      // Making A depend on C would create: A -> C -> B -> A (cycle!)
      // sourceId = C (prerequisite), targetId = A (will depend on C)
      expect(wouldCreateCircularDependency(features, 'C', 'A')).toBe(true);
    });

    it('should detect cycle in complex graph', () => {
      // Graph: A <- B, A <- C, B <- C (C depends on both A and B, B depends on A)
      const features = [
        createFeature('A'),
        createFeature('B', { dependencies: ['A'] }),
        createFeature('C', { dependencies: ['A', 'B'] }),
      ];

      // Making A depend on C would create a cycle
      expect(wouldCreateCircularDependency(features, 'C', 'A')).toBe(true);

      // Making B depend on C would also create a cycle
      expect(wouldCreateCircularDependency(features, 'C', 'B')).toBe(true);
    });

    it('should return false for parallel branches', () => {
      // A <- B, A <- C (B and C both depend on A, but not on each other)
      const features = [
        createFeature('A'),
        createFeature('B', { dependencies: ['A'] }),
        createFeature('C', { dependencies: ['A'] }),
      ];

      // Making B depend on C should be fine (no cycle)
      expect(wouldCreateCircularDependency(features, 'C', 'B')).toBe(false);

      // Making C depend on B should also be fine
      expect(wouldCreateCircularDependency(features, 'B', 'C')).toBe(false);
    });

    it('should handle self-dependency check', () => {
      const features = [createFeature('A')];

      // A depending on itself would be a trivial cycle
      expect(wouldCreateCircularDependency(features, 'A', 'A')).toBe(true);
    });

    it('should handle feature not in list', () => {
      const features = [createFeature('A')];

      // Non-existent source - should return false (no path exists)
      expect(wouldCreateCircularDependency(features, 'NonExistent', 'A')).toBe(false);

      // Non-existent target - should return false
      expect(wouldCreateCircularDependency(features, 'A', 'NonExistent')).toBe(false);
    });

    it('should handle empty features list', () => {
      const features: Feature[] = [];

      expect(wouldCreateCircularDependency(features, 'A', 'B')).toBe(false);
    });

    it('should handle longer transitive chains', () => {
      // A <- B <- C <- D <- E
      const features = [
        createFeature('A'),
        createFeature('B', { dependencies: ['A'] }),
        createFeature('C', { dependencies: ['B'] }),
        createFeature('D', { dependencies: ['C'] }),
        createFeature('E', { dependencies: ['D'] }),
      ];

      // Making A depend on E would create a 5-node cycle
      expect(wouldCreateCircularDependency(features, 'E', 'A')).toBe(true);

      // Making B depend on E would create a 4-node cycle
      expect(wouldCreateCircularDependency(features, 'E', 'B')).toBe(true);

      // Making E depend on A is fine (already exists transitively, but adding explicit is ok)
      // Wait, E already depends on A transitively. Let's add F instead
      const featuresWithF = [...features, createFeature('F')];
      expect(wouldCreateCircularDependency(featuresWithF, 'E', 'F')).toBe(false);
    });

    it('should handle diamond dependency pattern', () => {
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      const features = [
        createFeature('A'),
        createFeature('B', { dependencies: ['A'] }),
        createFeature('C', { dependencies: ['A'] }),
        createFeature('D', { dependencies: ['B', 'C'] }),
      ];

      // Making A depend on D would create a cycle through both paths
      expect(wouldCreateCircularDependency(features, 'D', 'A')).toBe(true);

      // Making B depend on D would create a cycle
      expect(wouldCreateCircularDependency(features, 'D', 'B')).toBe(true);

      // Adding E that depends on D should be fine
      const featuresWithE = [...features, createFeature('E')];
      expect(wouldCreateCircularDependency(featuresWithE, 'D', 'E')).toBe(false);
    });
  });

  describe('dependencyExists', () => {
    it('should return false when target has no dependencies', () => {
      const features = [createFeature('A'), createFeature('B')];

      expect(dependencyExists(features, 'A', 'B')).toBe(false);
    });

    it('should return true when direct dependency exists', () => {
      const features = [createFeature('A'), createFeature('B', { dependencies: ['A'] })];

      expect(dependencyExists(features, 'A', 'B')).toBe(true);
    });

    it('should return false for reverse direction', () => {
      const features = [createFeature('A'), createFeature('B', { dependencies: ['A'] })];

      // B depends on A, but A does not depend on B
      expect(dependencyExists(features, 'B', 'A')).toBe(false);
    });

    it('should return false for transitive dependencies', () => {
      // This function only checks direct dependencies, not transitive
      const features = [
        createFeature('A'),
        createFeature('B', { dependencies: ['A'] }),
        createFeature('C', { dependencies: ['B'] }),
      ];

      // C depends on B which depends on A, but C doesn't directly depend on A
      expect(dependencyExists(features, 'A', 'C')).toBe(false);
    });

    it('should return true for one of multiple dependencies', () => {
      const features = [
        createFeature('A'),
        createFeature('B'),
        createFeature('C', { dependencies: ['A', 'B'] }),
      ];

      expect(dependencyExists(features, 'A', 'C')).toBe(true);
      expect(dependencyExists(features, 'B', 'C')).toBe(true);
    });

    it('should return false when target feature does not exist', () => {
      const features = [createFeature('A')];

      expect(dependencyExists(features, 'A', 'NonExistent')).toBe(false);
    });

    it('should return false for empty dependencies array', () => {
      const features = [createFeature('A'), createFeature('B', { dependencies: [] })];

      expect(dependencyExists(features, 'A', 'B')).toBe(false);
    });
  });
});
