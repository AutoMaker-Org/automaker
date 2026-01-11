/**
 * Board Onboarding Wizard Component
 *
 * Board-specific wrapper around the shared OnboardingWizard component.
 * Adds Quick Start functionality to generate sample tasks.
 */

import { Sparkles, CheckCircle2, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OnboardingWizard, type OnboardingStep } from '@/components/shared/onboarding';

interface BoardOnboardingWizardProps {
  isVisible: boolean;
  currentStep: number;
  currentStepData: OnboardingStep | null;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onComplete: () => void;
  onQuickStart: () => void;
  hasSampleData: boolean;
  onClearSampleData: () => void;
  isQuickStartLoading?: boolean;
  steps: OnboardingStep[];
}

/**
 * Quick Start section component - only shown on first step
 */
function QuickStartSection({
  onQuickStart,
  hasSampleData,
  onClearSampleData,
  isQuickStartLoading = false,
}: {
  onQuickStart: () => void;
  hasSampleData: boolean;
  onClearSampleData: () => void;
  isQuickStartLoading?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border/50 p-4 mb-4">
      <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
        Quick Start
      </h4>
      <p className="text-xs text-muted-foreground mb-3">
        Want to see the board in action? We can add some sample tasks to demonstrate the workflow.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={onQuickStart}
          disabled={hasSampleData || isQuickStartLoading}
          className={cn('flex-1 min-h-[40px]', 'focus-visible:ring-2 focus-visible:ring-primary')}
          aria-busy={isQuickStartLoading}
        >
          {isQuickStartLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />
              <span>Adding tasks...</span>
            </>
          ) : hasSampleData ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-green-500" aria-hidden="true" />
              <span>Sample Data Added</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              <span>Add Sample Tasks</span>
            </>
          )}
        </Button>
        {hasSampleData && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearSampleData}
            className={cn(
              'min-w-[44px] min-h-[40px] px-3',
              'focus-visible:ring-2 focus-visible:ring-destructive'
            )}
            aria-label="Remove sample tasks"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function BoardOnboardingWizard({
  isVisible,
  currentStep,
  currentStepData,
  totalSteps,
  onNext,
  onPrevious,
  onSkip,
  onComplete,
  onQuickStart,
  hasSampleData,
  onClearSampleData,
  isQuickStartLoading = false,
  steps,
}: BoardOnboardingWizardProps) {
  const isFirstStep = currentStep === 0;

  return (
    <OnboardingWizard
      isVisible={isVisible}
      currentStep={currentStep}
      currentStepData={currentStepData}
      totalSteps={totalSteps}
      onNext={onNext}
      onPrevious={onPrevious}
      onSkip={onSkip}
      onComplete={onComplete}
      steps={steps}
    >
      {/* Board-specific Quick Start section - only on first step */}
      {isFirstStep && (
        <QuickStartSection
          onQuickStart={onQuickStart}
          hasSampleData={hasSampleData}
          onClearSampleData={onClearSampleData}
          isQuickStartLoading={isQuickStartLoading}
        />
      )}
    </OnboardingWizard>
  );
}
