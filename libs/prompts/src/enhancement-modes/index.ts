/**
 * Enhancement Modes Index
 *
 * Central export point for all enhancement mode definitions.
 * Each mode exports:
 * - System prompt constant
 * - Examples array
 * - Description string
 */

export { IMPROVE_SYSTEM_PROMPT, IMPROVE_EXAMPLES, IMPROVE_DESCRIPTION } from './improve.js';

export { TECHNICAL_SYSTEM_PROMPT, TECHNICAL_EXAMPLES, TECHNICAL_DESCRIPTION } from './technical.js';

export { SIMPLIFY_SYSTEM_PROMPT, SIMPLIFY_EXAMPLES, SIMPLIFY_DESCRIPTION } from './simplify.js';

export {
  ACCEPTANCE_SYSTEM_PROMPT,
  ACCEPTANCE_EXAMPLES,
  ACCEPTANCE_DESCRIPTION,
} from './acceptance.js';

export {
  UX_REVIEWER_SYSTEM_PROMPT,
  UX_REVIEWER_EXAMPLES,
  UX_REVIEWER_DESCRIPTION,
} from './ux-reviewer.js';
