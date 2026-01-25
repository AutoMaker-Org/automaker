// @ts-nocheck
import { useState, useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CategoryAutocomplete } from '@/components/ui/category-autocomplete';
import { DependencySelector } from '@/components/ui/dependency-selector';
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  FeatureTextFilePath as DescriptionTextFilePath,
  ImagePreviewMap,
} from '@/components/ui/description-image-dropzone';
import { GitBranch, Cpu, FolderKanban, Settings2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { cn, modelSupportsThinking } from '@/lib/utils';
import { Feature, ModelAlias, ThinkingLevel, useAppStore, PlanningMode } from '@/store/app-store';
import type { ReasoningEffort, PhaseModelEntry, DescriptionHistoryEntry } from '@automaker/types';
import { migrateModelId } from '@automaker/types';
import {
  TestingTabContent,
  PrioritySelector,
  WorkModeSelector,
  PlanningModeSelect,
  EnhanceWithAI,
  EnhancementHistoryButton,
  type EnhancementMode,
} from '../shared';
import type { WorkMode } from '../shared';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DependencyTreeDialog } from './dependency-tree-dialog';
import { isClaudeModel, supportsReasoningEffort } from '@automaker/types';

const logger = createLogger('EditFeatureDialog');

interface EditFeatureDialogProps {
  feature: Feature | null;
  onClose: () => void;
  onUpdate: (
    featureId: string,
    updates: {
      title: string;
      category: string;
      description: string;
      skipTests: boolean;
      model: ModelAlias;
      thinkingLevel: ThinkingLevel;
      reasoningEffort: ReasoningEffort;
      imagePaths: DescriptionImagePath[];
      textFilePaths: DescriptionTextFilePath[];
      branchName: string; // Can be empty string to use current branch
      priority: number;
      planningMode: PlanningMode;
      requirePlanApproval: boolean;
      dependencies?: string[];
      childDependencies?: string[]; // Feature IDs that should depend on this feature
    },
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: EnhancementMode,
    preEnhancementDescription?: string
  ) => void;
  categorySuggestions: string[];
  branchSuggestions: string[];
  branchCardCounts?: Record<string, number>; // Map of branch name to unarchived card count
  currentBranch?: string;
  isMaximized: boolean;
  allFeatures: Feature[];
}

