import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { isElectronMode } from '@/lib/http-api-client';
import { getElectronAPI, Project } from '@/lib/electron';
import { validateProjectPath } from '@/lib/validate-project-path';

interface UseProjectRestorationOptions {
  isMounted: boolean;
  currentProject: Project | null;
  currentPathname: string;
  isAuthenticated: boolean;
  authChecked: boolean;
  appHydrated: boolean;
  onShowValidationDialog: (project: Project) => void;
}

/**
 * Hook for restoring project on app initialization.
 * Validates the project path and navigates to board if valid,
 * or shows validation dialog if path is invalid.
 */
export function useProjectRestoration(options: UseProjectRestorationOptions) {
  const {
    isMounted,
    currentProject,
    currentPathname,
    isAuthenticated,
    authChecked,
    appHydrated,
    onShowValidationDialog,
  } = options;

  const navigate = useNavigate();
  const isValidatingRef = useRef(false);

  const validateAndRestore = useCallback(
    async (shouldCheckIpc: boolean) => {
      isValidatingRef.current = true;
      try {
        // Electron-specific: check IPC connection first
        if (shouldCheckIpc) {
          const api = getElectronAPI();
          const result = await api.ping();
          if (result !== 'pong') {
            console.log('IPC not connected, skipping project restoration');
            return;
          }
        }

        // Validate project path before restoring
        const isValid = await validateProjectPath(currentProject!);
        if (!isValid) {
          console.log('Project path is invalid, showing validation dialog');
          onShowValidationDialog(currentProject!);
          return;
        }

        navigate({ to: '/board' });
      } catch (error) {
        console.error('Failed to validate project or restore:', error);
      } finally {
        isValidatingRef.current = false;
      }
    },
    [currentProject, navigate, onShowValidationDialog]
  );

  useEffect(() => {
    if (!isMounted || !currentProject) return;
    // Only restore when on the root/welcome page
    if (currentPathname !== '/') return;
    if (!authChecked || !appHydrated) return;
    if (!isElectronMode() && !isAuthenticated) return;
    if (isValidatingRef.current) return;

    validateAndRestore(isElectronMode());
  }, [
    isMounted,
    currentProject,
    currentPathname,
    authChecked,
    appHydrated,
    isAuthenticated,
    validateAndRestore,
  ]);
}
