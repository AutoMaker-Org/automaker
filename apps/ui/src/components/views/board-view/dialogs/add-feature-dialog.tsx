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
import { Sparkles, ChevronDown, ChevronRight, Play, Cpu, FolderKanban } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { modelSupportsThinking } from '@/lib/utils';
import {
  useAppStore,
  ModelAlias,
  ThinkingLevel,
  FeatureImage,
  AIProfile,
  PlanningMode,
  Feature,
} from '@/store/app-store';
import type { ReasoningEffort, PhaseModelEntry } from '@automaker/types';
import {
  supportsReasoningEffort,
  PROVIDER_PREFIXES,
  isCursorModel,
  isClaudeModel,
} from '@automaker/types';
import {
  TestingTabContent,
  PrioritySelector,
  BranchSelector,
  PlanningModeSelect,
  AncestorContextSection,
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
import { useNavigate } from '@tanstack/react-router';
import {
  getAncestors,
  formatAncestorContextForPrompt,
  type AncestorContext,
} from '@automaker/dependency-resolver';

const logger = createLogger('AddFeatureDialog');

type FeatureData = {
  title: string;
  category: string;
  description: string;
  images: FeatureImage[];
  imagePaths: DescriptionImagePath[];
  textFilePaths: DescriptionTextFilePath[];
  skipTests: boolean;
  model: AgentModel;
  thinkingLevel: ThinkingLevel;
  reasoningEffort: ReasoningEffort;
  branchName: string;
  priority: number;
  planningMode: PlanningMode;
  requirePlanApproval: boolean;
  dependencies?: string[];
};

interface AddFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (feature: FeatureData) => void;
  onAddAndStart?: (feature: FeatureData) => void;
  categorySuggestions: string[];
  branchSuggestions: string[];
  branchCardCounts?: Record<string, number>;
  defaultSkipTests: boolean;
  defaultBranch?: string;
  currentBranch?: string;
  isMaximized: boolean;
  showProfilesOnly: boolean;
  aiProfiles: AIProfile[];
  parentFeature?: Feature | null;
  allFeatures?: Feature[];
}

