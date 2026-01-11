import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Wand2,
  Check,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  BacklogPlanResult,
  BacklogChange,
  ModelAlias,
  CursorModelId,
  PhaseModelEntry,
} from '@automaker/types';
import { ModelOverrideTrigger } from '@/components/shared/model-override-trigger';
import { useAppStore } from '@/store/app-store';

/**
 * Normalize PhaseModelEntry or string to PhaseModelEntry
 */
function normalizeEntry(entry: PhaseModelEntry | string): PhaseModelEntry {
  if (typeof entry === 'string') {
    return { model: entry as ModelAlias | CursorModelId };
  }
  return entry;
}

/**
 * Extract model string from PhaseModelEntry or string
 */
function extractModel(entry: PhaseModelEntry | string): ModelAlias | CursorModelId {
  if (typeof entry === 'string') {
    return entry as ModelAlias | CursorModelId;
  }
  return entry.model;
}

interface BacklogPlanDialogProps {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  onPlanApplied?: () => void;
  // Props for background generation
  pendingPlanResult: BacklogPlanResult | null;
  setPendingPlanResult: (result: BacklogPlanResult | null) => void;
  isGeneratingPlan: boolean;
  setIsGeneratingPlan: (generating: boolean) => void;
  // Branch to use for created features (defaults to main if not provided)
  currentBranch?: string;
}

type DialogMode = 'input' | 'review' | 'applying';

