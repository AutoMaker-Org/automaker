import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  SelectionMode,
  ConnectionMode,
  Node,
  Connection,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Feature, useAppStore } from '@/store/app-store';
import { themeOptions } from '@/config/theme-options';
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
import { SearchX, Plus, Wand2, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanSettingsPopover } from '../board-view/dialogs/plan-settings-popover';
import {
  GRAPH_LARGE_EDGE_COUNT,
  GRAPH_LARGE_NODE_COUNT,
  GRAPH_RENDER_MODE_COMPACT,
  GRAPH_RENDER_MODE_FULL,
} from './constants';

// Define custom node and edge types - using any to avoid React Flow's strict typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: any = {
  task: TaskNode,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: any = {
  dependency: DependencyEdge,
};

interface BackgroundSettings {
  cardOpacity: number;
  cardGlassmorphism: boolean;
  cardBorderEnabled: boolean;
  cardBorderOpacity: number;
}

interface GraphCanvasProps {
  features: Feature[];
  runningAutoTasks: string[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onNodeDoubleClick?: (featureId: string) => void;
  nodeActionCallbacks?: NodeActionCallbacks;
  onCreateDependency?: (sourceId: string, targetId: string) => Promise<boolean>;
  onAddFeature?: () => void;
  onOpenPlanDialog?: () => void;
  hasPendingPlan?: boolean;
  planUseSelectedWorktreeBranch?: boolean;
  onPlanUseSelectedWorktreeBranchChange?: (value: boolean) => void;
  backgroundStyle?: React.CSSProperties;
  backgroundSettings?: BackgroundSettings;
  className?: string;
  projectPath?: string | null;
}

// Helper to get session storage key for viewport
const getViewportStorageKey = (projectPath: string) => `graph-viewport:${projectPath}`;

// Helper to save viewport to session storage
const saveViewportToStorage = (
  projectPath: string,
  viewport: { x: number; y: number; zoom: number }
) => {
  try {
    sessionStorage.setItem(getViewportStorageKey(projectPath), JSON.stringify(viewport));
  } catch {
    // Ignore storage errors
  }
};

// Helper to load viewport from session storage
const loadViewportFromStorage = (
  projectPath: string
): { x: number; y: number; zoom: number } | null => {
  try {
    const stored = sessionStorage.getItem(getViewportStorageKey(projectPath));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore storage errors
  }
  return null;
};

function GraphCanvasInner({
  features,
  runningAutoTasks,
  searchQuery,
  onSearchQueryChange,
  onNodeDoubleClick,
  nodeActionCallbacks,
  onCreateDependency,
  onAddFeature,
  onOpenPlanDialog,
  hasPendingPlan,
  planUseSelectedWorktreeBranch,
  onPlanUseSelectedWorktreeBranchChange,
  backgroundStyle,
  backgroundSettings,
  className,
  projectPath,
}: GraphCanvasProps) {
  const [isLocked, setIsLocked] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState<'LR' | 'TB'>('LR');
  const { setViewport, getViewport, fitView } = useReactFlow();

  // Refs for tracking layout and viewport state
  const hasRestoredViewport = useRef(false);
  const lastProjectPath = useRef(projectPath);
  const hasInitialLayout = useRef(false);
  const prevNodeIds = useRef<Set<string>>(new Set());
  const prevLayoutVersion = useRef<number>(0);
  const hasLayoutWithEdges = useRef(false);

  // Reset flags when project changes
  useEffect(() => {
    if (projectPath !== lastProjectPath.current) {
      hasRestoredViewport.current = false;
      hasLayoutWithEdges.current = false;
      hasInitialLayout.current = false;
      prevNodeIds.current = new Set();
      prevLayoutVersion.current = 0;
      lastProjectPath.current = projectPath;
    }
  }, [projectPath]);

  // Determine React Flow color mode based on current theme
  const effectiveTheme = useAppStore((state) => state.getEffectiveTheme());
  const [systemColorMode, setSystemColorMode] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (effectiveTheme !== 'system') return;
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemColorMode(mql.matches ? 'dark' : 'light');
    update();

    // Safari < 14 fallback
    if (mql.addEventListener) {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(update);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(update);
  }, [effectiveTheme]);

  const themeOption = themeOptions.find((t) => t.value === effectiveTheme);
  const colorMode =
    effectiveTheme === 'system' ? systemColorMode : themeOption?.isDark ? 'dark' : 'light';

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

