import { useCallback, useMemo, useRef } from 'react';
import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';
import { TaskNode, DependencyEdge } from './use-graph-nodes';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 120;

interface UseGraphLayoutProps {
  nodes: TaskNode[];
  edges: DependencyEdge[];
}

/**
 * Applies dagre layout to position nodes in a hierarchical DAG
 * Dependencies flow left-to-right
 */
export function useGraphLayout({ nodes, edges }: UseGraphLayoutProps) {
  // Cache the last computed positions to avoid recalculating layout
  const positionCache = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastStructureKey = useRef<string>('');
  // Track layout version to signal when fresh layout was computed
  const layoutVersion = useRef<number>(0);

  const getLayoutedElements = useCallback(
    (
      inputNodes: TaskNode[],
      inputEdges: DependencyEdge[],
      direction: 'LR' | 'TB' = 'LR'
    ): { nodes: TaskNode[]; edges: DependencyEdge[] } => {
      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));

      const isHorizontal = direction === 'LR';
      dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 50,
        ranksep: 100,
        marginx: 50,
        marginy: 50,
      });

      inputNodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      });

      inputEdges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
      });

      dagre.layout(dagreGraph);

      const layoutedNodes = inputNodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const position = {
          x: nodeWithPosition.x - NODE_WIDTH / 2,
          y: nodeWithPosition.y - NODE_HEIGHT / 2,
        };
        // Update cache
        positionCache.current.set(node.id, position);
        return {
          ...node,
          position,
          targetPosition: isHorizontal ? 'left' : 'top',
          sourcePosition: isHorizontal ? 'right' : 'bottom',
        } as TaskNode;
      });

      return { nodes: layoutedNodes, edges: inputEdges };
    },
    []
  );

  // Create a stable structure key based on node IDs AND edge connections
  // Layout must recalculate when the dependency graph structure changes
  const structureKey = useMemo(() => {
    const nodeIds = nodes
      .map((n) => n.id)
      .sort()
      .join(',');
    // Include edge structure (source->target pairs) to ensure layout recalculates
    // when dependencies change, not just when nodes are added/removed
    const edgeConnections = edges
      .map((e) => `${e.source}->${e.target}`)
      .sort()
      .join(',');
    return `${nodeIds}|${edgeConnections}`;
  }, [nodes, edges]);

  // Initial layout - recalculate when graph structure changes (nodes added/removed OR edges/dependencies change)
  const layoutedElements = useMemo(() => {
    if (nodes.length === 0) {
      positionCache.current.clear();
      lastStructureKey.current = '';
      return { nodes: [], edges: [], didRelayout: false };
    }

    // Check if structure changed (nodes added/removed OR dependencies changed)
    const structureChanged = structureKey !== lastStructureKey.current;

    if (structureChanged) {
      // Structure changed - run full layout
      lastStructureKey.current = structureKey;
      layoutVersion.current += 1;
      const result = getLayoutedElements(nodes, edges, 'LR');
      return { ...result, didRelayout: true };
    } else {
      // Structure unchanged - preserve cached positions, just update node data
      const layoutedNodes = nodes.map((node) => {
        const cachedPosition = positionCache.current.get(node.id);
        return {
          ...node,
          position: cachedPosition || { x: 0, y: 0 },
          targetPosition: 'left',
          sourcePosition: 'right',
        } as TaskNode;
      });
      return { nodes: layoutedNodes, edges, didRelayout: false };
    }
  }, [nodes, edges, structureKey, getLayoutedElements]);

  // Manual re-layout function
  const runLayout = useCallback(
    (direction: 'LR' | 'TB' = 'LR') => {
      return getLayoutedElements(nodes, edges, direction);
    },
    [nodes, edges, getLayoutedElements]
  );

  return {
    layoutedNodes: layoutedElements.nodes,
    layoutedEdges: layoutedElements.edges,
    layoutVersion: layoutVersion.current,
    runLayout,
  };
}
