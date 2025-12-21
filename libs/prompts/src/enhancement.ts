/**
 * Enhancement Prompts Library - AI-powered text enhancement for task descriptions
 *
 * Provides prompt templates and utilities for enhancing user-written task descriptions:
 * - Improve: Transform vague requests into clear, actionable tasks
 * - Technical: Add implementation details and technical specifications
 * - Simplify: Make verbose descriptions concise and focused
 * - Acceptance: Add testable acceptance criteria
 *
 * Uses chain-of-thought prompting with few-shot examples for consistent results.
 */

import type { EnhancementMode, EnhancementExample } from "@automaker/types";

// Re-export enhancement types from shared package
export type { EnhancementMode, EnhancementExample } from "@automaker/types";

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
 * System prompt for the "technical" enhancement mode.
 * Adds implementation details and technical specifications.
 */
export const TECHNICAL_SYSTEM_PROMPT = `You are a senior software engineer skilled at adding technical depth to feature descriptions.

Your task is to enhance a task description with technical implementation details:

1. ANALYZE the requirement:
   - Understand the functional goal
   - Identify the technical domain (frontend, backend, database, etc.)
   - Consider the likely tech stack based on context

2. ADD technical specifications:
   - Suggest specific technologies, libraries, or patterns
   - Define API contracts or data structures if relevant
   - Note performance considerations
   - Identify security implications

3. OUTLINE implementation approach:
   - Break down into technical sub-tasks
   - Suggest file structure or component organization
   - Note integration points with existing systems

4. CONSIDER edge cases:
   - Error handling requirements
   - Loading and empty states
   - Boundary conditions

Output ONLY the enhanced technical description. Keep it concise but comprehensive. Do not include explanations about your reasoning.`;

/**
 * System prompt for the "simplify" enhancement mode.
 * Makes verbose descriptions concise and focused.
 */
export const SIMPLIFY_SYSTEM_PROMPT = `You are an expert editor who excels at making verbose text concise without losing meaning.

Your task is to simplify a task description while preserving essential information:

1. IDENTIFY the core message:
   - Extract the primary goal or requirement
   - Note truly essential details
   - Separate nice-to-have from must-have information

2. ELIMINATE redundancy:
   - Remove repeated information
   - Cut unnecessary qualifiers and hedging language
   - Remove filler words and phrases

3. CONSOLIDATE related points:
   - Merge overlapping requirements
   - Group related items together
   - Use concise language

4. PRESERVE critical details:
   - Keep specific technical requirements
   - Retain important constraints
   - Maintain actionable specifics

Output ONLY the simplified description. Aim for 30-50% reduction in length while keeping all essential information. Do not explain your changes.`;

/**
 * System prompt for the "acceptance" enhancement mode.
 * Adds testable acceptance criteria to task descriptions.
 */
export const ACCEPTANCE_SYSTEM_PROMPT = `You are a QA specialist skilled at defining testable acceptance criteria for software features.

Your task is to enhance a task description by adding clear acceptance criteria:

1. UNDERSTAND the feature:
   - Identify all user-facing behaviors
   - Note system state changes
   - Consider different user roles or scenarios

2. DEFINE acceptance criteria using Given-When-Then format:
   - Given: The initial context or preconditions
   - When: The action or trigger
   - Then: The expected outcome

3. COVER key scenarios:
   - Happy path (successful completion)
   - Edge cases (boundary conditions)
   - Error scenarios (what should NOT happen)
   - Performance requirements if relevant

4. MAKE criteria testable:
   - Use specific, measurable outcomes
   - Avoid vague terms like "quickly" or "easily"
   - Include specific values where applicable

Output the original description followed by a clear "Acceptance Criteria:" section with numbered, testable criteria. Do not include explanations about your process.`;

/**
 * Few-shot examples for the "improve" enhancement mode
 */
