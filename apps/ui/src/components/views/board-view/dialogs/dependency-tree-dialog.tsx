import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Feature } from '@/store/app-store';
import { AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DependencyTreeDialogProps {
  open: boolean;
  onClose: () => void;
  feature: Feature | null;
  allFeatures: Feature[];
}

export function DependencyTreeDialog({
  open,
  onClose,
  feature,
  allFeatures,
}: DependencyTreeDialogProps) {
  const [dependencyTree, setDependencyTree] = useState<{
    dependencies: Feature[];
    dependents: Feature[];
  }>({ dependencies: [], dependents: [] });

  useEffect(() => {
    if (!feature) return;

    // Find features this depends on
    const dependencies = (feature.dependencies || [])
      .map((depId) => allFeatures.find((f) => f.id === depId))
      .filter((f): f is Feature => f !== undefined);

    // Find features that depend on this one
    const dependents = allFeatures.filter((f) => f.dependencies?.includes(feature.id));

    setDependencyTree({ dependencies, dependents });
  }, [feature, allFeatures]);

  if (!feature) return null;

  const getStatusIcon = (status: Feature['status']) => {
    switch (status) {
      case 'completed':
      case 'verified':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'in_progress':
      case 'waiting_approval':
        return <Circle className="w-4 h-4 text-blue-500 fill-blue-500/20" />;
      default:
        return <Circle className="w-4 h-4 text-muted-foreground/50" />;
    }
  };

  const getPriorityBadge = (priority?: number) => {
    if (!priority) return null;
    return (
      <span
        className={cn(
          'text-xs px-1.5 py-0.5 rounded font-medium',
          priority === 1 && 'bg-red-500/20 text-red-500',
          priority === 2 && 'bg-yellow-500/20 text-yellow-500',
          priority === 3 && 'bg-blue-500/20 text-blue-500'
        )}
      >
        P{priority}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dependency Tree</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Current Feature */}
          <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
            <div className="flex items-center gap-3 mb-2">
              {getStatusIcon(feature.status)}
              <h3 className="font-semibold text-sm">Current Feature</h3>
              {getPriorityBadge(feature.priority)}
            </div>
            <p className="text-sm text-muted-foreground">{feature.description}</p>
            <p className="text-xs text-muted-foreground/70 mt-2">Category: {feature.category}</p>
          </div>

          {/* Dependencies (what this feature needs) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-sm">
                Dependencies ({dependencyTree.dependencies.length})
              </h3>
              <span className="text-xs text-muted-foreground">This feature requires:</span>
            </div>

            {dependencyTree.dependencies.length === 0 ? (
              <div className="text-sm text-muted-foreground/70 italic border border-dashed rounded-lg p-4 text-center">
                No dependencies - this feature can be started independently
              </div>
            ) : (
              <div className="space-y-2">
                {dependencyTree.dependencies.map((dep) => (
                  <div
                    key={dep.id}
                    className={cn(
                      'border rounded-lg p-3 transition-colors',
                      dep.status === 'completed' || dep.status === 'verified'
                        ? 'bg-green-500/5 border-green-500/20'
                        : 'bg-muted/30 border-border'
                    )}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      {getStatusIcon(dep.status)}
                      <span className="text-sm font-medium flex-1">
                        {dep.description.slice(0, 100)}
                        {dep.description.length > 100 && '...'}
                      </span>
                      {getPriorityBadge(dep.priority)}
                    </div>
                    <div className="flex items-center gap-3 ml-7">
                      <span className="text-xs text-muted-foreground">{dep.category}</span>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          dep.status === 'completed' || dep.status === 'verified'
                            ? 'bg-green-500/20 text-green-600'
                            : dep.status === 'in_progress'
                              ? 'bg-blue-500/20 text-blue-600'
                              : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {(dep.status || 'backlog').replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dependents (what depends on this feature) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-sm">
                Dependents ({dependencyTree.dependents.length})
              </h3>
              <span className="text-xs text-muted-foreground">Features blocked by this:</span>
            </div>

            {dependencyTree.dependents.length === 0 ? (
              <div className="text-sm text-muted-foreground/70 italic border border-dashed rounded-lg p-4 text-center">
                No dependents - no other features are waiting on this one
              </div>
            ) : (
              <div className="space-y-2">
                {dependencyTree.dependents.map((dependent) => (
                  <div key={dependent.id} className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-center gap-3 mb-1">
                      {getStatusIcon(dependent.status)}
                      <span className="text-sm font-medium flex-1">
                        {dependent.description.slice(0, 100)}
                        {dependent.description.length > 100 && '...'}
                      </span>
                      {getPriorityBadge(dependent.priority)}
                    </div>
                    <div className="flex items-center gap-3 ml-7">
                      <span className="text-xs text-muted-foreground">{dependent.category}</span>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          dependent.status === 'completed' || dependent.status === 'verified'
                            ? 'bg-green-500/20 text-green-600'
                            : dependent.status === 'in_progress'
                              ? 'bg-blue-500/20 text-blue-600'
                              : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {(dependent.status || 'backlog').replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Warning for incomplete dependencies */}
          {dependencyTree.dependencies.some(
            (d) => d.status !== 'completed' && d.status !== 'verified'
          ) && (
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-700 dark:text-yellow-500">
                  Incomplete Dependencies
                </p>
                <p className="text-yellow-600 dark:text-yellow-400 mt-1">
                  This feature has dependencies that aren't completed yet. Consider completing them
                  first for a smoother implementation.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