  const estimatedEdgeCount = useMemo(() => {
    return features.reduce((total, feature) => {
      const deps = feature.dependencies as string[] | undefined;
      return total + (deps?.length ?? 0);
    }, 0);
  }, [features]);

  const isLargeGraph =
    features.length >= GRAPH_LARGE_NODE_COUNT || estimatedEdgeCount >= GRAPH_LARGE_EDGE_COUNT;
  const renderMode = isLargeGraph ? GRAPH_RENDER_MODE_COMPACT : GRAPH_RENDER_MODE_FULL;

  // Transform features to nodes and edges with filter results
  const { nodes: initialNodes, edges: initialEdges } = useGraphNodes({
    features,
    runningAutoTasks,
    filterResult,
    actionCallbacks: nodeActionCallbacks,
    backgroundSettings,
    renderMode,
    enableEdgeAnimations: !isLargeGraph,
  });

  // Apply layout
  const { layoutedNodes, layoutedEdges, layoutVersion, runLayout } = useGraphLayout({
    nodes: initialNodes,
    edges: initialEdges,
  });

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Update nodes/edges when features change, but preserve user positions
  useEffect(() => {
    const currentNodeIds = new Set(layoutedNodes.map((n) => n.id));
    const isInitialRender = !hasInitialLayout.current;
    // Detect if a fresh layout was computed (structure changed)
    const layoutWasRecomputed = layoutVersion !== prevLayoutVersion.current;

    // Check if there are new nodes that need layout
    const hasNewNodes = layoutedNodes.some((n) => !prevNodeIds.current.has(n.id));

    if (isInitialRender || layoutWasRecomputed) {
      // Apply full layout for initial render OR when layout was recomputed due to structure change
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      hasInitialLayout.current = true;
      prevLayoutVersion.current = layoutVersion;
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

    // Restore viewport from session storage after initial layout
    if (isInitialRender && projectPath && !hasRestoredViewport.current) {
      const savedViewport = loadViewportFromStorage(projectPath);
      if (savedViewport) {
        // Use setTimeout to ensure React Flow has finished rendering
        setTimeout(() => {
          setViewport(savedViewport, { duration: 0 });
        }, 50);
      }
      hasRestoredViewport.current = true;
    }
  }, [layoutedNodes, layoutedEdges, layoutVersion, setNodes, setEdges, projectPath, setViewport]);

  // Force layout recalculation on initial mount when edges are available
  // This fixes timing issues when navigating directly to the graph route
  useEffect(() => {
    // Only run once: when we have nodes and edges but haven't done a layout with edges yet
    if (!hasLayoutWithEdges.current && layoutedNodes.length > 0 && layoutedEdges.length > 0) {
      hasLayoutWithEdges.current = true;
      // Small delay to ensure React Flow is mounted and ready
      const timeoutId = setTimeout(() => {
        const { nodes: relayoutedNodes, edges: relayoutedEdges } = runLayout('LR');
        setNodes(relayoutedNodes);
        setEdges(relayoutedEdges);
        fitView({ padding: 0.2, duration: 300 });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [layoutedNodes.length, layoutedEdges.length, runLayout, setNodes, setEdges, fitView]);

  // Save viewport when user pans or zooms
  const handleMoveEnd = useCallback(() => {
    if (projectPath) {
      const viewport = getViewport();
      saveViewportToStorage(projectPath, viewport);
    }
  }, [projectPath, getViewport]);

  // Handle layout direction change
  const handleRunLayout = useCallback(
    (direction: 'LR' | 'TB') => {
      setLayoutDirection(direction);
      const { nodes: relayoutedNodes, edges: relayoutedEdges } = runLayout(direction);
      setNodes(relayoutedNodes);
      setEdges(relayoutedEdges);
      fitView({ padding: 0.2, duration: 300 });
    },
    [runLayout, setNodes, setEdges, fitView]
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

  // Handle orientation changes on mobile devices
  // When rotating from landscape to portrait, the view may incorrectly zoom in
  // This effect listens for orientation changes and calls fitView to correct the viewport
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Track the previous orientation to detect changes
    let previousWidth = window.innerWidth;
    let previousHeight = window.innerHeight;

    // Track timeout IDs for cleanup
    let orientationTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleOrientationChange = () => {
      // Clear any pending timeout
      if (orientationTimeoutId) {
        clearTimeout(orientationTimeoutId);
      }
      // Small delay to allow the browser to complete the orientation change
      orientationTimeoutId = setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
        orientationTimeoutId = null;
      }, 100);
    };

    const handleResize = () => {
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;

      // Detect orientation change by checking if width and height swapped significantly
      // This happens when device rotates between portrait and landscape
      const widthDiff = Math.abs(currentWidth - previousHeight);
      const heightDiff = Math.abs(currentHeight - previousWidth);

      // If the dimensions are close to being swapped (within 100px tolerance)
      // it's likely an orientation change
      const isOrientationChange = widthDiff < 100 && heightDiff < 100;

      if (isOrientationChange) {
        // Clear any pending timeout
        if (resizeTimeoutId) {
          clearTimeout(resizeTimeoutId);
        }
        // Delay fitView to allow browser to complete the layout
        resizeTimeoutId = setTimeout(() => {
          fitView({ padding: 0.2, duration: 300 });
          resizeTimeoutId = null;
        }, 150);
      }

      previousWidth = currentWidth;
      previousHeight = currentHeight;
    };

    // Listen for orientation change event (mobile specific)
    window.addEventListener('orientationchange', handleOrientationChange);
    // Also listen for resize as a fallback (some browsers don't fire orientationchange)
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleResize);
      // Clear any pending timeouts
      if (orientationTimeoutId) {
        clearTimeout(orientationTimeoutId);
      }
      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId);
      }
    };
  }, [fitView]);

  // Handle edge deletion (when user presses delete key or uses other deletion methods)
  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      console.log('onEdgesDelete triggered', deletedEdges);
      deletedEdges.forEach((edge) => {
        if (nodeActionCallbacks?.onDeleteDependency) {
          console.log('Calling onDeleteDependency from onEdgesDelete', {
            source: edge.source,
            target: edge.target,
          });
          nodeActionCallbacks.onDeleteDependency(edge.source, edge.target);
        }
      });
    },
    [nodeActionCallbacks]
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

  const shouldRenderVisibleOnly = isLargeGraph;

  return (
    <div className={cn('w-full h-full', className)} style={backgroundStyle}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isLocked ? undefined : onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgesDelete={handleEdgesDelete}
        onNodeDoubleClick={handleNodeDoubleClick}
        onMoveEnd={handleMoveEnd}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={colorMode}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        selectionMode={SelectionMode.Partial}
        connectionMode={ConnectionMode.Loose}
        onlyRenderVisibleElements={shouldRenderVisibleOnly}
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
          className="border-border! rounded-lg shadow-lg"
          style={{ backgroundColor: 'color-mix(in oklch, var(--popover) 90%, transparent)' }}
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
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          onCategoriesChange={setSelectedCategories}
          onStatusesChange={setSelectedStatuses}
          onNegativeFilterChange={setIsNegativeFilter}
          onClearFilters={handleClearFilters}
        />

        <GraphLegend />

        {/* Add Feature Button */}
        <Panel position="top-right">
          <div className="flex items-center gap-2">
            {onOpenPlanDialog && (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1 shadow-sm">
                {hasPendingPlan && (
                  <button
                    onClick={onOpenPlanDialog}
                    className="flex items-center text-emerald-500 hover:text-emerald-400 transition-colors"
                    data-testid="graph-plan-review-button"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                  </button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onOpenPlanDialog}
                  className="gap-1.5"
                  data-testid="graph-plan-button"
                >
                  <Wand2 className="w-4 h-4" />
                  Plan
                </Button>
                {onPlanUseSelectedWorktreeBranchChange &&
                  planUseSelectedWorktreeBranch !== undefined && (
                    <PlanSettingsPopover
                      planUseSelectedWorktreeBranch={planUseSelectedWorktreeBranch}
                      onPlanUseSelectedWorktreeBranchChange={onPlanUseSelectedWorktreeBranchChange}
                    />
                  )}
              </div>
            )}
            <Button variant="default" size="sm" onClick={onAddFeature} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Add Feature
            </Button>
          </div>
        </Panel>

        {/* Empty state when all nodes are filtered out */}
        {filterResult.hasActiveFilter && filterResult.matchedNodeIds.size === 0 && (
          <Panel position="top-center" className="mt-20">
            <div
              className="flex flex-col items-center gap-3 p-6 rounded-lg backdrop-blur-sm border border-border shadow-lg text-popover-foreground"
              style={{ backgroundColor: 'color-mix(in oklch, var(--popover) 95%, transparent)' }}
            >
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
