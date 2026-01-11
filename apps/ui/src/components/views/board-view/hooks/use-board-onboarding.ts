/**
 * Board Onboarding Hook
 *
 * Board-specific wrapper around the shared onboarding wizard hook.
 * Manages board-specific features like sample data (Quick Start).
 *
 * Usage:
 * - Wizard is triggered manually via startWizard() when user clicks help button
 * - No auto-show logic - user controls when to see the wizard
 */

import { useState, useCallback, useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getItem, setItem } from '@/lib/storage';
import {
  useOnboardingWizard,
  ONBOARDING_TARGET_ATTRIBUTE,
  type OnboardingStep,
} from '@/components/shared/onboarding';
import { PlayCircle, Sparkles, Lightbulb, CheckCircle2, Settings2 } from 'lucide-react';

const logger = createLogger('BoardOnboarding');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Storage key prefix for board-specific onboarding data */
const BOARD_ONBOARDING_STORAGE_KEY = 'automaker:board-onboarding-data';

/** Maximum length for project path hash in storage key */
const PROJECT_PATH_HASH_MAX_LENGTH = 50;

// Board-specific analytics events
export const BOARD_ONBOARDING_ANALYTICS = {
  QUICK_START_USED: 'board_onboarding_quick_start_used',
  SAMPLE_DATA_CLEARED: 'board_onboarding_sample_data_cleared',
} as const;

// ============================================================================
// WIZARD STEPS
// ============================================================================

/**
 * Board wizard step definitions
 * Each step targets a kanban column via data-onboarding-target
 */
export const BOARD_WIZARD_STEPS: OnboardingStep[] = [
  {
    id: 'backlog',
    targetId: 'backlog',
    title: 'Backlog',
    description:
      'This is where all your planned tasks live. Add new features, bug fixes, or improvements here. When you\'re ready to work on something, drag it to "In Progress" or click the play button.',
    tip: 'Press N or click the + button to quickly add a new feature.',
    icon: PlayCircle,
  },
  {
    id: 'in_progress',
    targetId: 'in_progress',
    title: 'In Progress',
    description:
      'Tasks being actively worked on appear here. AI agents automatically pick up items from the backlog and move them here when processing begins.',
    tip: 'You can run multiple tasks simultaneously using Auto Mode.',
    icon: Sparkles,
  },
  {
    id: 'waiting_approval',
    targetId: 'waiting_approval',
    title: 'Waiting Approval',
    description:
      'Completed work lands here for your review. Check the changes, run tests, and approve or send back for revisions.',
    tip: 'Click "View Output" to see what the AI agent did.',
    icon: Lightbulb,
  },
  {
    id: 'verified',
    targetId: 'verified',
    title: 'Verified',
    description:
      "Approved and verified tasks are ready for deployment! Archive them when you're done or move them back if changes are needed.",
    tip: 'Click "Complete All" to archive all verified items at once.',
    icon: CheckCircle2,
  },
  {
    id: 'custom_columns',
    targetId: 'pipeline-settings', // Highlight the pipeline settings button icon
    title: 'Custom Pipelines',
    description:
      'You can create custom columns (called pipelines) to build your own workflow! Click this settings icon to add, rename, or configure pipeline steps.',
    tip: 'Use pipelines to add code review, QA testing, or any custom stage to your workflow.',
    icon: Settings2,
  },
];

// Re-export for backward compatibility
export type { OnboardingStep as WizardStep } from '@/components/shared/onboarding';
export { ONBOARDING_TARGET_ATTRIBUTE };

// ============================================================================
// BOARD-SPECIFIC STATE
// ============================================================================

interface BoardOnboardingData {
  hasSampleData: boolean;
  quickStartUsed: boolean;
}

const DEFAULT_BOARD_DATA: BoardOnboardingData = {
  hasSampleData: false,
  quickStartUsed: false,
};

/**
 * Sanitize project path to create a storage key
 */
function sanitizeProjectPath(projectPath: string): string {
  return projectPath.replace(/[^a-zA-Z0-9]/g, '_').slice(0, PROJECT_PATH_HASH_MAX_LENGTH);
}

/**
 * Get storage key for board-specific data
 */
function getBoardDataStorageKey(projectPath: string): string {
  const hash = sanitizeProjectPath(projectPath);
  return `${BOARD_ONBOARDING_STORAGE_KEY}:${hash}`;
}

