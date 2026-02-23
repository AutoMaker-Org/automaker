import type { EnhancementMode } from '@automaker/types';
export type { EnhancementMode } from '@automaker/types';

/** Labels for enhancement modes displayed in the UI */
export const ENHANCEMENT_MODE_LABELS: Record<EnhancementMode, string> = {
  improve: 'Improve Clarity',
  technical: 'Add Technical Details',
  simplify: 'Simplify',
  acceptance: 'Add Acceptance Criteria',
  'ux-reviewer': 'User Experience',
};

/** Descriptions for enhancement modes (for tooltips/accessibility) */
export const ENHANCEMENT_MODE_DESCRIPTIONS: Record<EnhancementMode, string> = {
  improve: 'Make the prompt clearer and more concise',
  technical: 'Add implementation details and specifications',
  simplify: 'Reduce complexity while keeping the core intent',
  acceptance: 'Add specific acceptance criteria and test cases',
  'ux-reviewer': 'Add user experience considerations and flows',
};

/** Modes that rewrite/replace the entire description */
export const REWRITE_MODES: EnhancementMode[] = ['improve', 'simplify'];

/** Modes that append additional content below the original description */
export const ADDITIVE_MODES: EnhancementMode[] = ['technical', 'acceptance', 'ux-reviewer'];

/** Check if a mode appends content rather than replacing */
export function isAdditiveMode(mode: EnhancementMode): boolean {
  return ADDITIVE_MODES.includes(mode);
}
