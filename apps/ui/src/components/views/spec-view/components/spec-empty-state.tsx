import { Button } from '@/components/ui/button';
import { FileText, FilePlus2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { PHASE_LABELS } from '../constants';

interface SpecEmptyStateProps {
  projectPath: string;
  isCreating: boolean;
  isRegenerating: boolean;
  currentPhase: string;
  errorMessage: string;
  onCreateClick: () => void;
}

export function SpecEmptyState({
  projectPath,
  isCreating,
  isRegenerating,
  currentPhase,
  errorMessage,
  onCreateClick,
}: SpecEmptyStateProps) {
  const isProcessing = isCreating || isRegenerating;
  const phaseLabel = PHASE_LABELS[currentPhase] || currentPhase;

  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="spec-view-empty">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">App Specification</h1>
            <p className="text-sm text-muted-foreground">{projectPath}/.automaker/app_spec.txt</p>
          </div>
        </div>
        {isProcessing && (
          <div className="flex items-center gap-3 px-6 py-3.5 rounded-xl bg-linear-to-r from-primary/15 to-primary/5 border border-primary/30 shadow-lg backdrop-blur-md">
            <div className="relative">
              <Spinner size="md" className="shrink-0" />
              <div className="absolute inset-0 w-5 h-5 animate-ping text-primary/20" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm font-semibold text-primary leading-tight tracking-tight">
                {isCreating ? 'Generating Specification' : 'Regenerating Specification'}
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
          <div className="flex items-center gap-2 text-destructive">
            <span className="text-sm font-medium">Error: {errorMessage}</span>
          </div>
        )}
      </div>

      {/* Empty State Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mb-6 flex justify-center">
            <div className="p-4 rounded-full bg-primary/10">
              {isCreating ? (
                <Spinner size="xl" className="w-12 h-12" />
              ) : (
                <FilePlus2 className="w-12 h-12 text-primary" />
              )}
            </div>
          </div>
          <h2 className="text-2xl font-semibold mb-4">
            {isCreating ? (
              <>
                <div className="mb-4">
                  <span>Generating App Specification</span>
                </div>
                {currentPhase && (
                  <div className="px-6 py-3.5 rounded-xl bg-linear-to-r from-primary/15 to-primary/5 border border-primary/30 shadow-lg backdrop-blur-md inline-flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary text-center tracking-tight">
                      {phaseLabel}
                    </span>
                  </div>
                )}
              </>
            ) : (
              'No App Specification Found'
            )}
          </h2>
          <p className="text-muted-foreground mb-6">
            {isCreating
              ? currentPhase === 'feature_generation'
                ? 'The app specification has been created! Now generating features from the implementation roadmap...'
                : "We're analyzing your project and generating a comprehensive specification. This may take a few moments..."
              : "Create an app specification to help our system understand your project. We'll analyze your codebase and generate a comprehensive spec based on your description."}
          </p>
          {errorMessage && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive font-medium">Error:</p>
              <p className="text-sm text-destructive">{errorMessage}</p>
            </div>
          )}
          {!isCreating && (
            <div className="flex gap-2 justify-center">
              <Button size="lg" onClick={onCreateClick}>
                <FilePlus2 className="w-5 h-5 mr-2" />
                Create app_spec
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
