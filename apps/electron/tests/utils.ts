import { Page, Locator, expect } from "@playwright/test";

/**
 * Get an element by its data-testid attribute
 */
export async function getByTestId(
  page: Page,
  testId: string
): Promise<Locator> {
  return page.locator(`[data-testid="${testId}"]`);
}

/**
 * Set up a mock project in localStorage to bypass the welcome screen
 * This simulates having opened a project before
 */
export async function setupMockProject(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockProject = {
      id: "test-project-1",
      name: "Test Project",
      path: "/mock/test-project",
      lastOpened: new Date().toISOString(),
    };

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
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
  });
}

/**
 * Click an element by its data-testid attribute
 */
export async function clickElement(page: Page, testId: string): Promise<void> {
  const element = await getByTestId(page, testId);
  await element.click();
}

/**
 * Wait for an element with a specific data-testid to appear
 */
export async function waitForElement(
  page: Page,
  testId: string,
  options?: { timeout?: number; state?: "attached" | "visible" | "hidden" }
): Promise<Locator> {
  const element = page.locator(`[data-testid="${testId}"]`);
  await element.waitFor({
    timeout: options?.timeout ?? 5000,
    state: options?.state ?? "visible",
  });
  return element;
}

/**
 * Wait for an element with a specific data-testid to be hidden
 */
export async function waitForElementHidden(
  page: Page,
  testId: string,
  options?: { timeout?: number }
): Promise<void> {
  const element = page.locator(`[data-testid="${testId}"]`);
  await element.waitFor({
    timeout: options?.timeout ?? 5000,
    state: "hidden",
  });
}

/**
 * Get a button by its text content
 */
export async function getButtonByText(
  page: Page,
  text: string
): Promise<Locator> {
  return page.locator(`button:has-text("${text}")`);
}

/**
 * Click a button by its text content
 */
export async function clickButtonByText(
  page: Page,
  text: string
): Promise<void> {
  const button = await getButtonByText(page, text);
  await button.click();
}

/**
 * Fill an input field by its data-testid attribute
 */
export async function fillInput(
  page: Page,
  testId: string,
  value: string
): Promise<void> {
  const input = await getByTestId(page, testId);
  await input.fill(value);
}

/**
 * Navigate to the board/kanban view
 */
export async function navigateToBoard(page: Page): Promise<void> {
  await page.goto("/");

  // Wait for the page to load
  await page.waitForLoadState("networkidle");

  // Check if we're on the board view already
  const boardView = page.locator('[data-testid="board-view"]');
  const isOnBoard = await boardView.isVisible().catch(() => false);

  if (!isOnBoard) {
    // Try to click on a recent project first (from welcome screen)
    const recentProject = page.locator('p:has-text("Test Project")').first();
    if (await recentProject.isVisible().catch(() => false)) {
      await recentProject.click();
      await page.waitForTimeout(200);
    }

    // Then click on Kanban Board nav button to ensure we're on the board
    const kanbanNav = page.locator('[data-testid="nav-board"]');
    if (await kanbanNav.isVisible().catch(() => false)) {
      await kanbanNav.click();
    }
  }

  // Wait for the board view to be visible
  await waitForElement(page, "board-view", { timeout: 10000 });
}

/**
 * Check if the agent output modal is visible
 */
export async function isAgentOutputModalVisible(page: Page): Promise<boolean> {
  const modal = page.locator('[data-testid="agent-output-modal"]');
  return await modal.isVisible();
}

/**
 * Wait for the agent output modal to be visible
 */
export async function waitForAgentOutputModal(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, "agent-output-modal", options);
}

/**
 * Wait for the agent output modal to be hidden
 */
export async function waitForAgentOutputModalHidden(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  await waitForElementHidden(page, "agent-output-modal", options);
}

/**
 * Drag a kanban card from one column to another
 */
export async function dragKanbanCard(
  page: Page,
  featureId: string,
  targetColumnId: string
): Promise<void> {
  const card = page.locator(`[data-testid="kanban-card-${featureId}"]`);
  const dragHandle = page.locator(`[data-testid="drag-handle-${featureId}"]`);
  const targetColumn = page.locator(
    `[data-testid="kanban-column-${targetColumnId}"]`
  );

  // Perform drag and drop
  await dragHandle.dragTo(targetColumn);
}

/**
 * Get a kanban card by feature ID
 */
export async function getKanbanCard(
  page: Page,
  featureId: string
): Promise<Locator> {
  return page.locator(`[data-testid="kanban-card-${featureId}"]`);
}

/**
 * Click the view output button on a kanban card
 */
export async function clickViewOutput(
  page: Page,
  featureId: string
): Promise<void> {
  // Try the running version first, then the in-progress version
  const runningBtn = page.locator(`[data-testid="view-output-${featureId}"]`);
  const inProgressBtn = page.locator(
    `[data-testid="view-output-inprogress-${featureId}"]`
  );

  if (await runningBtn.isVisible()) {
    await runningBtn.click();
  } else if (await inProgressBtn.isVisible()) {
    await inProgressBtn.click();
  } else {
    throw new Error(`View output button not found for feature ${featureId}`);
  }
}

/**
 * Perform a drag and drop operation that works with @dnd-kit
 * This uses explicit mouse movements with pointer events
 */
export async function dragAndDropWithDndKit(
  page: Page,
  sourceLocator: Locator,
  targetLocator: Locator
): Promise<void> {
  const sourceBox = await sourceLocator.boundingBox();
  const targetBox = await targetLocator.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error("Could not find source or target element bounds");
  }

  // Start drag from the center of the source element
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;

  // End drag at the center of the target element
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  // Perform the drag and drop with pointer events
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(150); // Give dnd-kit time to recognize the drag
  await page.mouse.move(endX, endY, { steps: 15 });
  await page.waitForTimeout(100); // Allow time for drop detection
  await page.mouse.up();
}

/**
 * Get the concurrency slider container
 */
export async function getConcurrencySliderContainer(
  page: Page
): Promise<Locator> {
  return page.locator('[data-testid="concurrency-slider-container"]');
}

/**
 * Get the concurrency slider
 */
export async function getConcurrencySlider(page: Page): Promise<Locator> {
  return page.locator('[data-testid="concurrency-slider"]');
}

/**
 * Get the displayed concurrency value
 */
export async function getConcurrencyValue(page: Page): Promise<string | null> {
  const valueElement = page.locator('[data-testid="concurrency-value"]');
  return await valueElement.textContent();
}

/**
 * Change the concurrency slider value by clicking on the slider track
 */
export async function setConcurrencyValue(
  page: Page,
  targetValue: number,
  min: number = 1,
  max: number = 10
): Promise<void> {
  const slider = page.locator('[data-testid="concurrency-slider"]');
  const sliderBounds = await slider.boundingBox();

  if (!sliderBounds) {
    throw new Error("Concurrency slider not found or not visible");
  }

  // Calculate position for target value
  const percentage = (targetValue - min) / (max - min);
  const targetX = sliderBounds.x + sliderBounds.width * percentage;
  const centerY = sliderBounds.y + sliderBounds.height / 2;

  // Click at the target position to set the value
  await page.mouse.click(targetX, centerY);
}

/**
 * Set up a mock project with custom concurrency value
 */
