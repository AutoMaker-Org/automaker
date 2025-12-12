/**
 * Suggestions Service Interface
 * Generates feature suggestions based on project analysis
 */

import type { ServiceResult, Subscription, IService } from "../types";
import type { SuggestionsEvent, FeatureSuggestion } from "../types/events";

export type SuggestionType =
  | "features"
  | "refactoring"
  | "security"
  | "performance";

export interface SuggestionsStatus {
  isRunning: boolean;
}

export interface ISuggestionsService extends IService {
  /**
   * Generate suggestions for a project
   */
  generate(
    projectPath: string,
    suggestionType?: SuggestionType
  ): Promise<ServiceResult>;

  /**
   * Stop suggestion generation
   */
  stop(): Promise<ServiceResult>;

  /**
   * Get generation status
   */
  status(): Promise<ServiceResult<SuggestionsStatus>>;

  /**
   * Subscribe to suggestion events
   */
  onEvent(callback: (event: SuggestionsEvent) => void): Subscription;
}

// Re-export types for convenience
export type { SuggestionsEvent, FeatureSuggestion } from "../types/events";
