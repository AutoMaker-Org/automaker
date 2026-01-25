import type { FeatureCount } from './types';

// Delay before reloading spec file to ensure it's written to disk
export const SPEC_FILE_WRITE_DELAY = 500;

// Interval for polling backend status during generation
export const STATUS_CHECK_INTERVAL_MS = 2000;

// Feature count options with labels and warnings
export const FEATURE_COUNT_OPTIONS: {
  value: FeatureCount;
  label: string;
  warning?: string;
}[] = [
  { value: 20, label: '20' },
  { value: 50, label: '50', warning: 'May take up to 5 minutes' },
  { value: 100, label: '100', warning: 'May take up to 5 minutes' },
];

// Phase display labels for UI
export const PHASE_LABELS: Record<string, string> = {
  initialization: 'Initializing...',
  setup: 'Setting up tools...',
  analysis: 'Analyzing project structure...',
  spec_complete: 'Spec created! Generating features...',
  feature_generation: 'Creating features from roadmap...',
  working: 'Working...',
  complete: 'Complete!',
  error: 'Error occurred',
};