export async function setupMockProjectWithConcurrency(
  page: Page,
  concurrency: number
): Promise<void> {
  await page.addInitScript((maxConcurrency: number) => {
    const mockProject = {
      id: "test-project-1",
      name: "Test Project",
      path: "/mock/test-project",
      lastOpened: new Date().toISOString(),
    };

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: "dark",
        sidebarOpen: true,
        apiKeys: { anthropic: "", google: "" },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: maxConcurrency,
      },
      version: 0,
    };

    localStorage.setItem("automaker-storage", JSON.stringify(mockState));
  }, concurrency);
}

/**
 * Navigate to the context view
 */
export async function navigateToContext(page: Page): Promise<void> {
  await page.goto("/");

  // Wait for the page to load
  await page.waitForLoadState("networkidle");

  // Click on the Context nav button
  const contextNav = page.locator('[data-testid="nav-context"]');
  if (await contextNav.isVisible().catch(() => false)) {
    await contextNav.click();
  }

  // Wait for the context view to be visible
  await waitForElement(page, "context-view", { timeout: 10000 });
}

/**
 * Get the context file list element
 */
export async function getContextFileList(page: Page): Promise<Locator> {
  return page.locator('[data-testid="context-file-list"]');
}

/**
 * Click on a context file in the list
 */
export async function clickContextFile(
  page: Page,
  fileName: string
): Promise<void> {
  const fileButton = page.locator(`[data-testid="context-file-${fileName}"]`);
  await fileButton.click();
}

/**
 * Get the context editor element
 */
export async function getContextEditor(page: Page): Promise<Locator> {
  return page.locator('[data-testid="context-editor"]');
}

/**
 * Open the add context file dialog
 */
export async function openAddContextFileDialog(page: Page): Promise<void> {
  await clickElement(page, "add-context-file");
  await waitForElement(page, "add-context-dialog");
}

/**
 * Wait for an error toast to appear with specific text
 */
export async function waitForErrorToast(
  page: Page,
  titleText?: string,
  options?: { timeout?: number }
): Promise<Locator> {
  // Sonner toasts use data-sonner-toast and data-type="error" for error toasts
  const toastSelector = titleText
    ? `[data-sonner-toast][data-type="error"]:has-text("${titleText}")`
    : '[data-sonner-toast][data-type="error"]';

  const toast = page.locator(toastSelector).first();
  await toast.waitFor({
    timeout: options?.timeout ?? 5000,
    state: "visible",
  });
  return toast;
}

/**
 * Check if an error toast is visible
 */
export async function isErrorToastVisible(
  page: Page,
  titleText?: string
): Promise<boolean> {
  const toastSelector = titleText
    ? `[data-sonner-toast][data-type="error"]:has-text("${titleText}")`
    : '[data-sonner-toast][data-type="error"]';

  const toast = page.locator(toastSelector).first();
  return await toast.isVisible();
}

/**
 * Set up a mock project with specific running tasks to simulate concurrency limit
 */
export async function setupMockProjectAtConcurrencyLimit(
  page: Page,
  maxConcurrency: number = 1,
  runningTasks: string[] = ["running-task-1"]
): Promise<void> {
  await page.addInitScript(
    ({
      maxConcurrency,
      runningTasks,
    }: {
      maxConcurrency: number;
      runningTasks: string[];
    }) => {
      const mockProject = {
        id: "test-project-1",
        name: "Test Project",
        path: "/mock/test-project",
        lastOpened: new Date().toISOString(),
      };

      const mockState = {
        state: {
          projects: [mockProject],
          currentProject: mockProject,
          theme: "dark",
          sidebarOpen: true,
          apiKeys: { anthropic: "", google: "" },
          chatSessions: [],
          chatHistoryOpen: false,
          maxConcurrency: maxConcurrency,
          isAutoModeRunning: false,
          runningAutoTasks: runningTasks,
          autoModeActivityLog: [],
        },
        version: 0,
      };

      localStorage.setItem("automaker-storage", JSON.stringify(mockState));
    },
    { maxConcurrency, runningTasks }
  );
}

/**
 * Get the force stop button for a specific feature
 */
export async function getForceStopButton(
  page: Page,
  featureId: string
): Promise<Locator> {
  return page.locator(`[data-testid="force-stop-${featureId}"]`);
}

/**
 * Click the force stop button for a specific feature
 */
export async function clickForceStop(
  page: Page,
  featureId: string
): Promise<void> {
  const button = page.locator(`[data-testid="force-stop-${featureId}"]`);
  await button.click();
}

/**
 * Check if the force stop button is visible for a feature
 */
export async function isForceStopButtonVisible(
  page: Page,
  featureId: string
): Promise<boolean> {
  const button = page.locator(`[data-testid="force-stop-${featureId}"]`);
  return await button.isVisible();
}

/**
 * Wait for a success toast to appear with specific text
 */
export async function waitForSuccessToast(
  page: Page,
  titleText?: string,
  options?: { timeout?: number }
): Promise<Locator> {
  // Sonner toasts use data-sonner-toast and data-type="success" for success toasts
  const toastSelector = titleText
    ? `[data-sonner-toast][data-type="success"]:has-text("${titleText}")`
    : '[data-sonner-toast][data-type="success"]';

  const toast = page.locator(toastSelector).first();
  await toast.waitFor({
    timeout: options?.timeout ?? 5000,
    state: "visible",
  });
  return toast;
}

/**
 * Get the delete button for an in_progress feature
 */
export async function getDeleteInProgressButton(
  page: Page,
  featureId: string
): Promise<Locator> {
  return page.locator(`[data-testid="delete-inprogress-feature-${featureId}"]`);
}

/**
 * Click the delete button for an in_progress feature
 */
export async function clickDeleteInProgressFeature(
  page: Page,
  featureId: string
): Promise<void> {
  const button = page.locator(
    `[data-testid="delete-inprogress-feature-${featureId}"]`
  );
  await button.click();
}

/**
 * Check if the delete button is visible for an in_progress feature
 */
export async function isDeleteInProgressButtonVisible(
  page: Page,
  featureId: string
): Promise<boolean> {
  const button = page.locator(
    `[data-testid="delete-inprogress-feature-${featureId}"]`
  );
  return await button.isVisible();
}

/**
 * Set up a mock project with features in different states
 */
export async function setupMockProjectWithFeatures(
  page: Page,
  options?: {
    maxConcurrency?: number;
    runningTasks?: string[];
    features?: Array<{
      id: string;
      category: string;
      description: string;
      status: "backlog" | "in_progress" | "verified";
      steps?: string[];
    }>;
  }
): Promise<void> {
  await page.addInitScript((opts: typeof options) => {
    const mockProject = {
      id: "test-project-1",
      name: "Test Project",
      path: "/mock/test-project",
      lastOpened: new Date().toISOString(),
    };

    const mockFeatures = opts?.features || [];

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: "dark",
        sidebarOpen: true,
        apiKeys: { anthropic: "", google: "" },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: opts?.maxConcurrency ?? 3,
        isAutoModeRunning: false,
        runningAutoTasks: opts?.runningTasks ?? [],
        autoModeActivityLog: [],
        features: mockFeatures,
      },
      version: 0,
    };

    localStorage.setItem("automaker-storage", JSON.stringify(mockState));

    // Also store features in a global variable that the mock electron API can use
    // This is needed because the board-view loads features from the file system
    (window as any).__mockFeatures = mockFeatures;
  }, options);
}

/**
 * Set up a mock project with a feature context file
 * This simulates an agent having created context for a feature
 */
