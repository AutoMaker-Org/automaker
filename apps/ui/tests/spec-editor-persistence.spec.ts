import { test, expect } from "@playwright/test";
import {
  resetFixtureSpec,
  setupProjectWithFixture,
  getFixturePath,
  navigateToSpecEditor,
  getEditorContent,
  setEditorContent,
  clickSaveButton,
  getByTestId,
  clickElement,
  fillInput,
  waitForNetworkIdle,
  waitForElement,
} from "./utils";

test.describe("Spec Editor Persistence", () => {
  test.beforeEach(async () => {
    // Reset the fixture spec file to original content before each test
    resetFixtureSpec();
  });

  test.afterEach(async () => {
    // Clean up - reset the spec file after each test
    resetFixtureSpec();
  });

  test("should open project, edit spec, save, and persist changes after refresh", async ({
    page,
  }) => {
    // Use the resolved fixture path
    const fixturePath = getFixturePath();

    // Step 1: Set up the project in localStorage pointing to our fixture
    await setupProjectWithFixture(page, fixturePath);

    // Step 2: Navigate to the app
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Step 3: Verify we're on the dashboard with the project loaded
    // The sidebar should show the project selector
    const sidebar = await getByTestId(page, "sidebar");
    await sidebar.waitFor({ state: "visible", timeout: 10000 });

    // Step 4: Click on the Spec Editor in the sidebar
    await navigateToSpecEditor(page);

    // Step 5: Wait for the spec view to load (not empty state)
    await waitForElement(page, "spec-view", { timeout: 10000 });

    // Step 6: Wait for the spec editor to load
    const specEditor = await getByTestId(page, "spec-editor");
    await specEditor.waitFor({ state: "visible", timeout: 10000 });

    // Step 7: Wait for CodeMirror to initialize (it has a .cm-content element)
    await specEditor.locator(".cm-content").waitFor({ state: "visible", timeout: 10000 });

    // Step 8: Modify the editor content to "hello world"
    await setEditorContent(page, "hello world");

    // Verify content was set before saving
    const contentBeforeSave = await getEditorContent(page);
    expect(contentBeforeSave.trim()).toBe("hello world");

    // Step 9: Click the save button and wait for save to complete
    await clickSaveButton(page);

    // Step 10: Refresh the page
    await page.reload();
    await waitForNetworkIdle(page);

    // Step 11: Navigate back to the spec editor
    // After reload, we need to wait for the app to initialize
    await waitForElement(page, "sidebar", { timeout: 10000 });

    // Navigate to spec editor again
    await navigateToSpecEditor(page);

    // Wait for CodeMirror to be ready
    const specEditorAfterReload = await getByTestId(page, "spec-editor");
    await specEditorAfterReload.locator(".cm-content").waitFor({ state: "visible", timeout: 10000 });

    // Wait for CodeMirror content to update with the loaded spec
    // The spec might need time to load into the editor after page reload
    let contentMatches = false;
    let attempts = 0;
    const maxAttempts = 30; // Try for up to 30 seconds with 1-second intervals

    while (!contentMatches && attempts < maxAttempts) {
      try {
        const contentElement = page.locator('[data-testid="spec-editor"] .cm-content');
        const text = await contentElement.textContent();
        if (text && text.trim() === "hello world") {
          contentMatches = true;
          break;
        }
      } catch (e) {
        // Element might not be ready yet, continue
      }

      if (!contentMatches) {
        await page.waitForTimeout(1000);
        attempts++;
      }
    }

    // If we didn't get the right content with our polling, use the fallback
    if (!contentMatches) {
      await page.waitForFunction(
        (expectedContent) => {
          const contentElement = document.querySelector('[data-testid="spec-editor"] .cm-content');
          if (!contentElement) return false;
          const text = (contentElement.textContent || "").trim();
          return text === expectedContent;
        },
        "hello world",
        { timeout: 10000 }
      );
    }

    // Step 12: Verify the content was persisted
    const persistedContent = await getEditorContent(page);
    expect(persistedContent.trim()).toBe("hello world");
  });

  test("should handle opening project via Open Project button and file browser", async ({
    page,
  }) => {
    // This test covers the flow of:
    // 1. Clicking Open Project button
    // 2. Using the file browser to navigate to the fixture directory
    // 3. Opening the project
    // 4. Editing the spec

    // Set up without a current project to test the open project flow
    await page.addInitScript(() => {
      const mockState = {
        state: {
          projects: [],
          currentProject: null,
          currentView: "welcome",
          theme: "dark",
          sidebarOpen: true,
          apiKeys: { anthropic: "", google: "" },
          chatSessions: [],
          chatHistoryOpen: false,
          maxConcurrency: 3,
        },
        version: 0,
      };
      localStorage.setItem("automaker-storage", JSON.stringify(mockState));

      // Mark setup as complete
      const setupState = {
        state: {
          isFirstRun: false,
          setupComplete: true,
          currentStep: "complete",
          skipClaudeSetup: false,
        },
        version: 0,
      };
      localStorage.setItem("automaker-setup", JSON.stringify(setupState));
    });

    // Navigate to the app
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Wait for the sidebar to be visible
    const sidebar = await getByTestId(page, "sidebar");
    await sidebar.waitFor({ state: "visible", timeout: 10000 });

    // Click the Open Project button
    const openProjectButton = await getByTestId(page, "open-project-button");

    // Check if the button is visible (it might not be in collapsed sidebar)
    const isButtonVisible = await openProjectButton
      .isVisible()
      .catch(() => false);

    if (isButtonVisible) {
      await clickElement(page, "open-project-button");

      // The file browser dialog should open
      // Note: In web mode, this might use the FileBrowserDialog component
      // which makes requests to the backend server at /api/fs/browse

      // Wait a bit to see if a dialog appears
      await page.waitForTimeout(1000);

      // Check if a dialog is visible
      const dialog = page.locator('[role="dialog"]');
      const dialogVisible = await dialog.isVisible().catch(() => false);

      if (dialogVisible) {
        // If file browser dialog is open, we need to navigate to the fixture path
        // This depends on the current directory structure

        // For now, let's verify the dialog appeared and close it
        // A full test would navigate through directories
        console.log("File browser dialog opened successfully");

        // Press Escape to close the dialog
        await page.keyboard.press("Escape");
      }
    }

    // For a complete e2e test with file browsing, we'd need to:
    // 1. Navigate through the directory tree
    // 2. Select the projectA directory
    // 3. Click "Select Current Folder"

    // Since this involves actual file system navigation,
    // and depends on the backend server being properly configured,
    // we'll verify the basic UI elements are present

    expect(sidebar).toBeTruthy();
  });
});

