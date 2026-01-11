/**
 * Shared Onboarding Wizard Constants
 *
 * Layout, positioning, and timing constants for the onboarding wizard.
 */

/** Storage key prefix for onboarding state */
export const ONBOARDING_STORAGE_PREFIX = 'automaker:onboarding';

/** Padding around spotlight highlight elements (px) */
export const SPOTLIGHT_PADDING = 8;

/** Padding between target element and tooltip (px) */
export const TOOLTIP_OFFSET = 16;

/** Vertical offset from top of target to tooltip (px) */
export const TOOLTIP_TOP_OFFSET = 40;

/** Maximum tooltip width (px) */
export const TOOLTIP_MAX_WIDTH = 400;

/** Minimum safe margin from viewport edges (px) */
export const VIEWPORT_SAFE_MARGIN = 16;

/** Threshold for placing tooltip to the right of target (30% of viewport) */
export const TOOLTIP_POSITION_RIGHT_THRESHOLD = 0.3;

/** Threshold for placing tooltip to the left of target (70% of viewport) */
export const TOOLTIP_POSITION_LEFT_THRESHOLD = 0.7;

/** Threshold from bottom of viewport to trigger alternate positioning (px) */
export const BOTTOM_THRESHOLD = 450;

/** Debounce delay for resize handler (ms) */
export const RESIZE_DEBOUNCE_MS = 100;

/** Animation duration for step transitions (ms) */
export const STEP_TRANSITION_DURATION = 200;

/** ID for the wizard description element (for aria-describedby) */
export const WIZARD_DESCRIPTION_ID = 'onboarding-wizard-description';

/** ID for the wizard title element (for aria-labelledby) */
export const WIZARD_TITLE_ID = 'onboarding-wizard-title';

/** Data attribute name for targeting elements */
export const ONBOARDING_TARGET_ATTRIBUTE = 'data-onboarding-target';

/** Analytics event names for onboarding tracking */
export const ONBOARDING_ANALYTICS = {
  STARTED: 'onboarding_started',
  COMPLETED: 'onboarding_completed',
  SKIPPED: 'onboarding_skipped',
  STEP_VIEWED: 'onboarding_step_viewed',
} as const;
