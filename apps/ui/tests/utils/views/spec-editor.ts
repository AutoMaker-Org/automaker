import { Page, Locator } from '@playwright/test';
import { clickElement } from '../core/interactions';
import { navigateToSpec } from '../navigation/views';

/**
 * Get the spec editor element
 */
export async function getSpecEditor(page: Page): Promise<Locator> {
  return page.locator('[data-testid="spec-editor"]');
}

/**
 * Get the spec editor content
 */
export async function getSpecEditorContent(page: Page): Promise<string> {
  const editor = await getSpecEditor(page);
  return await editor.inputValue();
}

/**
 * Set the spec editor content
 */
export async function setSpecEditorContent(page: Page, content: string): Promise<void> {
  const editor = await getSpecEditor(page);
  await editor.fill(content);
}

/**
 * Click the reload spec button
 */
export async function clickReloadSpec(page: Page): Promise<void> {
  await clickElement(page, 'reload-spec');
}

/**
 * Check if the spec view path display shows the correct .automaker path
 */
export async function getDisplayedSpecPath(page: Page): Promise<string | null> {
  const specView = page.locator('[data-testid="spec-view"]');
  const pathElement = specView.locator('p.text-muted-foreground').first();
  return await pathElement.textContent();
}

/**
 * Navigate to the spec editor view
 */
export async function navigateToSpecEditor(page: Page): Promise<void> {
  await navigateToSpec(page);
}

/**
 * Get the CodeMirror editor content
 * Waits for CodeMirror to be ready and returns the content
 */
export async function getEditorContent(page: Page): Promise<string> {
  // CodeMirror uses a contenteditable div with class .cm-content
  // Wait for it to be visible and then read its textContent
  const contentElement = page.locator('[data-testid="spec-editor"] .cm-content');
  await contentElement.waitFor({ state: 'visible', timeout: 10000 });

  // Read the content - CodeMirror should have updated its DOM by now
  const content = await contentElement.textContent();
  return content || '';
}

/**
 * Set the CodeMirror editor content by selecting all and typing
 */
export async function setEditorContent(page: Page, content: string): Promise<void> {
  // Click on the editor to focus it
  const editor = page.locator('[data-testid="spec-editor"] .cm-content');
  await editor.click();

  // Wait for focus
  await page.waitForTimeout(200);

  // Select all content
  await page.keyboard.press('ControlOrMeta+a');

  // Wait for selection
  await page.waitForTimeout(100);

  // Delete the selected content first
  await page.keyboard.press('Backspace');

  // Wait for deletion
  await page.waitForTimeout(100);

  // Type the new content
  await page.keyboard.type(content, { delay: 10 });

  // Wait for typing to complete
  await page.waitForTimeout(200);
}

/**
 * Click the save button
 */
export async function clickSaveButton(page: Page): Promise<void> {
  const saveButton = page.locator('[data-testid="save-spec"]');
  await saveButton.click();

  // Wait for the button text to change to "Saved" indicating save is complete
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="save-spec"]');
      return btn?.textContent?.includes('Saved');
    },
    { timeout: 5000 }
  );
}
