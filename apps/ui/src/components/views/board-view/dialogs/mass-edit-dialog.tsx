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
import { modelSupportsThinking } from '@/lib/utils';
import { Feature, ModelAlias, ThinkingLevel, PlanningMode } from '@/store/app-store';
import { TestingTabContent, PrioritySelect, PlanningModeSelect } from '../shared';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import { isCursorModel, isClaudeModel, type PhaseModelEntry } from '@automaker/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MassEditDialogProps {
  open: boolean;
  onClose: () => void;
  selectedFeatures: Feature[];
  onApply: (updates: Partial<Feature>) => Promise<void>;
}

interface ApplyState {
  model: boolean;
  thinkingLevel: boolean;
  planningMode: boolean;
  requirePlanApproval: boolean;
  priority: boolean;
  skipTests: boolean;
}

function getMixedValues(features: Feature[]): Record<string, boolean> {
  if (features.length === 0) return {};
  const first = features[0];
  return {
    model: !features.every((f) => f.model === first.model),
    thinkingLevel: !features.every((f) => f.thinkingLevel === first.thinkingLevel),
    planningMode: !features.every((f) => f.planningMode === first.planningMode),
    requirePlanApproval: !features.every(
      (f) => f.requirePlanApproval === first.requirePlanApproval
    ),
    priority: !features.every((f) => f.priority === first.priority),
    skipTests: !features.every((f) => f.skipTests === first.skipTests),
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

export function MassEditDialog({ open, onClose, selectedFeatures, onApply }: MassEditDialogProps) {
  const [isApplying, setIsApplying] = useState(false);

  // Track which fields to apply
  const [applyState, setApplyState] = useState<ApplyState>({
    model: false,
    thinkingLevel: false,
    planningMode: false,
    requirePlanApproval: false,
    priority: false,
    skipTests: false,
  });

  // Field values
  const [model, setModel] = useState<ModelAlias>('sonnet');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>('none');
  const [planningMode, setPlanningMode] = useState<PlanningMode>('skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(false);
  const [priority, setPriority] = useState(2);
  const [skipTests, setSkipTests] = useState(false);

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
      });
      setModel(getInitialValue(selectedFeatures, 'model', 'sonnet') as ModelAlias);
      setThinkingLevel(getInitialValue(selectedFeatures, 'thinkingLevel', 'none') as ThinkingLevel);
      setPlanningMode(getInitialValue(selectedFeatures, 'planningMode', 'skip') as PlanningMode);
      setRequirePlanApproval(getInitialValue(selectedFeatures, 'requirePlanApproval', false));
      setPriority(getInitialValue(selectedFeatures, 'priority', 2));
      setSkipTests(getInitialValue(selectedFeatures, 'skipTests', false));
    }
  }, [open, selectedFeatures]);

  const handleApply = async () => {
    const updates: Partial<Feature> = {};

    if (applyState.model) updates.model = model;
    if (applyState.thinkingLevel) updates.thinkingLevel = thinkingLevel;
    if (applyState.planningMode) updates.planningMode = planningMode;
    if (applyState.requirePlanApproval) updates.requirePlanApproval = requirePlanApproval;
    if (applyState.priority) updates.priority = priority;
    if (applyState.skipTests) updates.skipTests = skipTests;

    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    setIsApplying(true);
    try {
      await onApply(updates);
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const hasAnyApply = Object.values(applyState).some(Boolean);
  const isCurrentModelCursor = isCursorModel(model);
  const modelAllowsThinking = !isCurrentModelCursor && modelSupportsThinking(model);
  const modelSupportsPlanningMode = isClaudeModel(model);

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
              value={{ model, thinkingLevel }}
              onChange={(entry: PhaseModelEntry) => {
                setModel(entry.model as ModelAlias);
                setThinkingLevel(entry.thinkingLevel || 'none');
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
          {modelSupportsPlanningMode ? (
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
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'p-3 rounded-lg border transition-colors border-border bg-muted/20 opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={false} disabled className="opacity-50" />
                        <Label className="text-sm font-medium text-muted-foreground">
                          Planning Mode
                        </Label>
                      </div>
                    </div>
                    <div className="opacity-50 pointer-events-none">
                      <PlanningModeSelect
                        mode="skip"
                        onModeChange={() => {}}
                        testIdPrefix="mass-edit-planning"
                        disabled
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Planning modes are only available for Claude Provider</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

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
