/**
 * Board Onboarding Hook
 *
 * Manages the state and logic for the interactive onboarding wizard
 * that guides new users through the Kanban board workflow.
 *
 * Features:
 * - Tracks wizard completion status per project
 * - Persists state to localStorage (per user, per board)
 * - Handles step navigation
 * - Provides analytics tracking
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getItem, setItem } from '@/lib/storage';

const logger = createLogger('BoardOnboarding');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Storage key prefix for onboarding state */
const ONBOARDING_STORAGE_KEY = 'automaker:board-onboarding';

/** Delay before auto-showing wizard to let the board render first (ms) */
const WIZARD_AUTO_SHOW_DELAY_MS = 500;

/** Maximum length for project path hash in storage key */
const PROJECT_PATH_HASH_MAX_LENGTH = 50;

// Analytics event names
export const ONBOARDING_ANALYTICS = {
  STARTED: 'onboarding_started',
  COMPLETED: 'onboarding_completed',
  SKIPPED: 'onboarding_skipped',
  QUICK_START_USED: 'onboarding_quick_start_used',
  SAMPLE_DATA_CLEARED: 'onboarding_sample_data_cleared',
  STEP_VIEWED: 'onboarding_step_viewed',
  RETRIGGERED: 'onboarding_retriggered',
} as const;

// Wizard step definitions
export interface WizardStep {
  id: string;
  columnId: string;
  title: string;
  description: string;
  tip?: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'backlog',
    columnId: 'backlog',
    title: 'Backlog',
    description:
      'This is where all your planned tasks live. Add new features, bug fixes, or improvements here. When you\'re ready to work on something, drag it to "In Progress" or click the play button.',
    tip: 'Press N or click the + button to quickly add a new feature.',
  },
  {
    id: 'in_progress',
    columnId: 'in_progress',
    title: 'In Progress',
    description:
      'Tasks being actively worked on appear here. AI agents automatically pick up items from the backlog and move them here when processing begins.',
    tip: 'You can run multiple tasks simultaneously using Auto Mode.',
  },
  {
    id: 'waiting_approval',
    columnId: 'waiting_approval',
    title: 'Waiting Approval',
    description:
      'Completed work lands here for your review. Check the changes, run tests, and approve or send back for revisions.',
    tip: 'Click "View Output" to see what the AI agent did.',
  },
  {
    id: 'verified',
    columnId: 'verified',
    title: 'Verified',
    description:
      "Approved and verified tasks are ready for deployment! Archive them when you're done or move them back if changes are needed.",
    tip: 'Click "Complete All" to archive all verified items at once.',
  },
  {
    id: 'custom_columns',
    columnId: 'in_progress', // Highlight "In Progress" column to show the settings icon
    title: 'Custom Pipelines',
    description:
      'You can create custom columns (called pipelines) to build your own workflow! Click the settings icon in any column header to add, rename, or configure pipeline steps.',
    tip: 'Use pipelines to add code review, QA testing, or any custom stage to your workflow.',
  },
];

// Persisted onboarding state structure
interface OnboardingState {
  completed: boolean;
  completedAt?: string;
  skipped: boolean;
  skippedAt?: string;
  hasEverSeenWizard: boolean;
  hasSampleData: boolean;
  quickStartUsed: boolean;
}

// Default state for new projects
const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  skipped: false,
  hasEverSeenWizard: false,
  hasSampleData: false,
  quickStartUsed: false,
};

/**
 * Get storage key for a specific project
 * Creates a sanitized key from the project path for localStorage
 */
function getStorageKey(projectPath: string): string {
  // Create a simple hash of the project path to use as key
  const hash = projectPath.replace(/[^a-zA-Z0-9]/g, '_').slice(0, PROJECT_PATH_HASH_MAX_LENGTH);
  return `${ONBOARDING_STORAGE_KEY}:${hash}`;
}

