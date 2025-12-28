import { useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Feature } from '@/store/app-store';
import { getBlockingDependencies } from '@automaker/dependency-resolver';
import { GraphFilterResult } from './use-graph-filter';

export interface TaskNodeData extends Feature {
  // Re-declare properties from BaseFeature that have index signature issues
  priority?: number;
  error?: string;
  branchName?: string;
  dependencies?: string[];
  // Task node specific properties
  isBlocked: boolean;
  isRunning: boolean;
  blockingDependencies: string[];
  // Filter highlight states
  isMatched?: boolean;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  // Action callbacks
  onViewLogs?: () => void;
  onViewDetails?: () => void;
  onStartTask?: () => void;
  onStopTask?: () => void;
  onResumeTask?: () => void;
  onSpawnTask?: () => void;
  onDeleteTask?: () => void;
}

export type TaskNode = Node<TaskNodeData, 'task'>;
export type DependencyEdge = Edge<{
  sourceStatus: Feature['status'];
  targetStatus: Feature['status'];
  isHighlighted?: boolean;
  isDimmed?: boolean;
  onDeleteDependency?: (sourceId: string, targetId: string) => void;
}>;

export interface NodeActionCallbacks {
  onViewLogs?: (featureId: string) => void;
  onViewDetails?: (featureId: string) => void;
  onStartTask?: (featureId: string) => void;
  onStopTask?: (featureId: string) => void;
  onResumeTask?: (featureId: string) => void;
  onSpawnTask?: (featureId: string) => void;
  onDeleteTask?: (featureId: string) => void;
  onDeleteDependency?: (sourceId: string, targetId: string) => void;
}

interface UseGraphNodesProps {
  features: Feature[];
  runningAutoTasks: string[];
  filterResult?: GraphFilterResult;
  actionCallbacks?: NodeActionCallbacks;
}

/**
 * Transforms features into React Flow nodes and edges
 * Creates dependency edges based on feature.dependencies array
 */
export function useGraphNodes({
  features,
  runningAutoTasks,
  filterResult,
  actionCallbacks,
}: UseGraphNodesProps) {
  const { nodes, edges } = useMemo(() => {
    const nodeList: TaskNode[] = [];
    const edgeList: DependencyEdge[] = [];
    const featureMap = new Map<string, Feature>();

    // Create feature map for quick lookups
    features.forEach((f) => featureMap.set(f.id, f));

    // Extract filter state
    const hasActiveFilter = filterResult?.hasActiveFilter ?? false;
    const matchedNodeIds = filterResult?.matchedNodeIds ?? new Set<string>();
    const highlightedNodeIds = filterResult?.highlightedNodeIds ?? new Set<string>();
    const highlightedEdgeIds = filterResult?.highlightedEdgeIds ?? new Set<string>();

    // Create nodes
    features.forEach((feature) => {
      const isRunning = runningAutoTasks.includes(feature.id);
      const blockingDeps = getBlockingDependencies(feature, features);

      // Calculate filter highlight states
      const isMatched = hasActiveFilter && matchedNodeIds.has(feature.id);
      const isHighlighted = hasActiveFilter && highlightedNodeIds.has(feature.id);
      const isDimmed = hasActiveFilter && !highlightedNodeIds.has(feature.id);

      const node: TaskNode = {
        id: feature.id,
        type: 'task',
        position: { x: 0, y: 0 }, // Will be set by layout
        data: {
          ...feature,
          isBlocked: blockingDeps.length > 0,
          isRunning,
          blockingDependencies: blockingDeps,
          // Filter states
          isMatched,
          isHighlighted,
          isDimmed,
          // Action callbacks (bound to this feature's ID)
          onViewLogs: actionCallbacks?.onViewLogs
            ? () => actionCallbacks.onViewLogs!(feature.id)
            : undefined,
          onViewDetails: actionCallbacks?.onViewDetails
            ? () => actionCallbacks.onViewDetails!(feature.id)
            : undefined,
          onStartTask: actionCallbacks?.onStartTask
            ? () => actionCallbacks.onStartTask!(feature.id)
            : undefined,
          onStopTask: actionCallbacks?.onStopTask
            ? () => actionCallbacks.onStopTask!(feature.id)
            : undefined,
          onResumeTask: actionCallbacks?.onResumeTask
            ? () => actionCallbacks.onResumeTask!(feature.id)
            : undefined,
          onSpawnTask: actionCallbacks?.onSpawnTask
            ? () => actionCallbacks.onSpawnTask!(feature.id)
            : undefined,
          onDeleteTask: actionCallbacks?.onDeleteTask
            ? () => actionCallbacks.onDeleteTask!(feature.id)
            : undefined,
        },
      };

      nodeList.push(node);

      // Create edges for dependencies
      const deps = feature.dependencies as string[] | undefined;
      if (deps && deps.length > 0) {
        deps.forEach((depId: string) => {
          // Only create edge if the dependency exists in current view
          if (featureMap.has(depId)) {
            const sourceFeature = featureMap.get(depId)!;
            const edgeId = `${depId}->${feature.id}`;

            // Calculate edge highlight states
            const edgeIsHighlighted = hasActiveFilter && highlightedEdgeIds.has(edgeId);
            const edgeIsDimmed = hasActiveFilter && !highlightedEdgeIds.has(edgeId);

            const edge: DependencyEdge = {
              id: edgeId,
              source: depId,
              target: feature.id,
              type: 'dependency',
              animated: isRunning || runningAutoTasks.includes(depId),
              data: {
                sourceStatus: sourceFeature.status,
                targetStatus: feature.status,
                isHighlighted: edgeIsHighlighted,
                isDimmed: edgeIsDimmed,
                onDeleteDependency: actionCallbacks?.onDeleteDependency,
              },
            };
            edgeList.push(edge);
          }
        });
      }
    });

    return { nodes: nodeList, edges: edgeList };
  }, [features, runningAutoTasks, filterResult, actionCallbacks]);

  return { nodes, edges };
}
