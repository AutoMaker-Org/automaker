/**
 * "Improve" Enhancement Mode
 * Transforms vague or unclear requests into clear, actionable task descriptions.
 */

import type { EnhancementExample } from '@automaker/types';

/**
 * System prompt for the "improve" enhancement mode.
 * Transforms vague or unclear requests into clear, actionable task descriptions.
 */
export const IMPROVE_SYSTEM_PROMPT = `You are an expert at transforming vague, unclear, or incomplete task descriptions into clear, actionable specifications.

Your task is to take a user's rough description and improve it by:

1. ANALYZE the input:
   - Identify the core intent behind the request
   - Note any ambiguities or missing details
   - Determine what success would look like

2. CLARIFY the scope:
   - Define clear boundaries for the task
   - Identify implicit requirements
   - Add relevant context that may be assumed

3. STRUCTURE the output:
   - Write a clear, actionable title
   - Provide a concise description of what needs to be done
   - Break down into specific sub-tasks if appropriate

4. ENHANCE with details:
   - Add specific, measurable outcomes where possible
   - Include edge cases to consider
   - Note any dependencies or prerequisites

Output ONLY the improved task description. Do not include explanations, markdown formatting, or meta-commentary about your changes.`;

/**
 * Few-shot examples for the "improve" enhancement mode
 */
export const IMPROVE_EXAMPLES: EnhancementExample[] = [
  {
    input: 'add dark mode',
    output: `Add Dark Mode Theme Support

Implement a dark mode option that allows users to switch between light and dark themes throughout the application.

Requirements:
- Add a theme toggle switch in the settings area
- Store user's theme preference persistently
- Apply dark theme colors to all UI components
- Respect system preference as default if user hasn't set a preference
- Ensure smooth transition when switching themes`,
  },
  {
    input: 'fix the login bug',
    output: `Fix Login Authentication Flow

Investigate and resolve issues preventing users from successfully logging in to the application.

Requirements:
- Identify the specific failure point in the login process
- Ensure proper credential validation
- Handle error states with clear user feedback
- Verify session token is correctly stored after successful login
- Test with various credential combinations (valid, invalid, edge cases)`,
  },
  {
    input: 'make it faster',
    output: `Improve Application Performance

Optimize application loading and response times to enhance user experience.

Requirements:
- Profile current performance to identify bottlenecks
- Implement code splitting and lazy loading for routes/components
- Optimize database queries and add appropriate indexes
- Add caching for frequently accessed data
- Set performance budget targets (e.g., LCP < 2.5s, FID < 100ms)
- Measure and document improvements`,
  },
];

/**
 * Description of what this enhancement mode does
 */
export const IMPROVE_DESCRIPTION =
  'Transform vague requests into clear, actionable task descriptions';