// Load onboarding state from localStorage
function loadOnboardingState(projectPath: string): OnboardingState {
  try {
    const key = getStorageKey(projectPath);
    const stored = getItem(key);
    if (stored) {
      return JSON.parse(stored) as OnboardingState;
    }
  } catch (error) {
    logger.error('Failed to load onboarding state:', error);
  }
  return { ...DEFAULT_ONBOARDING_STATE };
}

// Save onboarding state to localStorage
function saveOnboardingState(projectPath: string, state: OnboardingState): void {
  try {
    const key = getStorageKey(projectPath);
    setItem(key, JSON.stringify(state));
  } catch (error) {
    logger.error('Failed to save onboarding state:', error);
  }
}

// Track analytics event (placeholder - integrate with actual analytics service)
function trackAnalytics(event: string, data?: Record<string, unknown>): void {
  logger.debug(`[Analytics] ${event}`, data);
  // TODO: Integrate with actual analytics service (e.g., PostHog, Amplitude)
  // Example: posthog.capture(event, data);
}

export interface UseBoardOnboardingOptions {
  projectPath: string | null;
  isEmpty: boolean; // Whether the board has no features
  totalFeatureCount: number; // Total number of features in the board
  /** Whether the spec generation dialog is currently open (prevents wizard from showing) */
  isSpecDialogOpen?: boolean;
}

export interface UseBoardOnboardingResult {
  // Wizard visibility
  isWizardVisible: boolean;
  shouldShowWizard: boolean;

  // Current step
  currentStep: number;
  currentStepData: WizardStep | null;
  totalSteps: number;

  // Navigation
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  goToStep: (step: number) => void;

  // Actions
  startWizard: () => void;
  completeWizard: () => void;
  skipWizard: () => void;
  dismissWizard: () => void;

  // Quick Start / Sample Data
  hasSampleData: boolean;
  setHasSampleData: (has: boolean) => void;
  markQuickStartUsed: () => void;

  // Re-trigger
  canRetrigger: boolean;
  retriggerWizard: () => void;

  // State
  isCompleted: boolean;
  isSkipped: boolean;
}