export async function setupMockProjectWithContextFile(
  page: Page,
  featureId: string,
  contextContent: string = "# Agent Context\n\nPrevious implementation work..."
): Promise<void> {
  await page.addInitScript(
    ({
      featureId,
      contextContent,
    }: {
      featureId: string;
      contextContent: string;
    }) => {
      const mockProject = {
        id: "test-project-1",
        name: "Test Project",
        path: "/mock/test-project",
        lastOpened: new Date().toISOString(),
      };

      const mockState = {
        state: {
          projects: [mockProject],
          currentProject: mockProject,
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

      // Set up mock file system with a context file for the feature
      // This will be used by the mock electron API
      // Now uses features/{id}/agent-output.md path
      (window as any).__mockContextFile = {
        featureId,
        path: `/mock/test-project/.automaker/features/${featureId}/agent-output.md`,
        content: contextContent,
      };
    },
    { featureId, contextContent }
  );
}

/**
 * Get the category autocomplete input element
 */
export async function getCategoryAutocompleteInput(
  page: Page,
  testId: string = "feature-category-input"
): Promise<Locator> {
  return page.locator(`[data-testid="${testId}"]`);
}

/**
 * Get the category autocomplete dropdown list
 */
export async function getCategoryAutocompleteList(
  page: Page
): Promise<Locator> {
  return page.locator('[data-testid="category-autocomplete-list"]');
}

/**
 * Check if the category autocomplete dropdown is visible
 */
export async function isCategoryAutocompleteListVisible(
  page: Page
): Promise<boolean> {
  const list = page.locator('[data-testid="category-autocomplete-list"]');
  return await list.isVisible();
}

/**
 * Wait for the category autocomplete dropdown to be visible
 */
export async function waitForCategoryAutocompleteList(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, "category-autocomplete-list", options);
}

/**
 * Wait for the category autocomplete dropdown to be hidden
 */
export async function waitForCategoryAutocompleteListHidden(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  await waitForElementHidden(page, "category-autocomplete-list", options);
}

/**
 * Click a category option in the autocomplete dropdown
 */
export async function clickCategoryOption(
  page: Page,
  categoryName: string
): Promise<void> {
  const optionTestId = `category-option-${categoryName
    .toLowerCase()
    .replace(/\s+/g, "-")}`;
  const option = page.locator(`[data-testid="${optionTestId}"]`);
  await option.click();
}

/**
 * Get a category option element by name
 */
export async function getCategoryOption(
  page: Page,
  categoryName: string
): Promise<Locator> {
  const optionTestId = `category-option-${categoryName
    .toLowerCase()
    .replace(/\s+/g, "-")}`;
  return page.locator(`[data-testid="${optionTestId}"]`);
}

/**
 * Navigate to the agent view
 */
export async function navigateToAgent(page: Page): Promise<void> {
  await page.goto("/");

  // Wait for the page to load
  await page.waitForLoadState("networkidle");

  // Click on the Agent nav button
  const agentNav = page.locator('[data-testid="nav-agent"]');
  if (await agentNav.isVisible().catch(() => false)) {
    await agentNav.click();
  }

  // Wait for the agent view to be visible
  await waitForElement(page, "agent-view", { timeout: 10000 });
}

/**
 * Get the session list element
 */
export async function getSessionList(page: Page): Promise<Locator> {
  return page.locator('[data-testid="session-list"]');
}

/**
 * Get the new session button
 */
export async function getNewSessionButton(page: Page): Promise<Locator> {
  return page.locator('[data-testid="new-session-button"]');
}

/**
 * Click the new session button
 */
export async function clickNewSessionButton(page: Page): Promise<void> {
  const button = await getNewSessionButton(page);
  await button.click();
}

/**
 * Get a session item by its ID
 */
export async function getSessionItem(
  page: Page,
  sessionId: string
): Promise<Locator> {
  return page.locator(`[data-testid="session-item-${sessionId}"]`);
}

/**
 * Click the archive button for a session
 */
export async function clickArchiveSession(
  page: Page,
  sessionId: string
): Promise<void> {
  const button = page.locator(`[data-testid="archive-session-${sessionId}"]`);
  await button.click();
}

/**
 * Check if the no session placeholder is visible
 */
export async function isNoSessionPlaceholderVisible(
  page: Page
): Promise<boolean> {
  const placeholder = page.locator('[data-testid="no-session-placeholder"]');
  return await placeholder.isVisible();
}

/**
 * Wait for the no session placeholder to be visible
 */
export async function waitForNoSessionPlaceholder(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, "no-session-placeholder", options);
}

/**
 * Check if the message list is visible (indicates a session is selected)
 */
export async function isMessageListVisible(page: Page): Promise<boolean> {
  const messageList = page.locator('[data-testid="message-list"]');
  return await messageList.isVisible();
}

/**
 * Get the count up timer element for a specific feature card
 */
export async function getTimerForFeature(
  page: Page,
  featureId: string
): Promise<Locator> {
  const card = page.locator(`[data-testid="kanban-card-${featureId}"]`);
  return card.locator('[data-testid="count-up-timer"]');
}

/**
 * Get the timer display text for a specific feature card
 */
export async function getTimerDisplayForFeature(
  page: Page,
  featureId: string
): Promise<string | null> {
  const card = page.locator(`[data-testid="kanban-card-${featureId}"]`);
  const timerDisplay = card.locator('[data-testid="timer-display"]');
  return await timerDisplay.textContent();
}

/**
 * Check if a timer is visible for a specific feature
 */
export async function isTimerVisibleForFeature(
  page: Page,
  featureId: string
): Promise<boolean> {
  const card = page.locator(`[data-testid="kanban-card-${featureId}"]`);
  const timer = card.locator('[data-testid="count-up-timer"]');
  return await timer.isVisible().catch(() => false);
}

/**
 * Set up a mock project with features that have startedAt timestamps
 */
export async function setupMockProjectWithInProgressFeatures(
  page: Page,
  options?: {
    maxConcurrency?: number;
    runningTasks?: string[];
    features?: Array<{
      id: string;
      category: string;
      description: string;
      status: "backlog" | "in_progress" | "verified";
      steps?: string[];
      startedAt?: string;
    }>;
  }
): Promise<void> {
  await page.addInitScript((opts: typeof options) => {
    const mockProject = {
      id: "test-project-1",
      name: "Test Project",
      path: "/mock/test-project",
      lastOpened: new Date().toISOString(),
    };

    const mockFeatures = opts?.features || [];

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: "dark",
        sidebarOpen: true,
        apiKeys: { anthropic: "", google: "" },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: opts?.maxConcurrency ?? 3,
        isAutoModeRunning: false,
        runningAutoTasks: opts?.runningTasks ?? [],
        autoModeActivityLog: [],
        features: mockFeatures,
      },
      version: 0,
    };

    localStorage.setItem("automaker-storage", JSON.stringify(mockState));

    // Also store features in a global variable that the mock electron API can use
    // This is needed because the board-view loads features from the file system
    (window as any).__mockFeatures = mockFeatures;
  }, options);
}

/**
 * Navigate to the spec view
 */
export async function navigateToSpec(page: Page): Promise<void> {
  await page.goto("/");

  // Wait for the page to load
  await page.waitForLoadState("networkidle");

  // Click on the Spec nav button
  const specNav = page.locator('[data-testid="nav-spec"]');
  if (await specNav.isVisible().catch(() => false)) {
    await specNav.click();
  }

  // Wait for the spec view to be visible
  await waitForElement(page, "spec-view", { timeout: 10000 });
}

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
export async function setSpecEditorContent(
  page: Page,
  content: string
): Promise<void> {
  const editor = await getSpecEditor(page);
  await editor.fill(content);
}

