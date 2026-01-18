import { Page, Locator } from '@playwright/test';

/**
 * Sanitize a string for use in data-testid selectors.
 * This mirrors the sanitizeForTestId function in apps/ui/src/lib/utils.ts
 * to ensure tests use the same sanitization logic as the component.
 *
 * @param name - The string to sanitize (e.g., project name)
 * @returns A sanitized string safe for CSS selectors
 */
export function sanitizeForTestId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get an element by its data-testid attribute
 */
export async function getByTestId(page: Page, testId: string): Promise<Locator> {
  return page.locator(`[data-testid="${testId}"]`);
}

/**
 * Get a button by its text content
 */
export async function getButtonByText(page: Page, text: string): Promise<Locator> {
  return page.locator(`button:has-text("${text}")`);
}

/**
 * Get the category autocomplete input element
 */
export async function getCategoryAutocompleteInput(
  page: Page,
  testId: string = 'feature-category-input'
): Promise<Locator> {
  return page.locator(`[data-testid="${testId}"]`);
}

/**
 * Get the category autocomplete dropdown list
 */
export async function getCategoryAutocompleteList(page: Page): Promise<Locator> {
  return page.locator('[data-testid="category-autocomplete-list"]');
}
