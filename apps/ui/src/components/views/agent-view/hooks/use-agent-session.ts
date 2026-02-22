import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import type { PhaseModelEntry } from '@automaker/types';
import { useAppStore } from '@/store/app-store';

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
  } = useAppStore();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [modelSelection, setModelSelectionState] =
    useState<PhaseModelEntry>(DEFAULT_MODEL_SELECTION);

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
      // Restore model selection for this session if available
      if (sessionId) {
        const persistedModel = getAgentModelForSession(sessionId);
        if (persistedModel) {
          logger.info('Restoring model selection for session:', sessionId, persistedModel);
          setModelSelectionState(persistedModel);
        } else {
          // Reset to default for new sessions
          setModelSelectionState(DEFAULT_MODEL_SELECTION);
        }
      }
    },
    [persistenceKey, setLastSelectedSession, getAgentModelForSession]
  );

  // Wrapper for setModelSelection that also persists
  const setModelSelection = useCallback(
    (model: PhaseModelEntry) => {
      setModelSelectionState(model);
      // Persist model selection for current session
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
      logger.info('Restoring last selected session:', lastSessionId);
      setCurrentSessionId(lastSessionId);
      // Also restore model selection for this session
      const persistedModel = getAgentModelForSession(lastSessionId);
      if (persistedModel) {
        logger.info('Restoring model selection:', persistedModel);
        setModelSelectionState(persistedModel);
      }
    }
  }, [persistenceKey, getLastSelectedSession, getAgentModelForSession]);

  return {
    currentSessionId,
    handleSelectSession,
    modelSelection,
    setModelSelection,
  };
}