export function EditFeatureDialog({
  feature,
  onClose,
  onUpdate,
  categorySuggestions,
  branchSuggestions,
  branchCardCounts,
  currentBranch,
  isMaximized,
  allFeatures,
}: EditFeatureDialogProps) {
  const navigate = useNavigate();
  const [editingFeature, setEditingFeature] = useState<Feature | null>(feature);
  // Derive initial workMode from feature's branchName
  const [workMode, setWorkMode] = useState<WorkMode>(() => {
    // If feature has a branchName, it's using 'custom' mode
    // Otherwise, it's on 'current' branch (no worktree isolation)
    return feature?.branchName ? 'custom' : 'current';
  });
  const [editFeaturePreviewMap, setEditFeaturePreviewMap] = useState<ImagePreviewMap>(
    () => new Map()
  );
  const [showDependencyTree, setShowDependencyTree] = useState(false);
  const [planningMode, setPlanningMode] = useState<PlanningMode>(feature?.planningMode ?? 'skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(
    feature?.requirePlanApproval ?? false
  );

  // Model selection state - migrate legacy model IDs to canonical format
  const [modelEntry, setModelEntry] = useState<PhaseModelEntry>(() => ({
    model: migrateModelId(feature?.model) || 'claude-opus',
    thinkingLevel: feature?.thinkingLevel || 'none',
    reasoningEffort: feature?.reasoningEffort || 'none',
  }));

  // Check if current model supports planning mode (Claude/Anthropic only)
  const modelSupportsPlanningMode = isClaudeModel(modelEntry.model);

  // Track the source of description changes for history
  const [descriptionChangeSource, setDescriptionChangeSource] = useState<
    { source: 'enhance'; mode: EnhancementMode } | 'edit' | null
  >(null);
  // Track the original description when the dialog opened for comparison
  const [originalDescription, setOriginalDescription] = useState(feature?.description ?? '');
  // Track the description before enhancement (so it can be restored)
  const [preEnhancementDescription, setPreEnhancementDescription] = useState<string | null>(null);
  // Local history state for real-time display (combines persisted + session history)
  const [localHistory, setLocalHistory] = useState<DescriptionHistoryEntry[]>(
    feature?.descriptionHistory ?? []
  );

  // Dependency state
  const [parentDependencies, setParentDependencies] = useState<string[]>(
    feature?.dependencies ?? []
  );
  // Child dependencies are features that have this feature in their dependencies
  const [childDependencies, setChildDependencies] = useState<string[]>(() => {
    if (!feature) return [];
    return allFeatures.filter((f) => f.dependencies?.includes(feature.id)).map((f) => f.id);
  });
  // Track original child dependencies to detect changes
  const [originalChildDependencies, setOriginalChildDependencies] = useState<string[]>(() => {
    if (!feature) return [];
    return allFeatures.filter((f) => f.dependencies?.includes(feature.id)).map((f) => f.id);
  });

  useEffect(() => {
    setEditingFeature(feature);
    if (feature) {
      setPlanningMode(feature.planningMode ?? 'skip');
      setRequirePlanApproval(feature.requirePlanApproval ?? false);
      // Derive workMode from feature's branchName
      setWorkMode(feature.branchName ? 'custom' : 'current');
      // Reset history tracking state
      setOriginalDescription(feature.description ?? '');
      setDescriptionChangeSource(null);
      setPreEnhancementDescription(null);
      setLocalHistory(feature.descriptionHistory ?? []);
      // Reset model entry - migrate legacy model IDs
      setModelEntry({
        model: migrateModelId(feature.model) || 'claude-opus',
        thinkingLevel: feature.thinkingLevel || 'none',
        reasoningEffort: feature.reasoningEffort || 'none',
      });
      // Reset dependency state
      setParentDependencies(feature.dependencies ?? []);
      const childDeps = allFeatures
        .filter((f) => f.dependencies?.includes(feature.id))
        .map((f) => f.id);
      setChildDependencies(childDeps);
      setOriginalChildDependencies(childDeps);
    } else {
      setEditFeaturePreviewMap(new Map());
      setDescriptionChangeSource(null);
      setPreEnhancementDescription(null);
      setLocalHistory([]);
      setParentDependencies([]);
      setChildDependencies([]);
      setOriginalChildDependencies([]);
    }
  }, [feature, allFeatures]);

  const handleModelChange = (entry: PhaseModelEntry) => {
    setModelEntry(entry);
  };

  const handleUpdate = () => {
    if (!editingFeature) return;

    // Validate branch selection for custom mode
    const isBranchSelectorEnabled = editingFeature.status === 'backlog';
    if (isBranchSelectorEnabled && workMode === 'custom' && !editingFeature.branchName?.trim()) {
      toast.error('Please select a branch name');
      return;
    }

    const selectedModel = modelEntry.model;
    const normalizedThinking: ThinkingLevel = modelSupportsThinking(selectedModel)
      ? (modelEntry.thinkingLevel ?? 'none')
      : 'none';
    const normalizedReasoning: ReasoningEffort = supportsReasoningEffort(selectedModel)
      ? (modelEntry.reasoningEffort ?? 'none')
      : 'none';

    // For 'current' mode, use empty string (work on current branch)
    // For 'auto' mode, use empty string (will be auto-generated in use-board-actions)
    // For 'custom' mode, use the specified branch name
    const finalBranchName = workMode === 'custom' ? editingFeature.branchName || '' : '';

    // Check if child dependencies changed
    const childDepsChanged =
      childDependencies.length !== originalChildDependencies.length ||
      childDependencies.some((id) => !originalChildDependencies.includes(id)) ||
      originalChildDependencies.some((id) => !childDependencies.includes(id));

    const updates = {
      title: editingFeature.title ?? '',
      category: editingFeature.category,
      description: editingFeature.description,
      skipTests: editingFeature.skipTests ?? false,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      reasoningEffort: normalizedReasoning,
      imagePaths: editingFeature.imagePaths ?? [],
      textFilePaths: editingFeature.textFilePaths ?? [],
      branchName: finalBranchName,
      priority: editingFeature.priority ?? 2,
      planningMode,
      requirePlanApproval,
      workMode,
      dependencies: parentDependencies,
      childDependencies: childDepsChanged ? childDependencies : undefined,
    };

    // Determine if description changed and what source to use
    const descriptionChanged = editingFeature.description !== originalDescription;
    let historySource: 'enhance' | 'edit' | undefined;
    let historyEnhancementMode: 'improve' | 'technical' | 'simplify' | 'acceptance' | undefined;

    if (descriptionChanged && descriptionChangeSource) {
      if (descriptionChangeSource === 'edit') {
        historySource = 'edit';
      } else {
        historySource = 'enhance';
        historyEnhancementMode = descriptionChangeSource.mode;
      }
    }

    onUpdate(
      editingFeature.id,
      updates,
      historySource,
      historyEnhancementMode,
      preEnhancementDescription ?? undefined
    );
    setEditFeaturePreviewMap(new Map());
    onClose();
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  if (!editingFeature) {
    return null;
  }

  // Shared card styling
  const cardClass = 'rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3';
  const sectionHeaderClass = 'flex items-center gap-2 text-sm font-medium text-foreground';

  return (
    <Dialog open={!!editingFeature} onOpenChange={handleDialogClose}>
      <DialogContent
        compact={!isMaximized}
        data-testid="edit-feature-dialog"
        onPointerDownOutside={(e: CustomEvent) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e: CustomEvent) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit Feature</DialogTitle>
          <DialogDescription>Modify the feature details.</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Task Details Section */}
          <div className={cardClass}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-description">Description</Label>
                {/* Version History Button - uses local history for real-time updates */}
                <EnhancementHistoryButton
                  history={localHistory}
                  currentValue={editingFeature.description}
                  onRestore={(description) => {
                    setEditingFeature((prev) => (prev ? { ...prev, description } : prev));
                    setDescriptionChangeSource('edit');
                  }}
                  valueAccessor={(entry) => entry.description}
                  title="Version History"
                  restoreMessage="Description restored from history"
                />
              </div>
              <DescriptionImageDropZone
                value={editingFeature.description}
                onChange={(value) => {
                  setEditingFeature({
                    ...editingFeature,
                    description: value,
                  });
                  // Track that this change was a manual edit (unless already enhanced)
                  if (!descriptionChangeSource || descriptionChangeSource === 'edit') {
                    setDescriptionChangeSource('edit');
                  }
                }}
                images={editingFeature.imagePaths ?? []}
                onImagesChange={(images) =>
                  setEditingFeature({
                    ...editingFeature,
                    imagePaths: images,
                  })
                }
                textFiles={editingFeature.textFilePaths ?? []}
                onTextFilesChange={(textFiles) =>
                  setEditingFeature({
                    ...editingFeature,
                    textFilePaths: textFiles,
                  })
                }
                placeholder="Describe the feature..."
                previewMap={editFeaturePreviewMap}
                onPreviewMapChange={setEditFeaturePreviewMap}
                data-testid="edit-feature-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-title">Title (optional)</Label>
              <Input
                id="edit-title"
                value={editingFeature.title ?? ''}
                onChange={(e) =>
                  setEditingFeature({
                    ...editingFeature,
                    title: e.target.value,
                  })
                }
                placeholder="Leave blank to auto-generate"
                data-testid="edit-feature-title"
              />
            </div>

            {/* Enhancement Section */}
            <EnhanceWithAI
              value={editingFeature.description}
              onChange={(enhanced) =>
                setEditingFeature((prev) => (prev ? { ...prev, description: enhanced } : prev))
              }
              onHistoryAdd={({ mode, originalText, enhancedText }) => {
                setDescriptionChangeSource({ source: 'enhance', mode });
                setPreEnhancementDescription(originalText);

                // Update local history for real-time display
                const timestamp = new Date().toISOString();
                setLocalHistory((prev) => {
                  const newHistory = [...prev];
                  // Add original text first (so user can restore to pre-enhancement state)
                  const lastEntry = prev[prev.length - 1];
                  if (!lastEntry || lastEntry.description !== originalText) {
                    newHistory.push({
                      description: originalText,
                      timestamp,
                      source: prev.length === 0 ? 'initial' : 'edit',
                    });
                  }
                  // Add enhanced text
                  newHistory.push({
                    description: enhancedText,
                    timestamp,
                    source: 'enhance',
                    enhancementMode: mode,
                  });
                  return newHistory;
                });
              }}
            />
          </div>

          {/* AI & Execution Section */}
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <div className={sectionHeaderClass}>
                <Cpu className="w-4 h-4 text-muted-foreground" />
                <span>AI & Execution</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate({ to: '/settings', search: { view: 'defaults' } });
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      <span>Edit Defaults</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Change default model and planning settings for new features</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <PhaseModelSelector
                value={modelEntry}
                onChange={handleModelChange}
                compact
                align="end"
              />
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  className={cn(
                    'text-xs text-muted-foreground',
                    !modelSupportsPlanningMode && 'opacity-50'
                  )}
                >
                  Planning
                </Label>
                {modelSupportsPlanningMode ? (
                  <PlanningModeSelect
                    mode={planningMode}
                    onModeChange={setPlanningMode}
                    testIdPrefix="edit-feature-planning"
                    compact
                  />
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <PlanningModeSelect
                            mode="skip"
                            onModeChange={() => {}}
                            testIdPrefix="edit-feature-planning"
                            compact
                            disabled
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Planning modes are only available for Claude Provider</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Options</Label>
                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-feature-skip-tests"
                      checked={!(editingFeature.skipTests ?? false)}
                      onCheckedChange={(checked) =>
                        setEditingFeature({ ...editingFeature, skipTests: !checked })
                      }
                      data-testid="edit-feature-skip-tests-checkbox"
                    />
                    <Label
                      htmlFor="edit-feature-skip-tests"
                      className="text-xs font-normal cursor-pointer"
                    >
                      Run tests
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-feature-require-approval"
                      checked={requirePlanApproval}
                      onCheckedChange={(checked) => setRequirePlanApproval(!!checked)}
                      disabled={
                        !modelSupportsPlanningMode ||
                        planningMode === 'skip' ||
                        planningMode === 'lite'
                      }
                      data-testid="edit-feature-require-approval-checkbox"
                    />
                    <Label
                      htmlFor="edit-feature-require-approval"
                      className={cn(
                        'text-xs font-normal',
                        !modelSupportsPlanningMode ||
                          planningMode === 'skip' ||
                          planningMode === 'lite'
                          ? 'cursor-not-allowed text-muted-foreground'
                          : 'cursor-pointer'
                      )}
                    >
                      Require approval
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Organization Section */}
          <div className={cardClass}>
            <div className={sectionHeaderClass}>
              <FolderKanban className="w-4 h-4 text-muted-foreground" />
              <span>Organization</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <CategoryAutocomplete
                  value={editingFeature.category}
                  onChange={(value) =>
                    setEditingFeature({
                      ...editingFeature,
                      category: value,
                    })
                  }
                  suggestions={categorySuggestions}
                  placeholder="e.g., Core, UI, API"
                  data-testid="edit-feature-category"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <PrioritySelector
                  selectedPriority={editingFeature.priority ?? 2}
                  onPrioritySelect={(priority) =>
                    setEditingFeature({
                      ...editingFeature,
                      priority,
                    })
                  }
                  testIdPrefix="edit-priority"
                />
              </div>
            </div>

            {/* Work Mode Selector */}
            <div className="pt-2">
              <WorkModeSelector
                workMode={workMode}
                onWorkModeChange={setWorkMode}
                branchName={editingFeature.branchName ?? ''}
                onBranchNameChange={(value) =>
                  setEditingFeature({
                    ...editingFeature,
                    branchName: value,
                  })
                }
                branchSuggestions={branchSuggestions}
                branchCardCounts={branchCardCounts}
                currentBranch={currentBranch}
                disabled={editingFeature.status !== 'backlog'}
                testIdPrefix="edit-feature-work-mode"
              />
            </div>

            {/* Dependencies */}
            {allFeatures.length > 1 && (
              <div className="pt-2 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Parent Dependencies (this feature depends on)
                  </Label>
                  <DependencySelector
                    currentFeatureId={editingFeature.id}
                    value={parentDependencies}
                    onChange={setParentDependencies}
                    features={allFeatures}
                    type="parent"
                    placeholder="Select features this depends on..."
                    data-testid="edit-feature-parent-deps"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Child Dependencies (features that depend on this)
                  </Label>
                  <DependencySelector
                    currentFeatureId={editingFeature.id}
                    value={childDependencies}
                    onChange={setChildDependencies}
                    features={allFeatures}
                    type="child"
                    placeholder="Select features that depend on this..."
                    data-testid="edit-feature-child-deps"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:!justify-between">
          <Button
            variant="outline"
            onClick={() => setShowDependencyTree(true)}
            className="gap-2 h-10"
          >
            <GitBranch className="w-4 h-4" />
            View Dependency Tree
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleUpdate}
              hotkey={{ key: 'Enter', cmdCtrl: true }}
              hotkeyActive={!!editingFeature}
              data-testid="confirm-edit-feature"
              disabled={
                editingFeature.status === 'backlog' &&
                workMode === 'custom' &&
                !editingFeature.branchName?.trim()
              }
            >
              Save Changes
            </HotkeyButton>
          </div>
        </DialogFooter>
      </DialogContent>

      <DependencyTreeDialog
        open={showDependencyTree}
        onClose={() => setShowDependencyTree(false)}
        feature={editingFeature}
        allFeatures={allFeatures}
      />
    </Dialog>
  );
}
