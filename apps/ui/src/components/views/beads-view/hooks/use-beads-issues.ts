import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import type { BeadsIssue } from '@automaker/types';

interface UseBeadsIssuesProps {
  currentProject: { path: string; id: string } | null;
}

/**
 * Hook that loads and exposes Beads issues for the provided project.
 *
 * @param currentProject - The active project (contains `path` and `id`), or `null` when no project is selected.
 * @returns An object with:
 *  - `issues`: the array of `BeadsIssue` for the current project (empty if no project or none available),
 *  - `isLoading`: `true` while the hook is loading issues,
 *  - `error`: an error message when loading fails, or `null` when there is no error,
 *  - `loadIssues`: a function to trigger a manual reload of issues
 */
export function useBeadsIssues({ currentProject }: UseBeadsIssuesProps) {
  const { beadsByProject, setBeadsIssues } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track previous project path to detect project switches
  const prevProjectPathRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  // Load issues using beads API
  const loadIssues = useCallback(async () => {
    if (!currentProject) return;

    const currentPath = currentProject.path;
    const previousPath = prevProjectPathRef.current;
    const isProjectSwitch = previousPath !== null && currentPath !== previousPath;

    // Update the ref to track current project
    prevProjectPathRef.current = currentPath;

    // Only show loading spinner on initial load
    if (isInitialLoadRef.current) {
      setIsLoading(true);
    }

    setError(null);

    try {
      const api = getElectronAPI();
      if (!api.beads) {
        console.error('[BeadsView] Beads API not available');
        setError('Beads API not available');
        return;
      }

      // First validate beads is initialized
      const validation = await api.beads.validate(currentPath);
      if (!validation.success || !validation.initialized) {
        // Not initialized - start with empty issues
        setBeadsIssues(currentPath, []);
        setIsLoading(false);
        isInitialLoadRef.current = false;
        return;
      }

      const result = await api.beads.list(currentPath);

      if (result.success && result.issues) {
        setBeadsIssues(currentPath, result.issues);
      } else {
        console.error('[BeadsView] API returned error:', result.error);
        setError(result.error || 'Failed to load issues');
        // Keep existing issues on error, don't clear them
      }
    } catch (err) {
      console.error('Failed to load issues:', err);
      setError(err instanceof Error ? err.message : 'Failed to load issues');
      // On error, keep existing issues for the current project
    } finally {
      setIsLoading(false);
      isInitialLoadRef.current = false;
    }
  }, [currentProject, setBeadsIssues]);

  // Load issues when project changes
  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  return {
    issues: currentProject ? beadsByProject[currentProject.path]?.issues || [] : [],
    isLoading,
    error,
    loadIssues,
  };
}
