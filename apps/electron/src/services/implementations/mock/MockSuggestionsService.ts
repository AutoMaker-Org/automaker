/**
 * Mock implementation of ISuggestionsService
 * For web development and testing without Electron
 */

import type {
  ISuggestionsService,
  SuggestionType,
  SuggestionsStatus,
} from "../../interfaces/ISuggestionsService";
import type { ServiceResult, Subscription } from "../../types";
import type { SuggestionsEvent, FeatureSuggestion } from "../../types/events";
import { eventBus } from "../../core/EventBus";

let mockSuggestionsRunning = false;
let mockSuggestionsTimeout: NodeJS.Timeout | null = null;

function emitSuggestionsEvent(event: SuggestionsEvent) {
  eventBus.emit("suggestions:event", event);
}

async function simulateSuggestionsGeneration(suggestionType: SuggestionType) {
  const typeLabels: Record<SuggestionType, string> = {
    features: "feature suggestions",
    refactoring: "refactoring opportunities",
    security: "security vulnerabilities",
    performance: "performance issues",
  };

  emitSuggestionsEvent({
    type: "suggestions_progress",
    content: `Starting project analysis for ${typeLabels[suggestionType]}...\n`,
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  emitSuggestionsEvent({
    type: "suggestions_tool",
    tool: "Glob",
    input: { pattern: "**/*.{ts,tsx,js,jsx}" },
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  emitSuggestionsEvent({
    type: "suggestions_progress",
    content: `Identifying ${typeLabels[suggestionType]}...\n`,
  });

  await new Promise((resolve) => {
    mockSuggestionsTimeout = setTimeout(resolve, 500);
  });
  if (!mockSuggestionsRunning) return;

  const mockSuggestions: FeatureSuggestion[] = [
    {
      id: `suggestion-${Date.now()}-0`,
      category: suggestionType === "features" ? "User Experience" : "Code Quality",
      description:
        suggestionType === "features"
          ? "Add dark mode toggle with system preference detection"
          : "Extract duplicate validation logic into reusable utility",
      steps: [
        "Step 1: Analyze existing code",
        "Step 2: Implement changes",
        "Step 3: Test implementation",
      ],
      priority: 1,
      reasoning: "Improves overall application quality",
    },
    {
      id: `suggestion-${Date.now()}-1`,
      category: suggestionType === "features" ? "Performance" : "Architecture",
      description:
        suggestionType === "features"
          ? "Implement lazy loading for heavy components"
          : "Move business logic out of React components into hooks",
      steps: ["Step 1: Identify targets", "Step 2: Refactor", "Step 3: Verify"],
      priority: 2,
      reasoning: "Reduces technical debt",
    },
  ];

  emitSuggestionsEvent({
    type: "suggestions_complete",
    suggestions: mockSuggestions,
  });

  mockSuggestionsRunning = false;
  mockSuggestionsTimeout = null;
}

export class MockSuggestionsService implements ISuggestionsService {
  async generate(
    _projectPath: string,
    suggestionType: SuggestionType = "features"
  ): Promise<ServiceResult> {
    if (mockSuggestionsRunning) {
      return { success: false, error: "Suggestions generation is already running" };
    }

    mockSuggestionsRunning = true;
    console.log(`[Mock] Generating ${suggestionType} suggestions`);

    simulateSuggestionsGeneration(suggestionType);

    return { success: true };
  }

  async stop(): Promise<ServiceResult> {
    mockSuggestionsRunning = false;
    if (mockSuggestionsTimeout) {
      clearTimeout(mockSuggestionsTimeout);
      mockSuggestionsTimeout = null;
    }
    return { success: true };
  }

  async status(): Promise<ServiceResult<SuggestionsStatus>> {
    return {
      success: true,
      data: { isRunning: mockSuggestionsRunning },
    };
  }

  onEvent(callback: (event: SuggestionsEvent) => void): Subscription {
    const unsubscribe = eventBus.on("suggestions:event", callback);
    return { unsubscribe };
  }
}