/**
 * Click the save spec button
 */
export async function clickSaveSpec(page: Page): Promise<void> {
  await clickElement(page, "save-spec");
}

/**
 * Click the reload spec button
 */
export async function clickReloadSpec(page: Page): Promise<void> {
  await clickElement(page, "reload-spec");
}

/**
 * Check if the spec view path display shows the correct .automaker path
 */
export async function getDisplayedSpecPath(page: Page): Promise<string | null> {
  const specView = page.locator('[data-testid="spec-view"]');
  const pathElement = specView.locator("p.text-muted-foreground").first();
  return await pathElement.textContent();
}

/**
 * Get a kanban column by its ID
 */
export async function getKanbanColumn(
  page: Page,
  columnId: string
): Promise<Locator> {
  return page.locator(`[data-testid="kanban-column-${columnId}"]`);
}

/**
 * Get the width of a kanban column
 */
export async function getKanbanColumnWidth(
  page: Page,
  columnId: string
): Promise<number> {
  const column = page.locator(`[data-testid="kanban-column-${columnId}"]`);
  const box = await column.boundingBox();
  return box?.width ?? 0;
}

/**
 * Check if a kanban column has CSS columns (masonry) layout
 */
export async function hasKanbanColumnMasonryLayout(
  page: Page,
  columnId: string
): Promise<boolean> {
  const column = page.locator(`[data-testid="kanban-column-${columnId}"]`);
  const contentDiv = column.locator("> div").nth(1); // Second child is the content area

  const columnCount = await contentDiv.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.columnCount;
  });

  return columnCount === "2";
}

/**
 * Set up a mock project with a specific current view for route persistence testing
 */
export async function setupMockProjectWithView(
  page: Page,
  view: string
): Promise<void> {
  await page.addInitScript((currentView: string) => {
    const mockProject = {
      id: "test-project-1",
      name: "Test Project",
      path: "/mock/test-project",
      lastOpened: new Date().toISOString(),
    };

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        currentView: currentView,
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
  }, view);
}

/**
 * Navigate to a specific view using the sidebar navigation
 */
export async function navigateToView(
  page: Page,
  viewId: string
): Promise<void> {
  const navSelector =
    viewId === "settings" ? "settings-button" : `nav-${viewId}`;
  await clickElement(page, navSelector);
  await page.waitForTimeout(100);
}

/**
 * Get the current view from the URL or store (checks which view is active)
 */
export async function getCurrentView(page: Page): Promise<string | null> {
  // Get the current view from zustand store via localStorage
  const storage = await page.evaluate(() => {
    const item = localStorage.getItem("automaker-storage");
    return item ? JSON.parse(item) : null;
  });

  return storage?.state?.currentView || null;
}

/**
 * Check if the drag handle is visible for a specific feature card
 */
export async function isDragHandleVisibleForFeature(
  page: Page,
  featureId: string
): Promise<boolean> {
  const dragHandle = page.locator(`[data-testid="drag-handle-${featureId}"]`);
  return await dragHandle.isVisible().catch(() => false);
}

/**
 * Get the drag handle element for a specific feature card
 */
export async function getDragHandleForFeature(
  page: Page,
  featureId: string
): Promise<Locator> {
  return page.locator(`[data-testid="drag-handle-${featureId}"]`);
}

/**
 * Navigate to the welcome view (clear project selection)
 */
export async function navigateToWelcome(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await waitForElement(page, "welcome-view", { timeout: 10000 });
}

/**
 * Set up an empty localStorage (no projects) to show welcome screen
 */
export async function setupEmptyLocalStorage(page: Page): Promise<void> {
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
  });
}

/**
 * Set up mock projects in localStorage but with no current project (for recent projects list)
 */
export async function setupMockProjectsWithoutCurrent(
  page: Page
): Promise<void> {
  await page.addInitScript(() => {
    const mockProjects = [
      {
        id: "test-project-1",
        name: "Test Project 1",
        path: "/mock/test-project-1",
        lastOpened: new Date().toISOString(),
      },
      {
        id: "test-project-2",
        name: "Test Project 2",
        path: "/mock/test-project-2",
        lastOpened: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      },
    ];

    const mockState = {
      state: {
        projects: mockProjects,
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
  });
}

/**
 * Check if the project initialization dialog is visible
 */
export async function isProjectInitDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="project-init-dialog"]');
  return await dialog.isVisible();
}

/**
 * Wait for the project initialization dialog to appear
 */
export async function waitForProjectInitDialog(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, "project-init-dialog", options);
}

/**
 * Close the project initialization dialog
 */
export async function closeProjectInitDialog(page: Page): Promise<void> {
  const closeButton = page.locator('[data-testid="close-init-dialog"]');
  await closeButton.click();
}

/**
 * Check if the project opening overlay is visible
 */
export async function isProjectOpeningOverlayVisible(
  page: Page
): Promise<boolean> {
  const overlay = page.locator('[data-testid="project-opening-overlay"]');
  return await overlay.isVisible();
}

/**
 * Wait for the project opening overlay to disappear
 */
export async function waitForProjectOpeningOverlayHidden(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  await waitForElementHidden(page, "project-opening-overlay", options);
}

/**
 * Click on a recent project in the welcome view
 */
export async function clickRecentProject(
  page: Page,
  projectId: string
): Promise<void> {
  await clickElement(page, `recent-project-${projectId}`);
}

/**
 * Click the open project card in the welcome view
 */
export async function clickOpenProjectCard(page: Page): Promise<void> {
  await clickElement(page, "open-project-card");
}

/**
 * Check if a navigation item exists in the sidebar
 */
export async function isNavItemVisible(
  page: Page,
  navId: string
): Promise<boolean> {
  const navItem = page.locator(`[data-testid="nav-${navId}"]`);
  return await navItem.isVisible().catch(() => false);
}

/**
 * Get all visible navigation items in the sidebar
 */
export async function getVisibleNavItems(page: Page): Promise<string[]> {
  const navItems = page.locator('[data-testid^="nav-"]');
  const count = await navItems.count();
  const items: string[] = [];

  for (let i = 0; i < count; i++) {
    const testId = await navItems.nth(i).getAttribute("data-testid");
    if (testId) {
      items.push(testId.replace("nav-", ""));
    }
  }

  return items;
}

/**
 * Press a keyboard shortcut key
 */
export async function pressShortcut(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
}

/**
 * Count the number of session items in the session list
 */
export async function countSessionItems(page: Page): Promise<number> {
  const sessionList = page.locator(
    '[data-testid="session-list"] [data-testid^="session-item-"]'
  );
  return await sessionList.count();
}

/**
 * Wait for a new session to be created (by checking if a session item appears)
 */
export async function waitForNewSession(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  // Wait for any session item to appear
  const sessionItem = page.locator('[data-testid^="session-item-"]').first();
  await sessionItem.waitFor({
    timeout: options?.timeout ?? 5000,
    state: "visible",
  });
}

/**
 * Check if a shortcut key indicator is visible for a navigation item
 */
export async function isShortcutIndicatorVisible(
  page: Page,
  navId: string
): Promise<boolean> {
  const shortcut = page.locator(`[data-testid="shortcut-${navId}"]`);
  return await shortcut.isVisible().catch(() => false);
}

/**
 * Get the shortcut key text for a navigation item
 */
