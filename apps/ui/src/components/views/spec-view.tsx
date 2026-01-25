import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { Spinner } from '@/components/ui/spinner';

// Extracted hooks
import { useSpecLoading, useSpecSave, useSpecGeneration, useSpecParser } from './spec-view/hooks';

// Extracted components
import {
  SpecHeader,
  SpecEditor,
  SpecEmptyState,
  SpecViewMode,
  SpecEditMode,
  SpecModeTabs,
} from './spec-view/components';

// Extracted dialogs
import { CreateSpecDialog, RegenerateSpecDialog } from './spec-view/dialogs';

// Types
import type { SpecViewMode as SpecViewModeType } from './spec-view/types';

export function SpecView() {
  const { currentProject, appSpec } = useAppStore();

  // View mode state - default to 'view'
  const [mode, setMode] = useState<SpecViewModeType>('view');

  // Actions panel state (for tablet/mobile)
  const [showActionsPanel, setShowActionsPanel] = useState(false);

  // Loading state
  const { isLoading, specExists, isGenerationRunning, loadSpec } = useSpecLoading();

  // Save state
  const { isSaving, hasChanges, saveSpec, handleChange } = useSpecSave();

  // Parse the spec XML
  const { isValid: isParseValid, parsedSpec, errors: parseErrors } = useSpecParser(appSpec);

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

    // Sync
    isSyncing,

    // Status
    currentPhase,
    errorMessage,

    // Handlers
    handleCreateSpec,
    handleRegenerate,
    handleGenerateFeatures,
    handleSync,
  } = useSpecGeneration({ loadSpec });

  // Handle mode change - if parse is invalid, force source mode
  const handleModeChange = useCallback(
    (newMode: SpecViewModeType) => {
      if ((newMode === 'view' || newMode === 'edit') && !isParseValid) {
        // Can't switch to view/edit if parse is invalid
        return;
      }
      setMode(newMode);
    },
    [isParseValid]
  );

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
        <Spinner size="lg" />
      </div>
    );
  }

  // Empty state - only show when spec doesn't exist AND no generation is running
  // If generation is running but no spec exists, show the generating UI
  if (!specExists) {
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

  // Render content based on mode
  const renderContent = () => {
    // If the XML is invalid or spec is not parsed, we can only show the source editor.
    // The tabs for other modes are disabled, but this is an extra safeguard.
    if (!isParseValid || !parsedSpec) {
      return <SpecEditor value={appSpec} onChange={handleChange} />;
    }

    switch (mode) {
      case 'view':
        return <SpecViewMode spec={parsedSpec} />;
      case 'edit':
        return <SpecEditMode spec={parsedSpec} onChange={handleChange} />;
      case 'source':
      default:
        return <SpecEditor value={appSpec} onChange={handleChange} />;
    }
  };

  const isProcessing =
    isRegenerating || isGenerationRunning || isCreating || isGeneratingFeatures || isSyncing;

  // Main view - spec exists
  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="spec-view">
      <SpecHeader
        projectPath={currentProject.path}
        isRegenerating={isRegenerating || isGenerationRunning}
        isCreating={isCreating}
        isGeneratingFeatures={isGeneratingFeatures}
        isSyncing={isSyncing}
        isSaving={isSaving}
        hasChanges={hasChanges}
        currentPhase={currentPhase || (isGenerationRunning ? 'working' : '')}
        errorMessage={errorMessage}
        onRegenerateClick={() => setShowRegenerateDialog(true)}
        onGenerateFeaturesClick={handleGenerateFeatures}
        onSyncClick={handleSync}
        onSaveClick={saveSpec}
        showActionsPanel={showActionsPanel}
        onToggleActionsPanel={() => setShowActionsPanel(!showActionsPanel)}
        showSaveButton={mode !== 'view'}
      />

      {/* Mode tabs and content container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mode tabs bar - inside the content area, centered */}
        {!isProcessing && (
          <div className="flex items-center justify-center px-4 py-2 border-b border-border bg-muted/30 relative">
            <SpecModeTabs mode={mode} onModeChange={handleModeChange} isParseValid={isParseValid} />
            {/* Show parse error indicator - positioned to the right */}
            {!isParseValid && parseErrors.length > 0 && (
              <span className="absolute right-4 text-xs text-destructive">
                XML has errors - fix in Source mode
              </span>
            )}
          </div>
        )}

        {/* Show parse error banner if in source mode with errors */}
        {!isParseValid && parseErrors.length > 0 && mode === 'source' && (
          <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-sm text-destructive">
            <span className="font-medium">XML Parse Errors:</span> {parseErrors.join(', ')}
          </div>
        )}

        {renderContent()}
      </div>

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
