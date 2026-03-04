/**
 * Lightweight module-level state tracking which features are mid-transition
 * (e.g., being cancelled). Used by useAutoModeQueryInvalidation to skip
 * redundant cache invalidations while persistFeatureUpdate is in flight.
 */

const transitioningFeatures = new Set<string>();

export function markFeatureTransitioning(featureId: string): void {
  transitioningFeatures.add(featureId);
}

export function unmarkFeatureTransitioning(featureId: string): void {
  transitioningFeatures.delete(featureId);
}

export function isAnyFeatureTransitioning(): boolean {
  return transitioningFeatures.size > 0;
}
