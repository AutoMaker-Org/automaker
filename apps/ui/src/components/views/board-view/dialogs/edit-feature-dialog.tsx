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
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  FeatureTextFilePath as DescriptionTextFilePath,
  ImagePreviewMap,
} from '@/components/ui/description-image-dropzone';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  GitBranch,
  History,
  Cpu,
  FolderKanban,
} from 'lucide-react';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';
import { cn, modelSupportsThinking } from '@/lib/utils';
import {
  Feature,
  ModelAlias,
  ThinkingLevel,
  AIProfile,
  useAppStore,
  PlanningMode,
} from '@/store/app-store';
import type { ReasoningEffort, PhaseModelEntry, DescriptionHistoryEntry } from '@automaker/types';
import {
  TestingTabContent,
  PrioritySelector,
  BranchSelector,
  PlanningModeSelect,
  ProfileTypeahead,
} from '../shared';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import { ModelOverrideTrigger, useModelOverride } from '@/components/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DependencyTreeDialog } from './dependency-tree-dialog';
import {
  isCursorModel,
  isClaudeModel,
  PROVIDER_PREFIXES,
  supportsReasoningEffort,
} from '@automaker/types';
import { useNavigate } from '@tanstack/react-router';

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
    },
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance'
  ) => void;
  categorySuggestions: string[];
  branchSuggestions: string[];
  branchCardCounts?: Record<string, number>; // Map of branch name to unarchived card count
  currentBranch?: string;
  isMaximized: boolean;
  showProfilesOnly: boolean;
  aiProfiles: AIProfile[];
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
  showProfilesOnly,
  aiProfiles,
  allFeatures,
}: EditFeatureDialogProps) {
  const navigate = useNavigate();
  const [editingFeature, setEditingFeature] = useState<Feature | null>(feature);
  const [useCurrentBranch, setUseCurrentBranch] = useState(() => {
    // If feature has no branchName, default to using current branch
    return !feature?.branchName;
  });
  const [editFeaturePreviewMap, setEditFeaturePreviewMap] = useState<ImagePreviewMap>(
    () => new Map()
  );
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<
    'improve' | 'technical' | 'simplify' | 'acceptance'
  >('improve');
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [showDependencyTree, setShowDependencyTree] = useState(false);
  const [planningMode, setPlanningMode] = useState<PlanningMode>(feature?.planningMode ?? 'skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(
    feature?.requirePlanApproval ?? false
  );

  // Model selection state
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>();
  const [modelEntry, setModelEntry] = useState<PhaseModelEntry>(() => ({
    model: (feature?.model as ModelAlias) || 'opus',
    thinkingLevel: feature?.thinkingLevel || 'none',
    reasoningEffort: feature?.reasoningEffort || 'none',
  }));

  // Check if current model supports planning mode (Claude/Anthropic only)
  const modelSupportsPlanningMode = isClaudeModel(modelEntry.model);

  // Track the source of description changes for history
  const [descriptionChangeSource, setDescriptionChangeSource] = useState<
    { source: 'enhance'; mode: 'improve' | 'technical' | 'simplify' | 'acceptance' } | 'edit' | null
  >(null);
  // Track the original description when the dialog opened for comparison
  const [originalDescription, setOriginalDescription] = useState(feature?.description ?? '');
  // Track if history dropdown is open
  const [showHistory, setShowHistory] = useState(false);

  // Get worktrees setting from store
  const { useWorktrees } = useAppStore();

  // Enhancement model override
  const enhancementOverride = useModelOverride({ phase: 'enhancementModel' });

  useEffect(() => {
    setEditingFeature(feature);
    if (feature) {
      setPlanningMode(feature.planningMode ?? 'skip');
      setRequirePlanApproval(feature.requirePlanApproval ?? false);
      // If feature has no branchName, default to using current branch
      setUseCurrentBranch(!feature.branchName);
      // Reset history tracking state
      setOriginalDescription(feature.description ?? '');
      setDescriptionChangeSource(null);
      setShowHistory(false);
      setEnhanceOpen(false);
      // Reset model entry
      setModelEntry({
        model: (feature.model as ModelAlias) || 'opus',
        thinkingLevel: feature.thinkingLevel || 'none',
        reasoningEffort: feature.reasoningEffort || 'none',
      });
      setSelectedProfileId(undefined);
    } else {
      setEditFeaturePreviewMap(new Map());
      setDescriptionChangeSource(null);
      setShowHistory(false);
    }
  }, [feature]);

  const applyProfileToModel = (profile: AIProfile) => {
    if (profile.provider === 'cursor') {
      const cursorModel = `${PROVIDER_PREFIXES.cursor}${profile.cursorModel || 'auto'}`;
      setModelEntry({ model: cursorModel as ModelAlias });
    } else if (profile.provider === 'codex') {
      setModelEntry({
        model: profile.codexModel || 'codex-gpt-5.2-codex',
        reasoningEffort: 'none',
      });
    } else if (profile.provider === 'opencode') {
      setModelEntry({ model: profile.opencodeModel || 'opencode/big-pickle' });
    } else {
      // Claude
      setModelEntry({
        model: profile.model || 'sonnet',
        thinkingLevel: profile.thinkingLevel || 'none',
      });
    }
  };

  const handleProfileSelect = (profile: AIProfile) => {
    setSelectedProfileId(profile.id);
    applyProfileToModel(profile);
  };

  const handleModelChange = (entry: PhaseModelEntry) => {
    setModelEntry(entry);
    // Clear profile selection when manually changing model
    setSelectedProfileId(undefined);
  };

  const handleUpdate = () => {
    if (!editingFeature) return;

    // Validate branch selection when "other branch" is selected and branch selector is enabled
    const isBranchSelectorEnabled = editingFeature.status === 'backlog';
    if (
      useWorktrees &&
      isBranchSelectorEnabled &&
      !useCurrentBranch &&
      !editingFeature.branchName?.trim()
    ) {
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

    // Use current branch if toggle is on
    // If currentBranch is provided (non-primary worktree), use it
    // Otherwise (primary worktree), use empty string which means "unassigned" (show only on primary)
    const finalBranchName = useCurrentBranch
      ? currentBranch || ''
      : editingFeature.branchName || '';

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

    onUpdate(editingFeature.id, updates, historySource, historyEnhancementMode);
    setEditFeaturePreviewMap(new Map());
    onClose();
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleEnhanceDescription = async () => {
    if (!editingFeature?.description.trim() || isEnhancing) return;

    setIsEnhancing(true);
    try {
      const api = getElectronAPI();
      const result = await api.enhancePrompt?.enhance(
        editingFeature.description,
        enhancementMode,
        enhancementOverride.effectiveModel, // API accepts string, extract from PhaseModelEntry
        enhancementOverride.effectiveModelEntry.thinkingLevel // Pass thinking level
      );

      if (result?.success && result.enhancedText) {
        const enhancedText = result.enhancedText;
        setEditingFeature((prev) => (prev ? { ...prev, description: enhancedText } : prev));
        // Track that this change was from enhancement
        setDescriptionChangeSource({ source: 'enhance', mode: enhancementMode });
        toast.success('Description enhanced!');
      } else {
        toast.error(result?.error || 'Failed to enhance description');
      }
    } catch (error) {
      logger.error('Enhancement failed:', error);
      toast.error('Failed to enhance description');
    } finally {
      setIsEnhancing(false);
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
                {/* Version History Button */}
                {feature?.descriptionHistory && feature.descriptionHistory.length > 0 && (
                  <Popover open={showHistory} onOpenChange={setShowHistory}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground"
                      >
                        <History className="w-3.5 h-3.5" />
                        History ({feature.descriptionHistory.length})
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="end">
                      <div className="p-3 border-b">
                        <h4 className="font-medium text-sm">Version History</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Click a version to restore it
                        </p>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                        {[...(feature.descriptionHistory || [])]
                          .reverse()
                          .map((entry: DescriptionHistoryEntry, index: number) => {
                            const isCurrentVersion =
                              entry.description === editingFeature.description;
                            const date = new Date(entry.timestamp);
                            const formattedDate = date.toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            const sourceLabel =
                              entry.source === 'initial'
                                ? 'Original'
                                : entry.source === 'enhance'
                                  ? `Enhanced (${entry.enhancementMode || 'improve'})`
                                  : 'Edited';

                            return (
                              <button
                                key={`${entry.timestamp}-${index}`}
                                onClick={() => {
                                  setEditingFeature((prev) =>
                                    prev ? { ...prev, description: entry.description } : prev
                                  );
                                  // Mark as edit since user is restoring from history
                                  setDescriptionChangeSource('edit');
                                  setShowHistory(false);
                                  toast.success('Description restored from history');
                                }}
                                className={`w-full text-left p-2 rounded-md hover:bg-muted transition-colors ${
                                  isCurrentVersion ? 'bg-muted/50 border border-primary/20' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium">{sourceLabel}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formattedDate}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {entry.description.slice(0, 100)}
                                  {entry.description.length > 100 ? '...' : ''}
                                </p>
                                {isCurrentVersion && (
                                  <span className="text-xs text-primary font-medium mt-1 block">
                                    Current version
                                  </span>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
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

            {/* Collapsible Enhancement Section */}
            <Collapsible open={enhanceOpen} onOpenChange={setEnhanceOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-1">
                  {enhanceOpen ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <Sparkles className="w-4 h-4" />
                  <span>Enhance with AI</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs">
                        {enhancementMode === 'improve' && 'Improve Clarity'}
                        {enhancementMode === 'technical' && 'Add Technical Details'}
                        {enhancementMode === 'simplify' && 'Simplify'}
                        {enhancementMode === 'acceptance' && 'Add Acceptance Criteria'}
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => setEnhancementMode('improve')}>
                        Improve Clarity
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEnhancementMode('technical')}>
                        Add Technical Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEnhancementMode('simplify')}>
                        Simplify
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEnhancementMode('acceptance')}>
                        Add Acceptance Criteria
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleEnhanceDescription}
                    disabled={!editingFeature.description.trim() || isEnhancing}
                    loading={isEnhancing}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Enhance
                  </Button>

                  <ModelOverrideTrigger
                    currentModelEntry={enhancementOverride.effectiveModelEntry}
                    onModelChange={enhancementOverride.setOverride}
                    phase="enhancementModel"
                    isOverridden={enhancementOverride.isOverridden}
                    size="sm"
                    variant="icon"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* AI & Execution Section */}
          <div className={cardClass}>
            <div className={sectionHeaderClass}>
              <Cpu className="w-4 h-4 text-muted-foreground" />
              <span>AI & Execution</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Profile</Label>
                <ProfileTypeahead
                  profiles={aiProfiles}
                  selectedProfileId={selectedProfileId}
                  onSelect={handleProfileSelect}
                  placeholder="Select profile..."
                  showManageLink
                  onManageLinkClick={() => {
                    onClose();
                    navigate({ to: '/profiles' });
                  }}
                  testIdPrefix="edit-feature-profile"
                />
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
            </div>

            <div
              className={cn(
                'grid gap-3',
                modelSupportsPlanningMode ? 'grid-cols-2' : 'grid-cols-1'
              )}
            >
              {modelSupportsPlanningMode && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Planning</Label>
                  <PlanningModeSelect
                    mode={planningMode}
                    onModeChange={setPlanningMode}
                    testIdPrefix="edit-feature-planning"
                    compact
                  />
                </div>
              )}
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
                  {modelSupportsPlanningMode && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="edit-feature-require-approval"
                        checked={requirePlanApproval}
                        onCheckedChange={(checked) => setRequirePlanApproval(!!checked)}
                        disabled={planningMode === 'skip' || planningMode === 'lite'}
                        data-testid="edit-feature-require-approval-checkbox"
                      />
                      <Label
                        htmlFor="edit-feature-require-approval"
                        className={cn(
                          'text-xs font-normal',
                          planningMode === 'skip' || planningMode === 'lite'
                            ? 'cursor-not-allowed text-muted-foreground'
                            : 'cursor-pointer'
                        )}
                      >
                        Require approval
                      </Label>
                    </div>
                  )}
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

            {/* Branch Selector */}
            {useWorktrees && (
              <div className="pt-2">
                <BranchSelector
                  useCurrentBranch={useCurrentBranch}
                  onUseCurrentBranchChange={setUseCurrentBranch}
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
                  testIdPrefix="edit-feature"
                />
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
                useWorktrees &&
                editingFeature.status === 'backlog' &&
                !useCurrentBranch &&
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
