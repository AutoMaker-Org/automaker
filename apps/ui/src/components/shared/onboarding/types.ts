/**
 * Shared Onboarding Wizard Types
 *
 * Generic types for building onboarding wizards across different views.
 */

import type { ComponentType } from 'react';

/**
 * Represents a single step in the onboarding wizard
 */
export interface OnboardingStep {
  /** Unique identifier for this step */
  id: string;
  /** Target element ID - matches data-onboarding-target attribute */
  targetId: string;
  /** Step title displayed in the wizard */
  title: string;
  /** Main description explaining this step */
  description: string;
  /** Optional tip shown in a highlighted box */
  tip?: string;
  /** Optional icon component for visual identification */
  icon?: ComponentType<{ className?: string }>;
}

/**
 * Persisted onboarding state structure
 */
export interface OnboardingState {
  /** Whether the wizard has been completed */
  completed: boolean;
  /** ISO timestamp when completed */
  completedAt?: string;
  /** Whether the wizard has been skipped */
  skipped: boolean;
  /** ISO timestamp when skipped */
  skippedAt?: string;
}

/**
 * Options for the useOnboardingWizard hook
 */
export interface UseOnboardingWizardOptions {
  /** Unique storage key for localStorage persistence */
  storageKey: string;
  /** Array of wizard steps to display */
  steps: OnboardingStep[];
  /** Optional callback when wizard is completed */
  onComplete?: () => void;
  /** Optional callback when wizard is skipped */
  onSkip?: () => void;
}

/**
 * Return type for the useOnboardingWizard hook
 */
export interface UseOnboardingWizardResult {
  /** Whether the wizard is currently visible */
  isVisible: boolean;
  /** Current step index (0-based) */
  currentStep: number;
  /** Current step data or null if not available */
  currentStepData: OnboardingStep | null;
  /** Total number of steps */
  totalSteps: number;
  /** Navigate to the next step */
  goToNextStep: () => void;
  /** Navigate to the previous step */
  goToPreviousStep: () => void;
  /** Navigate to a specific step by index */
  goToStep: (step: number) => void;
  /** Start/show the wizard from the beginning */
  startWizard: () => void;
  /** Complete the wizard and hide it */
  completeWizard: () => void;
  /** Skip the wizard and hide it */
  skipWizard: () => void;
  /** Whether the wizard has been completed */
  isCompleted: boolean;
  /** Whether the wizard has been skipped */
  isSkipped: boolean;
}

/**
 * Props for the OnboardingWizard component
 */
export interface OnboardingWizardProps {
  /** Whether the wizard is visible */
  isVisible: boolean;
  /** Current step index */
  currentStep: number;
  /** Current step data */
  currentStepData: OnboardingStep | null;
  /** Total number of steps */
  totalSteps: number;
  /** Handler for next step navigation */
  onNext: () => void;
  /** Handler for previous step navigation */
  onPrevious: () => void;
  /** Handler for skipping the wizard */
  onSkip: () => void;
  /** Handler for completing the wizard */
  onComplete: () => void;
  /** Array of all steps (for step indicator navigation) */
  steps: OnboardingStep[];
  /** Optional content to render before navigation buttons (e.g., Quick Start) */
  children?: React.ReactNode;
}
