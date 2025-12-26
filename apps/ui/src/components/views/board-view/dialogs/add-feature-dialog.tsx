import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import {
  MessageSquare,
  Settings2,
  SlidersHorizontal,
  FlaskConical,
  Sparkles,
  ChevronDown,
  Server,
} from 'lucide-react';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';
import { modelSupportsThinking } from '@/lib/utils';
import {
  useAppStore,
  AgentModel,
  ThinkingLevel,
  FeatureImage,
  AIProfile,
  PlanningMode,
  Feature,
} from '@/store/app-store';
import {
  ModelSelector,
  ThinkingLevelSelector,
  ProfileQuickSelect,
  TestingTabContent,
  PrioritySelector,
  BranchSelector,
  PlanningModeSelector,
  AncestorContextSection,
  WorktreeCategorySelector,
} from '../shared';
import type { WorktreeCategory } from '@automaker/types';
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

interface AddFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (feature: {
    title: string;
    category: string;
    description: string;
    images: FeatureImage[];
    imagePaths: DescriptionImagePath[];
    textFilePaths: DescriptionTextFilePath[];
    skipTests: boolean;
    model: AgentModel;
    planningModel?: AgentModel;
    thinkingLevel: ThinkingLevel;
    branchName: string; // Can be empty string to use current branch
    priority: number;
    planningMode: PlanningMode;
    requirePlanApproval: boolean;
    dependencies?: string[];
    implementationEndpointPreset?: 'default' | 'zai' | 'custom';
    implementationEndpointUrl?: string;
    enabledMcpServers?: string[];
    worktreeCategory?: WorktreeCategory;
  }) => void;
  categorySuggestions?: string[];
  branchSuggestions?: string[];
  branchCardCounts?: Record<string, number>;
  defaultSkipTests?: boolean;
  defaultBranch?: string;
  currentBranch?: string;
  isMaximized?: boolean;
  showProfilesOnly?: boolean;
  aiProfiles?: AIProfile[];
  // Spawn task mode props
  parentFeature?: Feature | null;
  allFeatures?: Feature[];
}