export function BacklogPlanDialog({
  open,
  onClose,
  projectPath,
  onPlanApplied,
  pendingPlanResult,
  setPendingPlanResult,
  isGeneratingPlan,
  setIsGeneratingPlan,
  currentBranch,
}: BacklogPlanDialogProps) {
  const [mode, setMode] = useState<DialogMode>('input');
  const [prompt, setPrompt] = useState('');
  const [expandedChanges, setExpandedChanges] = useState<Set<number>>(new Set());
  const [selectedChanges, setSelectedChanges] = useState<Set<number>>(new Set());
  const [modelOverride, setModelOverride] = useState<PhaseModelEntry | null>(null);

  const { phaseModels } = useAppStore();

  // Set mode based on whether we have a pending result
  useEffect(() => {
    if (open) {
      if (pendingPlanResult) {
        setMode('review');
        // Select all changes by default
        setSelectedChanges(new Set(pendingPlanResult.changes.map((_, i) => i)));
        setExpandedChanges(new Set());
      } else {
        setMode('input');
      }
    }
  }, [open, pendingPlanResult]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt describing the changes you want');
      return;
    }

    const api = getElectronAPI();
    if (!api?.backlogPlan) {
      toast.error('API not available');
      return;
    }

    // Start generation in background
    setIsGeneratingPlan(true);

    // Use model override if set, otherwise use global default (extract model string from PhaseModelEntry)
    const effectiveModelEntry = modelOverride || normalizeEntry(phaseModels.backlogPlanningModel);
    const effectiveModel = effectiveModelEntry.model;
    const result = await api.backlogPlan.generate(projectPath, prompt, effectiveModel);
    if (!result.success) {
      setIsGeneratingPlan(false);
      toast.error(result.error || 'Failed to start plan generation');
      return;
    }

    // Show toast and close dialog - generation runs in background
    toast.info('Generating plan... This will be ready soon!', {
      duration: 3000,
    });
    setPrompt('');
    onClose();
  }, [projectPath, prompt, modelOverride, phaseModels, setIsGeneratingPlan, onClose]);

  const handleApply = useCallback(async () => {
    if (!pendingPlanResult) return;

    // Filter to only selected changes
    const selectedChangesList = pendingPlanResult.changes.filter((_, index) =>
      selectedChanges.has(index)
    );

    if (selectedChangesList.length === 0) {
      toast.error('Please select at least one change to apply');
      return;
    }

    const api = getElectronAPI();
    if (!api?.backlogPlan) {
      toast.error('API not available');
      return;
    }

    setMode('applying');

    // Create a filtered plan result with only selected changes
    const filteredPlanResult: BacklogPlanResult = {
      ...pendingPlanResult,
      changes: selectedChangesList,
      // Filter dependency updates to only include those for selected features
      dependencyUpdates:
        pendingPlanResult.dependencyUpdates?.filter((update) => {
          const isDeleting = selectedChangesList.some(
            (c) => c.type === 'delete' && c.featureId === update.featureId
          );
          return !isDeleting;
        }) || [],
    };

    const result = await api.backlogPlan.apply(projectPath, filteredPlanResult, currentBranch);
    if (result.success) {
      toast.success(`Applied ${result.appliedChanges?.length || 0} changes`);
      setPendingPlanResult(null);
      onPlanApplied?.();
      onClose();
    } else {
      toast.error(result.error || 'Failed to apply plan');
      setMode('review');
    }
  }, [
    projectPath,
    pendingPlanResult,
    selectedChanges,
    setPendingPlanResult,
    onPlanApplied,
    onClose,
    currentBranch,
  ]);

  const handleDiscard = useCallback(() => {
    setPendingPlanResult(null);
    setMode('input');
  }, [setPendingPlanResult]);

  const toggleChangeExpanded = (index: number) => {
    setExpandedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleChangeSelected = (index: number) => {
    setSelectedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAllChanges = () => {
    if (!pendingPlanResult) return;
    if (selectedChanges.size === pendingPlanResult.changes.length) {
      setSelectedChanges(new Set());
    } else {
      setSelectedChanges(new Set(pendingPlanResult.changes.map((_, i) => i)));
    }
  };

  const getChangeIcon = (type: BacklogChange['type']) => {
    switch (type) {
      case 'add':
        return <Plus className="w-4 h-4 text-green-500" />;
      case 'update':
        return <Pencil className="w-4 h-4 text-yellow-500" />;
      case 'delete':
        return <Trash2 className="w-4 h-4 text-red-500" />;
    }
  };

  const getChangeLabel = (change: BacklogChange) => {
    switch (change.type) {
      case 'add':
        return change.feature?.title || 'New Feature';
      case 'update':
        return `Update: ${change.featureId}`;
      case 'delete':
        return `Delete: ${change.featureId}`;
    }
  };

  const renderContent = () => {
    switch (mode) {
      case 'input':
        return (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Describe the changes you want to make to your backlog. The AI will analyze your
              current features and propose additions, updates, or deletions.
            </div>
            <Textarea
              placeholder="e.g., Add authentication features with login, signup, and password reset. Also add a dashboard feature that depends on authentication."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[150px] resize-none"
              autoFocus
            />
            <div className="text-xs text-muted-foreground">
              The AI will automatically handle dependency graph updates when adding or removing
              features.
            </div>
            {isGeneratingPlan && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <Loader2 className="w-4 h-4 animate-spin" />A plan is currently being generated in
                the background...
              </div>
            )}
          </div>
        );

      case 'review':
        if (!pendingPlanResult) return null;

        const additions = pendingPlanResult.changes.filter((c) => c.type === 'add');
        const updates = pendingPlanResult.changes.filter((c) => c.type === 'update');
        const deletions = pendingPlanResult.changes.filter((c) => c.type === 'delete');
        const allSelected = selectedChanges.size === pendingPlanResult.changes.length;
        const someSelected = selectedChanges.size > 0 && !allSelected;

        return (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="font-medium mb-2">Summary</h4>
              <p className="text-sm text-muted-foreground">{pendingPlanResult.summary}</p>
            </div>

            {/* Stats */}
            <div className="flex gap-4 text-sm">
              {additions.length > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <Plus className="w-4 h-4" /> {additions.length} additions
                </span>
              )}
              {updates.length > 0 && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <Pencil className="w-4 h-4" /> {updates.length} updates
                </span>
              )}
              {deletions.length > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <Trash2 className="w-4 h-4" /> {deletions.length} deletions
                </span>
              )}
            </div>

            {/* Select all */}
            <div className="flex items-center gap-2 pb-2 border-b">
              <Checkbox
                id="select-all"
                checked={allSelected}
                // @ts-expect-error - indeterminate is valid but not in types
                indeterminate={someSelected}
                onCheckedChange={toggleAllChanges}
              />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                {allSelected ? 'Deselect all' : 'Select all'} ({selectedChanges.size}/
                {pendingPlanResult.changes.length})
              </label>
            </div>

            {/* Changes list */}
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {pendingPlanResult.changes.map((change, index) => (
                <div
                  key={index}
                  className={cn(
                    'rounded-lg border p-3',
                    change.type === 'add' && 'border-green-500/30 bg-green-500/5',
                    change.type === 'update' && 'border-yellow-500/30 bg-yellow-500/5',
                    change.type === 'delete' && 'border-red-500/30 bg-red-500/5',
                    !selectedChanges.has(index) && 'opacity-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedChanges.has(index)}
                      onCheckedChange={() => toggleChangeSelected(index)}
                    />
                    <button
                      className="flex-1 flex items-center gap-2 text-left"
                      onClick={() => toggleChangeExpanded(index)}
                    >
                      {expandedChanges.has(index) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      {getChangeIcon(change.type)}
                      <span className="font-medium text-sm">{getChangeLabel(change)}</span>
                    </button>
                  </div>

                  {expandedChanges.has(index) && (
                    <div className="mt-3 pl-10 space-y-2 text-sm">
                      <p className="text-muted-foreground">{change.reason}</p>
                      {change.feature && (
                        <div className="rounded bg-background/50 p-2 text-xs font-mono">
                          {change.feature.description && (
                            <p className="text-foreground">{change.feature.description}</p>
                          )}
                          {change.feature.dependencies &&
                            change.feature.dependencies.length > 0 && (
                              <p className="text-muted-foreground mt-1">
                                Dependencies: {change.feature.dependencies.join(', ')}
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'applying':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Applying changes...</p>
          </div>
        );
    }
  };

  // Get effective model entry (override or global default)
  const effectiveModelEntry = modelOverride || normalizeEntry(phaseModels.backlogPlanningModel);
  const effectiveModel = effectiveModelEntry.model;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            {mode === 'review' ? 'Review Plan' : 'Plan Backlog Changes'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'review'
              ? 'Select which changes to apply to your backlog'
              : 'Use AI to add, update, or remove features from your backlog'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">{renderContent()}</div>

        <DialogFooter>
          {mode === 'input' && (
            <>
              <div className="flex items-center gap-2 mr-auto">
                <span className="text-xs text-muted-foreground">Model:</span>
                <ModelOverrideTrigger
                  currentModelEntry={effectiveModelEntry}
                  onModelChange={setModelOverride}
                  phase="backlogPlanningModel"
                  size="sm"
                  variant="button"
                  isOverridden={modelOverride !== null}
                />
              </div>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={!prompt.trim() || isGeneratingPlan}>
                {isGeneratingPlan ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Generate Plan
                  </>
                )}
              </Button>
            </>
          )}

          {mode === 'review' && (
            <>
              <Button variant="outline" onClick={handleDiscard}>
                Discard
              </Button>
              <Button variant="outline" onClick={onClose}>
                Review Later
              </Button>
              <Button onClick={handleApply} disabled={selectedChanges.size === 0}>
                <Check className="w-4 h-4 mr-2" />
                Apply {selectedChanges.size} Change{selectedChanges.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
