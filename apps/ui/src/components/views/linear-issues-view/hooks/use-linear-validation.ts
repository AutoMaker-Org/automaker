/* global HTMLAudioElement */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  getElectronAPI,
  LinearIssue,
  IssueValidationResult,
  LinearValidationEvent,
  StoredLinearValidation,
} from '@/lib/electron';
import type { PhaseModelEntry, ModelAlias, CursorModelId } from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { isValidationStale } from '../utils';

const logger = createLogger('LinearValidation');

/**
 * Normalize path for comparison - removes trailing slashes and normalizes format
 */
function normalizePath(path: string | undefined): string {
  if (!path) return '';
  // Remove trailing slashes and normalize
  return path.replace(/\/+$/, '');
}

interface UseLinearValidationOptions {
  selectedIssue: LinearIssue | null;
  showValidationDialog: boolean;
  onValidationResultChange: (result: IssueValidationResult | null) => void;
  onShowValidationDialogChange: (show: boolean) => void;
  /** Callback when auto-convert should happen (valid issues) */
  onAutoConvert?: (identifier: string, result: IssueValidationResult) => void;
}

export function useLinearValidation({
  selectedIssue,
  showValidationDialog,
  onValidationResultChange,
  onShowValidationDialogChange,
  onAutoConvert,
}: UseLinearValidationOptions) {
  const { currentProject, phaseModels, muteDoneSound } = useAppStore();
  // Linear uses string identifiers (e.g., "ALE-1")
  const [validatingIssues, setValidatingIssues] = useState<Set<string>>(new Set());
  const [cachedValidations, setCachedValidations] = useState<Map<string, StoredLinearValidation>>(
    new Map()
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Refs for stable event handler (avoids re-subscribing on state changes)
  const selectedIssueRef = useRef<LinearIssue | null>(null);
  const showValidationDialogRef = useRef(false);

  // Keep refs in sync with state for stable event handler
  useEffect(() => {
    selectedIssueRef.current = selectedIssue;
  }, [selectedIssue]);

  useEffect(() => {
    showValidationDialogRef.current = showValidationDialog;
  }, [showValidationDialog]);

  // Load cached validations on mount
  useEffect(() => {
    let isMounted = true;

    const loadCachedValidations = async () => {
      if (!currentProject?.path) return;

      try {
        const api = getElectronAPI();
        if (api.linear?.getValidations) {
          const result = await api.linear.getValidations(currentProject.path);
          if (isMounted && result.success && result.validations) {
            const map = new Map<string, StoredLinearValidation>();
            for (const v of result.validations) {
              map.set(v.identifier, v);
            }
            setCachedValidations(map);
          }
        }
      } catch (err) {
        if (isMounted) {
          logger.error('Failed to load cached validations:', err);
        }
      }
    };

    loadCachedValidations();

    return () => {
      isMounted = false;
    };
  }, [currentProject?.path]);

  // Load running validations on mount (restore validatingIssues state)
  useEffect(() => {
    let isMounted = true;

    const loadRunningValidations = async () => {
      if (!currentProject?.path) return;

      try {
        const api = getElectronAPI();
        if (api.linear?.getValidationStatus) {
          const result = await api.linear.getValidationStatus(currentProject.path);
          if (isMounted && result.success && result.runningIdentifiers) {
            setValidatingIssues(new Set(result.runningIdentifiers));
          }
        }
      } catch (err) {
        if (isMounted) {
          logger.error('Failed to load running validations:', err);
        }
      }
    };

    loadRunningValidations();

    return () => {
      isMounted = false;
    };
  }, [currentProject?.path]);

  // Subscribe to validation events
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.linear?.onValidationEvent) return;

    const handleValidationEvent = (event: LinearValidationEvent) => {
      const normalizedEventPath = normalizePath(event.projectPath);
      const normalizedCurrentPath = normalizePath(currentProject?.path);
      const pathsMatch = normalizedEventPath === normalizedCurrentPath;

      // Debug: log all incoming events and path comparison
      logger.info(
        `[ValidationEvent] type=${event.type} identifier=${event.identifier} ` +
          `eventPath="${event.projectPath}" (normalized: "${normalizedEventPath}") ` +
          `currentPath="${currentProject?.path}" (normalized: "${normalizedCurrentPath}") ` +
          `match=${pathsMatch}`
      );

      // Only handle events for current project (use normalized paths for comparison)
      if (!pathsMatch) {
        logger.warn(
          `[ValidationEvent] SKIPPING - path mismatch: "${normalizedEventPath}" !== "${normalizedCurrentPath}"`
        );
        return;
      }

      switch (event.type) {
        case 'linear_validation_start':
          setValidatingIssues((prev) => new Set([...prev, event.identifier]));
          break;

        case 'linear_validation_complete':
          setValidatingIssues((prev) => {
            const next = new Set(prev);
            next.delete(event.identifier);
            return next;
          });

          // Update cached validations (use event.model to avoid stale closure race condition)
          setCachedValidations((prev) => {
            const next = new Map(prev);
            next.set(event.identifier, {
              issueId: event.issueId,
              identifier: event.identifier,
              issueTitle: event.issueTitle,
              validatedAt: new Date().toISOString(),
              model: event.model,
              result: event.result,
            });
            return next;
          });

          // Log completion with model info
          logger.info(
            `[ValidationComplete] identifier=${event.identifier} verdict=${event.result.verdict} model=${event.model}`
          );

          // Show toast notification with model info
          toast.success(`Issue ${event.identifier} validated: ${event.result.verdict}`, {
            description:
              (event.result.verdict === 'valid'
                ? 'Issue is ready to be converted to a task'
                : event.result.verdict === 'invalid'
                  ? 'Issue may have problems'
                  : 'Issue needs clarification') + ` (${event.model})`,
          });

          // Play audio notification (if not muted)
          if (!muteDoneSound) {
            try {
              if (!audioRef.current) {
                audioRef.current = new Audio('/sounds/ding.mp3');
              }
              audioRef.current.play().catch(() => {
                // Audio play might fail due to browser restrictions
              });
            } catch {
              // Ignore audio errors
            }
          }

          // If validation dialog is open for this issue, update the result
          if (
            selectedIssueRef.current?.identifier === event.identifier &&
            showValidationDialogRef.current
          ) {
            onValidationResultChange(event.result);
          }

          // Trigger auto-convert callback for valid issues
          if (onAutoConvert && event.result.verdict === 'valid') {
            onAutoConvert(event.identifier, event.result);
          }
          break;

        case 'linear_validation_error':
          setValidatingIssues((prev) => {
            const next = new Set(prev);
            next.delete(event.identifier);
            return next;
          });
          toast.error(`Validation failed for issue ${event.identifier}`, {
            description: event.error,
          });
          if (
            selectedIssueRef.current?.identifier === event.identifier &&
            showValidationDialogRef.current
          ) {
            onShowValidationDialogChange(false);
          }
          break;
      }
    };

    const unsubscribe = api.linear.onValidationEvent(handleValidationEvent);
    return () => unsubscribe();
  }, [
    currentProject?.path,
    muteDoneSound,
    onValidationResultChange,
    onShowValidationDialogChange,
    onAutoConvert,
  ]);

  // Cleanup audio element on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleValidateIssue = useCallback(
    async (
      issue: LinearIssue,
      options: {
        forceRevalidate?: boolean;
        model?: string | PhaseModelEntry; // Accept either string (backward compat) or PhaseModelEntry
        modelEntry?: PhaseModelEntry; // New preferred way to pass model with thinking level
      } = {}
    ) => {
      const { forceRevalidate = false, model, modelEntry } = options;

      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      // Check if already validating this issue
      if (validatingIssues.has(issue.identifier)) {
        toast.info(`Validation already in progress for issue ${issue.identifier}`);
        return;
      }

      // Check for cached result - if fresh, show it directly (unless force revalidate)
      const cached = cachedValidations.get(issue.identifier);
      if (cached && !forceRevalidate && !isValidationStale(cached.validatedAt)) {
        // Show cached result directly
        onValidationResultChange(cached.result);
        onShowValidationDialogChange(true);
        return;
      }

      // Start async validation in background (no dialog - user will see badge when done)
      toast.info(`Starting validation for issue ${issue.identifier}`, {
        description: 'You will be notified when the analysis is complete',
      });

      // Use provided model override or fall back to phaseModels.validationModel
      // Extract model string and thinking level from PhaseModelEntry (handles both old string format and new object format)
      const effectiveModelEntry = modelEntry
        ? modelEntry
        : model
          ? typeof model === 'string'
            ? { model: model as ModelAlias | CursorModelId }
            : model
          : phaseModels.validationModel;
      const normalizedEntry =
        typeof effectiveModelEntry === 'string'
          ? { model: effectiveModelEntry as ModelAlias | CursorModelId }
          : effectiveModelEntry;
      const modelToUse = normalizedEntry.model;
      const thinkingLevelToUse = normalizedEntry.thinkingLevel;

      try {
        const api = getElectronAPI();
        if (api.linear?.validateIssue) {
          const validationInput = {
            issueId: issue.id,
            identifier: issue.identifier,
            issueTitle: issue.title,
            issueBody: issue.description || '',
            issueLabels: issue.labels.map((l) => l.name),
          };
          const result = await api.linear.validateIssue(
            currentProject.path,
            validationInput,
            modelToUse,
            thinkingLevelToUse
          );

          if (!result.success) {
            toast.error(result.error || 'Failed to start validation');
          }
          // On success, the result will come through the event stream
        }
      } catch (err) {
        logger.error('Validation error:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to validate issue');
      }
    },
    [
      currentProject?.path,
      validatingIssues,
      cachedValidations,
      phaseModels.validationModel,
      onValidationResultChange,
      onShowValidationDialogChange,
    ]
  );

  // View cached validation result
  const handleViewCachedValidation = useCallback(
    async (issue: LinearIssue) => {
      const cached = cachedValidations.get(issue.identifier);
      if (cached) {
        onValidationResultChange(cached.result);
        onShowValidationDialogChange(true);

        // Mark as viewed if not already viewed
        if (!cached.viewedAt && currentProject?.path) {
          try {
            const api = getElectronAPI();
            if (api.linear?.markValidationViewed) {
              await api.linear.markValidationViewed(
                currentProject.path,
                issue.identifier,
                issue.id
              );
              // Update local state
              setCachedValidations((prev) => {
                const next = new Map(prev);
                const updated = prev.get(issue.identifier);
                if (updated) {
                  next.set(issue.identifier, {
                    ...updated,
                    viewedAt: new Date().toISOString(),
                  });
                }
                return next;
              });
            }
          } catch (err) {
            logger.error('Failed to mark validation as viewed:', err);
          }
        }
      }
    },
    [
      cachedValidations,
      currentProject?.path,
      onValidationResultChange,
      onShowValidationDialogChange,
    ]
  );

  return {
    validatingIssues,
    cachedValidations,
    handleValidateIssue,
    handleViewCachedValidation,
  };
}
