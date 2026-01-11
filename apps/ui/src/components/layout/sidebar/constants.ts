import { darkThemes, lightThemes } from '@/config/theme-options';

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
