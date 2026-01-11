/**
 * Board Onboarding Wizard Component
 *
 * A multi-step wizard overlay that guides new users through the Kanban board
 * workflow with visual highlighting (spotlight effect) on each column.
 *
 * Features:
 * - Spotlight/overlay effect to focus attention on each column
 * - Step navigation (Next, Previous, Skip)
 * - Quick Start button to generate sample cards
 * - Responsive design for mobile, tablet, and desktop
 * - Keyboard navigation support
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  PlayCircle,
  Lightbulb,
  CheckCircle2,
  Trash2,
  Loader2,
  PartyPopper,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS, type WizardStep } from '../hooks/use-board-onboarding';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Threshold for placing tooltip to the right of column (30% of viewport) */
const TOOLTIP_POSITION_RIGHT_THRESHOLD = 0.3;

/** Threshold for placing tooltip to the left of column (70% of viewport) */
const TOOLTIP_POSITION_LEFT_THRESHOLD = 0.7;

/** Padding around tooltip and highlight elements (px) */
const SPOTLIGHT_PADDING = 8;

/** Padding between column and tooltip (px) */
const TOOLTIP_OFFSET = 16;

/** Vertical offset from top of column to tooltip (px) */
const TOOLTIP_TOP_OFFSET = 40;

/** Maximum tooltip width (px) */
const TOOLTIP_MAX_WIDTH = 400;

/** Minimum safe margin from viewport edges (px) */
const VIEWPORT_SAFE_MARGIN = 16;

/** Threshold from bottom of viewport to trigger alternate positioning (px) */
const BOTTOM_THRESHOLD = 450;

/** Debounce delay for resize handler (ms) */
const RESIZE_DEBOUNCE_MS = 100;

/** Animation duration for step transitions (ms) */
const STEP_TRANSITION_DURATION = 200;

/** ID for the wizard description element (for aria-describedby) */
const WIZARD_DESCRIPTION_ID = 'wizard-step-description';

/** ID for the wizard title element (for aria-labelledby) */
const WIZARD_TITLE_ID = 'wizard-step-title';

interface BoardOnboardingWizardProps {
  isVisible: boolean;
  currentStep: number;
  currentStepData: WizardStep | null;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onComplete: () => void;
  onQuickStart: () => void;
  hasSampleData: boolean;
  onClearSampleData: () => void;
  isQuickStartLoading?: boolean;
}