export async function getShortcutKeyText(
  page: Page,
  navId: string
): Promise<string | null> {
  const shortcut = page.locator(`[data-testid="shortcut-${navId}"]`);
  return await shortcut.textContent();
}

/**
 * Focus on an input element to test that shortcuts don't fire when typing
 */
export async function focusOnInput(page: Page, testId: string): Promise<void> {
  const input = page.locator(`[data-testid="${testId}"]`);
  await input.focus();
}

/**
 * Check if the add feature dialog is visible
 */
export async function isAddFeatureDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="add-feature-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Check if the add context file dialog is visible
 */
export async function isAddContextDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="add-context-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Close any open dialog by pressing Escape
 */
export async function closeDialogWithEscape(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100); // Give dialog time to close
}

/**
 * Wait for a toast notification with specific text to appear
 */
export async function waitForToast(
  page: Page,
  text: string,
  options?: { timeout?: number }
): Promise<Locator> {
  const toast = page.locator(`[data-sonner-toast]:has-text("${text}")`).first();
  await toast.waitFor({
    timeout: options?.timeout ?? 5000,
    state: "visible",
  });
  return toast;
}

/**
 * Check if project analysis is in progress (analyzing spinner is visible)
 */
export async function isProjectAnalyzingVisible(page: Page): Promise<boolean> {
  const analyzingText = page.locator('p:has-text("AI agent is analyzing")');
  return await analyzingText.isVisible().catch(() => false);
}

/**
 * Wait for project analysis to complete (no longer analyzing)
 */
export async function waitForProjectAnalysisComplete(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  // Wait for the analyzing text to disappear
  const analyzingText = page.locator('p:has-text("AI agent is analyzing")');
  await analyzingText
    .waitFor({
      timeout: options?.timeout ?? 10000,
      state: "hidden",
    })
    .catch(() => {
      // It may never have been visible, that's ok
    });
}

/**
 * Get the delete confirmation dialog
 */
export async function getDeleteConfirmationDialog(
  page: Page
): Promise<Locator> {
  return page.locator('[data-testid="delete-confirmation-dialog"]');
}

/**
 * Check if the delete confirmation dialog is visible
 */
export async function isDeleteConfirmationDialogVisible(
  page: Page
): Promise<boolean> {
  const dialog = page.locator('[data-testid="delete-confirmation-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Wait for the delete confirmation dialog to appear
 */
export async function waitForDeleteConfirmationDialog(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, "delete-confirmation-dialog", options);
}

/**
 * Wait for the delete confirmation dialog to be hidden
 */
export async function waitForDeleteConfirmationDialogHidden(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  await waitForElementHidden(page, "delete-confirmation-dialog", options);
}

/**
 * Click the confirm delete button in the delete confirmation dialog
 */
export async function clickConfirmDeleteButton(page: Page): Promise<void> {
  await clickElement(page, "confirm-delete-button");
}

/**
 * Click the cancel delete button in the delete confirmation dialog
 */
export async function clickCancelDeleteButton(page: Page): Promise<void> {
  await clickElement(page, "cancel-delete-button");
}

/**
 * Click the delete button for a backlog feature card
 */
export async function clickDeleteFeatureButton(
  page: Page,
  featureId: string
): Promise<void> {
  const button = page.locator(`[data-testid="delete-feature-${featureId}"]`);
  await button.click();
}

/**
 * Check if the delete button is visible for a backlog feature
 */
export async function isDeleteFeatureButtonVisible(
  page: Page,
  featureId: string
): Promise<boolean> {
  const button = page.locator(`[data-testid="delete-feature-${featureId}"]`);
  return await button.isVisible().catch(() => false);
}

/**
 * Check if the edit feature dialog is visible
 */
export async function isEditFeatureDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="edit-feature-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Wait for the edit feature dialog to be visible
 */
export async function waitForEditFeatureDialog(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, "edit-feature-dialog", options);
}

/**
 * Get the edit feature description input/textarea element
 */
export async function getEditFeatureDescriptionInput(
  page: Page
): Promise<Locator> {
  return page.locator('[data-testid="edit-feature-description"]');
}

/**
 * Check if the edit feature description field is a textarea
 */
export async function isEditFeatureDescriptionTextarea(
  page: Page
): Promise<boolean> {
  const element = page.locator('[data-testid="edit-feature-description"]');
  const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
  return tagName === "textarea";
}

/**
 * Open the edit dialog for a specific feature
 */
export async function openEditFeatureDialog(
  page: Page,
  featureId: string
): Promise<void> {
  await clickElement(page, `edit-feature-${featureId}`);
  await waitForEditFeatureDialog(page);
}

/**
 * Fill the edit feature description field
 */
export async function fillEditFeatureDescription(
  page: Page,
  value: string
): Promise<void> {
  const input = await getEditFeatureDescriptionInput(page);
  await input.fill(value);
}

/**
 * Click the confirm edit feature button
 */
export async function confirmEditFeature(page: Page): Promise<void> {
  await clickElement(page, "confirm-edit-feature");
}

/**
 * Get the skip tests checkbox element in the add feature dialog
 */
export async function getSkipTestsCheckbox(page: Page): Promise<Locator> {
  return page.locator('[data-testid="skip-tests-checkbox"]');
}

/**
 * Toggle the skip tests checkbox in the add feature dialog
 */
export async function toggleSkipTestsCheckbox(page: Page): Promise<void> {
  const checkbox = page.locator('[data-testid="skip-tests-checkbox"]');
  await checkbox.click();
}

/**
 * Check if the skip tests checkbox is checked in the add feature dialog
 */
export async function isSkipTestsChecked(page: Page): Promise<boolean> {
  const checkbox = page.locator('[data-testid="skip-tests-checkbox"]');
  const state = await checkbox.getAttribute("data-state");
  return state === "checked";
}

/**
 * Get the edit skip tests checkbox element in the edit feature dialog
 */
export async function getEditSkipTestsCheckbox(page: Page): Promise<Locator> {
  return page.locator('[data-testid="edit-skip-tests-checkbox"]');
}

/**
 * Toggle the skip tests checkbox in the edit feature dialog
 */
export async function toggleEditSkipTestsCheckbox(page: Page): Promise<void> {
  const checkbox = page.locator('[data-testid="edit-skip-tests-checkbox"]');
  await checkbox.click();
}

/**
 * Check if the skip tests checkbox is checked in the edit feature dialog
 */
export async function isEditSkipTestsChecked(page: Page): Promise<boolean> {
  const checkbox = page.locator('[data-testid="edit-skip-tests-checkbox"]');
  const state = await checkbox.getAttribute("data-state");
  return state === "checked";
}

/**
 * Check if the skip tests badge is visible on a kanban card
 */
export async function isSkipTestsBadgeVisible(
  page: Page,
  featureId: string
): Promise<boolean> {
  const badge = page.locator(`[data-testid="skip-tests-badge-${featureId}"]`);
  return await badge.isVisible().catch(() => false);
}

/**
 * Get the skip tests badge element for a kanban card
 */
export async function getSkipTestsBadge(
  page: Page,
  featureId: string
): Promise<Locator> {
  return page.locator(`[data-testid="skip-tests-badge-${featureId}"]`);
}

/**
 * Click the manual verify button for a skipTests feature
 */
export async function clickManualVerify(
  page: Page,
  featureId: string
): Promise<void> {
  const button = page.locator(`[data-testid="manual-verify-${featureId}"]`);
  await button.click();
}

