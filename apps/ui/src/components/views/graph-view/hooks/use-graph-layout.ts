import { useCallback, useMemo, useRef } from 'react';
import dagre from 'dagre';
import { Node, Edge, useReactFlow } from '@xyflow/react';
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
  const { fitView, setNodes } = useReactFlow();

  // Cache the last computed positions to avoid recalculating layout
  const positionCache = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastStructureKey = useRef<string>('');

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

  // Create a stable structure key based only on node IDs (not edge changes)
  // Edges changing shouldn't trigger re-layout
  const structureKey = useMemo(() => {
    const nodeIds = nodes
      .map((n) => n.id)
      .sort()
      .join(',');
    return nodeIds;
  }, [nodes]);

  // Initial layout - only recalculate when node structure changes (new nodes added/removed)
  const layoutedElements = useMemo(() => {
    if (nodes.length === 0) {
      positionCache.current.clear();
      lastStructureKey.current = '';
      return { nodes: [], edges: [] };
    }

    // Check if structure changed (new nodes added or removed)
    const structureChanged = structureKey !== lastStructureKey.current;

    if (structureChanged) {
      // Structure changed - run full layout
      lastStructureKey.current = structureKey;
      return getLayoutedElements(nodes, edges, 'LR');
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
      return { nodes: layoutedNodes, edges };
    }
  }, [nodes, edges, structureKey, getLayoutedElements]);

  // Manual re-layout function
  const runLayout = useCallback(
    (direction: 'LR' | 'TB' = 'LR') => {
      const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges, direction);
      setNodes(layoutedNodes);
      // Fit view after layout with a small delay to allow DOM updates
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
      }, 50);
    },
    [nodes, edges, getLayoutedElements, setNodes, fitView]
  );

  return {
    layoutedNodes: layoutedElements.nodes,
    layoutedEdges: layoutedElements.edges,
    runLayout,
  };
}
