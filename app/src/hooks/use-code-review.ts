import { useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore, Feature } from "@/store/app-store";
import { getElectronAPI, CodeReviewEvent } from "@/lib/electron";

/**
 * Hook for managing code review operations
 */
export function useCodeReview() {
  const {
    currentProject,
    updateFeature,
    codeReviewMode,
    codeReviewChecks,
    codeReviewAgent,
  } = useAppStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      updateFeature: state.updateFeature,
      codeReviewMode: state.codeReviewMode,
      codeReviewChecks: state.codeReviewChecks,
      codeReviewAgent: state.codeReviewAgent,
    }))
  );

  // Listen for code review events
  useEffect(() => {
    const api = getElectronAPI();
    const codeReviewApi = api?.codeReview;
    if (!codeReviewApi) return;

    const unsubscribe = codeReviewApi.onEvent((event: CodeReviewEvent) => {
      console.log("[CodeReview Event]", event);

      switch (event.type) {
        case "review_start":
          updateFeature(event.featureId, {
            reviewStatus: "in_progress",
          });
          break;

        case "review_progress":
          // Could be used for progress tracking
          console.log(
            `[CodeReview] ${event.check}: ${event.message}`
          );
          break;

        case "review_complete":
          updateFeature(event.featureId, {
            reviewStatus: event.results.overallPass ? "passed" : "failed",
            reviewResults: event.results,
          });
          break;

        case "review_error":
          console.error("[CodeReview Error]", event.error);
          updateFeature(event.featureId, {
            reviewStatus: "failed",
            reviewResults: {
              overallPass: false,
              timestamp: new Date().toISOString(),
              checks: [
                {
                  name: "error",
                  passed: false,
                  issues: [
                    {
                      severity: "error",
                      message: event.error,
                    },
                  ],
                },
              ],
            },
          });
          break;
      }
    });

    return unsubscribe;
  }, [updateFeature]);

  // Get enabled checks based on settings
  const getEnabledChecks = useCallback((): ("typescript" | "build" | "patterns")[] => {
    const checks: ("typescript" | "build" | "patterns")[] = [];
    if (codeReviewChecks.typescript) checks.push("typescript");
    if (codeReviewChecks.build) checks.push("build");
    if (codeReviewChecks.patterns) checks.push("patterns");
    return checks;
  }, [codeReviewChecks]);

  // Run code review on a feature
  const runReview = useCallback(
    async (featureId: string) => {
      if (!currentProject) {
        console.error("[CodeReview] No project selected");
        return { success: false, error: "No project selected" };
      }

      try {
        const api = getElectronAPI();
        const codeReviewApi = api?.codeReview;
        if (!codeReviewApi) {
          throw new Error("Code review API not available");
        }

        console.log(`[CodeReview] Starting review for feature ${featureId}`);

        // Update status to in_progress immediately
        updateFeature(featureId, { reviewStatus: "in_progress" });

        const result = await codeReviewApi.runReview(
          currentProject.path,
          featureId,
          {
            checks: getEnabledChecks(),
            agent: codeReviewAgent,
          }
        );

        if (result.success && result.results) {
          updateFeature(featureId, {
            reviewStatus: result.results.overallPass ? "passed" : "failed",
            reviewResults: result.results,
          });
        } else {
          updateFeature(featureId, {
            reviewStatus: "failed",
            reviewResults: {
              overallPass: false,
              timestamp: new Date().toISOString(),
              checks: [
                {
                  name: "error",
                  passed: false,
                  issues: [
                    {
                      severity: "error",
                      message: result.error || "Review failed",
                    },
                  ],
                },
              ],
            },
          });
        }

        return result;
      } catch (error) {
        console.error("[CodeReview] Error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        updateFeature(featureId, {
          reviewStatus: "failed",
          reviewResults: {
            overallPass: false,
            timestamp: new Date().toISOString(),
            checks: [
              {
                name: "error",
                passed: false,
                issues: [
                  {
                    severity: "error",
                    message: errorMessage,
                  },
                ],
              },
            ],
          },
        });

        return { success: false, error: errorMessage };
      }
    },
    [currentProject, updateFeature, getEnabledChecks, codeReviewAgent]
  );

  // Run code review with automatic fixes until passing
  const runReviewWithFixes = useCallback(
    async (featureId: string) => {
      if (!currentProject) {
        console.error("[CodeReview] No project selected");
        return { success: false, error: "No project selected" };
      }

      try {
        const api = getElectronAPI();
        const codeReviewApi = api?.codeReview;
        if (!codeReviewApi?.runReviewWithFixes) {
          // Fallback to regular review if runReviewWithFixes not available
          console.warn("[CodeReview] runReviewWithFixes not available, using regular review");
          return runReview(featureId);
        }

        console.log(`[CodeReview] Starting review with fixes for feature ${featureId}`);

        // Update status to in_progress immediately
        updateFeature(featureId, { reviewStatus: "in_progress" });

        const result = await codeReviewApi.runReviewWithFixes(
          currentProject.path,
          featureId,
          {
            checks: getEnabledChecks(),
            agent: codeReviewAgent,
          }
        );

        if (result.success && result.results) {
          updateFeature(featureId, {
            reviewStatus: result.results.overallPass ? "passed" : "failed",
            reviewResults: result.results,
          });

          // Log the attempts info
          if (result.attempts) {
            console.log(`[CodeReview] Completed in ${result.attempts} attempt(s)`);
          }
          if (result.maxAttemptsReached) {
            console.warn(`[CodeReview] Max fix attempts reached`);
          }
        } else {
          updateFeature(featureId, {
            reviewStatus: "failed",
            reviewResults: {
              overallPass: false,
              timestamp: new Date().toISOString(),
              checks: [
                {
                  name: "error",
                  passed: false,
                  issues: [
                    {
                      severity: "error",
                      message: result.error || "Review with fixes failed",
                    },
                  ],
                },
              ],
            },
          });
        }

        return result;
      } catch (error) {
        console.error("[CodeReview] Error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        updateFeature(featureId, {
          reviewStatus: "failed",
          reviewResults: {
            overallPass: false,
            timestamp: new Date().toISOString(),
            checks: [
              {
                name: "error",
                passed: false,
                issues: [
                  {
                    severity: "error",
                    message: errorMessage,
                  },
                ],
              },
            ],
          },
        });

        return { success: false, error: errorMessage };
      }
    },
    [currentProject, updateFeature, getEnabledChecks, codeReviewAgent, runReview]
  );

  // Clear review status for a feature
  const clearReview = useCallback(
    (featureId: string) => {
      updateFeature(featureId, {
        reviewStatus: undefined,
        reviewResults: undefined,
      });
    },
    [updateFeature]
  );

  // Check if auto review should run for a completed feature
  const shouldAutoReview = useCallback(
    (feature: Feature): boolean => {
      return (
        codeReviewMode === "auto" &&
        feature.status === "waiting_approval" &&
        !feature.reviewStatus &&
        !feature.error
      );
    },
    [codeReviewMode]
  );

  return {
    runReview,
    runReviewWithFixes,
    clearReview,
    shouldAutoReview,
    codeReviewMode,
    codeReviewChecks,
    codeReviewAgent,
  };
}