export function AddFeatureDialog({
  open,
  onOpenChange,
  onAdd,
  onAddAndStart,
  categorySuggestions,
  branchSuggestions,
  branchCardCounts,
  defaultSkipTests,
  defaultBranch = 'main',
  currentBranch,
  isMaximized,
  showProfilesOnly,
  aiProfiles,
  parentFeature = null,
  allFeatures = [],
}: AddFeatureDialogProps) {
  const isSpawnMode = !!parentFeature;
  const navigate = useNavigate();
  const [useCurrentBranch, setUseCurrentBranch] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<FeatureImage[]>([]);
  const [imagePaths, setImagePaths] = useState<DescriptionImagePath[]>([]);
  const [textFilePaths, setTextFilePaths] = useState<DescriptionTextFilePath[]>([]);
  const [skipTests, setSkipTests] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [priority, setPriority] = useState(2);

  // Model selection state
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>();
  const [modelEntry, setModelEntry] = useState<PhaseModelEntry>({ model: 'opus' });

  // Check if current model supports planning mode (Claude/Anthropic only)
  const modelSupportsPlanningMode = isClaudeModel(modelEntry.model);

  // Planning mode state
  const [planningMode, setPlanningMode] = useState<PlanningMode>('skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(false);

  // UI state
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>(() => new Map());
  const [descriptionError, setDescriptionError] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<
    'improve' | 'technical' | 'simplify' | 'acceptance'
  >('improve');
  const [enhanceOpen, setEnhanceOpen] = useState(false);

  // Spawn mode state
  const [ancestors, setAncestors] = useState<AncestorContext[]>([]);
  const [selectedAncestorIds, setSelectedAncestorIds] = useState<Set<string>>(new Set());

  // Get defaults from store
  const { defaultPlanningMode, defaultRequirePlanApproval, defaultAIProfileId, useWorktrees } =
    useAppStore();

  // Enhancement model override
  const enhancementOverride = useModelOverride({ phase: 'enhancementModel' });

  // Sync defaults when dialog opens
  useEffect(() => {
    if (open) {
      const defaultProfile = defaultAIProfileId
        ? aiProfiles.find((p) => p.id === defaultAIProfileId)
        : null;

      setSkipTests(defaultSkipTests);
      setBranchName(defaultBranch || '');
      setUseCurrentBranch(true);
      setPlanningMode(defaultPlanningMode);
      setRequirePlanApproval(defaultRequirePlanApproval);

      // Set model from default profile or fallback
      if (defaultProfile) {
        setSelectedProfileId(defaultProfile.id);
        applyProfileToModel(defaultProfile);
      } else {
        setSelectedProfileId(undefined);
        setModelEntry({ model: 'opus' });
      }

      // Initialize ancestors for spawn mode
      if (parentFeature) {
        const ancestorList = getAncestors(parentFeature, allFeatures);
        setAncestors(ancestorList);
        setSelectedAncestorIds(new Set([parentFeature.id]));
      } else {
        setAncestors([]);
        setSelectedAncestorIds(new Set());
      }
    }
  }, [
    open,
    defaultSkipTests,
    defaultBranch,
    defaultPlanningMode,
    defaultRequirePlanApproval,
    defaultAIProfileId,
    aiProfiles,
    parentFeature,
    allFeatures,
  ]);

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

  const buildFeatureData = (): FeatureData | null => {
    if (!description.trim()) {
      setDescriptionError(true);
      return null;
    }

    if (useWorktrees && !useCurrentBranch && !branchName.trim()) {
      toast.error('Please select a branch name');
      return null;
    }

    const finalCategory = category || 'Uncategorized';
    const selectedModel = modelEntry.model;
    const normalizedThinking = modelSupportsThinking(selectedModel)
      ? modelEntry.thinkingLevel || 'none'
      : 'none';
    const normalizedReasoning = supportsReasoningEffort(selectedModel)
      ? modelEntry.reasoningEffort || 'none'
      : 'none';

    const finalBranchName = useCurrentBranch ? currentBranch || '' : branchName || '';

    // Build final description with ancestor context in spawn mode
    let finalDescription = description;
    if (isSpawnMode && parentFeature && selectedAncestorIds.size > 0) {
      const parentContext: AncestorContext = {
        id: parentFeature.id,
        title: parentFeature.title,
        description: parentFeature.description,
        spec: parentFeature.spec,
        summary: parentFeature.summary,
        depth: -1,
      };

      const allAncestorsWithParent = [parentContext, ...ancestors];
      const contextText = formatAncestorContextForPrompt(
        allAncestorsWithParent,
        selectedAncestorIds
      );

      if (contextText) {
        finalDescription = `${contextText}\n\n---\n\n## Task Description\n\n${description}`;
      }
    }

    return {
      title,
      category: finalCategory,
      description: finalDescription,
      images,
      imagePaths,
      textFilePaths,
      skipTests,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      reasoningEffort: normalizedReasoning,
      branchName: finalBranchName,
      priority,
      planningMode,
      requirePlanApproval,
      dependencies: isSpawnMode && parentFeature ? [parentFeature.id] : undefined,
    };
  };

  const resetForm = () => {
    setTitle('');
    setCategory('');
    setDescription('');
    setImages([]);
    setImagePaths([]);
    setTextFilePaths([]);
    setSkipTests(defaultSkipTests);
    setBranchName('');
    setPriority(2);
    setSelectedProfileId(undefined);
    setModelEntry({ model: 'opus' });
    setUseCurrentBranch(true);
    setPlanningMode(defaultPlanningMode);
    setRequirePlanApproval(defaultRequirePlanApproval);
    setPreviewMap(new Map());
    setDescriptionError(false);
    setEnhanceOpen(false);
    onOpenChange(false);
  };

  const handleAction = (actionFn?: (data: FeatureData) => void) => {
    if (!actionFn) return;
    const featureData = buildFeatureData();
    if (!featureData) return;
    actionFn(featureData);
    resetForm();
  };

  const handleAdd = () => handleAction(onAdd);
  const handleAddAndStart = () => handleAction(onAddAndStart);

  const handleDialogClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setPreviewMap(new Map());
      setDescriptionError(false);
    }
  };

  const handleEnhanceDescription = async () => {
    if (!description.trim() || isEnhancing) return;

    setIsEnhancing(true);
    try {
      const api = getElectronAPI();
      const result = await api.enhancePrompt?.enhance(
        description,
        enhancementMode,
        enhancementOverride.effectiveModel,
        enhancementOverride.effectiveModelEntry.thinkingLevel
      );

      if (result?.success && result.enhancedText) {
        setDescription(result.enhancedText);
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

  // Shared card styling
  const cardClass = 'rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3';
  const sectionHeaderClass = 'flex items-center gap-2 text-sm font-medium text-foreground';

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent
        compact={!isMaximized}
        data-testid="add-feature-dialog"
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
          <DialogTitle>{isSpawnMode ? 'Spawn Sub-Task' : 'Add New Feature'}</DialogTitle>
          <DialogDescription>
            {isSpawnMode
              ? `Create a sub-task that depends on "${parentFeature?.title || parentFeature?.description.slice(0, 50)}..."`
              : 'Create a new feature card for the Kanban board.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Ancestor Context Section - only in spawn mode */}
          {isSpawnMode && parentFeature && (
            <AncestorContextSection
              parentFeature={{
                id: parentFeature.id,
                title: parentFeature.title,
                description: parentFeature.description,
                spec: parentFeature.spec,
                summary: parentFeature.summary,
              }}
              ancestors={ancestors}
              selectedAncestorIds={selectedAncestorIds}
              onSelectionChange={setSelectedAncestorIds}
            />
          )}

          {/* Task Details Section */}
          <div className={cardClass}>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <DescriptionImageDropZone
                value={description}
                onChange={(value) => {
                  setDescription(value);
                  if (value.trim()) setDescriptionError(false);
                }}
                images={imagePaths}
                onImagesChange={setImagePaths}
                textFiles={textFilePaths}
                onTextFilesChange={setTextFilePaths}
                placeholder="Describe the feature..."
                previewMap={previewMap}
                onPreviewMapChange={setPreviewMap}
                autoFocus
                error={descriptionError}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave blank to auto-generate"
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
                    disabled={!description.trim() || isEnhancing}
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
                    onOpenChange(false);
                    navigate({ to: '/profiles' });
                  }}
                  testIdPrefix="add-feature-profile"
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
                    testIdPrefix="add-feature-planning"
                    compact
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Options</Label>
                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-feature-skip-tests"
                      checked={!skipTests}
                      onCheckedChange={(checked) => setSkipTests(!checked)}
                      data-testid="add-feature-skip-tests-checkbox"
                    />
                    <Label
                      htmlFor="add-feature-skip-tests"
                      className="text-xs font-normal cursor-pointer"
                    >
                      Run tests
                    </Label>
                  </div>
                  {modelSupportsPlanningMode && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="add-feature-require-approval"
                        checked={requirePlanApproval}
                        onCheckedChange={(checked) => setRequirePlanApproval(!!checked)}
                        disabled={planningMode === 'skip' || planningMode === 'lite'}
                        data-testid="add-feature-require-approval-checkbox"
                      />
                      <Label
                        htmlFor="add-feature-require-approval"
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
                  value={category}
                  onChange={setCategory}
                  suggestions={categorySuggestions}
                  placeholder="e.g., Core, UI, API"
                  data-testid="feature-category-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <PrioritySelector
                  selectedPriority={priority}
                  onPrioritySelect={setPriority}
                  testIdPrefix="priority"
                />
              </div>
            </div>

            {/* Branch Selector */}
            {useWorktrees && (
              <div className="pt-2">
                <BranchSelector
                  useCurrentBranch={useCurrentBranch}
                  onUseCurrentBranchChange={setUseCurrentBranch}
                  branchName={branchName}
                  onBranchNameChange={setBranchName}
                  branchSuggestions={branchSuggestions}
                  branchCardCounts={branchCardCounts}
                  currentBranch={currentBranch}
                  testIdPrefix="feature"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {onAddAndStart && (
            <Button
              onClick={handleAddAndStart}
              variant="secondary"
              data-testid="confirm-add-and-start-feature"
              disabled={useWorktrees && !useCurrentBranch && !branchName.trim()}
            >
              <Play className="w-4 h-4 mr-2" />
              Make
            </Button>
          )}
          <HotkeyButton
            onClick={handleAdd}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            data-testid="confirm-add-feature"
            disabled={useWorktrees && !useCurrentBranch && !branchName.trim()}
          >
            {isSpawnMode ? 'Spawn Task' : 'Add Feature'}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
