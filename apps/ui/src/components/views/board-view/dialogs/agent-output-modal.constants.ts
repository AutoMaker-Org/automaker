/**
 * Constants for AgentOutputModal component
 * Centralizes magic numbers, timeouts, and configuration values
 */

export const MODAL_CONSTANTS = {
  // Auto-scroll threshold for detecting when user is at bottom
  AUTOSCROLL_THRESHOLD: 50,

  // Delay for closing modal after successful completion
  MODAL_CLOSE_DELAY_MS: 1500,

  // Modal height constraints for different viewports
  HEIGHT_CONSTRAINTS: {
    MOBILE_MAX_DVH: '85dvh',
    SMALL_MAX_VH: '80vh',
    TABLET_MAX_VH: '85vh',
  },

  // Modal width constraints for different viewports
  WIDTH_CONSTRAINTS: {
    MOBILE_MAX_CALC: 'calc(100% - 2rem)',
    SMALL_MAX_VW: '60vw',
    TABLET_MAX_VW: '90vw',
    TABLET_MAX_WIDTH: '1200px',
  },

  // View modes
  VIEW_MODES: {
    SUMMARY: 'summary',
    PARSED: 'parsed',
    RAW: 'raw',
    CHANGES: 'changes',
  } as const,

  // Component heights (complete Tailwind class fragments for template interpolation)
  COMPONENT_HEIGHTS: {
    SMALL_MIN: 'sm:min-h-[200px]',
    SMALL_MAX: 'sm:max-h-[60vh]',
  },
} as const;
