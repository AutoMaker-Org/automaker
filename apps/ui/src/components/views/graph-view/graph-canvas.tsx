import { useCallback, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  SelectionMode,
  ConnectionMode,
  Node,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Feature } from '@/store/app-store';
import {
  TaskNode,
  DependencyEdge,
  GraphControls,
  GraphLegend,
  GraphFilterControls,
} from './components';
import {
  useGraphNodes,
  useGraphLayout,
  useGraphFilter,
  type TaskNodeData,
  type GraphFilterState,
  type NodeActionCallbacks,
} from './hooks';
import { cn } from '@/lib/utils';
import { useDebounceValue } from 'usehooks-ts';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Define custom node and edge types - using any to avoid React Flow's strict typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: any = {
  task: TaskNode,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: any = {
  dependency: DependencyEdge,
};

interface GraphCanvasProps {
  features: Feature[];
  runningAutoTasks: string[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onNodeDoubleClick?: (featureId: string) => void;
  nodeActionCallbacks?: NodeActionCallbacks;
  onCreateDependency?: (sourceId: string, targetId: string) => Promise<boolean>;
  backgroundStyle?: React.CSSProperties;
  className?: string;
}

function GraphCanvasInner({
  features,
  runningAutoTasks,
  searchQuery,
  onSearchQueryChange,
  onNodeDoubleClick,
  nodeActionCallbacks,
  onCreateDependency,
  backgroundStyle,
  className,
}: GraphCanvasProps) {
  const [isLocked, setIsLocked] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState<'LR' | 'TB'>('LR');

  // Filter state (category, status, and negative toggle are local to graph view)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [isNegativeFilter, setIsNegativeFilter] = useState(false);

  // Debounce search query for performance with large graphs
  const [debouncedSearchQuery] = useDebounceValue(searchQuery, 200);

  // Combined filter state
  const filterState: GraphFilterState = {
    searchQuery: debouncedSearchQuery,
    selectedCategories,
    selectedStatuses,
    isNegativeFilter,
  };

  // Calculate filter results
  const filterResult = useGraphFilter(features, filterState, runningAutoTasks);

  // Transform features to nodes and edges with filter results
  const { nodes: initialNodes, edges: initialEdges } = useGraphNodes({
    features,
    runningAutoTasks,
    filterResult,
    actionCallbacks: nodeActionCallbacks,
  });

  // Apply layout
  const { layoutedNodes, layoutedEdges, runLayout } = useGraphLayout({
    nodes: initialNodes,
    edges: initialEdges,
  });

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Track if initial layout has been applied
  const hasInitialLayout = useRef(false);
  // Track the previous node IDs to detect new nodes
  const prevNodeIds = useRef<Set<string>>(new Set());

  // Update nodes/edges when features change, but preserve user positions
  useEffect(() => {
    const currentNodeIds = new Set(layoutedNodes.map((n) => n.id));
    const isInitialRender = !hasInitialLayout.current;

    // Check if there are new nodes that need layout
    const hasNewNodes = layoutedNodes.some((n) => !prevNodeIds.current.has(n.id));

    if (isInitialRender) {
      // Apply full layout for initial render
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      hasInitialLayout.current = true;
    } else if (hasNewNodes) {
      // New nodes added - need to re-layout but try to preserve existing positions
      setNodes((currentNodes) => {
        const positionMap = new Map(currentNodes.map((n) => [n.id, n.position]));
        return layoutedNodes.map((node) => ({
          ...node,
          position: positionMap.get(node.id) || node.position,
        }));
      });
      setEdges(layoutedEdges);
    } else {
      // No new nodes - just update data without changing positions
      setNodes((currentNodes) => {
        const positionMap = new Map(currentNodes.map((n) => [n.id, n.position]));
        return layoutedNodes.map((node) => ({
          ...node,
          position: positionMap.get(node.id) || node.position,
        }));
      });
      // Update edges without triggering re-render of nodes
      setEdges(layoutedEdges);
    }

    // Update prev node IDs for next comparison
    prevNodeIds.current = currentNodeIds;
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  // Handle layout direction change
  const handleRunLayout = useCallback(
    (direction: 'LR' | 'TB') => {
      setLayoutDirection(direction);
      runLayout(direction);
    },
    [runLayout]
  );

  // Handle clear all filters
  const handleClearFilters = useCallback(() => {
    onSearchQueryChange('');
    setSelectedCategories([]);
    setSelectedStatuses([]);
    setIsNegativeFilter(false);
  }, [onSearchQueryChange]);

  // Handle node double click
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node<TaskNodeData>) => {
      onNodeDoubleClick?.(node.id);
    },
    [onNodeDoubleClick]
  );

  // Handle edge connection (creating dependencies)
  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // In React Flow, dragging from source handle to target handle means:
      // - source = the node being dragged FROM (the prerequisite/dependency)
      // - target = the node being dragged TO (the dependent task)
      await onCreateDependency?.(connection.source, connection.target);
    },
    [onCreateDependency]
  );

  // Allow any connection between different nodes
  const isValidConnection = useCallback(
    (connection: Connection | { source: string; target: string }) => {
      // Don't allow self-connections
      if (connection.source === connection.target) return false;
      return true;
    },
    []
  );

  // MiniMap node color based on status
  const minimapNodeColor = useCallback((node: Node<TaskNodeData>) => {
    const data = node.data as TaskNodeData | undefined;
    const status = data?.status;
    switch (status) {
      case 'completed':
      case 'verified':
        return 'var(--status-success)';
      case 'in_progress':
        return 'var(--status-in-progress)';
      case 'waiting_approval':
        return 'var(--status-waiting)';
      default:
        if (data?.isBlocked) return 'rgb(249, 115, 22)'; // orange-500
        if (data?.error) return 'var(--status-error)';
        return 'var(--muted-foreground)';
    }
  }, []);

  return (
    <div className={cn('w-full h-full', className)} style={backgroundStyle}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isLocked ? undefined : onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        selectionMode={SelectionMode.Partial}
        connectionMode={ConnectionMode.Loose}
        proOptions={{ hideAttribution: true }}
        className="graph-canvas"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
          className="opacity-50"
        />

        <MiniMap
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-popover/90 !border-border rounded-lg shadow-lg"
        />

        <GraphControls
          isLocked={isLocked}
          onToggleLock={() => setIsLocked(!isLocked)}
          onRunLayout={handleRunLayout}
          layoutDirection={layoutDirection}
        />

        <GraphFilterControls
          filterState={filterState}
          availableCategories={filterResult.availableCategories}
          hasActiveFilter={filterResult.hasActiveFilter}
          onCategoriesChange={setSelectedCategories}
          onStatusesChange={setSelectedStatuses}
          onNegativeFilterChange={setIsNegativeFilter}
          onClearFilters={handleClearFilters}
        />

        <GraphLegend />

        {/* Empty state when all nodes are filtered out */}
        {filterResult.hasActiveFilter && filterResult.matchedNodeIds.size === 0 && (
          <Panel position="top-center" className="mt-20">
            <div className="flex flex-col items-center gap-3 p-6 rounded-lg bg-popover/95 backdrop-blur-sm border border-border shadow-lg text-popover-foreground">
              <SearchX className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">No matching tasks</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your filters or search query
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="mt-1">
                Clear Filters
              </Button>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

// Wrap with provider for hooks to work
export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
