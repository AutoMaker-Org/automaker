import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';

const logger = createLogger('AgentSession');

interface UseAgentSessionOptions {
  projectPath: string | undefined;
  workingDirectory?: string; // Current worktree path for per-worktree session persistence
}

interface UseAgentSessionResult {
  currentSessionId: string | null;
  handleSelectSession: (sessionId: string | null) => void;
}

export function useAgentSession({
  projectPath,
  workingDirectory,
}: UseAgentSessionOptions): UseAgentSessionResult {
  const { setLastSelectedSession, getLastSelectedSession } = useAppStore();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Track if initial session has been loaded
  const initialSessionLoadedRef = useRef(false);

  // Use workingDirectory as the persistence key so sessions are scoped per worktree
  const persistenceKey = workingDirectory || projectPath;

  // Handle session selection with persistence
  const handleSelectSession = useCallback(
    (sessionId: string | null) => {
      setCurrentSessionId(sessionId);
      // Persist the selection for this worktree/project
      if (persistenceKey) {
        setLastSelectedSession(persistenceKey, sessionId);
      }
    },
    [persistenceKey, setLastSelectedSession]
  );

  // Restore last selected session when switching to Agent view or when worktree changes
  useEffect(() => {
    if (!persistenceKey) {
      // No project, reset
      setCurrentSessionId(null);
      initialSessionLoadedRef.current = false;
      return;
    }

    // Only restore once per persistence key
    if (initialSessionLoadedRef.current) return;
    initialSessionLoadedRef.current = true;

    const lastSessionId = getLastSelectedSession(persistenceKey);
    if (lastSessionId) {
      logger.info('Restoring last selected session:', lastSessionId);
      setCurrentSessionId(lastSessionId);
    }
  }, [persistenceKey, getLastSelectedSession]);

  // Reset when worktree/project changes - clear current session and allow restore
  useEffect(() => {
    initialSessionLoadedRef.current = false;
    setCurrentSessionId(null);
  }, [persistenceKey]);

  return {
    currentSessionId,
    handleSelectSession,
  };
}
