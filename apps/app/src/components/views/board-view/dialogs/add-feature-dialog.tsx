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
import { BranchAutocomplete } from "@/components/ui/branch-autocomplete";
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  ImagePreviewMap,
} from "@/components/ui/description-image-dropzone";
import { MessageSquare, Settings2, FlaskConical } from "lucide-react";
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
} from "../shared";

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
    branchName: string;
  }) => void;
  categorySuggestions: string[];
  branchSuggestions: string[];
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
  branchSuggestions,
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
    branchName: "main",
  });
  const [newFeaturePreviewMap, setNewFeaturePreviewMap] =
    useState<ImagePreviewMap>(() => new Map());
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [descriptionError, setDescriptionError] = useState(false);

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
      branchName: newFeature.branchName,
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
      thinkingLevel: "none",
      branchName: "main",
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
          <TabsContent value="prompt" className="space-y-4 overflow-y-auto">
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
            <div className="space-y-2">
              <Label htmlFor="branch">Target Branch</Label>
              <BranchAutocomplete
                value={newFeature.branchName}
                onChange={(value) =>
                  setNewFeature({ ...newFeature, branchName: value })
                }
                branches={branchSuggestions}
                placeholder="Select or create branch..."
                data-testid="feature-branch-input"
              />
              <p className="text-xs text-muted-foreground">
                Work will be done in this branch. A worktree will be created if needed.
              </p>
            </div>
          </TabsContent>

          {/* Model Tab */}
          <TabsContent value="model" className="space-y-4 overflow-y-auto">
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
          <TabsContent value="testing" className="space-y-4 overflow-y-auto">
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