// Icons for each column/step
const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  backlog: PlayCircle,
  in_progress: Sparkles,
  waiting_approval: Lightbulb,
  verified: CheckCircle2,
  custom_columns: Settings2,
};

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
}: BoardOnboardingWizardProps) {
  // Store rect as simple object to avoid DOMRect type issues
  const [highlightRect, setHighlightRect] = useState<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'left' | 'right' | 'bottom'>('bottom');
  const [isAnimating, setIsAnimating] = useState(false);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);

  // Refs for focus management
  const dialogRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  // Detect if user is on a touch device
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Lock scroll when wizard is visible
  useEffect(() => {
    if (!isVisible) return;

    // Prevent body scroll while wizard is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isVisible]);

  // Focus management - move focus to dialog when opened
  useEffect(() => {
    if (!isVisible) return;

    // Focus the next button when wizard opens for keyboard accessibility
    const timer = setTimeout(() => {
      nextButtonRef.current?.focus();
    }, STEP_TRANSITION_DURATION);

    return () => clearTimeout(timer);
  }, [isVisible]);

  // Animate step transitions
  useEffect(() => {
    if (!isVisible) return;

    setIsAnimating(true);
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, STEP_TRANSITION_DURATION);

    return () => clearTimeout(timer);
  }, [currentStep, isVisible]);

  // Find and highlight the current column
  useEffect(() => {
    if (!isVisible || !currentStepData) {
      setHighlightRect(null);
      return;
    }

    // Helper to update highlight rect and tooltip position
    const updateHighlight = () => {
      const columnEl = document.querySelector(
        `[data-testid="kanban-column-${currentStepData.columnId}"]`
      );

      if (columnEl) {
        const rect = columnEl.getBoundingClientRect();
        setHighlightRect({
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });

        // Determine tooltip position based on column position and available space
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const columnCenter = rect.left + rect.width / 2;
        const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, viewportWidth - VIEWPORT_SAFE_MARGIN * 2);

        // Check if there's enough space at the bottom
        const spaceAtBottom = viewportHeight - rect.bottom - TOOLTIP_OFFSET;
        const spaceAtRight = viewportWidth - rect.right - TOOLTIP_OFFSET;
        const spaceAtLeft = rect.left - TOOLTIP_OFFSET;

        // For leftmost columns, prefer right position
        if (
          columnCenter < viewportWidth * TOOLTIP_POSITION_RIGHT_THRESHOLD &&
          spaceAtRight >= tooltipWidth
        ) {
          setTooltipPosition('right');
        }
        // For rightmost columns, prefer left position
        else if (
          columnCenter > viewportWidth * TOOLTIP_POSITION_LEFT_THRESHOLD &&
          spaceAtLeft >= tooltipWidth
        ) {
          setTooltipPosition('left');
        }
        // For middle columns, check if bottom position would work
        else if (spaceAtBottom >= BOTTOM_THRESHOLD) {
          setTooltipPosition('bottom');
        }
        // If bottom doesn't have enough space, try left or right based on which has more space
        else if (spaceAtRight > spaceAtLeft && spaceAtRight >= tooltipWidth * 0.6) {
          setTooltipPosition('right');
        } else if (spaceAtLeft >= tooltipWidth * 0.6) {
          setTooltipPosition('left');
        }
        // Fallback to bottom with scrollable content
        else {
          setTooltipPosition('bottom');
        }
      }
    };

    // Initial update
    updateHighlight();

    // Debounced resize handler for performance
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateHighlight, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [isVisible, currentStepData]);

  // Keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStep < totalSteps - 1) {
          onNext();
        } else {
          onComplete();
        }
      } else if (e.key === 'ArrowLeft') {
        onPrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, currentStep, totalSteps, onNext, onPrevious, onSkip, onComplete]);

  // Calculate tooltip styles based on position and highlight rect
  const getTooltipStyles = useCallback((): React.CSSProperties => {
    if (!highlightRect) return {};

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, viewportWidth - VIEWPORT_SAFE_MARGIN * 2);

    switch (tooltipPosition) {
      case 'right': {
        const topPos = Math.max(VIEWPORT_SAFE_MARGIN, highlightRect.top + TOOLTIP_TOP_OFFSET);
        const availableHeight = viewportHeight - topPos - VIEWPORT_SAFE_MARGIN;
        return {
          position: 'fixed',
          top: topPos,
          left: highlightRect.right + TOOLTIP_OFFSET,
          width: tooltipWidth,
          maxWidth: `calc(100vw - ${highlightRect.right + TOOLTIP_OFFSET * 2}px)`,
          maxHeight: Math.max(200, availableHeight),
        };
      }
      case 'left': {
        const topPos = Math.max(VIEWPORT_SAFE_MARGIN, highlightRect.top + TOOLTIP_TOP_OFFSET);
        const availableHeight = viewportHeight - topPos - VIEWPORT_SAFE_MARGIN;
        return {
          position: 'fixed',
          top: topPos,
          right: viewportWidth - highlightRect.left + TOOLTIP_OFFSET,
          width: tooltipWidth,
          maxWidth: `calc(${highlightRect.left - TOOLTIP_OFFSET * 2}px)`,
          maxHeight: Math.max(200, availableHeight),
        };
      }
      case 'bottom':
      default: {
        // Calculate available space at bottom
        const idealTop = highlightRect.bottom + TOOLTIP_OFFSET;
        const availableHeight = viewportHeight - idealTop - VIEWPORT_SAFE_MARGIN;

        // If not enough space, position higher but ensure tooltip stays below header
        const minTop = 100; // Minimum distance from top of viewport
        const topPos =
          availableHeight < 250
            ? Math.max(
                minTop,
                viewportHeight - Math.max(300, availableHeight) - VIEWPORT_SAFE_MARGIN
              )
            : idealTop;

        // Center tooltip under column but keep within viewport bounds
        const idealLeft = highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2;
        const leftPos = Math.max(
          VIEWPORT_SAFE_MARGIN,
          Math.min(idealLeft, viewportWidth - tooltipWidth - VIEWPORT_SAFE_MARGIN)
        );

        return {
          position: 'fixed',
          top: topPos,
          left: leftPos,
          width: tooltipWidth,
          maxHeight: Math.max(200, viewportHeight - topPos - VIEWPORT_SAFE_MARGIN),
        };
      }
    }
  }, [highlightRect, tooltipPosition]);

  // Handle completion with celebration
  const handleComplete = useCallback(() => {
    setShowCompletionCelebration(true);
    // Show celebration briefly before completing
    setTimeout(() => {
      setShowCompletionCelebration(false);
      onComplete();
    }, 1200);
  }, [onComplete]);

  // Handle step indicator click for direct navigation
  const handleStepClick = useCallback(
    (stepIndex: number) => {
      if (stepIndex === currentStep) return;

      // Use onNext/onPrevious to properly track analytics
      if (stepIndex > currentStep) {
        for (let i = currentStep; i < stepIndex; i++) {
          onNext();
        }
      } else {
        for (let i = currentStep; i > stepIndex; i--) {
          onPrevious();
        }
      }
    },
    [currentStep, onNext, onPrevious]
  );

  if (!isVisible || !currentStepData) return null;

  const StepIcon = STEP_ICONS[currentStepData.id] || Sparkles;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;

  const content = (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={WIZARD_TITLE_ID}
      aria-describedby={WIZARD_DESCRIPTION_ID}
    >
      {/* Completion celebration overlay */}
      {showCompletionCelebration && (
        <div className="absolute inset-0 z-[102] flex items-center justify-center pointer-events-none">
          <div className="animate-in zoom-in-50 fade-in duration-300 flex flex-col items-center gap-4 text-white">
            <PartyPopper className="w-16 h-16 text-yellow-400 animate-bounce" />
            <p className="text-2xl font-bold">You're all set!</p>
          </div>
        </div>
      )}

      {/* Dark overlay with cutout for highlighted column */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <mask id="spotlight-mask">
            {/* White = visible, black = hidden */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {highlightRect && (
              <rect
                x={highlightRect.left - SPOTLIGHT_PADDING}
                y={highlightRect.top - SPOTLIGHT_PADDING}
                width={highlightRect.width + SPOTLIGHT_PADDING * 2}
                height={highlightRect.height + SPOTLIGHT_PADDING * 2}
                rx="16"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
          className="transition-all duration-300"
        />
      </svg>

      {/* Highlight border around the column */}
      {highlightRect && (
        <div
          className="absolute pointer-events-none transition-all duration-300 ease-out"
          style={{
            left: highlightRect.left - SPOTLIGHT_PADDING,
            top: highlightRect.top - SPOTLIGHT_PADDING,
            width: highlightRect.width + SPOTLIGHT_PADDING * 2,
            height: highlightRect.height + SPOTLIGHT_PADDING * 2,
            borderRadius: '16px',
            border: '2px solid hsl(var(--primary))',
            boxShadow:
              '0 0 20px 4px hsl(var(--primary) / 0.3), inset 0 0 20px 4px hsl(var(--primary) / 0.1)',
          }}
        />
      )}

      {/* Skip button - top right with accessible touch target */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'fixed top-4 right-4 z-[101]',
          'text-white/70 hover:text-white hover:bg-white/10',
          'focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          'min-h-[44px] min-w-[44px] px-3' // Ensure minimum touch target size
        )}
        onClick={onSkip}
        aria-label="Skip the onboarding tour"
      >
        <X className="w-4 h-4 mr-1.5" aria-hidden="true" />
        <span>Skip Tour</span>
      </Button>

      {/* Tooltip/Card with step content */}
      <div
        className={cn(
          'z-[101] bg-popover/95 backdrop-blur-xl rounded-xl shadow-2xl border border-border/50',
          'p-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-300',
          'max-h-[calc(100vh-100px)] overflow-y-auto',
          // Step transition animation
          isAnimating && 'opacity-90 scale-[0.98]',
          'transition-all duration-200 ease-out'
        )}
        style={getTooltipStyles()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
            <StepIcon className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id={WIZARD_TITLE_ID} className="text-lg font-semibold text-foreground truncate">
              {currentStepData.title}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-muted-foreground" aria-live="polite">
                Step {currentStep + 1} of {totalSteps}
              </span>
              {/* Step indicators - clickable for navigation */}
              <nav aria-label="Wizard steps" className="flex items-center gap-1">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleStepClick(i)}
                    className={cn(
                      'relative flex items-center justify-center',
                      'w-6 h-6', // Touch target size
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:rounded-full',
                      'transition-transform duration-200 hover:scale-110'
                    )}
                    aria-label={`Go to step ${i + 1}: ${WIZARD_STEPS[i]?.title}`}
                    aria-current={i === currentStep ? 'step' : undefined}
                  >
                    {/* Visual dot indicator */}
                    <span
                      className={cn(
                        'block rounded-full transition-all duration-200',
                        i === currentStep
                          ? 'w-2.5 h-2.5 bg-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-popover'
                          : i < currentStep
                            ? 'w-2 h-2 bg-primary/60'
                            : 'w-2 h-2 bg-muted-foreground/40'
                      )}
                    />
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* Description */}
        <p
          id={WIZARD_DESCRIPTION_ID}
          className="text-sm text-muted-foreground leading-relaxed mb-4"
        >
          {currentStepData.description}
        </p>

        {/* Tip box */}
        {currentStepData.tip && (
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 mb-4">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Tip: </span>
              {currentStepData.tip}
            </p>
          </div>
        )}

        {/* Quick Start section - only on first step */}
        {isFirstStep && (
          <div className="rounded-lg bg-muted/30 border border-border/50 p-4 mb-4">
            <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
              Quick Start
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Want to see the board in action? We can add some sample tasks to demonstrate the
              workflow.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={onQuickStart}
                disabled={hasSampleData || isQuickStartLoading}
                className={cn(
                  'flex-1 min-h-[40px]', // Slightly larger touch target
                  'focus-visible:ring-2 focus-visible:ring-primary'
                )}
                aria-busy={isQuickStartLoading}
              >
                {isQuickStartLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                    <span>Adding tasks...</span>
                  </>
                ) : hasSampleData ? (
                  <>
                    <CheckCircle2
                      className="w-3.5 h-3.5 mr-1.5 text-green-500"
                      aria-hidden="true"
                    />
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
                    'min-w-[44px] min-h-[40px] px-3', // Accessible touch target
                    'focus-visible:ring-2 focus-visible:ring-destructive'
                  )}
                  aria-label="Remove sample tasks"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrevious}
            disabled={isFirstStep}
            className={cn(
              'text-muted-foreground min-h-[44px]',
              'focus-visible:ring-2 focus-visible:ring-primary',
              isFirstStep && 'invisible'
            )}
            aria-label="Go to previous step"
          >
            <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
            <span>Previous</span>
          </Button>

          <Button
            ref={nextButtonRef}
            size="sm"
            onClick={isLastStep ? handleComplete : onNext}
            disabled={showCompletionCelebration}
            className={cn(
              'bg-primary hover:bg-primary/90 text-primary-foreground',
              'min-w-[120px] min-h-[44px]', // Accessible touch target
              'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'transition-all duration-200'
            )}
            aria-label={isLastStep ? 'Complete the tour and get started' : 'Go to next step'}
          >
            {isLastStep ? (
              <>
                <span>Get Started</span>
                <CheckCircle2 className="w-4 h-4 ml-1.5" aria-hidden="true" />
              </>
            ) : (
              <>
                <span>Next</span>
                <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>

        {/* Keyboard hints - hidden on touch devices for cleaner mobile UX */}
        {!isTouchDevice && (
          <div
            className="mt-4 pt-3 border-t border-border/50 flex items-center justify-center gap-4 text-xs text-muted-foreground/70"
            aria-hidden="true"
          >
            <span className="flex items-center gap-1.5">
              <kbd className="px-2 py-1 rounded bg-muted text-muted-foreground font-mono text-[11px] shadow-sm">
                ESC
              </kbd>
              <span>to skip</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-2 py-1 rounded bg-muted text-muted-foreground font-mono text-[11px] shadow-sm">
                ←
              </kbd>
              <kbd className="px-2 py-1 rounded bg-muted text-muted-foreground font-mono text-[11px] shadow-sm">
                →
              </kbd>
              <span>to navigate</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );

  // Render in a portal to ensure it's above everything
  return createPortal(content, document.body);
}
