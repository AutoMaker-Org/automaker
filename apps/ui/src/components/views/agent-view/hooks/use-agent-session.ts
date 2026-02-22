import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import type { PhaseModelEntry } from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';

const logger = createLogger('AgentSession');

// Default model selection when none is persisted
const DEFAULT_MODEL_SELECTION: PhaseModelEntry = { model: 'claude-sonnet' };

interface UseAgentSessionOptions {
  projectPath: string | undefined;
  workingDirectory?: string; // Current worktree path for per-worktree session persistence
}

interface UseAgentSessionResult {
  currentSessionId: string | null;
  handleSelectSession: (sessionId: string | null) => void;
  // Model selection persistence
  modelSelection: PhaseModelEntry;
  setModelSelection: (model: PhaseModelEntry) => void;
}

export function useAgentSession({
  projectPath,
  workingDirectory,
}: UseAgentSessionOptions): UseAgentSessionResult {
  const {
    setLastSelectedSession,
    getLastSelectedSession,
    setAgentModelForSession,
    getAgentModelForSession,
  } = useAppStore(
    useShallow((state) => ({
      setLastSelectedSession: state.setLastSelectedSession,
      getLastSelectedSession: state.getLastSelectedSession,
      setAgentModelForSession: state.setAgentModelForSession,
      getAgentModelForSession: state.getAgentModelForSession,
    }))
  );
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [modelSelection, setModelSelectionState] =
    useState<PhaseModelEntry>(DEFAULT_MODEL_SELECTION);

  // Track if initial session has been loaded
  const initialSessionLoadedRef = useRef(false);

  // Use workingDirectory as the persistence key so sessions are scoped per worktree
  const persistenceKey = workingDirectory || projectPath;

  /**
   * Fetch persisted model for sessionId and update local state, or fall back to default.
   */
  const restoreModelForSession = useCallback(
    (sessionId: string) => {
      const persistedModel = getAgentModelForSession(sessionId);
      if (persistedModel) {
        logger.debug('Restoring model selection for session:', sessionId, persistedModel);
        setModelSelectionState(persistedModel);
      } else {
        setModelSelectionState(DEFAULT_MODEL_SELECTION);
      }
    },
    [getAgentModelForSession]
  );

  // Handle session selection with persistence
  const handleSelectSession = useCallback(
    (sessionId: string | null) => {
      setCurrentSessionId(sessionId);
      // Persist the selection for this worktree/project
      if (persistenceKey) {
        setLastSelectedSession(persistenceKey, sessionId);
      }
      // Restore model selection for this session if available
      if (sessionId) {
        restoreModelForSession(sessionId);
      }
    },
    [persistenceKey, setLastSelectedSession, restoreModelForSession]
  );

  // Wrapper for setModelSelection that also persists
  const setModelSelection = useCallback(
    (model: PhaseModelEntry) => {
      setModelSelectionState(model);
      // Persist model selection for current session.
      // If currentSessionId is null (no active session), we only update local state
      // and skip persistence — this is intentional because the model picker should be
      // disabled (or hidden) in the UI whenever there is no active session, so this
      // path is only reached if the UI allows selection before a session is established.
      if (currentSessionId) {
        setAgentModelForSession(currentSessionId, model);
      }
    },
    [currentSessionId, setAgentModelForSession]
  );

  // Track the previous persistence key to detect actual changes
  const prevPersistenceKeyRef = useRef(persistenceKey);

  // Restore last selected session when switching to Agent view or when worktree changes
  useEffect(() => {
    // Detect if persistenceKey actually changed (worktree/project switch)
    const persistenceKeyChanged = prevPersistenceKeyRef.current !== persistenceKey;

    if (persistenceKeyChanged) {
      // Reset state when switching worktree/project
      prevPersistenceKeyRef.current = persistenceKey;
      initialSessionLoadedRef.current = false;
      setCurrentSessionId(null);
      setModelSelectionState(DEFAULT_MODEL_SELECTION);

      if (!persistenceKey) {
        // No project, nothing to restore
        return;
      }
    }

    if (!persistenceKey) {
      return;
    }

    // Only restore once per persistence key
    if (initialSessionLoadedRef.current) return;
    initialSessionLoadedRef.current = true;

    const lastSessionId = getLastSelectedSession(persistenceKey);
    if (lastSessionId) {
      logger.debug('Restoring last selected session:', lastSessionId);
      setCurrentSessionId(lastSessionId);
      // Also restore model selection for this session
      restoreModelForSession(lastSessionId);
    }
  }, [persistenceKey, getLastSelectedSession, restoreModelForSession]);

  return {
    currentSessionId,
    handleSelectSession,
    modelSelection,
    setModelSelection,
  };
}