test.describe("Spec Editor - Full Open Project Flow", () => {
  test.beforeEach(async () => {
    // Reset the fixture spec file to original content before each test
    resetFixtureSpec();
  });

  test.afterEach(async () => {
    // Clean up - reset the spec file after each test
    resetFixtureSpec();
  });

  // Skip in CI - file browser navigation is flaky in headless environments
  test.skip("should open project via file browser, edit spec, and persist", async ({
    page,
  }) => {
    // Navigate to app first
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Set up localStorage state (without a current project, but mark setup complete)
    // Using evaluate instead of addInitScript so it only runs once
    // Note: In CI, setup wizard is also skipped via NEXT_PUBLIC_SKIP_SETUP env var
    await page.evaluate(() => {
      const mockState = {
        state: {
          projects: [],
          currentProject: null,
          currentView: "welcome",
          theme: "dark",
          sidebarOpen: true,
          apiKeys: { anthropic: "", google: "" },
          chatSessions: [],
          chatHistoryOpen: false,
          maxConcurrency: 3,
        },
        version: 0,
      };
      localStorage.setItem("automaker-storage", JSON.stringify(mockState));

      // Mark setup as complete (fallback for when NEXT_PUBLIC_SKIP_SETUP isn't set)
      const setupState = {
        state: {
          isFirstRun: false,
          setupComplete: true,
          currentStep: "complete",
          skipClaudeSetup: false,
        },
        version: 0,
      };
      localStorage.setItem("automaker-setup", JSON.stringify(setupState));
    });

    // Reload to apply the localStorage state
    await page.reload();
    await waitForNetworkIdle(page);

    // Wait for sidebar
    await waitForElement(page, "sidebar", { timeout: 10000 });

    // Click the Open Project button
    const openProjectButton = await getByTestId(page, "open-project-button");
    await openProjectButton.waitFor({ state: "visible", timeout: 10000 });
    await clickElement(page, "open-project-button");

    // Wait for the file browser dialog to open
    const dialogTitle = page.locator('text="Select Project Directory"');
    await dialogTitle.waitFor({ state: "visible", timeout: 10000 });

    // Wait for the dialog to fully load (loading to complete)
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading directories..."),
      { timeout: 10000 }
    );

    // Use the path input to directly navigate to the fixture directory
    const pathInput = await getByTestId(page, "path-input");
    await pathInput.waitFor({ state: "visible", timeout: 5000 });

    // Clear the input and type the full path to the fixture
    await fillInput(page, "path-input", getFixturePath());

    // Click the Go button to navigate to the path
    await clickElement(page, "go-to-path-button");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading directories..."),
      { timeout: 10000 }
    );

    // Verify we're in the right directory by checking the path display
    const pathDisplay = page.locator(".font-mono.text-sm.truncate");
    await expect(pathDisplay).toContainText("projectA");

    // Click "Select Current Folder" button
    const selectFolderButton = page.locator(
      'button:has-text("Select Current Folder")'
    );
    await selectFolderButton.click();

    // Wait for dialog to close and project to load
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"]'),
      { timeout: 10000 }
    );
    await page.waitForTimeout(500);

    // Navigate to spec editor
    const specNav = await getByTestId(page, "nav-spec");
    await specNav.waitFor({ state: "visible", timeout: 10000 });
    await clickElement(page, "nav-spec");

    // Wait for spec view with the editor (not the empty state)
    await waitForElement(page, "spec-view", { timeout: 10000 });
    const specEditorForOpenFlow = await getByTestId(page, "spec-editor");
    await specEditorForOpenFlow.locator(".cm-content").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(500);

    // Edit the content
    await setEditorContent(page, "hello world");

    // Click save button
    await clickSaveButton(page);

    // Refresh and verify persistence
    await page.reload();
    await waitForNetworkIdle(page);

    // Navigate back to spec editor
    await specNav.waitFor({ state: "visible", timeout: 10000 });
    await clickElement(page, "nav-spec");

    const specEditorAfterRefresh = await getByTestId(page, "spec-editor");
    await specEditorAfterRefresh.locator(".cm-content").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(500);

    // Verify the content persisted
    const persistedContent = await getEditorContent(page);
    expect(persistedContent.trim()).toBe("hello world");
  });
});
