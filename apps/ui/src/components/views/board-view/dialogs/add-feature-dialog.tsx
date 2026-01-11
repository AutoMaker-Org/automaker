// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
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
import { Play, Cpu, FolderKanban } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { modelSupportsThinking } from '@/lib/utils';
import {
  useAppStore,
  ModelAlias,
  ThinkingLevel,
  FeatureImage,
  PlanningMode,
  Feature,
} from '@/store/app-store';
import type { ReasoningEffort, PhaseModelEntry } from '@automaker/types';
import { supportsReasoningEffort, isClaudeModel } from '@automaker/types';
import {
  TestingTabContent,
  PrioritySelector,
  WorkModeSelector,
  PlanningModeSelect,
  AncestorContextSection,
  EnhanceWithAI,
  EnhancementHistoryButton,
  type BaseHistoryEntry,
} from '../shared';
import type { WorkMode } from '../shared';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  workMode: WorkMode;
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
  parentFeature?: Feature | null;
  allFeatures?: Feature[];
}

/**
 * A single entry in the description history
 */
interface DescriptionHistoryEntry extends BaseHistoryEntry {
  description: string;
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
  parentFeature = null,
  allFeatures = [],
}: AddFeatureDialogProps) {
  const isSpawnMode = !!parentFeature;
  const [workMode, setWorkMode] = useState<WorkMode>('current');

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
  const [modelEntry, setModelEntry] = useState<PhaseModelEntry>({ model: 'opus' });

  // Check if current model supports planning mode (Claude/Anthropic only)
  const modelSupportsPlanningMode = isClaudeModel(modelEntry.model);

  // Planning mode state
  const [planningMode, setPlanningMode] = useState<PlanningMode>('skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(false);

  // UI state
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>(() => new Map());
  const [descriptionError, setDescriptionError] = useState(false);

  // Description history state
  const [descriptionHistory, setDescriptionHistory] = useState<DescriptionHistoryEntry[]>([]);

  // Spawn mode state
  const [ancestors, setAncestors] = useState<AncestorContext[]>([]);
  const [selectedAncestorIds, setSelectedAncestorIds] = useState<Set<string>>(new Set());

  // Get defaults from store
  const { defaultPlanningMode, defaultRequirePlanApproval } = useAppStore();

  // Track previous open state to detect when dialog opens
  const wasOpenRef = useRef(false);

  // Sync defaults only when dialog opens (transitions from closed to open)
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;

    if (justOpened) {
      setSkipTests(defaultSkipTests);
      setBranchName(defaultBranch || '');
      setWorkMode('current');
      setPlanningMode(defaultPlanningMode);
      setRequirePlanApproval(defaultRequirePlanApproval);
      setModelEntry({ model: 'opus' });

      // Initialize description history (empty for new feature)
      setDescriptionHistory([]);

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
    parentFeature,
    allFeatures,
  ]);

  const handleModelChange = (entry: PhaseModelEntry) => {
    setModelEntry(entry);
  };

  const buildFeatureData = (): FeatureData | null => {
    if (!description.trim()) {
      setDescriptionError(true);
      return null;
    }

    if (workMode === 'custom' && !branchName.trim()) {
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

    // For 'current' mode, use empty string (work on current branch)
    // For 'auto' mode, use empty string (will be auto-generated in use-board-actions)
    // For 'custom' mode, use the specified branch name
    const finalBranchName = workMode === 'custom' ? branchName || '' : '';

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
      workMode,
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
    setModelEntry({ model: 'opus' });
    setWorkMode('current');
    setPlanningMode(defaultPlanningMode);
    setRequirePlanApproval(defaultRequirePlanApproval);
    setPreviewMap(new Map());
    setDescriptionError(false);
    setDescriptionHistory([]);
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
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Description</Label>
                {/* Version History Button */}
                <EnhancementHistoryButton
                  history={descriptionHistory}
                  currentValue={description}
                  onRestore={setDescription}
                  valueAccessor={(entry) => entry.description}
                  title="Version History"
                  restoreMessage="Description restored from history"
                />
              </div>
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

            {/* Enhancement Section */}
            <EnhanceWithAI
              value={description}
              onChange={setDescription}
              onHistoryAdd={({ mode, originalText, enhancedText }) => {
                const timestamp = new Date().toISOString();
                setDescriptionHistory((prev) => {
                  const newHistory = [...prev];
                  // Add original text first (so user can restore to pre-enhancement state)
                  // Only add if it's different from the last entry to avoid duplicates
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
            <div className={sectionHeaderClass}>
              <Cpu className="w-4 h-4 text-muted-foreground" />
              <span>AI & Execution</span>
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
                    testIdPrefix="add-feature-planning"
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
                            testIdPrefix="add-feature-planning"
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
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-feature-require-approval"
                      checked={requirePlanApproval}
                      onCheckedChange={(checked) => setRequirePlanApproval(!!checked)}
                      disabled={
                        !modelSupportsPlanningMode ||
                        planningMode === 'skip' ||
                        planningMode === 'lite'
                      }
                      data-testid="add-feature-require-approval-checkbox"
                    />
                    <Label
                      htmlFor="add-feature-require-approval"
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

            {/* Work Mode Selector */}
            <div className="pt-2">
              <WorkModeSelector
                workMode={workMode}
                onWorkModeChange={setWorkMode}
                branchName={branchName}
                onBranchNameChange={setBranchName}
                branchSuggestions={branchSuggestions}
                branchCardCounts={branchCardCounts}
                currentBranch={currentBranch}
                testIdPrefix="feature-work-mode"
              />
            </div>
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
              disabled={workMode === 'custom' && !branchName.trim()}
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
            disabled={workMode === 'custom' && !branchName.trim()}
          >
            {isSpawnMode ? 'Spawn Task' : 'Add Feature'}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
