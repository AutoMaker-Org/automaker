import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';
import { Feature, ModelAlias, ThinkingLevel, PlanningMode } from '@/store/app-store';
import {
  TestingTabContent,
  PrioritySelect,
  PlanningModeSelect,
  WorkModeSelector,
  PipelineExclusionControls,
} from '../shared';
import type { WorkMode } from '../shared';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import type { PhaseModelEntry } from '@automaker/types';
import { cn, normalizeModelEntry } from '@/lib/utils';

interface MassEditDialogProps {
  open: boolean;
  onClose: () => void;
  selectedFeatures: Feature[];
  onApply: (updates: Partial<Feature>, workMode: WorkMode) => Promise<void>;
  branchSuggestions: string[];
  branchCardCounts?: Record<string, number>;
  currentBranch?: string;
  projectPath?: string;
}

interface ApplyState {
  model: boolean;
  thinkingLevel: boolean;
  planningMode: boolean;
  requirePlanApproval: boolean;
  priority: boolean;
  skipTests: boolean;
  branchName: boolean;
  excludedPipelineSteps: boolean;
}

function getMixedValues(features: Feature[]): Record<string, boolean> {
  if (features.length === 0) return {};
  const first = features[0];
  const firstExcludedSteps = JSON.stringify(first.excludedPipelineSteps || []);
  return {
    model: !features.every((f) => f.model === first.model),
    thinkingLevel: !features.every((f) => f.thinkingLevel === first.thinkingLevel),
    planningMode: !features.every((f) => f.planningMode === first.planningMode),
    requirePlanApproval: !features.every(
      (f) => f.requirePlanApproval === first.requirePlanApproval
    ),
    priority: !features.every((f) => f.priority === first.priority),
    skipTests: !features.every((f) => f.skipTests === first.skipTests),
    branchName: !features.every((f) => f.branchName === first.branchName),
    excludedPipelineSteps: !features.every(
      (f) => JSON.stringify(f.excludedPipelineSteps || []) === firstExcludedSteps
    ),
  };
}

function getInitialValue<T>(features: Feature[], key: keyof Feature, defaultValue: T): T {
  if (features.length === 0) return defaultValue;
  return (features[0][key] as T) ?? defaultValue;
}

interface FieldWrapperProps {
  label: string;
  isMixed: boolean;
  willApply: boolean;
  onApplyChange: (apply: boolean) => void;
  children: React.ReactNode;
}

function FieldWrapper({ label, isMixed, willApply, onApplyChange, children }: FieldWrapperProps) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border transition-colors',
        willApply ? 'border-brand-500/50 bg-brand-500/5' : 'border-border bg-muted/20'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={willApply}
            onCheckedChange={(checked) => onApplyChange(!!checked)}
            className="data-[state=checked]:bg-brand-500 data-[state=checked]:border-brand-500"
          />
          <Label
            className="text-sm font-medium cursor-pointer"
            onClick={() => onApplyChange(!willApply)}
          >
            {label}
          </Label>
        </div>
        {isMixed && (
          <span className="flex items-center gap-1 text-xs text-amber-500">
            <AlertCircle className="w-3 h-3" />
            Mixed values
          </span>
        )}
      </div>
      <div className={cn(!willApply && 'opacity-50 pointer-events-none')}>{children}</div>
    </div>
  );
}

