/**
 * Generic Onboarding Wizard Component
 *
 * A multi-step wizard overlay that guides users through features
 * with visual highlighting (spotlight effect) on target elements.
 *
 * Features:
 * - Spotlight overlay targeting elements via data-onboarding-target
 * - Responsive tooltip positioning (left/right/bottom)
 * - Step navigation (keyboard & mouse)
 * - Configurable children slot for view-specific content
 * - Completion celebration animation
 * - Full accessibility (ARIA, focus management)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, CheckCircle2, PartyPopper, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  SPOTLIGHT_PADDING,
  TOOLTIP_OFFSET,
  TOOLTIP_TOP_OFFSET,
  TOOLTIP_MAX_WIDTH,
  VIEWPORT_SAFE_MARGIN,
  TOOLTIP_POSITION_RIGHT_THRESHOLD,
  TOOLTIP_POSITION_LEFT_THRESHOLD,
  BOTTOM_THRESHOLD,
  RESIZE_DEBOUNCE_MS,
  STEP_TRANSITION_DURATION,
  WIZARD_DESCRIPTION_ID,
  WIZARD_TITLE_ID,
  ONBOARDING_TARGET_ATTRIBUTE,
} from './constants';
import type { OnboardingWizardProps, OnboardingStep } from './types';

interface HighlightRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function OnboardingWizard({
  isVisible,
  currentStep,
  currentStepData,
  totalSteps,
  onNext,
  onPrevious,
  onSkip,
  onComplete,
  steps,
  children,
}: OnboardingWizardProps) {
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
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

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isVisible]);

  // Focus management - move focus to dialog when opened
  useEffect(() => {
    if (!isVisible) return;

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

  // Find and highlight the target element
  useEffect(() => {
    if (!isVisible || !currentStepData) {
      setHighlightRect(null);
      return;
    }

    const updateHighlight = () => {
      // Find target element by data-onboarding-target attribute
      const targetEl = document.querySelector(
        `[${ONBOARDING_TARGET_ATTRIBUTE}="${currentStepData.targetId}"]`
      );

      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        setHighlightRect({
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });

        // Determine tooltip position based on target position and available space
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const targetCenter = rect.left + rect.width / 2;
        const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, viewportWidth - VIEWPORT_SAFE_MARGIN * 2);

        const spaceAtBottom = viewportHeight - rect.bottom - TOOLTIP_OFFSET;
        const spaceAtRight = viewportWidth - rect.right - TOOLTIP_OFFSET;
        const spaceAtLeft = rect.left - TOOLTIP_OFFSET;

        // For leftmost targets, prefer right position
        if (
          targetCenter < viewportWidth * TOOLTIP_POSITION_RIGHT_THRESHOLD &&
          spaceAtRight >= tooltipWidth
        ) {
          setTooltipPosition('right');
        }
        // For rightmost targets, prefer left position
        else if (
          targetCenter > viewportWidth * TOOLTIP_POSITION_LEFT_THRESHOLD &&
          spaceAtLeft >= tooltipWidth
        ) {
          setTooltipPosition('left');
        }
        // For middle targets, check if bottom position would work
        else if (spaceAtBottom >= BOTTOM_THRESHOLD) {
          setTooltipPosition('bottom');
        }
        // Fallback logic
        else if (spaceAtRight > spaceAtLeft && spaceAtRight >= tooltipWidth * 0.6) {
          setTooltipPosition('right');
        } else if (spaceAtLeft >= tooltipWidth * 0.6) {
          setTooltipPosition('left');
        } else {
          setTooltipPosition('bottom');
        }
      }
    };

    updateHighlight();

    // Debounced resize handler
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
          handleComplete();
        }
      } else if (e.key === 'ArrowLeft') {
        onPrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, currentStep, totalSteps, onNext, onPrevious, onSkip]);

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
        const idealTop = highlightRect.bottom + TOOLTIP_OFFSET;
        const availableHeight = viewportHeight - idealTop - VIEWPORT_SAFE_MARGIN;

        const minTop = 100;
        const topPos =
          availableHeight < 250
            ? Math.max(
                minTop,
                viewportHeight - Math.max(300, availableHeight) - VIEWPORT_SAFE_MARGIN
              )
            : idealTop;

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
    setTimeout(() => {
      setShowCompletionCelebration(false);
      onComplete();
    }, 1200);
  }, [onComplete]);

  // Handle step indicator click for direct navigation
  const handleStepClick = useCallback(
    (stepIndex: number) => {
      if (stepIndex === currentStep) return;

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

  const StepIcon = currentStepData.icon || Sparkles;
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

      {/* Dark overlay with cutout for highlighted element */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <mask id="spotlight-mask">
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

      {/* Highlight border around the target element */}
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

      {/* Skip button - top right */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'fixed top-4 right-4 z-[101]',
          'text-white/70 hover:text-white hover:bg-white/10',
          'focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          'min-h-[44px] min-w-[44px] px-3'
        )}
        onClick={onSkip}
        aria-label="Skip the onboarding tour"
      >
        <X className="w-4 h-4 mr-1.5" aria-hidden="true" />
        <span>Skip Tour</span>
      </Button>

      {/* Tooltip card with step content */}
      <div
        className={cn(
          'z-[101] bg-popover/95 backdrop-blur-xl rounded-xl shadow-2xl border border-border/50',
          'p-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-300',
          'max-h-[calc(100vh-100px)] overflow-y-auto',
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
                      'w-6 h-6',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:rounded-full',
                      'transition-transform duration-200 hover:scale-110'
                    )}
                    aria-label={`Go to step ${i + 1}: ${steps[i]?.title}`}
                    aria-current={i === currentStep ? 'step' : undefined}
                  >
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

        {/* Custom content slot (e.g., Quick Start section) */}
        {children}

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
              'min-w-[120px] min-h-[44px]',
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

        {/* Keyboard hints - hidden on touch devices */}
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
