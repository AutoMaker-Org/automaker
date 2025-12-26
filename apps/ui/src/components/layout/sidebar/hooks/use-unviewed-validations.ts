import { useState, useEffect, useCallback, useRef } from 'react';
import { getElectronAPI } from '@/lib/electron';
import type { Project, StoredValidation } from '@/lib/electron';

/**
 * Hook to track the count of unviewed (fresh) issue validations for a project.
 * Also provides a function to decrement the count when a validation is viewed.
 */
export function useUnviewedValidations(currentProject: Project | null) {
  const [count, setCount] = useState(0);
  const projectPathRef = useRef<string | null>(null);

  // Keep project path in ref for use in async functions
  useEffect(() => {
    projectPathRef.current = currentProject?.path ?? null;
  }, [currentProject?.path]);

  // Fetch and update count from server
  const fetchUnviewedCount = useCallback(async () => {
    const projectPath = projectPathRef.current;
    if (!projectPath) return;

    try {
      const api = getElectronAPI();
      if (api.github?.getValidations) {
        const result = await api.github.getValidations(projectPath);
        if (result.success && result.validations) {
          const unviewed = result.validations.filter((v: StoredValidation) => {
            if (v.viewedAt) return false;
            // Check if not stale (< 24 hours)
            const hoursSince = (Date.now() - new Date(v.validatedAt).getTime()) / (1000 * 60 * 60);
            return hoursSince <= 24;
          });
          // Only update count if we're still on the same project (guard against race condition)
          if (projectPathRef.current === projectPath) {
            setCount(unviewed.length);
          }
        }
      }
    } catch (err) {
      console.error('[useUnviewedValidations] Failed to load count:', err);
    }
  }, []);

  // Load initial count and subscribe to events
  useEffect(() => {
    if (!currentProject?.path) {
      setCount(0);
      return;
    }

    // Load initial count
    fetchUnviewedCount();

    // Subscribe to validation events to update count
    const api = getElectronAPI();
    if (api.github?.onValidationEvent) {
      const unsubscribe = api.github.onValidationEvent((event) => {
        if (event.projectPath === currentProject.path) {
          if (event.type === 'issue_validation_complete') {
            // New validation completed - refresh count from server for consistency
            fetchUnviewedCount();
          } else if (event.type === 'issue_validation_viewed') {
            // Validation was viewed - refresh count from server for consistency
            fetchUnviewedCount();
          }
        }
      });
      return () => unsubscribe();
    }
  }, [currentProject?.path, fetchUnviewedCount]);

  // Function to decrement count when a validation is viewed
  const decrementCount = useCallback(() => {
    setCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Expose refreshCount as an alias to fetchUnviewedCount for external use
  const refreshCount = fetchUnviewedCount;

  return { count, decrementCount, refreshCount };
}
