import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { pathsEqual } from '@/lib/utils';

interface InitScriptStartedPayload {
  projectPath: string;
  worktreePath: string;
  branch: string;
}

interface InitScriptOutputPayload {
  projectPath: string;
  branch: string;
  type: 'stdout' | 'stderr';
  content: string;
}

interface InitScriptCompletedPayload {
  projectPath: string;
  worktreePath: string;
  branch: string;
  success: boolean;
  exitCode?: number;
  error?: string;
}

/**
 * Hook to subscribe to init script WebSocket events and update the store.
 * Should be used in a component that's always mounted (e.g., board-view).
 */
export function useInitScriptEvents(projectPath: string | null) {
  const setInitScriptState = useAppStore((s) => s.setInitScriptState);
  const appendInitScriptOutput = useAppStore((s) => s.appendInitScriptOutput);

  useEffect(() => {
    if (!projectPath) return;

    const api = getHttpApiClient();

    const unsubscribe = api.worktree.onInitScriptEvent((event) => {
      const payload = event.payload as
        | InitScriptStartedPayload
        | InitScriptOutputPayload
        | InitScriptCompletedPayload;

      // Only handle events for the current project (use pathsEqual for cross-platform path comparison)
      if (!pathsEqual(payload.projectPath, projectPath)) return;

      switch (event.type) {
        case 'worktree:init-started': {
          const startPayload = payload as InitScriptStartedPayload;
          setInitScriptState(projectPath, startPayload.branch, {
            status: 'running',
            branch: startPayload.branch,
            output: [],
            error: undefined,
          });
          break;
        }
        case 'worktree:init-output': {
          const outputPayload = payload as InitScriptOutputPayload;
          appendInitScriptOutput(projectPath, outputPayload.branch, outputPayload.content);
          break;
        }
        case 'worktree:init-completed': {
          const completePayload = payload as InitScriptCompletedPayload;
          setInitScriptState(projectPath, completePayload.branch, {
            status: completePayload.success ? 'success' : 'failed',
            error: completePayload.error,
          });
          break;
        }
      }
    });

    return unsubscribe;
  }, [projectPath, setInitScriptState, appendInitScriptOutput]);
}
