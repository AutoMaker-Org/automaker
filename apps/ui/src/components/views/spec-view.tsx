import { RefreshCw } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

// Extracted hooks
import { useSpecLoading, useSpecSave, useSpecGeneration } from './spec-view/hooks';

// Extracted components
import { SpecHeader, SpecEditor, SpecEmptyState } from './spec-view/components';

// Extracted dialogs
import { CreateSpecDialog, RegenerateSpecDialog } from './spec-view/dialogs';

export function SpecView() {
  const { currentProject, appSpec } = useAppStore();

  // Loading state
  const { isLoading, specExists, isGenerationRunning, loadSpec } = useSpecLoading();

  // Save state
  const { isSaving, hasChanges, saveSpec, handleChange, setHasChanges } = useSpecSave();

  // Generation state and handlers
  const {
    // Dialog visibility
    showCreateDialog,
    setShowCreateDialog,
    showRegenerateDialog,
    setShowRegenerateDialog,

    // Create state
    projectOverview,
    setProjectOverview,
    isCreating,
    generateFeatures,
    setGenerateFeatures,
    analyzeProjectOnCreate,
    setAnalyzeProjectOnCreate,
    featureCountOnCreate,
    setFeatureCountOnCreate,

    // Regenerate state
    projectDefinition,
    setProjectDefinition,
    isRegenerating,
    generateFeaturesOnRegenerate,
    setGenerateFeaturesOnRegenerate,
    analyzeProjectOnRegenerate,
    setAnalyzeProjectOnRegenerate,
    featureCountOnRegenerate,
    setFeatureCountOnRegenerate,

    // Feature generation
    isGeneratingFeatures,

    // Status
    currentPhase,
    errorMessage,

    // Handlers
    handleCreateSpec,
    handleRegenerate,
  } = useSpecGeneration({ loadSpec });

  // Reset hasChanges when spec is reloaded
  // (This is needed because loadSpec updates appSpec in the store)

  // No project selected
  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="spec-view-no-project">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="spec-view-loading">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state - no spec exists or generation is running
  // When generation is running, we skip loading the spec to avoid 500 errors,
  // so we show the empty state with generation indicator
  if (!specExists || isGenerationRunning) {
    // If generation is running (from loading hook check), ensure we show the generating UI
    const showAsGenerating = isCreating || isGenerationRunning;

    return (
      <>
        <SpecEmptyState
          projectPath={currentProject.path}
          isCreating={showAsGenerating}
          isRegenerating={isRegenerating || isGenerationRunning}
          currentPhase={currentPhase || (isGenerationRunning ? 'initialization' : '')}
          errorMessage={errorMessage}
          onCreateClick={() => setShowCreateDialog(true)}
        />

        <CreateSpecDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          projectOverview={projectOverview}
          onProjectOverviewChange={setProjectOverview}
          generateFeatures={generateFeatures}
          onGenerateFeaturesChange={setGenerateFeatures}
          analyzeProject={analyzeProjectOnCreate}
          onAnalyzeProjectChange={setAnalyzeProjectOnCreate}
          featureCount={featureCountOnCreate}
          onFeatureCountChange={setFeatureCountOnCreate}
          onCreateSpec={handleCreateSpec}
          isCreatingSpec={isCreating}
        />
      </>
    );
  }

  // Main view - spec exists
  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="spec-view">
      <SpecHeader
        projectPath={currentProject.path}
        isRegenerating={isRegenerating}
        isCreating={isCreating}
        isGeneratingFeatures={isGeneratingFeatures}
        isSaving={isSaving}
        hasChanges={hasChanges}
        currentPhase={currentPhase}
        errorMessage={errorMessage}
        onRegenerateClick={() => setShowRegenerateDialog(true)}
        onSaveClick={saveSpec}
      />

      <SpecEditor value={appSpec} onChange={handleChange} />

      <RegenerateSpecDialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
        projectDefinition={projectDefinition}
        onProjectDefinitionChange={setProjectDefinition}
        generateFeatures={generateFeaturesOnRegenerate}
        onGenerateFeaturesChange={setGenerateFeaturesOnRegenerate}
        analyzeProject={analyzeProjectOnRegenerate}
        onAnalyzeProjectChange={setAnalyzeProjectOnRegenerate}
        featureCount={featureCountOnRegenerate}
        onFeatureCountChange={setFeatureCountOnRegenerate}
        onRegenerate={handleRegenerate}
        isRegenerating={isRegenerating}
        isGeneratingFeatures={isGeneratingFeatures}
      />
    </div>
  );
}