/**
 * Check if the manual verify button is visible for a feature
 */
export async function isManualVerifyButtonVisible(
  page: Page,
  featureId: string
): Promise<boolean> {
  const button = page.locator(`[data-testid="manual-verify-${featureId}"]`);
  return await button.isVisible().catch(() => false);
}

/**
 * Click the move back button for a verified skipTests feature
 */
export async function clickMoveBack(
  page: Page,
  featureId: string
): Promise<void> {
  const button = page.locator(`[data-testid="move-back-${featureId}"]`);
  await button.click();
}

/**
 * Check if the move back button is visible for a feature
 */
export async function isMoveBackButtonVisible(
  page: Page,
  featureId: string
): Promise<boolean> {
  const button = page.locator(`[data-testid="move-back-${featureId}"]`);
  return await button.isVisible().catch(() => false);
}

/**
 * Set up a mock project with features that have skipTests enabled
 */
export async function setupMockProjectWithSkipTestsFeatures(
  page: Page,
  options?: {
    maxConcurrency?: number;
    runningTasks?: string[];
    features?: Array<{
      id: string;
      category: string;
      description: string;
      status: "backlog" | "in_progress" | "verified";
      steps?: string[];
      startedAt?: string;
      skipTests?: boolean;
    }>;
  }
): Promise<void> {
  await page.addInitScript((opts: typeof options) => {
    const mockProject = {
      id: "test-project-1",
      name: "Test Project",
      path: "/mock/test-project",
      lastOpened: new Date().toISOString(),
    };

    const mockFeatures = opts?.features || [];

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: "dark",
        sidebarOpen: true,
        apiKeys: { anthropic: "", google: "" },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: opts?.maxConcurrency ?? 3,
        isAutoModeRunning: false,
        runningAutoTasks: opts?.runningTasks ?? [],
        autoModeActivityLog: [],
        features: mockFeatures,
      },
      version: 0,
    };

    localStorage.setItem("automaker-storage", JSON.stringify(mockState));
  }, options);
}

/**
 * Press a number key (0-9) on the keyboard
 */
export async function pressNumberKey(page: Page, num: number): Promise<void> {
  await page.keyboard.press(num.toString());
}

/**
 * Get the modal title/description text to verify which feature's output is being shown
 */
export async function getAgentOutputModalDescription(
  page: Page
): Promise<string | null> {
  const modal = page.locator('[data-testid="agent-output-modal"]');
  const description = modal
    .locator('[id="radix-\\:r.+\\:-description"]')
    .first();
  return await description.textContent().catch(() => null);
}

/**
 * Check the dialog description content in the agent output modal
 */
export async function getOutputModalDescription(
  page: Page
): Promise<string | null> {
  const modalDescription = page.locator(
    '[data-testid="agent-output-modal"] [data-slot="dialog-description"]'
  );
  return await modalDescription.textContent().catch(() => null);
}

/**
 * Check if the project picker dropdown is open
 */
export async function isProjectPickerDropdownOpen(
  page: Page
): Promise<boolean> {
  const dropdown = page.locator('[data-testid="project-picker-dropdown"]');
  return await dropdown.isVisible().catch(() => false);
}

/**
 * Wait for the project picker dropdown to be visible
 */
export async function waitForProjectPickerDropdown(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, "project-picker-dropdown", options);
}

/**
 * Wait for the project picker dropdown to be hidden
 */
export async function waitForProjectPickerDropdownHidden(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  await waitForElementHidden(page, "project-picker-dropdown", options);
}

/**
 * Get a project hotkey indicator element by number (1-5)
 */
export async function getProjectHotkey(
  page: Page,
  num: number
): Promise<Locator> {
  return page.locator(`[data-testid="project-hotkey-${num}"]`);
}

/**
 * Check if a project hotkey indicator is visible
 */
export async function isProjectHotkeyVisible(
  page: Page,
  num: number
): Promise<boolean> {
  const hotkey = page.locator(`[data-testid="project-hotkey-${num}"]`);
  return await hotkey.isVisible().catch(() => false);
}

/**
 * Get the project picker shortcut indicator (P key)
 */
export async function getProjectPickerShortcut(page: Page): Promise<Locator> {
  return page.locator('[data-testid="project-picker-shortcut"]');
}

/**
 * Set up a mock state with multiple projects
 */
