/**
 * "Acceptance" Enhancement Mode
 * Adds testable acceptance criteria to task descriptions.
 */

import type { EnhancementExample } from '@automaker/types';

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
 * Few-shot examples for the "acceptance" enhancement mode
 */
export const ACCEPTANCE_EXAMPLES: EnhancementExample[] = [
  {
    input: 'Add password reset functionality',
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
    input: 'Shopping cart checkout',
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
 * Description of what this enhancement mode does
 */
export const ACCEPTANCE_DESCRIPTION = 'Add testable acceptance criteria to task descriptions';
