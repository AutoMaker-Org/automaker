# Graph View Layout Bug

## Problem

When navigating directly to the graph view route (e.g., refreshing on `/graph` or opening the app on that route), all feature cards appear in a single vertical column instead of being properly arranged in a hierarchical dependency graph.

**Works correctly when:** User navigates to Kanban view first, then to Graph view.
**Broken when:** User loads the graph route directly (refresh, direct URL, app opens on that route).

## Expected Behavior

Nodes should be positioned by the dagre layout algorithm in a hierarchical DAG based on their dependency relationships (edges).

## Actual Behavior

All nodes appear stacked in a single column/row, as if dagre computed the layout with no edges.

## Technology Stack

- React 19
- @xyflow/react (React Flow) for graph rendering
- dagre for layout algorithm
- Zustand for state management

## Architecture

### Data Flow

1. `GraphViewPage` loads features via `useBoardFeatures` hook
2. Shows loading spinner while `isLoading === true`
3. When loaded, renders `GraphView` → `GraphCanvas`
4. `GraphCanvas` uses three hooks:
   - `useGraphNodes`: Transforms features → React Flow nodes and edges (edges from `feature.dependencies`)
   - `useGraphLayout`: Applies dagre layout to position nodes based on edges
   - `useNodesState`/`useEdgesState`: React Flow's state management

### Key Files

- `apps/ui/src/components/views/graph-view-page.tsx` - Page component with loading state
- `apps/ui/src/components/views/graph-view/graph-canvas.tsx` - React Flow integration
- `apps/ui/src/components/views/graph-view/hooks/use-graph-layout.ts` - Dagre layout logic
- `apps/ui/src/components/views/graph-view/hooks/use-graph-nodes.ts` - Feature → node/edge transformation
- `apps/ui/src/components/views/board-view/hooks/use-board-features.ts` - Data fetching

## Relevant Code

### use-graph-layout.ts (layout computation)

```typescript
export function useGraphLayout({ nodes, edges }: UseGraphLayoutProps) {
  const positionCache = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastStructureKey = useRef<string>('');
  const layoutVersion = useRef<number>(0);

  const getLayoutedElements = useCallback((inputNodes, inputEdges, direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 100 });

    inputNodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: 280, height: 120 });
    });

    inputEdges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target); // THIS IS WHERE EDGES MATTER
    });

    dagre.layout(dagreGraph);
    // ... returns positioned nodes
  }, []);

  // Structure key includes both nodes AND edges
  const structureKey = useMemo(() => {
    const nodeIds = nodes
      .map((n) => n.id)
      .sort()
      .join(',');
    const edgeConnections = edges
      .map((e) => `${e.source}->${e.target}`)
      .sort()
      .join(',');
    return `${nodeIds}|${edgeConnections}`;
  }, [nodes, edges]);

  const layoutedElements = useMemo(() => {
    if (nodes.length === 0) return { nodes: [], edges: [] };

    const structureChanged = structureKey !== lastStructureKey.current;
    if (structureChanged) {
      lastStructureKey.current = structureKey;
      layoutVersion.current += 1;
      return getLayoutedElements(nodes, edges, 'LR'); // Full layout with edges
    } else {
      // Use cached positions
    }
  }, [nodes, edges, structureKey, getLayoutedElements]);

  return { layoutedNodes, layoutedEdges, layoutVersion: layoutVersion.current, runLayout };
}
```

### graph-canvas.tsx (React Flow integration)

```typescript
function GraphCanvasInner({ features, ... }) {
  // Transform features to nodes/edges
  const { nodes: initialNodes, edges: initialEdges } = useGraphNodes({ features, ... });

  // Apply layout
  const { layoutedNodes, layoutedEdges, layoutVersion, runLayout } = useGraphLayout({
    nodes: initialNodes,
    edges: initialEdges,
  });

  // React Flow state - INITIALIZES with layoutedNodes
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Effect to update nodes when layout changes
  useEffect(() => {
    // ... updates nodes/edges state when layoutedNodes/layoutedEdges change
  }, [layoutedNodes, layoutedEdges, layoutVersion, ...]);

  // Attempted fix: Force layout after mount when edges are available
  useEffect(() => {
    if (!hasLayoutWithEdges.current && layoutedNodes.length > 0 && layoutedEdges.length > 0) {
      hasLayoutWithEdges.current = true;
      setTimeout(() => runLayout('LR'), 100);
    }
  }, [layoutedNodes.length, layoutedEdges.length, runLayout]);

  return <ReactFlow nodes={nodes} edges={edges} fitView ... />;
}
```

### use-board-features.ts (data loading)

```typescript
export function useBoardFeatures({ currentProject }) {
  const { features, setFeatures } = useAppStore();  // From Zustand store
  const [isLoading, setIsLoading] = useState(true);

  const loadFeatures = useCallback(async () => {
    setIsLoading(true);
    const result = await api.features.getAll(currentProject.path);
    if (result.success) {
      const featuresWithIds = result.features.map((f) => ({
        ...f,  // dependencies come from here via spread
        id: f.id || `...`,
        status: f.status || 'backlog',
      }));
      setFeatures(featuresWithIds);  // Updates Zustand store
    }
    setIsLoading(false);
  }, [currentProject, setFeatures]);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  return { features, isLoading, ... };  // features is from useAppStore()
}
```

### graph-view-page.tsx (loading gate)

```typescript
export function GraphViewPage() {
  const { features: hookFeatures, isLoading } = useBoardFeatures({ currentProject });

  if (isLoading) {
    return <Spinner />;  // Graph doesn't render until loading is done
  }

  return <GraphView features={hookFeatures} ... />;
}
```

## What I've Tried

1. **Added edges to structureKey** - So layout recalculates when dependencies change, not just when nodes change

2. **Added layoutVersion tracking** - To signal when a fresh layout was computed vs cached positions used

3. **Track layoutVersion in GraphCanvas** - To detect when to apply fresh positions instead of preserving old ones

4. **Force runLayout after mount** - Added useEffect that calls `runLayout('LR')` after 100ms when nodes and edges are available

5. **Reset all refs on project change** - Clear layout state when switching projects

## Hypothesis

The issue appears to be a timing/race condition where:

- When going Kanban → Graph: Features are already in Zustand store, so graph mounts with complete data
- When loading Graph directly: Something causes the initial layout to compute before edges are properly available, or the layout result isn't being applied to React Flow's state correctly

The fact that clicking Kanban then Graph works suggests the data IS correct, just something about the initial render timing when loading the route directly.

## Questions to Investigate

1. Is `useNodesState(layoutedNodes)` capturing stale initial positions?
2. Is there a React 19 / StrictMode double-render issue with the refs?
3. Is React Flow's `fitView` prop interfering with initial positions?
4. Is there a race between Zustand store updates and React renders?
5. Should the graph component not render until layout is definitively computed with edges?