export async function setupMockMultipleProjects(
  page: Page,
  projectCount: number = 3
): Promise<void> {
  await page.addInitScript((count: number) => {
    const mockProjects = [];
    for (let i = 0; i < count; i++) {
      mockProjects.push({
        id: `test-project-${i + 1}`,
        name: `Test Project ${i + 1}`,
        path: `/mock/test-project-${i + 1}`,
        lastOpened: new Date(Date.now() - i * 86400000).toISOString(),
      });
    }

    const mockState = {
      state: {
        projects: mockProjects,
        currentProject: mockProjects[0],
        currentView: "board",
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
  }, projectCount);
}

/**
 * Get the description image dropzone element
 */
export async function getDescriptionImageDropzone(
  page: Page
): Promise<Locator> {
  return page.locator('[data-testid="feature-description-input"]');
}

/**
 * Get the description image hidden input element
 */
export async function getDescriptionImageInput(page: Page): Promise<Locator> {
  return page.locator('[data-testid="description-image-input"]');
}

/**
 * Check if the description image previews section is visible
 */
export async function isDescriptionImagePreviewsVisible(
  page: Page
): Promise<boolean> {
  const previews = page.locator('[data-testid="description-image-previews"]');
  return await previews.isVisible().catch(() => false);
}

/**
 * Get the number of description image previews
 */
export async function getDescriptionImagePreviewCount(
  page: Page
): Promise<number> {
  const previews = page.locator('[data-testid^="description-image-preview-"]');
  return await previews.count();
}

/**
 * Upload an image to the description dropzone via the file input
 */
export async function uploadDescriptionImage(
  page: Page,
  imagePath: string
): Promise<void> {
  const input = page.locator('[data-testid="description-image-input"]');
  await input.setInputFiles(imagePath);
}

/**
 * Create a test PNG image as a data URL
 */
export function createTestImageDataUrl(): string {
  // A tiny 1x1 transparent PNG as base64
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
}

/**
 * Wait for description image preview to appear
 */
export async function waitForDescriptionImagePreview(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  const preview = page
    .locator('[data-testid^="description-image-preview-"]')
    .first();
  await preview.waitFor({
    timeout: options?.timeout ?? 5000,
    state: "visible",
  });
  return preview;
}

/**
 * Check if the drop overlay is visible on the description area
 */
export async function isDropOverlayVisible(page: Page): Promise<boolean> {
  const overlay = page.locator('[data-testid="drop-overlay"]');
  return await overlay.isVisible().catch(() => false);
}

/**
 * Navigate to the settings view
 */
export async function navigateToSettings(page: Page): Promise<void> {
  await page.goto("/");

  // Wait for the page to load
  await page.waitForLoadState("networkidle");

  // Click on the Settings button in the sidebar
  const settingsButton = page.locator('[data-testid="settings-button"]');
  if (await settingsButton.isVisible().catch(() => false)) {
    await settingsButton.click();
  }

  // Wait for the settings view to be visible
  await waitForElement(page, "settings-view", { timeout: 10000 });
}

/**
 * Get the settings view scrollable content area
 */
export async function getSettingsContentArea(page: Page): Promise<Locator> {
  return page.locator('[data-testid="settings-view"] .overflow-y-auto');
}

/**
 * Check if an element is scrollable (has scrollable content)
 */
export async function isElementScrollable(locator: Locator): Promise<boolean> {
  const scrollInfo = await locator.evaluate((el) => {
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      isScrollable: el.scrollHeight > el.clientHeight,
    };
  });
  return scrollInfo.isScrollable;
}

/**
 * Scroll an element to the bottom
 */
export async function scrollToBottom(locator: Locator): Promise<void> {
  await locator.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
}

/**
 * Get the scroll position of an element
 */
export async function getScrollPosition(
  locator: Locator
): Promise<{ scrollTop: number; scrollHeight: number; clientHeight: number }> {
  return await locator.evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
}

/**
 * Check if an element is visible within a scrollable container
 */
export async function isElementVisibleInScrollContainer(
  element: Locator,
  container: Locator
): Promise<boolean> {
  const elementBox = await element.boundingBox();
  const containerBox = await container.boundingBox();

  if (!elementBox || !containerBox) {
    return false;
  }

  // Check if element is within the visible area of the container
  return (
    elementBox.y >= containerBox.y &&
    elementBox.y + elementBox.height <= containerBox.y + containerBox.height
  );
}

// ============ Log Viewer Utilities ============

/**
 * Get the log viewer header element (contains type counts and expand/collapse buttons)
 */
export async function getLogViewerHeader(page: Page): Promise<Locator> {
  return page.locator('[data-testid="log-viewer-header"]');
}

/**
 * Check if the log viewer header is visible
 */
export async function isLogViewerHeaderVisible(page: Page): Promise<boolean> {
  const header = page.locator('[data-testid="log-viewer-header"]');
  return await header.isVisible().catch(() => false);
}

/**
 * Get the log entries container element
 */
export async function getLogEntriesContainer(page: Page): Promise<Locator> {
  return page.locator('[data-testid="log-entries-container"]');
}

/**
 * Get a log entry by its type
 */
export async function getLogEntryByType(
  page: Page,
  type: string
): Promise<Locator> {
  return page.locator(`[data-testid="log-entry-${type}"]`).first();
}

/**
 * Get all log entries of a specific type
 */
export async function getAllLogEntriesByType(
  page: Page,
  type: string
): Promise<Locator> {
  return page.locator(`[data-testid="log-entry-${type}"]`);
}

/**
 * Count log entries of a specific type
 */
export async function countLogEntriesByType(
  page: Page,
  type: string
): Promise<number> {
  const entries = page.locator(`[data-testid="log-entry-${type}"]`);
  return await entries.count();
}

/**
 * Get the log type count badge by type
 */
export async function getLogTypeCountBadge(
  page: Page,
  type: string
): Promise<Locator> {
  return page.locator(`[data-testid="log-type-count-${type}"]`);
}

/**
 * Check if a log type count badge is visible
 */
export async function isLogTypeCountBadgeVisible(
  page: Page,
  type: string
): Promise<boolean> {
  const badge = page.locator(`[data-testid="log-type-count-${type}"]`);
  return await badge.isVisible().catch(() => false);
}

/**
 * Click the expand all button in the log viewer
 */
export async function clickLogExpandAll(page: Page): Promise<void> {
  await clickElement(page, "log-expand-all");
}

/**
 * Click the collapse all button in the log viewer
 */
export async function clickLogCollapseAll(page: Page): Promise<void> {
  await clickElement(page, "log-collapse-all");
}

/**
 * Get a log entry badge element
 */
export async function getLogEntryBadge(page: Page): Promise<Locator> {
  return page.locator('[data-testid="log-entry-badge"]').first();
}

/**
 * Check if any log entry badge is visible
 */
export async function isLogEntryBadgeVisible(page: Page): Promise<boolean> {
  const badge = page.locator('[data-testid="log-entry-badge"]').first();
  return await badge.isVisible().catch(() => false);
}

/**
 * Get the view mode toggle button (parsed/raw)
 */
export async function getViewModeButton(
  page: Page,
  mode: "parsed" | "raw"
): Promise<Locator> {
  return page.locator(`[data-testid="view-mode-${mode}"]`);
}

/**
 * Click a view mode toggle button
 */
export async function clickViewModeButton(
  page: Page,
  mode: "parsed" | "raw"
): Promise<void> {
  await clickElement(page, `view-mode-${mode}`);
}

/**
 * Check if a view mode button is active (selected)
 */
export async function isViewModeActive(
  page: Page,
  mode: "parsed" | "raw"
): Promise<boolean> {
  const button = page.locator(`[data-testid="view-mode-${mode}"]`);
  const classes = await button.getAttribute("class");
  return classes?.includes("text-purple-300") ?? false;
}

/**
 * Set up a mock project with agent output content in the context file
 */
export async function setupMockProjectWithAgentOutput(
  page: Page,
  featureId: string,
  outputContent: string
): Promise<void> {
  await page.addInitScript(
    ({
      featureId,
      outputContent,
    }: {
      featureId: string;
      outputContent: string;
    }) => {
      const mockProject = {
        id: "test-project-1",
        name: "Test Project",
        path: "/mock/test-project",
        lastOpened: new Date().toISOString(),
      };

      const mockState = {
        state: {
          projects: [mockProject],
          currentProject: mockProject,
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

      // Set up mock file system with output content for the feature
      // Now uses features/{id}/agent-output.md path
      (window as any).__mockContextFile = {
        featureId,
        path: `/mock/test-project/.automaker/features/${featureId}/agent-output.md`,
        content: outputContent,
      };
    },
    { featureId, outputContent }
  );
}

// ============ Waiting Approval Feature Utilities ============

/**
 * Get the follow-up button for a waiting_approval feature
 */
export async function getFollowUpButton(
  page: Page,
  featureId: string
): Promise<Locator> {
  return page.locator(`[data-testid="follow-up-${featureId}"]`);
}

/**
 * Click the follow-up button for a waiting_approval feature
 */
export async function clickFollowUpButton(
  page: Page,
  featureId: string
): Promise<void> {
  const button = page.locator(`[data-testid="follow-up-${featureId}"]`);
  await button.click();
}

/**
 * Check if the follow-up button is visible for a feature
 */
export async function isFollowUpButtonVisible(
  page: Page,
  featureId: string
): Promise<boolean> {
  const button = page.locator(`[data-testid="follow-up-${featureId}"]`);
  return await button.isVisible().catch(() => false);
}

/**
 * Get the commit button for a waiting_approval feature
 */
export async function getCommitButton(
  page: Page,
  featureId: string
): Promise<Locator> {
  return page.locator(`[data-testid="commit-${featureId}"]`);
}

/**
 * Click the commit button for a waiting_approval feature
 */
export async function clickCommitButton(
  page: Page,
  featureId: string
): Promise<void> {
  const button = page.locator(`[data-testid="commit-${featureId}"]`);
  await button.click();
}

/**
 * Check if the commit button is visible for a feature
 */
export async function isCommitButtonVisible(
  page: Page,
  featureId: string
): Promise<boolean> {
  const button = page.locator(`[data-testid="commit-${featureId}"]`);
  return await button.isVisible().catch(() => false);
}

/**
 * Check if the follow-up dialog is visible
 */
export async function isFollowUpDialogVisible(page: Page): Promise<boolean> {
  const dialog = page.locator('[data-testid="follow-up-dialog"]');
  return await dialog.isVisible().catch(() => false);
}

/**
 * Wait for the follow-up dialog to be visible
 */
export async function waitForFollowUpDialog(
  page: Page,
  options?: { timeout?: number }
): Promise<Locator> {
  return await waitForElement(page, "follow-up-dialog", options);
}

/**
 * Wait for the follow-up dialog to be hidden
 */
export async function waitForFollowUpDialogHidden(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  await waitForElementHidden(page, "follow-up-dialog", options);
}

/**
 * Click the confirm follow-up button in the follow-up dialog
 */
export async function clickConfirmFollowUp(page: Page): Promise<void> {
  await clickElement(page, "confirm-follow-up");
}

/**
 * Get the waiting_approval kanban column
 */
export async function getWaitingApprovalColumn(page: Page): Promise<Locator> {
  return page.locator('[data-testid="kanban-column-waiting_approval"]');
}

/**
 * Check if the waiting_approval column is visible
 */
export async function isWaitingApprovalColumnVisible(
  page: Page
): Promise<boolean> {
  const column = page.locator('[data-testid="kanban-column-waiting_approval"]');
  return await column.isVisible().catch(() => false);
}

/**
 * Get the agent output modal description element
 */
export async function getAgentOutputModalDescriptionElement(
  page: Page
): Promise<Locator> {
  return page.locator('[data-testid="agent-output-description"]');
}

/**
 * Check if the agent output modal description is scrollable
 */
export async function isAgentOutputDescriptionScrollable(
  page: Page
): Promise<boolean> {
  const description = page.locator('[data-testid="agent-output-description"]');
  const scrollInfo = await description.evaluate((el) => {
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      isScrollable: el.scrollHeight > el.clientHeight,
    };
  });
  return scrollInfo.isScrollable;
}

/**
 * Get scroll dimensions of the agent output modal description
 */
export async function getAgentOutputDescriptionScrollDimensions(
  page: Page
): Promise<{
  scrollHeight: number;
  clientHeight: number;
  maxHeight: string;
  overflowY: string;
}> {
  const description = page.locator('[data-testid="agent-output-description"]');
  return await description.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
    };
  });
}

