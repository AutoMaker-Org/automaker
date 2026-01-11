import type { Feature } from '@/store/app-store';
import type { PipelineConfig, FeatureStatusWithPipeline } from '@automaker/types';

export type ColumnId = Feature['status'];

export interface Column {
  id: FeatureStatusWithPipeline;
  title: string;
  colorClass: string;
  isPipelineStep?: boolean;
  pipelineStepId?: string;
}

// Base columns (start)
const BASE_COLUMNS: Column[] = [
  { id: 'backlog', title: 'Backlog', colorClass: 'bg-[var(--status-backlog)]' },
  {
    id: 'in_progress',
    title: 'In Progress',
    colorClass: 'bg-[var(--status-in-progress)]',
  },
];

// End columns (after pipeline)
const END_COLUMNS: Column[] = [
  {
    id: 'waiting_approval',
    title: 'Waiting Approval',
    colorClass: 'bg-[var(--status-waiting)]',
  },
  {
    id: 'verified',
    title: 'Verified',
    colorClass: 'bg-[var(--status-success)]',
  },
];

// Static COLUMNS for backwards compatibility (no pipeline)
export const COLUMNS: Column[] = [...BASE_COLUMNS, ...END_COLUMNS];

/**
 * Generate columns including pipeline steps
 */
export function getColumnsWithPipeline(pipelineConfig: PipelineConfig | null): Column[] {
  const pipelineSteps = pipelineConfig?.steps || [];

  if (pipelineSteps.length === 0) {
    return COLUMNS;
  }

  // Sort steps by order
  const sortedSteps = [...pipelineSteps].sort((a, b) => a.order - b.order);

  // Convert pipeline steps to columns (filter out invalid steps)
  const pipelineColumns: Column[] = sortedSteps
    .filter((step) => step && step.id) // Only include valid steps with an id
    .map((step) => ({
      id: `pipeline_${step.id}` as FeatureStatusWithPipeline,
      title: step.name || 'Pipeline Step',
      colorClass: step.colorClass || 'bg-[var(--status-in-progress)]',
      isPipelineStep: true,
      pipelineStepId: step.id,
    }));

  return [...BASE_COLUMNS, ...pipelineColumns, ...END_COLUMNS];
}

/**
 * Get the index where pipeline columns should be inserted
 * (after in_progress, before waiting_approval)
 */
export function getPipelineInsertIndex(): number {
  return BASE_COLUMNS.length;
}

/**
 * Check if a status is a pipeline status
 */
export function isPipelineStatus(status: string): boolean {
  return status.startsWith('pipeline_');
}

/**
 * Extract step ID from a pipeline status
 */
export function getStepIdFromStatus(status: string): string | null {
  if (!isPipelineStatus(status)) {
    return null;
  }
  return status.replace('pipeline_', '');
}

// ============================================================================
// SAMPLE DATA FOR ONBOARDING WIZARD
// ============================================================================

/**
 * Prefix used to identify sample/demo features in the board
 * This marker persists through the database and is used for cleanup
 */
export const SAMPLE_FEATURE_PREFIX = '[DEMO]';

/**
 * Sample feature template for Quick Start onboarding
 * These demonstrate a typical workflow progression across columns
 */
export interface SampleFeatureTemplate {
  title: string;
  description: string;
  category: string;
  status: Feature['status'];
  priority: number;
  isSampleData: true; // Marker to identify sample data
}

/**
 * Sample features that demonstrate the workflow across all columns.
 * Each feature shows a realistic task at different stages.
 */
export const SAMPLE_FEATURES: SampleFeatureTemplate[] = [
  // Backlog items - awaiting work
  {
    title: '[DEMO] Add user profile page',
    description:
      'Create a user profile page where users can view and edit their account settings, change password, and manage preferences.\n\n---\n**This is sample data** - Click the trash icon in the wizard to remove all demo items.',
    category: 'Feature',
    status: 'backlog',
    priority: 1,
    isSampleData: true,
  },
  {
    title: '[DEMO] Implement dark mode toggle',
    description:
      'Add a toggle in the settings to switch between light and dark themes. Should persist the preference across sessions.\n\n---\n**This is sample data** - Click the trash icon in the wizard to remove all demo items.',
    category: 'Enhancement',
    status: 'backlog',
    priority: 2,
    isSampleData: true,
  },

  // In Progress - currently being worked on
  {
    title: '[DEMO] Fix login timeout issue',
    description:
      'Users are being logged out after 5 minutes of inactivity. Investigate and increase the session timeout to 30 minutes.\n\n---\n**This is sample data** - Click the trash icon in the wizard to remove all demo items.',
    category: 'Bug Fix',
    status: 'in_progress',
    priority: 1,
    isSampleData: true,
  },

  // Waiting Approval - completed and awaiting review
  {
    title: '[DEMO] Update API documentation',
    description:
      'Update the API documentation to reflect recent endpoint changes and add examples for new authentication flow.\n\n---\n**This is sample data** - Click the trash icon in the wizard to remove all demo items.',
    category: 'Documentation',
    status: 'waiting_approval',
    priority: 2,
    isSampleData: true,
  },

  // Verified - approved and ready
  {
    title: '[DEMO] Add loading spinners',
    description:
      'Added loading spinner components to all async operations to improve user feedback during data fetching.\n\n---\n**This is sample data** - Click the trash icon in the wizard to remove all demo items.',
    category: 'Enhancement',
    status: 'verified',
    priority: 3,
    isSampleData: true,
  },
];

/**
 * Check if a feature is sample data
 * Uses the SAMPLE_FEATURE_PREFIX in the title as the marker for sample data
 */
export function isSampleFeature(feature: Partial<Feature>): boolean {
  // Check title prefix - this is the reliable marker that persists through the database
  return feature.title?.startsWith(SAMPLE_FEATURE_PREFIX) ?? false;
}

/**
 * Generate sample feature data with unique IDs
 * @returns Array of sample features ready to be created
 */
export function generateSampleFeatures(): Array<Omit<Feature, 'id' | 'createdAt' | 'updatedAt'>> {
  return SAMPLE_FEATURES.map((template) => ({
    title: template.title,
    description: template.description,
    category: template.category,
    status: template.status,
    priority: template.priority,
    images: [],
    imagePaths: [],
    skipTests: true,
    model: 'sonnet' as const,
    thinkingLevel: 'none' as const,
    planningMode: 'skip' as const,
    requirePlanApproval: false,
    // Mark as sample data in a way that persists
    // We use the title prefix [DEMO] as the marker
  }));
}
