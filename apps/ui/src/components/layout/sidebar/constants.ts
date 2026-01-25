import { darkThemes, lightThemes } from '@/config/theme-options';

/**
 * Shared constants for theme submenu positioning and layout.
 * Used across project-context-menu and project-selector-with-options components
 * to ensure consistent viewport-aware positioning and styling.
 */
export const THEME_SUBMENU_CONSTANTS = {
  /**
   * Estimated total height of the theme submenu content in pixels.
   * Includes all theme options, headers, padding, and "Use Global" button.
   */
  ESTIMATED_SUBMENU_HEIGHT: 620,

  /**
   * Padding from viewport edges to prevent submenu overflow.
   * Applied to both top and bottom edges when calculating available space.
   */
  COLLISION_PADDING: 32,

  /**
   * Vertical offset from context menu top to the "Project Theme" button.
   * Used for calculating submenu position relative to trigger button.
   */
  THEME_BUTTON_OFFSET: 50,

  /**
   * Height reserved for submenu header area (includes "Use Global" button and separator).
   * Subtracted from maxHeight to get scrollable content area height.
   */
  SUBMENU_HEADER_HEIGHT: 80,
} as const;

export const PROJECT_DARK_THEMES = darkThemes.map((opt) => ({
  value: opt.value,
  label: opt.label,
  icon: opt.Icon,
  color: opt.color,
}));

export const PROJECT_LIGHT_THEMES = lightThemes.map((opt) => ({
  value: opt.value,
  label: opt.label,
  icon: opt.Icon,
  color: opt.color,
}));

export const SIDEBAR_FEATURE_FLAGS = {
  hideTerminal: import.meta.env.VITE_HIDE_TERMINAL === 'true',
  hideWiki: import.meta.env.VITE_HIDE_WIKI === 'true',
  hideRunningAgents: import.meta.env.VITE_HIDE_RUNNING_AGENTS === 'true',
  hideContext: import.meta.env.VITE_HIDE_CONTEXT === 'true',
  hideSpecEditor: import.meta.env.VITE_HIDE_SPEC_EDITOR === 'true',
} as const;
