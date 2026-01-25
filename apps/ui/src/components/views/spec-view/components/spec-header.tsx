import { Button } from '@/components/ui/button';
import {
  HeaderActionsPanel,
  HeaderActionsPanelTrigger,
} from '@/components/ui/header-actions-panel';
import { Save, Sparkles, FileText, AlertCircle, ListPlus, RefreshCcw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { PHASE_LABELS } from '../constants';

interface SpecHeaderProps {
  projectPath: string;
  isRegenerating: boolean;
  isCreating: boolean;
  isGeneratingFeatures: boolean;
  isSyncing: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  currentPhase: string;
  errorMessage: string;
  onRegenerateClick: () => void;
  onGenerateFeaturesClick: () => void;
  onSyncClick: () => void;
  onSaveClick: () => void;
  showActionsPanel: boolean;
  onToggleActionsPanel: () => void;
  // Mode-related props for save button visibility
  showSaveButton: boolean;
}

export function SpecHeader({
  projectPath,
  isRegenerating,
  isCreating,
  isGeneratingFeatures,
  isSyncing,
  isSaving,
  hasChanges,
  currentPhase,
  errorMessage,
  onRegenerateClick,
  onGenerateFeaturesClick,
  onSyncClick,
  onSaveClick,
  showActionsPanel,
  onToggleActionsPanel,
  showSaveButton,
}: SpecHeaderProps) {
  const isProcessing = isRegenerating || isCreating || isGeneratingFeatures || isSyncing;
  const phaseLabel = PHASE_LABELS[currentPhase] || currentPhase;

  return (
    <>
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">App Specification</h1>
            <p className="text-sm text-muted-foreground">{projectPath}/.automaker/app_spec.txt</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Status indicators - always visible */}
          {isProcessing && (
            <div className="hidden lg:flex items-center gap-3 px-6 py-3.5 rounded-xl bg-linear-to-r from-primary/15 to-primary/5 border border-primary/30 shadow-lg backdrop-blur-md">
              <div className="relative">
                <Spinner size="md" className="shrink-0" />
                <div className="absolute inset-0 w-5 h-5 animate-ping text-primary/20" />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-semibold text-primary leading-tight tracking-tight">
                  {isSyncing
                    ? 'Syncing Specification'
                    : isGeneratingFeatures
                      ? 'Generating Features'
                      : isCreating
                        ? 'Generating Specification'
                        : 'Regenerating Specification'}
                </span>
                {currentPhase && (
                  <span className="text-xs text-muted-foreground/90 leading-tight font-medium">
                    {phaseLabel}
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Mobile processing indicator */}
          {isProcessing && (
            <div className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <Spinner size="sm" />
              <span className="text-xs font-medium text-primary">Processing...</span>
            </div>
          )}
          {errorMessage && (
            <div className="hidden lg:flex items-center gap-3 px-6 py-3.5 rounded-xl bg-linear-to-r from-destructive/15 to-destructive/5 border border-destructive/30 shadow-lg backdrop-blur-md">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-semibold text-destructive leading-tight tracking-tight">
                  Error
                </span>
                <span className="text-xs text-destructive/90 leading-tight font-medium">
                  {errorMessage}
                </span>
              </div>
            </div>
          )}
          {/* Mobile error indicator */}
          {errorMessage && (
            <div className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <span className="text-xs font-medium text-destructive">Error</span>
            </div>
          )}
          {/* Desktop: show actions inline - hidden when processing since status card shows progress */}
          {!isProcessing && (
            <div className="hidden lg:flex gap-2">
              <Button size="sm" variant="outline" onClick={onSyncClick} data-testid="sync-spec">
                <RefreshCcw className="w-4 h-4 mr-2" />
                Sync
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onRegenerateClick}
                data-testid="regenerate-spec"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onGenerateFeaturesClick}
                data-testid="generate-features"
              >
                <ListPlus className="w-4 h-4 mr-2" />
                Generate Features
              </Button>
              {showSaveButton && (
                <Button
                  size="sm"
                  onClick={onSaveClick}
                  disabled={!hasChanges || isSaving}
                  data-testid="save-spec"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Saved'}
                </Button>
              )}
            </div>
          )}
          {/* Tablet/Mobile: show trigger for actions panel */}
          <HeaderActionsPanelTrigger isOpen={showActionsPanel} onToggle={onToggleActionsPanel} />
        </div>
      </div>

      {/* Actions Panel (tablet/mobile) */}
      <HeaderActionsPanel
        isOpen={showActionsPanel}
        onClose={onToggleActionsPanel}
        title="Specification Actions"
      >
        {/* Status messages in panel */}
        {isProcessing && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Spinner size="sm" className="shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-primary">
                {isSyncing
                  ? 'Syncing Specification'
                  : isGeneratingFeatures
                    ? 'Generating Features'
                    : isCreating
                      ? 'Generating Specification'
                      : 'Regenerating Specification'}
              </span>
              {currentPhase && <span className="text-xs text-muted-foreground">{phaseLabel}</span>}
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-destructive">Error</span>
              <span className="text-xs text-destructive/80">{errorMessage}</span>
            </div>
          </div>
        )}
        {/* Hide action buttons when processing - status card shows progress */}
        {!isProcessing && (
          <>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onSyncClick}
              data-testid="sync-spec-mobile"
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              Sync
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onRegenerateClick}
              data-testid="regenerate-spec-mobile"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Regenerate
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onGenerateFeaturesClick}
              data-testid="generate-features-mobile"
            >
              <ListPlus className="w-4 h-4 mr-2" />
              Generate Features
            </Button>
            {showSaveButton && (
              <Button
                className="w-full justify-start"
                onClick={onSaveClick}
                disabled={!hasChanges || isSaving}
                data-testid="save-spec-mobile"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Saved'}
              </Button>
            )}
          </>
        )}
      </HeaderActionsPanel>
    </>
  );
}
