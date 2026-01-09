import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';

const logger = createLogger('AgentSession');

interface UseAgentSessionOptions {
  projectPath: string | undefined;
}

interface UseAgentSessionResult {
  currentSessionId: string | null;
  handleSelectSession: (sessionId: string | null) => void;
}

export function useAgentSession({ projectPath }: UseAgentSessionOptions): UseAgentSessionResult {
  const { setLastSelectedSession, getLastSelectedSession } = useAppStore();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Track if initial session has been loaded
  const initialSessionLoadedRef = useRef(false);

  // Handle session selection with persistence
  const handleSelectSession = useCallback(
    (sessionId: string | null) => {
      setCurrentSessionId(sessionId);
      // Persist the selection for this project
      if (projectPath) {
        setLastSelectedSession(projectPath, sessionId);
      }
    },
    [projectPath, setLastSelectedSession]
  );

  // Restore last selected session when switching to Agent view or when project changes
  useEffect(() => {
    if (!projectPath) {
      // No project, reset
      setCurrentSessionId(null);
      initialSessionLoadedRef.current = false;
      return;
    }

    // Only restore once per project
    if (initialSessionLoadedRef.current) return;
    initialSessionLoadedRef.current = true;

    const lastSessionId = getLastSelectedSession(projectPath);
    if (lastSessionId) {
      logger.info('Restoring last selected session:', lastSessionId);
      setCurrentSessionId(lastSessionId);
    }
  }, [projectPath, getLastSelectedSession]);

  // Reset initialSessionLoadedRef when project changes
  useEffect(() => {
    initialSessionLoadedRef.current = false;
  }, [projectPath]);

  return {
    currentSessionId,
    handleSelectSession,
  };
}