export function AddFeatureDialog({
  open,
  onOpenChange,
  onAdd,
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
  const [newFeature, setNewFeature] = useState({
    title: '',
    category: '',
    description: '',
    images: [] as FeatureImage[],
    imagePaths: [] as DescriptionImagePath[],
    textFilePaths: [] as DescriptionTextFilePath[],
    skipTests: false,
    model: 'opus' as AgentModel,
    planningModel: 'opus' as AgentModel,
    thinkingLevel: 'none' as ThinkingLevel,
    branchName: '',
    priority: 2 as number, // Default to medium priority
    implementationEndpointPreset: undefined as 'default' | 'zai' | 'custom' | undefined,
  });
  const [newFeaturePreviewMap, setNewFeaturePreviewMap] = useState<ImagePreviewMap>(
    () => new Map()
  );
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [descriptionError, setDescriptionError] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<
    'improve' | 'technical' | 'simplify' | 'acceptance'
  >('improve');
  const [planningMode, setPlanningMode] = useState<PlanningMode>('skip');
  const [requirePlanApproval, setRequirePlanApproval] = useState(false);
  const [enabledMcpServers, setEnabledMcpServers] = useState<string[]>([]);
  const [worktreeCategory, setWorktreeCategory] = useState<WorktreeCategory>('feature');

  // Spawn mode state
  const [ancestors, setAncestors] = useState<AncestorContext[]>([]);
  const [selectedAncestorIds, setSelectedAncestorIds] = useState<Set<string>>(new Set());

  // Get enhancement model, planning mode defaults, and worktrees setting from store
  const {
    enhancementModel,
    defaultPlanningMode,
    defaultRequirePlanApproval,
    defaultAIProfileId,
    useWorktrees,
    mcpServers,
  } = useAppStore();

  // Sync defaults when dialog opens
  useEffect(() => {
    if (open) {
      // Find the default profile if one is set
      const defaultProfile = defaultAIProfileId
        ? aiProfiles.find((p) => p.id === defaultAIProfileId)
        : null;

      setNewFeature((prev) => ({
        ...prev,
        skipTests: defaultSkipTests,
        branchName: defaultBranch || '',
        // Use default profile's model/thinkingLevel if set, else fallback to defaults
        model: defaultProfile?.model ?? 'opus',
        planningModel: defaultProfile?.planningModel ?? defaultProfile?.model ?? 'opus',
        thinkingLevel: defaultProfile?.thinkingLevel ?? 'none',
        implementationEndpointPreset: defaultProfile?.implementationEndpointPreset ?? 'default',
      }));
      setUseCurrentBranch(true);
      setPlanningMode(defaultPlanningMode);
      setRequirePlanApproval(defaultRequirePlanApproval);
      // Initialize enabled MCP servers from global defaults
      setEnabledMcpServers(mcpServers.filter((s) => s.enabled).map((s) => s.id));
      setWorktreeCategory('feature'); // Default to feature category

      // Initialize ancestors for spawn mode
      if (parentFeature) {
        const ancestorList = getAncestors(parentFeature, allFeatures);
        setAncestors(ancestorList);
        // Only select parent by default - ancestors are optional context
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
    mcpServers,
    parentFeature,
    allFeatures,
  ]);

  const handleAdd = () => {
    if (!newFeature.description.trim()) {
      setDescriptionError(true);
      return;
    }

    // Validate branch selection when "other branch" is selected
    if (useWorktrees && !useCurrentBranch && !newFeature.branchName.trim()) {
      toast.error('Please select a branch name');
      return;
    }

    const category = newFeature.category || 'Uncategorized';
    const selectedModel = newFeature.model;
    const normalizedThinking = modelSupportsThinking(selectedModel)
      ? newFeature.thinkingLevel
      : 'none';

    // Use current branch if toggle is on
    // If currentBranch is provided (non-primary worktree), use it
    // Otherwise (primary worktree), use empty string which means "unassigned" (show only on primary)
    const finalBranchName = useCurrentBranch ? currentBranch || '' : newFeature.branchName || '';

    // Build final description - prepend ancestor context in spawn mode
    let finalDescription = newFeature.description;
    if (isSpawnMode && parentFeature && selectedAncestorIds.size > 0) {
      // Create parent context as an AncestorContext
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
        finalDescription = `${contextText}\n\n---\n\n## Task Description\n\n${newFeature.description}`;
      }
    }

    onAdd({
      title: newFeature.title,
      category,
      description: finalDescription,
      images: newFeature.images,
      imagePaths: newFeature.imagePaths,
      textFilePaths: newFeature.textFilePaths,
      skipTests: newFeature.skipTests,
      model: selectedModel,
      planningModel: newFeature.planningModel,
      thinkingLevel: normalizedThinking,
      branchName: finalBranchName,
      priority: newFeature.priority,
      planningMode,
      requirePlanApproval,
      // In spawn mode, automatically add parent as dependency
      dependencies: isSpawnMode && parentFeature ? [parentFeature.id] : undefined,
      implementationEndpointPreset: newFeature.implementationEndpointPreset,
      implementationEndpointUrl: newFeature.implementationEndpointUrl,
      enabledMcpServers,
      worktreeCategory: useWorktrees ? worktreeCategory : undefined,
    });

    // Reset form
    setNewFeature({
      title: '',
      category: '',
      description: '',
      images: [],
      imagePaths: [],
      textFilePaths: [],
      skipTests: defaultSkipTests,
      model: 'opus',
      planningModel: 'opus',
      priority: 2,
      thinkingLevel: 'none',
      branchName: '',
      implementationEndpointPreset: undefined,
    });
    setUseCurrentBranch(true);
    setPlanningMode(defaultPlanningMode);
    setRequirePlanApproval(defaultRequirePlanApproval);
    setEnabledMcpServers(mcpServers.filter((s) => s.enabled).map((s) => s.id));
    setWorktreeCategory('feature');
    setNewFeaturePreviewMap(new Map());
    setShowAdvancedOptions(false);
    setDescriptionError(false);
    onOpenChange(false);
  };

  const handleDialogClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setNewFeaturePreviewMap(new Map());
      setShowAdvancedOptions(false);
      setDescriptionError(false);
    }
  };

  const handleEnhanceDescription = async () => {
    if (!newFeature.description.trim() || isEnhancing) return;

    setIsEnhancing(true);
    try {
      const api = getElectronAPI();
      const result = await api.enhancePrompt?.enhance(
        newFeature.description,
        enhancementMode,
        enhancementModel
      );

      if (result?.success && result.enhancedText) {
        const enhancedText = result.enhancedText;
        setNewFeature((prev) => ({ ...prev, description: enhancedText }));
        toast.success('Description enhanced!');
      } else {
        toast.error(result?.error || 'Failed to enhance description');
      }
    } catch (error) {
      console.error('Enhancement failed:', error);
      toast.error('Failed to enhance description');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleModelSelect = (model: AgentModel) => {
    setNewFeature({
      ...newFeature,
      model,
      thinkingLevel: modelSupportsThinking(model) ? newFeature.thinkingLevel : 'none',
      // Auto-default to Z.AI endpoint for GLM-4.7
      implementationEndpointPreset: model === 'glm-4.7' ? 'zai' : 'default',
    });
  };

  const handleProfileSelect = (
    model: AgentModel,
    planningModel: AgentModel,
    thinkingLevel: ThinkingLevel,
    implementationEndpointPreset?: 'default' | 'zai' | 'custom'
  ) => {
    setNewFeature({
      ...newFeature,
      model,
      planningModel: planningModel || model,
      thinkingLevel,
      implementationEndpointPreset,
    });
  };

  const newModelAllowsThinking = modelSupportsThinking(newFeature.model);

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
        <Tabs defaultValue="prompt" className="py-4 flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="prompt" data-testid="tab-prompt">
              <MessageSquare className="w-4 h-4 mr-2" />
              Prompt
            </TabsTrigger>
            <TabsTrigger value="model" data-testid="tab-model">
              <Settings2 className="w-4 h-4 mr-2" />
              Model
            </TabsTrigger>
            <TabsTrigger value="options" data-testid="tab-options">
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Options
            </TabsTrigger>
          </TabsList>

          {/* Prompt Tab */}
          <TabsContent value="prompt" className="space-y-4 overflow-y-auto cursor-default">
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

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <DescriptionImageDropZone
                value={newFeature.description}
                onChange={(value) => {
                  setNewFeature({ ...newFeature, description: value });
                  if (value.trim()) {
                    setDescriptionError(false);
                  }
                }}
                images={newFeature.imagePaths}
                onImagesChange={(images) => setNewFeature({ ...newFeature, imagePaths: images })}
                textFiles={newFeature.textFilePaths}
                onTextFilesChange={(textFiles) =>
                  setNewFeature({ ...newFeature, textFilePaths: textFiles })
                }
                placeholder="Describe the feature..."
                previewMap={newFeaturePreviewMap}
                onPreviewMapChange={setNewFeaturePreviewMap}
                autoFocus
                error={descriptionError}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={newFeature.title}
                onChange={(e) => setNewFeature({ ...newFeature, title: e.target.value })}
                placeholder="Leave blank to auto-generate"
              />
            </div>
            <div className="flex w-fit items-center gap-3 select-none cursor-default">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[200px] justify-between">
                    {enhancementMode === 'improve' && 'Improve Clarity'}
                    {enhancementMode === 'technical' && 'Add Technical Details'}
                    {enhancementMode === 'simplify' && 'Simplify'}
                    {enhancementMode === 'acceptance' && 'Add Acceptance Criteria'}
                    <ChevronDown className="w-4 h-4 ml-2" />
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
                variant="outline"
                size="sm"
                onClick={handleEnhanceDescription}
                disabled={!newFeature.description.trim() || isEnhancing}
                loading={isEnhancing}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Enhance with AI
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category (optional)</Label>
              <CategoryAutocomplete
                value={newFeature.category}
                onChange={(value) => setNewFeature({ ...newFeature, category: value })}
                suggestions={categorySuggestions}
                placeholder="e.g., Core, UI, API"
                data-testid="feature-category-input"
              />
            </div>
            {useWorktrees && (
              <BranchSelector
                useCurrentBranch={useCurrentBranch}
                onUseCurrentBranchChange={setUseCurrentBranch}
                branchName={newFeature.branchName}
                onBranchNameChange={(value) => setNewFeature({ ...newFeature, branchName: value })}
                branchSuggestions={branchSuggestions}
                branchCardCounts={branchCardCounts}
                currentBranch={currentBranch}
                testIdPrefix="feature"
              />
            )}

            {/* Worktree Category Selector - only show when worktrees are enabled */}
            {useWorktrees && (
              <WorktreeCategorySelector
                selectedCategory={worktreeCategory}
                onCategorySelect={setWorktreeCategory}
                testIdPrefix="add-feature"
              />
            )}

            {/* Priority Selector */}
            <PrioritySelector
              selectedPriority={newFeature.priority}
              onPrioritySelect={(priority) => setNewFeature({ ...newFeature, priority })}
              testIdPrefix="priority"
            />
          </TabsContent>

          {/* Model Tab */}
          <TabsContent value="model" className="space-y-4 overflow-y-auto cursor-default">
            {/* Show Advanced Options Toggle */}
            {showProfilesOnly && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Simple Mode Active</p>
                  <p className="text-xs text-muted-foreground">
                    Only showing AI profiles. Advanced model tweaking is hidden.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  data-testid="show-advanced-options-toggle"
                >
                  <Settings2 className="w-4 h-4 mr-2" />
                  {showAdvancedOptions ? 'Hide' : 'Show'} Advanced
                </Button>
              </div>
            )}

            {/* Quick Select Profile Section */}
            <ProfileQuickSelect
              profiles={aiProfiles}
              selectedModel={newFeature.model}
              selectedPlanningModel={newFeature.planningModel}
              selectedThinkingLevel={newFeature.thinkingLevel}
              selectedImplementationEndpointPreset={newFeature.implementationEndpointPreset}
              onSelect={handleProfileSelect}
              showManageLink
              onManageLinkClick={() => {
                onOpenChange(false);
                navigate({ to: '/profiles' });
              }}
            />

            {/* Separator */}
            {aiProfiles.length > 0 && (!showProfilesOnly || showAdvancedOptions) && (
              <div className="border-t border-border" />
            )}

            {/* Claude Models Section */}
            {(!showProfilesOnly || showAdvancedOptions) && (
              <>
                <ModelSelector selectedModel={newFeature.model} onModelSelect={handleModelSelect} />
                {newModelAllowsThinking && (
                  <ThinkingLevelSelector
                    selectedLevel={newFeature.thinkingLevel}
                    onLevelSelect={(level) =>
                      setNewFeature({ ...newFeature, thinkingLevel: level })
                    }
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* Options Tab */}
          <TabsContent value="options" className="space-y-4 overflow-y-auto cursor-default">
            {/* Planning Mode Section */}
            <PlanningModeSelector
              mode={planningMode}
              onModeChange={setPlanningMode}
              requireApproval={requirePlanApproval}
              onRequireApprovalChange={setRequirePlanApproval}
              featureDescription={newFeature.description}
              testIdPrefix="add-feature"
              compact
            />

            <div className="border-t border-border my-4" />

            {/* Testing Section */}
            <TestingTabContent
              skipTests={newFeature.skipTests}
              onSkipTestsChange={(skipTests) => setNewFeature({ ...newFeature, skipTests })}
            />

            <div className="border-t border-border my-4" />

            {/* MCP Servers Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">MCP Servers</Label>
              </div>
              {mcpServers.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  <p>No MCP servers configured.</p>
                  <p className="mt-1">
                    <Button
                      variant="link"
                      className="h-auto p-0 text-brand-500"
                      onClick={() => {
                        onOpenChange(false);
                        navigate({ to: '/settings', search: { section: 'mcp' } });
                      }}
                    >
                      Add MCP servers in Settings
                    </Button>{' '}
                    to extend Claude's capabilities.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Select which MCP servers to enable for this feature.
                  </p>
                  <div className="space-y-2">
                    {mcpServers.map((server) => (
                      <div key={server.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`mcp-${server.id}`}
                          checked={enabledMcpServers.includes(server.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEnabledMcpServers([...enabledMcpServers, server.id]);
                            } else {
                              setEnabledMcpServers(
                                enabledMcpServers.filter((id) => id !== server.id)
                              );
                            }
                          }}
                          data-testid={`mcp-server-${server.id}`}
                        />
                        <Label
                          htmlFor={`mcp-${server.id}`}
                          className="text-sm cursor-pointer flex items-center gap-2"
                        >
                          {server.name}
                          {server.description && (
                            <span className="text-xs text-muted-foreground">
                              — {server.description}
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <HotkeyButton
            onClick={handleAdd}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            data-testid="confirm-add-feature"
            disabled={useWorktrees && !useCurrentBranch && !newFeature.branchName.trim()}
          >
            {isSpawnMode ? 'Spawn Task' : 'Add Feature'}
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
