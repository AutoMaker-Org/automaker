/**
 * Generic Onboarding Wizard Hook
 *
 * Manages the state and logic for interactive onboarding wizards.
 * Can be used to create onboarding experiences for any view.
 *
 * Features:
 * - Persists completion status to localStorage
 * - Step navigation (next, previous, jump to step)
 * - Analytics tracking hooks
 * - No auto-show logic - wizard only shows via startWizard()
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getItem, setItem } from '@/lib/storage';
import { ONBOARDING_STORAGE_PREFIX, ONBOARDING_ANALYTICS } from './constants';
import type {
  OnboardingState,
  OnboardingStep,
  UseOnboardingWizardOptions,
  UseOnboardingWizardResult,
} from './types';

const logger = createLogger('OnboardingWizard');

/** Default state for new wizards */
const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  skipped: false,
};

/**
 * Load onboarding state from localStorage
 */
function loadOnboardingState(storageKey: string): OnboardingState {
  try {
    const fullKey = `${ONBOARDING_STORAGE_PREFIX}:${storageKey}`;
    const stored = getItem(fullKey);
    if (stored) {
      return JSON.parse(stored) as OnboardingState;
    }
  } catch (error) {
    logger.error('Failed to load onboarding state:', error);
  }
  return { ...DEFAULT_ONBOARDING_STATE };
}

/**
 * Save onboarding state to localStorage
 */
function saveOnboardingState(storageKey: string, state: OnboardingState): void {
  try {
    const fullKey = `${ONBOARDING_STORAGE_PREFIX}:${storageKey}`;
    setItem(fullKey, JSON.stringify(state));
  } catch (error) {
    logger.error('Failed to save onboarding state:', error);
  }
}

/**
 * Track analytics event (placeholder - integrate with actual analytics service)
 */
function trackAnalytics(event: string, data?: Record<string, unknown>): void {
  logger.debug(`[Analytics] ${event}`, data);
}

/**
 * Generic hook for managing onboarding wizard state.
 *
 * @example
 * ```tsx
 * const wizard = useOnboardingWizard({
 *   storageKey: 'my-view-onboarding',
 *   steps: MY_WIZARD_STEPS,
 *   onComplete: () => console.log('Done!'),
 * });
 *
 * // Start the wizard when user clicks help button
 * <button onClick={wizard.startWizard}>Help</button>
 *
 * // Render the wizard
 * <OnboardingWizard
 *   isVisible={wizard.isVisible}
 *   currentStep={wizard.currentStep}
 *   currentStepData={wizard.currentStepData}
 *   totalSteps={wizard.totalSteps}
 *   onNext={wizard.goToNextStep}
 *   onPrevious={wizard.goToPreviousStep}
 *   onSkip={wizard.skipWizard}
 *   onComplete={wizard.completeWizard}
 *   steps={MY_WIZARD_STEPS}
 * />
 * ```
 */
export function useOnboardingWizard({
  storageKey,
  steps,
  onComplete,
  onSkip,
}: UseOnboardingWizardOptions): UseOnboardingWizardResult {
  const [currentStep, setCurrentStep] = useState(0);
  const [isWizardVisible, setIsWizardVisible] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE);

  // Load persisted state on mount
  useEffect(() => {
    const state = loadOnboardingState(storageKey);
    setOnboardingState(state);
  }, [storageKey]);

  // Update persisted state helper
  const updateState = useCallback(
    (updates: Partial<OnboardingState>) => {
      setOnboardingState((prev) => {
        const newState = { ...prev, ...updates };
        saveOnboardingState(storageKey, newState);
        return newState;
      });
    },
    [storageKey]
  );

  // Current step data
  const currentStepData = useMemo(() => steps[currentStep] || null, [steps, currentStep]);
  const totalSteps = steps.length;

  // Navigation handlers
  const goToNextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      trackAnalytics(ONBOARDING_ANALYTICS.STEP_VIEWED, {
        storageKey,
        step: nextStep,
        stepId: steps[nextStep]?.id,
      });
    }
  }, [currentStep, totalSteps, storageKey, steps]);

  const goToPreviousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback(
    (step: number) => {
      if (step >= 0 && step < totalSteps) {
        setCurrentStep(step);
        trackAnalytics(ONBOARDING_ANALYTICS.STEP_VIEWED, {
          storageKey,
          step,
          stepId: steps[step]?.id,
        });
      }
    },
    [totalSteps, storageKey, steps]
  );

  // Wizard lifecycle handlers
  const startWizard = useCallback(() => {
    setCurrentStep(0);
    setIsWizardVisible(true);
    trackAnalytics(ONBOARDING_ANALYTICS.STARTED, { storageKey });
  }, [storageKey]);

  const completeWizard = useCallback(() => {
    setIsWizardVisible(false);
    setCurrentStep(0);
    updateState({
      completed: true,
      completedAt: new Date().toISOString(),
    });
    trackAnalytics(ONBOARDING_ANALYTICS.COMPLETED, { storageKey });
    onComplete?.();
  }, [storageKey, updateState, onComplete]);

  const skipWizard = useCallback(() => {
    setIsWizardVisible(false);
    setCurrentStep(0);
    updateState({
      skipped: true,
      skippedAt: new Date().toISOString(),
    });
    trackAnalytics(ONBOARDING_ANALYTICS.SKIPPED, {
      storageKey,
      skippedAtStep: currentStep,
    });
    onSkip?.();
  }, [storageKey, currentStep, updateState, onSkip]);

  return {
    // Visibility
    isVisible: isWizardVisible,

    // Steps
    currentStep,
    currentStepData,
    totalSteps,

    // Navigation
    goToNextStep,
    goToPreviousStep,
    goToStep,

    // Actions
    startWizard,
    completeWizard,
    skipWizard,

    // State
    isCompleted: onboardingState.completed,
    isSkipped: onboardingState.skipped,
  };
}