/**
 * Load board-specific onboarding data from localStorage
 */
function loadBoardData(projectPath: string): BoardOnboardingData {
  try {
    const key = getBoardDataStorageKey(projectPath);
    const stored = getItem(key);
    if (stored) {
      return JSON.parse(stored) as BoardOnboardingData;
    }
  } catch (error) {
    logger.error('Failed to load board onboarding data:', error);
  }
  return { ...DEFAULT_BOARD_DATA };
}

/**
 * Save board-specific onboarding data to localStorage
 */
function saveBoardData(projectPath: string, data: BoardOnboardingData): void {
  try {
    const key = getBoardDataStorageKey(projectPath);
    setItem(key, JSON.stringify(data));
  } catch (error) {
    logger.error('Failed to save board onboarding data:', error);
  }
}

/**
 * Track analytics event (placeholder)
 */
function trackAnalytics(event: string, data?: Record<string, unknown>): void {
  logger.debug(`[Analytics] ${event}`, data);
}

// ============================================================================
// HOOK
// ============================================================================

export interface UseBoardOnboardingOptions {
  projectPath: string | null;
}

export interface UseBoardOnboardingResult {
  // From shared wizard hook
  isWizardVisible: boolean;
  currentStep: number;
  currentStepData: OnboardingStep | null;
  totalSteps: number;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  goToStep: (step: number) => void;
  startWizard: () => void;
  completeWizard: () => void;
  skipWizard: () => void;
  isCompleted: boolean;
  isSkipped: boolean;

  // Board-specific
  hasSampleData: boolean;
  setHasSampleData: (has: boolean) => void;
  markQuickStartUsed: () => void;

  // Steps data for component
  steps: OnboardingStep[];
}

export function useBoardOnboarding({
  projectPath,
}: UseBoardOnboardingOptions): UseBoardOnboardingResult {
  // Board-specific state for sample data
  const [boardData, setBoardData] = useState<BoardOnboardingData>(DEFAULT_BOARD_DATA);

  // Create storage key from project path
  const storageKey = projectPath ? `board:${sanitizeProjectPath(projectPath)}` : 'board:default';

  // Use the shared onboarding wizard hook
  const wizard = useOnboardingWizard({
    storageKey,
    steps: BOARD_WIZARD_STEPS,
  });

  // Load board-specific data when project changes
  useEffect(() => {
    if (!projectPath) {
      setBoardData(DEFAULT_BOARD_DATA);
      return;
    }

    const data = loadBoardData(projectPath);
    setBoardData(data);
  }, [projectPath]);

  // Update board data helper
  const updateBoardData = useCallback(
    (updates: Partial<BoardOnboardingData>) => {
      if (!projectPath) return;

      setBoardData((prev) => {
        const newData = { ...prev, ...updates };
        saveBoardData(projectPath, newData);
        return newData;
      });
    },
    [projectPath]
  );

  // Sample data handlers
  const setHasSampleData = useCallback(
    (has: boolean) => {
      updateBoardData({ hasSampleData: has });
      if (!has) {
        trackAnalytics(BOARD_ONBOARDING_ANALYTICS.SAMPLE_DATA_CLEARED, { projectPath });
      }
    },
    [projectPath, updateBoardData]
  );

  const markQuickStartUsed = useCallback(() => {
    updateBoardData({ quickStartUsed: true, hasSampleData: true });
    trackAnalytics(BOARD_ONBOARDING_ANALYTICS.QUICK_START_USED, { projectPath });
  }, [projectPath, updateBoardData]);

  return {
    // Spread shared wizard state and actions
    isWizardVisible: wizard.isVisible,
    currentStep: wizard.currentStep,
    currentStepData: wizard.currentStepData,
    totalSteps: wizard.totalSteps,
    goToNextStep: wizard.goToNextStep,
    goToPreviousStep: wizard.goToPreviousStep,
    goToStep: wizard.goToStep,
    startWizard: wizard.startWizard,
    completeWizard: wizard.completeWizard,
    skipWizard: wizard.skipWizard,
    isCompleted: wizard.isCompleted,
    isSkipped: wizard.isSkipped,

    // Board-specific
    hasSampleData: boardData.hasSampleData,
    setHasSampleData,
    markQuickStartUsed,

    // Steps data
    steps: BOARD_WIZARD_STEPS,
  };
}
