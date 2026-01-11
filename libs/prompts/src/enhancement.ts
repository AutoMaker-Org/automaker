/**
 * Enhancement Prompts Library - AI-powered text enhancement for task descriptions
 *
 * Provides prompt templates and utilities for enhancing user-written task descriptions:
 * - Improve: Transform vague requests into clear, actionable tasks
 * - Technical: Add implementation details and technical specifications
 * - Simplify: Make verbose descriptions concise and focused
 * - Acceptance: Add testable acceptance criteria
 * - UX Reviewer: Review and enhance from a user experience and design perspective
 *
 * Uses chain-of-thought prompting with few-shot examples for consistent results.
 */

import type { EnhancementMode, EnhancementExample } from '@automaker/types';

// Re-export enhancement types from shared package
export type { EnhancementMode, EnhancementExample } from '@automaker/types';

// Import all enhancement mode definitions from separate files
import {
  IMPROVE_SYSTEM_PROMPT,
  IMPROVE_EXAMPLES,
  IMPROVE_DESCRIPTION,
  TECHNICAL_SYSTEM_PROMPT,
  TECHNICAL_EXAMPLES,
  TECHNICAL_DESCRIPTION,
  SIMPLIFY_SYSTEM_PROMPT,
  SIMPLIFY_EXAMPLES,
  SIMPLIFY_DESCRIPTION,
  ACCEPTANCE_SYSTEM_PROMPT,
  ACCEPTANCE_EXAMPLES,
  ACCEPTANCE_DESCRIPTION,
  UX_REVIEWER_SYSTEM_PROMPT,
  UX_REVIEWER_EXAMPLES,
  UX_REVIEWER_DESCRIPTION,
} from './enhancement-modes/index.js';

// Re-export system prompts and examples for backward compatibility
export {
  IMPROVE_SYSTEM_PROMPT,
  IMPROVE_EXAMPLES,
  TECHNICAL_SYSTEM_PROMPT,
  TECHNICAL_EXAMPLES,
  SIMPLIFY_SYSTEM_PROMPT,
  SIMPLIFY_EXAMPLES,
  ACCEPTANCE_SYSTEM_PROMPT,
  ACCEPTANCE_EXAMPLES,
  UX_REVIEWER_SYSTEM_PROMPT,
  UX_REVIEWER_EXAMPLES,
} from './enhancement-modes/index.js';

/**
 * Map of enhancement modes to their system prompts
 */
const SYSTEM_PROMPTS: Record<EnhancementMode, string> = {
  improve: IMPROVE_SYSTEM_PROMPT,
  technical: TECHNICAL_SYSTEM_PROMPT,
  simplify: SIMPLIFY_SYSTEM_PROMPT,
  acceptance: ACCEPTANCE_SYSTEM_PROMPT,
  'ux-reviewer': UX_REVIEWER_SYSTEM_PROMPT,
};

/**
 * Map of enhancement modes to their few-shot examples
 */
const EXAMPLES: Record<EnhancementMode, EnhancementExample[]> = {
  improve: IMPROVE_EXAMPLES,
  technical: TECHNICAL_EXAMPLES,
  simplify: SIMPLIFY_EXAMPLES,
  acceptance: ACCEPTANCE_EXAMPLES,
  'ux-reviewer': UX_REVIEWER_EXAMPLES,
};

/**
 * Enhancement prompt configuration returned by getEnhancementPrompt
 */
export interface EnhancementPromptConfig {
  /** System prompt for the enhancement mode */
  systemPrompt: string;
  /** Description of what this mode does */
  description: string;
}

/**
 * Descriptions for each enhancement mode
 */
const MODE_DESCRIPTIONS: Record<EnhancementMode, string> = {
  improve: IMPROVE_DESCRIPTION,
  technical: TECHNICAL_DESCRIPTION,
  simplify: SIMPLIFY_DESCRIPTION,
  acceptance: ACCEPTANCE_DESCRIPTION,
  'ux-reviewer': UX_REVIEWER_DESCRIPTION,
};

/**
 * Get the enhancement prompt configuration for a given mode
 *
 * @param mode - The enhancement mode (falls back to 'improve' if invalid)
 * @returns The enhancement prompt configuration
 */
export function getEnhancementPrompt(mode: string): EnhancementPromptConfig {
  const normalizedMode = mode.toLowerCase() as EnhancementMode;
  const validMode = normalizedMode in SYSTEM_PROMPTS ? normalizedMode : 'improve';

  return {
    systemPrompt: SYSTEM_PROMPTS[validMode],
    description: MODE_DESCRIPTIONS[validMode],
  };
}

/**
 * Get the system prompt for a specific enhancement mode
 *
 * @param mode - The enhancement mode to get the prompt for
 * @returns The system prompt string
 */
export function getSystemPrompt(mode: EnhancementMode): string {
  return SYSTEM_PROMPTS[mode];
}

/**
 * Get the few-shot examples for a specific enhancement mode
 *
 * @param mode - The enhancement mode to get examples for
 * @returns Array of input/output example pairs
 */
export function getExamples(mode: EnhancementMode): EnhancementExample[] {
  return EXAMPLES[mode];
}

/**
 * Build a user prompt for enhancement with optional few-shot examples
 *
 * @param mode - The enhancement mode
 * @param text - The text to enhance
 * @param includeExamples - Whether to include few-shot examples (default: true)
 * @returns The formatted user prompt string
 */
export function buildUserPrompt(
  mode: EnhancementMode,
  text: string,
  includeExamples: boolean = true
): string {
  const examples = includeExamples ? getExamples(mode) : [];

  if (examples.length === 0) {
    return `Please enhance the following task description:\n\n${text}`;
  }

  // Build few-shot examples section
  const examplesSection = examples
    .map(
      (example, index) =>
        `Example ${index + 1}:\nInput: ${example.input}\nOutput: ${example.output}`
    )
    .join('\n\n---\n\n');

  return `Here are some examples of how to enhance task descriptions:

${examplesSection}

---

Now, please enhance the following task description:

${text}`;
}

/**
 * Check if a mode is a valid enhancement mode
 *
 * @param mode - The mode to check
 * @returns True if the mode is valid
 */
export function isValidEnhancementMode(mode: string): mode is EnhancementMode {
  return mode in SYSTEM_PROMPTS;
}

/**
 * Get all available enhancement modes
 *
 * @returns Array of available enhancement mode names
 */
export function getAvailableEnhancementModes(): EnhancementMode[] {
  return Object.keys(SYSTEM_PROMPTS) as EnhancementMode[];
}