/**
 * Set up a mock project with features that include waiting_approval status
 */
export async function setupMockProjectWithWaitingApprovalFeatures(
  page: Page,
  options?: {
    maxConcurrency?: number;
    runningTasks?: string[];
    features?: Array<{
      id: string;
      category: string;
      description: string;
      status: "backlog" | "in_progress" | "waiting_approval" | "verified";
      steps?: string[];
      startedAt?: string;
      skipTests?: boolean;
    }>;
  }
): Promise<void> {
  await page.addInitScript((opts: typeof options) => {
    const mockProject = {
      id: "test-project-1",
      name: "Test Project",
      path: "/mock/test-project",
      lastOpened: new Date().toISOString(),
    };

    const mockFeatures = opts?.features || [];

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: "dark",
        sidebarOpen: true,
        apiKeys: { anthropic: "", google: "" },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: opts?.maxConcurrency ?? 3,
        isAutoModeRunning: false,
        runningAutoTasks: opts?.runningTasks ?? [],
        autoModeActivityLog: [],
        features: mockFeatures,
      },
      version: 0,
    };

    localStorage.setItem("automaker-storage", JSON.stringify(mockState));

    // Also store features in a global variable that the mock electron API can use
    (window as any).__mockFeatures = mockFeatures;
  }, options);
}

// ============================================================================
// Setup View Utilities
// ============================================================================

/**
 * Set up the app store to show setup view (simulate first run)
 */
export async function setupFirstRun(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Clear any existing setup state to simulate first run
    localStorage.removeItem("automaker-setup");
    localStorage.removeItem("automaker-storage");

    // Set up the setup store state for first run
    const setupState = {
      state: {
        isFirstRun: true,
        setupComplete: false,
        currentStep: "welcome",
        claudeCliStatus: null,
        claudeAuthStatus: null,
        claudeInstallProgress: {
          isInstalling: false,
          currentStep: "",
          progress: 0,
          output: [],
        },
        codexCliStatus: null,
        codexAuthStatus: null,
        codexInstallProgress: {
          isInstalling: false,
          currentStep: "",
          progress: 0,
          output: [],
        },
        skipClaudeSetup: false,
        skipCodexSetup: false,
      },
      version: 0,
    };

    localStorage.setItem("automaker-setup", JSON.stringify(setupState));

    // Also set up app store to show setup view
    const appState = {
      state: {
        projects: [],
        currentProject: null,
        theme: "dark",
        sidebarOpen: true,
        apiKeys: { anthropic: "", google: "", openai: "" },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
        isAutoModeRunning: false,
        runningAutoTasks: [],
        autoModeActivityLog: [],
        currentView: "setup",
      },
      version: 0,
    };

    localStorage.setItem("automaker-storage", JSON.stringify(appState));
  });
}

/**
 * Set up the app to skip the setup wizard (setup already complete)
 */
export async function setupComplete(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Mark setup as complete
    const setupState = {
      state: {
        isFirstRun: false,
        setupComplete: true,
        currentStep: "complete",
        skipClaudeSetup: false,
        skipCodexSetup: false,
      },
      version: 0,
    };

    localStorage.setItem("automaker-setup", JSON.stringify(setupState));
  });
}

/**
 * Navigate to the setup view directly
 */
export async function navigateToSetup(page: Page): Promise<void> {
  await setupFirstRun(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await waitForElement(page, "setup-view", { timeout: 10000 });
}

/**
 * Wait for setup view to be visible
 */
export async function waitForSetupView(page: Page): Promise<Locator> {
  return waitForElement(page, "setup-view", { timeout: 10000 });
}

/**
 * Click "Get Started" button on setup welcome step
 */
export async function clickSetupGetStarted(page: Page): Promise<void> {
  const button = await getByTestId(page, "setup-start-button");
  await button.click();
}

/**
 * Click continue on Claude setup step
 */
export async function clickClaudeContinue(page: Page): Promise<void> {
  const button = await getByTestId(page, "claude-next-button");
  await button.click();
}

/**
 * Click continue on Codex setup step
 */
export async function clickCodexContinue(page: Page): Promise<void> {
  const button = await getByTestId(page, "codex-next-button");
  await button.click();
}

/**
 * Click finish on setup complete step
 */
export async function clickSetupFinish(page: Page): Promise<void> {
  const button = await getByTestId(page, "setup-finish-button");
  await button.click();
}

/**
 * Enter Anthropic API key in setup
 */
export async function enterAnthropicApiKey(
  page: Page,
  apiKey: string
): Promise<void> {
  // Click "Use Anthropic API Key Instead" button
  const useApiKeyButton = await getByTestId(page, "use-api-key-button");
  await useApiKeyButton.click();

  // Enter the API key
  const input = await getByTestId(page, "anthropic-api-key-input");
  await input.fill(apiKey);

  // Click save button
  const saveButton = await getByTestId(page, "save-anthropic-key-button");
  await saveButton.click();
}

/**
 * Enter OpenAI API key in setup
 */
export async function enterOpenAIApiKey(
  page: Page,
  apiKey: string
): Promise<void> {
  // Click "Enter OpenAI API Key" button
  const useApiKeyButton = await getByTestId(page, "use-openai-key-button");
  await useApiKeyButton.click();

  // Enter the API key
  const input = await getByTestId(page, "openai-api-key-input");
  await input.fill(apiKey);

  // Click save button
  const saveButton = await getByTestId(page, "save-openai-key-button");
  await saveButton.click();
}
