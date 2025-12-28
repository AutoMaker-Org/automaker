import { useMemo, useCallback } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { GraphCanvas } from './graph-canvas';
import { useBoardBackground } from '../board-view/hooks';
import { NodeActionCallbacks } from './hooks';
import { wouldCreateCircularDependency, dependencyExists } from '@automaker/dependency-resolver';
import { toast } from 'sonner';

interface GraphViewProps {
  features: Feature[];
  runningAutoTasks: string[];
  currentWorktreePath: string | null;
  currentWorktreeBranch: string | null;
  projectPath: string | null;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onEditFeature: (feature: Feature) => void;
  onViewOutput: (feature: Feature) => void;
  onStartTask?: (feature: Feature) => void;
  onStopTask?: (feature: Feature) => void;
  onResumeTask?: (feature: Feature) => void;
  onUpdateFeature?: (featureId: string, updates: Partial<Feature>) => void;
  onSpawnTask?: (feature: Feature) => void;
  onDeleteTask?: (feature: Feature) => void;
}

export function GraphView({
  features,
  runningAutoTasks,
  currentWorktreePath,
  currentWorktreeBranch,
  projectPath,
  searchQuery,
  onSearchQueryChange,
  onEditFeature,
  onViewOutput,
  onStartTask,
  onStopTask,
  onResumeTask,
  onUpdateFeature,
  onSpawnTask,
  onDeleteTask,
}: GraphViewProps) {
  const { currentProject } = useAppStore();

  // Use the same background hook as the board view
  const { backgroundImageStyle } = useBoardBackground({ currentProject });

  // Filter features by current worktree (same logic as board view)
  const filteredFeatures = useMemo(() => {
    const effectiveBranch = currentWorktreeBranch;

    return features.filter((f) => {
      // Skip completed features (they're in archive)
      if (f.status === 'completed') return false;

      const featureBranch = f.branchName as string | undefined;

      if (!featureBranch) {
        // No branch assigned - show only on primary worktree
        return currentWorktreePath === null;
      } else if (effectiveBranch === null) {
        // Viewing main but branch not initialized
        return projectPath
          ? useAppStore.getState().isPrimaryWorktreeBranch(projectPath, featureBranch)
          : false;
      } else {
        // Match by branch name
        return featureBranch === effectiveBranch;
      }
    });
  }, [features, currentWorktreePath, currentWorktreeBranch, projectPath]);

  // Handle node double click - edit
  const handleNodeDoubleClick = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (feature) {
        onEditFeature(feature);
      }
    },
    [features, onEditFeature]
  );

  // Handle creating a dependency via edge connection
  const handleCreateDependency = useCallback(
    async (sourceId: string, targetId: string): Promise<boolean> => {
      const targetFeature = features.find((f) => f.id === targetId);

      // Prevent self-dependency
      if (sourceId === targetId) {
        toast.error('A task cannot depend on itself');
        return false;
      }

      // Check if dependency already exists
      if (dependencyExists(features, sourceId, targetId)) {
        toast.info('Dependency already exists');
        return false;
      }

      // Check for circular dependency
      // This checks: if we make targetId depend on sourceId, would it create a cycle?
      // A cycle would occur if sourceId already depends on targetId (transitively)
      const wouldCycle = wouldCreateCircularDependency(features, sourceId, targetId);
      if (wouldCycle) {
        toast.error('Cannot create circular dependency', {
          description: 'This would create a dependency cycle',
        });
        return false;
      }

      // Get target feature and update its dependencies
      if (!targetFeature) {
        toast.error('Target task not found');
        return false;
      }

      const currentDeps = (targetFeature.dependencies as string[] | undefined) || [];

      // Add the dependency
      onUpdateFeature?.(targetId, {
        dependencies: [...currentDeps, sourceId],
      });

      toast.success('Dependency created');
      return true;
    },
    [features, onUpdateFeature]
  );

  // Node action callbacks for dropdown menu
  const nodeActionCallbacks: NodeActionCallbacks = useMemo(
    () => ({
      onViewLogs: (featureId: string) => {
        const feature = features.find((f) => f.id === featureId);
        if (feature) {
          onViewOutput(feature);
        }
      },
      onViewDetails: (featureId: string) => {
        const feature = features.find((f) => f.id === featureId);
        if (feature) {
          onEditFeature(feature);
        }
      },
      onStartTask: (featureId: string) => {
        const feature = features.find((f) => f.id === featureId);
        if (feature) {
          onStartTask?.(feature);
        }
      },
      onStopTask: (featureId: string) => {
        const feature = features.find((f) => f.id === featureId);
        if (feature) {
          onStopTask?.(feature);
        }
      },
      onResumeTask: (featureId: string) => {
        const feature = features.find((f) => f.id === featureId);
        if (feature) {
          onResumeTask?.(feature);
        }
      },
      onSpawnTask: (featureId: string) => {
        const feature = features.find((f) => f.id === featureId);
        if (feature) {
          onSpawnTask?.(feature);
        }
      },
      onDeleteTask: (featureId: string) => {
        const feature = features.find((f) => f.id === featureId);
        if (feature) {
          onDeleteTask?.(feature);
        }
      },
      onDeleteDependency: (sourceId: string, targetId: string) => {
        // Find the target feature and remove the source from its dependencies
        const targetFeature = features.find((f) => f.id === targetId);
        if (!targetFeature) return;

        const currentDeps = (targetFeature.dependencies as string[] | undefined) || [];
        const newDeps = currentDeps.filter((depId) => depId !== sourceId);

        onUpdateFeature?.(targetId, {
          dependencies: newDeps,
        });

        toast.success('Dependency removed');
      },
    }),
    [
      features,
      onViewOutput,
      onEditFeature,
      onStartTask,
      onStopTask,
      onResumeTask,
      onSpawnTask,
      onDeleteTask,
      onUpdateFeature,
    ]
  );

  return (
    <div className="flex-1 overflow-hidden relative">
      <GraphCanvas
        features={filteredFeatures}
        runningAutoTasks={runningAutoTasks}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeActionCallbacks={nodeActionCallbacks}
        onCreateDependency={handleCreateDependency}
        backgroundStyle={backgroundImageStyle}
        className="h-full"
      />
    </div>
  );
}