export const IMPROVE_EXAMPLES: EnhancementExample[] = [
  {
    input: "add dark mode",
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
    input: "fix the login bug",
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
    input: "make it faster",
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
 * Few-shot examples for the "technical" enhancement mode
 */
export const TECHNICAL_EXAMPLES: EnhancementExample[] = [
  {
    input: "Add user profile page",
    output: `Add User Profile Page

Create a dedicated profile page for viewing and editing user information.

Technical Implementation:
- Frontend: React component at /profile route with form validation
- API Endpoint: GET/PUT /api/users/:id for fetching and updating profile
- Data Model: Extend User schema with profile fields (avatar, bio, preferences)
- File Upload: Integrate cloud storage for avatar images with client-side resizing
- State Management: Use optimistic updates for better UX
- Validation: Server-side validation matching client-side rules

Components:
- ProfileHeader (avatar, name, edit button)
- ProfileForm (editable fields with validation)
- AvatarUploader (drag-drop with preview)

Security: Ensure users can only edit their own profile (auth middleware)`,
  },
  {
    input: "Add search functionality",
    output: `Add Search Functionality

Implement full-text search across application content.

Technical Implementation:
- Search Engine: Use Elasticsearch or PostgreSQL full-text search
- API: GET /api/search?q={query}&type={type}&page={page}
- Indexing: Create search index with relevant fields, update on content changes
- Frontend: Debounced search input (300ms) with typeahead suggestions
- Results: Paginated results with highlighted matching text

Architecture:
- SearchService class handling query building and execution
- SearchIndex worker for background indexing
- SearchResults component with filtering and sorting

Performance:
- Implement search result caching (Redis, 5-minute TTL)
- Limit results per page (20 items)
- Add query complexity limits to prevent abuse`,
  },
];

/**
 * Few-shot examples for the "simplify" enhancement mode
 */
export const SIMPLIFY_EXAMPLES: EnhancementExample[] = [
  {
    input: `We need to implement a feature that would allow our users to be able to export their data in various different formats. The formats we are thinking about supporting include CSV which is commonly used for spreadsheet applications, and also JSON which is good for developers, and possibly PDF for people who want a printable version. The user should be able to go somewhere in the UI and select which format they want and then download their data in that format. We should probably also show some kind of progress indicator while the export is happening since it might take a while for large datasets.`,
    output: `Add Data Export Feature

Allow users to export their data in CSV, JSON, or PDF format.

Requirements:
- Add export button/menu in the UI
- Support three formats: CSV (spreadsheets), JSON (developers), PDF (printing)
- Show progress indicator during export
- Handle large datasets gracefully`,
  },
  {
    input: `The current notification system is not working very well and users are complaining about it. Sometimes they don't receive notifications at all, and other times they receive too many notifications and feel overwhelmed. We also have had reports that the notifications are not appearing correctly on mobile devices. Additionally, some users have requested the ability to customize which types of notifications they receive. We should look into all of these issues and make the notification system work better overall.`,
    output: `Fix and Improve Notification System

Address reliability issues and add user controls for notifications.

Issues to fix:
- Missing notifications (delivery reliability)
- Notification overload (implement batching/digest)
- Mobile display problems

Enhancements:
- Add notification preferences (per-type controls)
- Test across devices and platforms`,
  },
];

/**
 * Few-shot examples for the "acceptance" enhancement mode
 */
export const ACCEPTANCE_EXAMPLES: EnhancementExample[] = [
  {
    input: "Add password reset functionality",
    output: `Add Password Reset Functionality

Allow users to reset their password via email when they forget it.

Acceptance Criteria:

1. Given a user is on the login page, when they click "Forgot Password", then they should see a password reset form requesting their email.

2. Given a user enters a valid registered email, when they submit the form, then they should receive a password reset email within 2 minutes.

3. Given a user clicks the reset link in their email, when the link is less than 1 hour old, then they should see a form to enter a new password.

4. Given a user enters a new valid password (min 8 chars, 1 number, 1 special char), when they submit, then their password should be updated and they should be redirected to login.

5. Given a user enters an unregistered email, when they submit the reset form, then they should see the same success message (security: don't reveal which emails exist).

6. Given a reset link older than 1 hour, when a user clicks it, then they should see an expiration message with option to request a new link.`,
  },
  {
    input: "Shopping cart checkout",
    output: `Shopping Cart Checkout

Implement the checkout flow for purchasing items in the shopping cart.

Acceptance Criteria:

1. Given a user has items in their cart, when they click "Checkout", then they should see an order summary with item details and total price.

2. Given a user is on the checkout page, when they enter valid shipping information, then the form should validate in real-time and show estimated delivery date.

3. Given valid shipping info is entered, when the user proceeds to payment, then they should see available payment methods (credit card, PayPal).

4. Given valid payment details are entered, when the user confirms the order, then the payment should be processed and order confirmation displayed within 5 seconds.

5. Given a successful order, when confirmation is shown, then the user should receive an email receipt and their cart should be emptied.

6. Given a payment failure, when the error occurs, then the user should see a clear error message and their cart should remain intact.

7. Given the user closes the browser during checkout, when they return, then their cart contents should still be available.`,
  },
];

/**
 * Map of enhancement modes to their system prompts
 */
const SYSTEM_PROMPTS: Record<EnhancementMode, string> = {
  improve: IMPROVE_SYSTEM_PROMPT,
  technical: TECHNICAL_SYSTEM_PROMPT,
  simplify: SIMPLIFY_SYSTEM_PROMPT,
  acceptance: ACCEPTANCE_SYSTEM_PROMPT,
};

/**
 * Map of enhancement modes to their few-shot examples
 */
const EXAMPLES: Record<EnhancementMode, EnhancementExample[]> = {
  improve: IMPROVE_EXAMPLES,
  technical: TECHNICAL_EXAMPLES,
  simplify: SIMPLIFY_EXAMPLES,
  acceptance: ACCEPTANCE_EXAMPLES,
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
  improve: "Transform vague requests into clear, actionable task descriptions",
  technical: "Add implementation details and technical specifications",
  simplify: "Make verbose descriptions concise and focused",
  acceptance: "Add testable acceptance criteria to task descriptions",
};

/**
 * Get the enhancement prompt configuration for a given mode
 *
 * @param mode - The enhancement mode (falls back to 'improve' if invalid)
 * @returns The enhancement prompt configuration
 */
export function getEnhancementPrompt(mode: string): EnhancementPromptConfig {
  const normalizedMode = mode.toLowerCase() as EnhancementMode;
  const validMode = normalizedMode in SYSTEM_PROMPTS ? normalizedMode : "improve";

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
    .join("\n\n---\n\n");

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