export function useBoardOnboarding({
  projectPath,
  isEmpty,
  totalFeatureCount,
  isSpecDialogOpen = false,
}: UseBoardOnboardingOptions): UseBoardOnboardingResult {
  // Local state
  const [currentStep, setCurrentStep] = useState(0);
  const [isWizardActive, setIsWizardActive] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE);

  // Load persisted state when project changes
  useEffect(() => {
    if (!projectPath) {
      setOnboardingState(DEFAULT_ONBOARDING_STATE);
      return;
    }

    const state = loadOnboardingState(projectPath);
    setOnboardingState(state);

    // Auto-show wizard for empty boards that haven't seen it
    // Don't re-trigger if board became empty after having features (edge case)
    // Don't show if spec dialog is open (for new projects)
    if (
      isEmpty &&
      !state.hasEverSeenWizard &&
      !state.completed &&
      !state.skipped &&
      !isSpecDialogOpen
    ) {
      // Small delay to let the board render first
      const timer = setTimeout(() => {
        setIsWizardActive(true);
        trackAnalytics(ONBOARDING_ANALYTICS.STARTED, { projectPath });
      }, WIZARD_AUTO_SHOW_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [projectPath, isEmpty, isSpecDialogOpen]);

  // Update persisted state helper
  const updateState = useCallback(
    (updates: Partial<OnboardingState>) => {
      if (!projectPath) return;

      setOnboardingState((prev) => {
        const newState = { ...prev, ...updates };
        saveOnboardingState(projectPath, newState);
        return newState;
      });
    },
    [projectPath]
  );

  // Determine if wizard should be visible
  // Don't show if:
  // - No project selected
  // - Already completed or skipped
  // - Board has features and user has seen wizard before (became empty after deletion)
  const shouldShowWizard = useMemo(() => {
    if (!projectPath) return false;
    if (onboardingState.completed || onboardingState.skipped) return false;
    if (!isEmpty && onboardingState.hasEverSeenWizard) return false;
    return isEmpty && !onboardingState.hasEverSeenWizard;
  }, [projectPath, isEmpty, onboardingState]);

  // Current step data
  const currentStepData = WIZARD_STEPS[currentStep] || null;
  const totalSteps = WIZARD_STEPS.length;

  // Navigation handlers
  const goToNextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      trackAnalytics(ONBOARDING_ANALYTICS.STEP_VIEWED, {
        step: nextStep,
        stepId: WIZARD_STEPS[nextStep]?.id,
        projectPath,
      });
    }
  }, [currentStep, totalSteps, projectPath]);

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
          step,
          stepId: WIZARD_STEPS[step]?.id,
          projectPath,
        });
      }
    },
    [totalSteps, projectPath]
  );

  // Wizard lifecycle handlers
  const startWizard = useCallback(() => {
    setCurrentStep(0);
    setIsWizardActive(true);
    updateState({ hasEverSeenWizard: true });
    trackAnalytics(ONBOARDING_ANALYTICS.STARTED, { projectPath });
  }, [projectPath, updateState]);

  const completeWizard = useCallback(() => {
    setIsWizardActive(false);
    setCurrentStep(0);
    updateState({
      completed: true,
      completedAt: new Date().toISOString(),
      hasEverSeenWizard: true,
    });
    trackAnalytics(ONBOARDING_ANALYTICS.COMPLETED, {
      projectPath,
      quickStartUsed: onboardingState.quickStartUsed,
      totalFeatureCount,
    });
  }, [projectPath, updateState, onboardingState.quickStartUsed, totalFeatureCount]);

  const skipWizard = useCallback(() => {
    setIsWizardActive(false);
    setCurrentStep(0);
    updateState({
      skipped: true,
      skippedAt: new Date().toISOString(),
      hasEverSeenWizard: true,
    });
    trackAnalytics(ONBOARDING_ANALYTICS.SKIPPED, {
      projectPath,
      skippedAtStep: currentStep,
    });
  }, [projectPath, currentStep, updateState]);

  const dismissWizard = useCallback(() => {
    // Same as skip but doesn't mark as "skipped" - just closes the wizard
    setIsWizardActive(false);
    updateState({ hasEverSeenWizard: true });
  }, [updateState]);

  // Quick Start / Sample Data
  const setHasSampleData = useCallback(
    (has: boolean) => {
      updateState({ hasSampleData: has });
      if (!has) {
        trackAnalytics(ONBOARDING_ANALYTICS.SAMPLE_DATA_CLEARED, { projectPath });
      }
    },
    [projectPath, updateState]
  );

  const markQuickStartUsed = useCallback(() => {
    updateState({ quickStartUsed: true, hasSampleData: true });
    trackAnalytics(ONBOARDING_ANALYTICS.QUICK_START_USED, { projectPath });
  }, [projectPath, updateState]);

  // Re-trigger wizard - memoized for stable reference
  const canRetrigger = useMemo(
    () => onboardingState.completed || onboardingState.skipped,
    [onboardingState.completed, onboardingState.skipped]
  );

  const retriggerWizard = useCallback(() => {
    setCurrentStep(0);
    setIsWizardActive(true);
    // Don't reset completion status, just show wizard again
    trackAnalytics(ONBOARDING_ANALYTICS.RETRIGGERED, { projectPath });
  }, [projectPath]);

  return {
    // Visibility
    isWizardVisible: isWizardActive,
    shouldShowWizard,

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
    dismissWizard,

    // Sample Data
    hasSampleData: onboardingState.hasSampleData,
    setHasSampleData,
    markQuickStartUsed,

    // Re-trigger
    canRetrigger,
    retriggerWizard,

    // State
    isCompleted: onboardingState.completed,
    isSkipped: onboardingState.skipped,
  };
}
