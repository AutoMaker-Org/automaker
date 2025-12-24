import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getElectronAPI,
  GitHubIssue,
  IssueValidationResult,
  IssueValidationEvent,
  StoredValidation,
} from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { isValidationStale } from '../utils';

interface UseIssueValidationOptions {
  selectedIssue: GitHubIssue | null;
  showValidationDialog: boolean;
  onValidationResultChange: (result: IssueValidationResult | null) => void;
  onShowValidationDialogChange: (show: boolean) => void;
}

export function useIssueValidation({
  selectedIssue,
  showValidationDialog,
  onValidationResultChange,
  onShowValidationDialogChange,
}: UseIssueValidationOptions) {
  const { currentProject, validationModel, muteDoneSound } = useAppStore();
  const [validatingIssues, setValidatingIssues] = useState<Set<number>>(new Set());
  const [cachedValidations, setCachedValidations] = useState<Map<number, StoredValidation>>(
    new Map()
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Refs for stable event handler (avoids re-subscribing on state changes)
  const selectedIssueRef = useRef<GitHubIssue | null>(null);
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
        if (api.github?.getValidations) {
          const result = await api.github.getValidations(currentProject.path);
          if (isMounted && result.success && result.validations) {
            const map = new Map<number, StoredValidation>();
            for (const v of result.validations) {
              map.set(v.issueNumber, v);
            }
            setCachedValidations(map);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('[GitHubIssuesView] Failed to load cached validations:', err);
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
        if (api.github?.getValidationStatus) {
          const result = await api.github.getValidationStatus(currentProject.path);
          if (isMounted && result.success && result.runningIssues) {
            setValidatingIssues(new Set(result.runningIssues));
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('[GitHubIssuesView] Failed to load running validations:', err);
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
    if (!api.github?.onValidationEvent) return;

    const handleValidationEvent = (event: IssueValidationEvent) => {
      // Only handle events for current project
      if (event.projectPath !== currentProject?.path) return;

      switch (event.type) {
        case 'issue_validation_start':
          setValidatingIssues((prev) => new Set([...prev, event.issueNumber]));
          break;

        case 'issue_validation_complete':
          setValidatingIssues((prev) => {
            const next = new Set(prev);
            next.delete(event.issueNumber);
            return next;
          });

          // Update cached validations (use event.model to avoid stale closure race condition)
          setCachedValidations((prev) => {
            const next = new Map(prev);
            next.set(event.issueNumber, {
              issueNumber: event.issueNumber,
              issueTitle: event.issueTitle,
              validatedAt: new Date().toISOString(),
              model: event.model,
              result: event.result,
            });
            return next;
          });

          // Show toast notification
          toast.success(`Issue #${event.issueNumber} validated: ${event.result.verdict}`, {
            description:
              event.result.verdict === 'valid'
                ? 'Issue is ready to be converted to a task'
                : event.result.verdict === 'invalid'
                  ? 'Issue may have problems'
                  : 'Issue needs clarification',
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
            selectedIssueRef.current?.number === event.issueNumber &&
            showValidationDialogRef.current
          ) {
            onValidationResultChange(event.result);
          }
          break;

        case 'issue_validation_error':
          setValidatingIssues((prev) => {
            const next = new Set(prev);
            next.delete(event.issueNumber);
            return next;
          });
          toast.error(`Validation failed for issue #${event.issueNumber}`, {
            description: event.error,
          });
          if (
            selectedIssueRef.current?.number === event.issueNumber &&
            showValidationDialogRef.current
          ) {
            onShowValidationDialogChange(false);
          }
          break;
      }
    };

    const unsubscribe = api.github.onValidationEvent(handleValidationEvent);
    return () => unsubscribe();
  }, [currentProject?.path, muteDoneSound, onValidationResultChange, onShowValidationDialogChange]);

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
    async (issue: GitHubIssue, options: { forceRevalidate?: boolean } = {}) => {
      const { forceRevalidate = false } = options;

      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      // Check if already validating this issue
      if (validatingIssues.has(issue.number)) {
        toast.info(`Validation already in progress for issue #${issue.number}`);
        return;
      }

      // Check for cached result - if fresh, show it directly (unless force revalidate)
      const cached = cachedValidations.get(issue.number);
      if (cached && !forceRevalidate && !isValidationStale(cached.validatedAt)) {
        // Show cached result directly
        onValidationResultChange(cached.result);
        onShowValidationDialogChange(true);
        return;
      }

      // Start async validation in background (no dialog - user will see badge when done)
      toast.info(`Starting validation for issue #${issue.number}`, {
        description: 'You will be notified when the analysis is complete',
      });

      try {
        const api = getElectronAPI();
        if (api.github?.validateIssue) {
          const result = await api.github.validateIssue(
            currentProject.path,
            {
              issueNumber: issue.number,
              issueTitle: issue.title,
              issueBody: issue.body || '',
              issueLabels: issue.labels.map((l) => l.name),
            },
            validationModel
          );

          if (!result.success) {
            toast.error(result.error || 'Failed to start validation');
          }
          // On success, the result will come through the event stream
        }
      } catch (err) {
        console.error('[GitHubIssuesView] Validation error:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to validate issue');
      }
    },
    [
      currentProject?.path,
      validatingIssues,
      cachedValidations,
      validationModel,
      onValidationResultChange,
      onShowValidationDialogChange,
    ]
  );

  // View cached validation result
  const handleViewCachedValidation = useCallback(
    async (issue: GitHubIssue) => {
      const cached = cachedValidations.get(issue.number);
      if (cached) {
        onValidationResultChange(cached.result);
        onShowValidationDialogChange(true);

        // Mark as viewed if not already viewed
        if (!cached.viewedAt && currentProject?.path) {
          try {
            const api = getElectronAPI();
            if (api.github?.markValidationViewed) {
              await api.github.markValidationViewed(currentProject.path, issue.number);
              // Update local state
              setCachedValidations((prev) => {
                const next = new Map(prev);
                const updated = prev.get(issue.number);
                if (updated) {
                  next.set(issue.number, {
                    ...updated,
                    viewedAt: new Date().toISOString(),
                  });
                }
                return next;
              });
            }
          } catch (err) {
            console.error('[GitHubIssuesView] Failed to mark validation as viewed:', err);
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
