"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Label } from "@/components/ui/label";
import { CategoryAutocomplete } from "@/components/ui/category-autocomplete";
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  ImagePreviewMap,
} from "@/components/ui/description-image-dropzone";
import { MessageSquare, Settings2, FlaskConical, Sparkles, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getElectronAPI } from "@/lib/electron";
import { modelSupportsThinking } from "@/lib/utils";
import {
  useAppStore,
  AgentModel,
  ThinkingLevel,
  FeatureImage,
  AIProfile,
} from "@/store/app-store";
import {
  ModelSelector,
  ThinkingLevelSelector,
  ProfileQuickSelect,
  TestingTabContent,
  PrioritySelector,
} from "../shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AddFeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (feature: {
    category: string;
    description: string;
    steps: string[];
    images: FeatureImage[];
    imagePaths: DescriptionImagePath[];
    skipTests: boolean;
    model: AgentModel;
    thinkingLevel: ThinkingLevel;
    priority: number;
  }) => void;
  categorySuggestions: string[];
  defaultSkipTests: boolean;
  isMaximized: boolean;
  showProfilesOnly: boolean;
  aiProfiles: AIProfile[];
}

export function AddFeatureDialog({
  open,
  onOpenChange,
  onAdd,
  categorySuggestions,
  defaultSkipTests,
  isMaximized,
  showProfilesOnly,
  aiProfiles,
}: AddFeatureDialogProps) {
  const [newFeature, setNewFeature] = useState({
    category: "",
    description: "",
    steps: [""],
    images: [] as FeatureImage[],
    imagePaths: [] as DescriptionImagePath[],
    skipTests: false,
    model: "opus" as AgentModel,
    thinkingLevel: "none" as ThinkingLevel,
    priority: 2 as number, // Default to medium priority
  });
  const [newFeaturePreviewMap, setNewFeaturePreviewMap] =
    useState<ImagePreviewMap>(() => new Map());
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [descriptionError, setDescriptionError] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<'improve' | 'technical' | 'simplify' | 'acceptance'>('improve');

  // Get enhancement model from store
  const { enhancementModel } = useAppStore();

  // Sync skipTests default when dialog opens
  useEffect(() => {
    if (open) {
      setNewFeature((prev) => ({
        ...prev,
        skipTests: defaultSkipTests,
      }));
    }
  }, [open, defaultSkipTests]);

  const handleAdd = () => {
    if (!newFeature.description.trim()) {
      setDescriptionError(true);
      return;
    }

    const category = newFeature.category || "Uncategorized";
    const selectedModel = newFeature.model;
    const normalizedThinking = modelSupportsThinking(selectedModel)
      ? newFeature.thinkingLevel
      : "none";

    onAdd({
      category,
      description: newFeature.description,
      steps: newFeature.steps.filter((s) => s.trim()),
      images: newFeature.images,
      imagePaths: newFeature.imagePaths,
      skipTests: newFeature.skipTests,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      priority: newFeature.priority,
    });

    // Reset form
    setNewFeature({
      category: "",
      description: "",
      steps: [""],
      images: [],
      imagePaths: [],
      skipTests: defaultSkipTests,
      model: "opus",
      priority: 2,
      thinkingLevel: "none",
    });
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
        setNewFeature(prev => ({ ...prev, description: enhancedText }));
        toast.success("Description enhanced!");
      } else {
        toast.error(result?.error || "Failed to enhance description");
      }
    } catch (error) {
      console.error("Enhancement failed:", error);
      toast.error("Failed to enhance description");
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleModelSelect = (model: AgentModel) => {
    setNewFeature({
      ...newFeature,
      model,
      thinkingLevel: modelSupportsThinking(model)
        ? newFeature.thinkingLevel
        : "none",
    });
  };

  const handleProfileSelect = (model: AgentModel, thinkingLevel: ThinkingLevel) => {
    setNewFeature({
      ...newFeature,
      model,
      thinkingLevel,
    });
  };

  const newModelAllowsThinking = modelSupportsThinking(newFeature.model);

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent
        compact={!isMaximized}
        data-testid="add-feature-dialog"
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Add New Feature</DialogTitle>
          <DialogDescription>
            Create a new feature card for the Kanban board.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          defaultValue="prompt"
          className="py-4 flex-1 min-h-0 flex flex-col"
        >
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="prompt" data-testid="tab-prompt">
              <MessageSquare className="w-4 h-4 mr-2" />
              Prompt
            </TabsTrigger>
            <TabsTrigger value="model" data-testid="tab-model">
              <Settings2 className="w-4 h-4 mr-2" />
              Model
            </TabsTrigger>
            <TabsTrigger value="testing" data-testid="tab-testing">
              <FlaskConical className="w-4 h-4 mr-2" />
              Testing
            </TabsTrigger>
          </TabsList>

          {/* Prompt Tab */}
          <TabsContent value="prompt" className="space-y-4 overflow-y-auto cursor-default">
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
                onImagesChange={(images) =>
                  setNewFeature({ ...newFeature, imagePaths: images })
                }
                placeholder="Describe the feature..."
                previewMap={newFeaturePreviewMap}
                onPreviewMapChange={setNewFeaturePreviewMap}
                autoFocus
                error={descriptionError}
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
                onChange={(value) =>
                  setNewFeature({ ...newFeature, category: value })
                }
                suggestions={categorySuggestions}
                placeholder="e.g., Core, UI, API"
                data-testid="feature-category-input"
              />
            </div>

            {/* Priority Selector */}
            <PrioritySelector
              selectedPriority={newFeature.priority}
              onPrioritySelect={(priority) =>
                setNewFeature({ ...newFeature, priority })
              }
              testIdPrefix="priority"
            />
          </TabsContent>

          {/* Model Tab */}
          <TabsContent value="model" className="space-y-4 overflow-y-auto cursor-default">
            {/* Show Advanced Options Toggle */}
            {showProfilesOnly && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Simple Mode Active
                  </p>
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
                  {showAdvancedOptions ? "Hide" : "Show"} Advanced
                </Button>
              </div>
            )}

            {/* Quick Select Profile Section */}
            <ProfileQuickSelect
              profiles={aiProfiles}
              selectedModel={newFeature.model}
              selectedThinkingLevel={newFeature.thinkingLevel}
              onSelect={handleProfileSelect}
              showManageLink
              onManageLinkClick={() => {
                onOpenChange(false);
                useAppStore.getState().setCurrentView("profiles");
              }}
            />

            {/* Separator */}
            {aiProfiles.length > 0 &&
              (!showProfilesOnly || showAdvancedOptions) && (
                <div className="border-t border-border" />
              )}

            {/* Claude Models Section */}
            {(!showProfilesOnly || showAdvancedOptions) && (
              <>
                <ModelSelector
                  selectedModel={newFeature.model}
                  onModelSelect={handleModelSelect}
                />
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

          {/* Testing Tab */}
          <TabsContent value="testing" className="space-y-4 overflow-y-auto cursor-default">
            <TestingTabContent
              skipTests={newFeature.skipTests}
              onSkipTestsChange={(skipTests) =>
                setNewFeature({ ...newFeature, skipTests })
              }
              steps={newFeature.steps}
              onStepsChange={(steps) =>
                setNewFeature({ ...newFeature, steps })
              }
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <HotkeyButton
            onClick={handleAdd}
            hotkey={{ key: "Enter", cmdCtrl: true }}
            hotkeyActive={open}
            data-testid="confirm-add-feature"
          >
            Add Feature
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