export function MassEditDialog({
  open,
  onClose,
  selectedFeatures,
  onApply,
  branchSuggestions,
  branchCardCounts,
  currentBranch,
  projectPath,
}: MassEditDialogProps) {
  const [isApplying, setIsApplying] = useState(false);

  // Track which fields to apply
  const [applyState, setApplyState] = useState<ApplyState>({
    model: false,
    thinkingLevel: false,
    planningMode: false,
    requirePlanApproval: false,
    priority: false,
    skipTests: false,
    branchName: false,
    excludedPipelineSteps: false,
  });

  // Field values
  const [model, setModel] = useState<ModelAlias>('claude-sonnet');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>('none');
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [planningMode, setPlanningMode] = useState<PlanningMode>('skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(false);
  const [priority, setPriority] = useState(2);
  const [skipTests, setSkipTests] = useState(false);

  // Work mode and branch name state
  const [workMode, setWorkMode] = useState<WorkMode>(() => {
    // Derive initial work mode from first selected feature's branchName
    if (selectedFeatures.length > 0 && selectedFeatures[0].branchName) {
      return 'custom';
    }
    return 'current';
  });
  const [branchName, setBranchName] = useState(() => {
    return getInitialValue(selectedFeatures, 'branchName', '') as string;
  });

  // Pipeline exclusion state
  const [excludedPipelineSteps, setExcludedPipelineSteps] = useState<string[]>(() => {
    return getInitialValue(selectedFeatures, 'excludedPipelineSteps', []) as string[];
  });

  // Calculate mixed values
  const mixedValues = useMemo(() => getMixedValues(selectedFeatures), [selectedFeatures]);

  // Reset state when dialog opens with new features
  useEffect(() => {
    if (open && selectedFeatures.length > 0) {
      setApplyState({
        model: false,
        thinkingLevel: false,
        planningMode: false,
        requirePlanApproval: false,
        priority: false,
        skipTests: false,
        branchName: false,
        excludedPipelineSteps: false,
      });
      setModel(getInitialValue(selectedFeatures, 'model', 'claude-sonnet') as ModelAlias);
      setThinkingLevel(getInitialValue(selectedFeatures, 'thinkingLevel', 'none') as ThinkingLevel);
      setProviderId(
        getInitialValue(selectedFeatures, 'providerId', undefined) as string | undefined
      );
      setPlanningMode(getInitialValue(selectedFeatures, 'planningMode', 'skip') as PlanningMode);
      setRequirePlanApproval(getInitialValue(selectedFeatures, 'requirePlanApproval', false));
      setPriority(getInitialValue(selectedFeatures, 'priority', 2));
      setSkipTests(getInitialValue(selectedFeatures, 'skipTests', false));
      // Reset work mode and branch name
      const initialBranchName = getInitialValue(selectedFeatures, 'branchName', '') as string;
      setBranchName(initialBranchName);
      setWorkMode(initialBranchName ? 'custom' : 'current');
      // Reset pipeline exclusions
      setExcludedPipelineSteps(
        getInitialValue(selectedFeatures, 'excludedPipelineSteps', []) as string[]
      );
    }
  }, [open, selectedFeatures]);

  // Clear requirePlanApproval when planning mode is skip or lite
  useEffect(() => {
    if (planningMode === 'skip' || planningMode === 'lite') {
      setRequirePlanApproval(false);
    }
  }, [planningMode]);

  const handleApply = async () => {
    const updates: Partial<Feature> = {};

    if (applyState.model || applyState.thinkingLevel) {
      const normalizedEntry = normalizeModelEntry({
        model,
        thinkingLevel,
        providerId,
      });

      if (applyState.model) {
        updates.model = normalizedEntry.model;
        updates.providerId = normalizedEntry.providerId;
      }

      if (applyState.thinkingLevel) {
        updates.thinkingLevel = normalizedEntry.thinkingLevel;
      }
    }

    if (applyState.planningMode) updates.planningMode = planningMode;
    if (applyState.requirePlanApproval) updates.requirePlanApproval = requirePlanApproval;
    if (applyState.priority) updates.priority = priority;
    if (applyState.skipTests) updates.skipTests = skipTests;
    if (applyState.branchName) {
      // For 'current' mode, use empty string (work on current branch)
      // For 'auto' mode, use empty string (will be auto-generated)
      // For 'custom' mode, use the specified branch name
      updates.branchName = workMode === 'custom' ? branchName : '';
    }
    if (applyState.excludedPipelineSteps) {
      updates.excludedPipelineSteps =
        excludedPipelineSteps.length > 0 ? excludedPipelineSteps : undefined;
    }

    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    setIsApplying(true);
    try {
      await onApply(updates, workMode);
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const hasAnyApply = Object.values(applyState).some(Boolean);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="mass-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit {selectedFeatures.length} Features</DialogTitle>
          <DialogDescription>
            Select which settings to apply to all selected features.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 pr-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Model Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">AI Model</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Select a specific model configuration
            </p>
            <PhaseModelSelector
              value={{ model, thinkingLevel, providerId }}
              onChange={(entry: PhaseModelEntry) => {
                setModel(entry.model as ModelAlias);
                setThinkingLevel(entry.thinkingLevel || 'none');
                setProviderId(entry.providerId);
                // Auto-enable model and thinking level for apply state
                setApplyState((prev) => ({
                  ...prev,
                  model: true,
                  thinkingLevel: true,
                }));
              }}
              compact
            />
          </div>

          {/* Separator */}
          <div className="border-t border-border" />

          {/* Planning Mode */}
          <FieldWrapper
            label="Planning Mode"
            isMixed={mixedValues.planningMode || mixedValues.requirePlanApproval}
            willApply={applyState.planningMode || applyState.requirePlanApproval}
            onApplyChange={(apply) =>
              setApplyState((prev) => ({
                ...prev,
                planningMode: apply,
                requirePlanApproval: apply,
              }))
            }
          >
            <PlanningModeSelect
              mode={planningMode}
              onModeChange={(newMode) => {
                setPlanningMode(newMode);
                // Auto-suggest approval based on mode, but user can override
                setRequirePlanApproval(newMode === 'spec' || newMode === 'full');
              }}
              requireApproval={requirePlanApproval}
              onRequireApprovalChange={setRequirePlanApproval}
              testIdPrefix="mass-edit-planning"
            />
          </FieldWrapper>

          {/* Priority */}
          <FieldWrapper
            label="Priority"
            isMixed={mixedValues.priority}
            willApply={applyState.priority}
            onApplyChange={(apply) => setApplyState((prev) => ({ ...prev, priority: apply }))}
          >
            <PrioritySelect
              selectedPriority={priority}
              onPrioritySelect={setPriority}
              testIdPrefix="mass-edit-priority"
            />
          </FieldWrapper>

          {/* Testing */}
          <FieldWrapper
            label="Testing"
            isMixed={mixedValues.skipTests}
            willApply={applyState.skipTests}
            onApplyChange={(apply) => setApplyState((prev) => ({ ...prev, skipTests: apply }))}
          >
            <TestingTabContent
              skipTests={skipTests}
              onSkipTestsChange={setSkipTests}
              testIdPrefix="mass-edit"
            />
          </FieldWrapper>

          {/* Branch / Work Mode */}
          <FieldWrapper
            label="Branch / Work Mode"
            isMixed={mixedValues.branchName}
            willApply={applyState.branchName}
            onApplyChange={(apply) => setApplyState((prev) => ({ ...prev, branchName: apply }))}
          >
            <WorkModeSelector
              workMode={workMode}
              onWorkModeChange={setWorkMode}
              branchName={branchName}
              onBranchNameChange={setBranchName}
              branchSuggestions={branchSuggestions}
              branchCardCounts={branchCardCounts}
              currentBranch={currentBranch}
              testIdPrefix="mass-edit-work-mode"
            />
          </FieldWrapper>

          {/* Pipeline Exclusion */}
          <FieldWrapper
            label="Pipeline Steps"
            isMixed={mixedValues.excludedPipelineSteps}
            willApply={applyState.excludedPipelineSteps}
            onApplyChange={(apply) =>
              setApplyState((prev) => ({ ...prev, excludedPipelineSteps: apply }))
            }
          >
            <PipelineExclusionControls
              projectPath={projectPath}
              excludedPipelineSteps={excludedPipelineSteps}
              onExcludedStepsChange={setExcludedPipelineSteps}
              testIdPrefix="mass-edit-pipeline"
            />
          </FieldWrapper>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!hasAnyApply || isApplying}
            loading={isApplying}
            data-testid="mass-edit-apply-button"
          >
            Apply to {selectedFeatures.length} Features
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
