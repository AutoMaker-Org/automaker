import { Button } from '@/components/ui/button';
import { Save, Sparkles, Loader2, FileText, AlertCircle } from 'lucide-react';
import { PHASE_LABELS } from '../constants';

interface SpecHeaderProps {
  projectPath: string;
  isRegenerating: boolean;
  isCreating: boolean;
  isGeneratingFeatures: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  currentPhase: string;
  errorMessage: string;
  onRegenerateClick: () => void;
  onSaveClick: () => void;
}

export function SpecHeader({
  projectPath,
  isRegenerating,
  isCreating,
  isGeneratingFeatures,
  isSaving,
  hasChanges,
  currentPhase,
  errorMessage,
  onRegenerateClick,
  onSaveClick,
}: SpecHeaderProps) {
  const isProcessing = isRegenerating || isCreating || isGeneratingFeatures;
  const phaseLabel = PHASE_LABELS[currentPhase] || currentPhase;

  return (
    <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <FileText className="w-5 h-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold">App Specification</h1>
          <p className="text-sm text-muted-foreground">{projectPath}/.automaker/app_spec.txt</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isProcessing && (
          <div className="flex items-center gap-3 px-6 py-3.5 rounded-xl bg-linear-to-r from-primary/15 to-primary/5 border border-primary/30 shadow-lg backdrop-blur-md">
            <div className="relative">
              <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
              <div className="absolute inset-0 w-5 h-5 animate-ping text-primary/20" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm font-semibold text-primary leading-tight tracking-tight">
                {isGeneratingFeatures
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
        {errorMessage && (
          <div className="flex items-center gap-3 px-6 py-3.5 rounded-xl bg-linear-to-r from-destructive/15 to-destructive/5 border border-destructive/30 shadow-lg backdrop-blur-md">
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
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onRegenerateClick}
            disabled={isProcessing}
            data-testid="regenerate-spec"
          >
            {isRegenerating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {isRegenerating ? 'Regenerating...' : 'Regenerate'}
          </Button>
          <Button
            size="sm"
            onClick={onSaveClick}
            disabled={!hasChanges || isSaving || isProcessing}
            data-testid="save-spec"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Saved'}
          </Button>
        </div>
      </div>
    </div>
  );
}
