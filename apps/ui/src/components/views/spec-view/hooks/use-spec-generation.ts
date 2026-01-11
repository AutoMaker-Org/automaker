import { useEffect, useState, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';

const logger = createLogger('SpecGeneration');
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { createElement } from 'react';
import { SPEC_FILE_WRITE_DELAY, STATUS_CHECK_INTERVAL_MS } from '../constants';
import type { FeatureCount } from '../types';
import type { SpecRegenerationEvent } from '@/types/electron';

interface UseSpecGenerationOptions {
  loadSpec: () => Promise<void>;
}

export function useSpecGeneration({ loadSpec }: UseSpecGenerationOptions) {
  const { currentProject } = useAppStore();

  // Dialog visibility state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);

  // Create spec state
  const [projectOverview, setProjectOverview] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [generateFeatures, setGenerateFeatures] = useState(true);
  const [analyzeProjectOnCreate, setAnalyzeProjectOnCreate] = useState(true);
  const [featureCountOnCreate, setFeatureCountOnCreate] = useState<FeatureCount>(50);

  // Regenerate spec state
  const [projectDefinition, setProjectDefinition] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [generateFeaturesOnRegenerate, setGenerateFeaturesOnRegenerate] = useState(true);
  const [analyzeProjectOnRegenerate, setAnalyzeProjectOnRegenerate] = useState(true);
  const [featureCountOnRegenerate, setFeatureCountOnRegenerate] = useState<FeatureCount>(50);

  // Generate features only state
  const [isGeneratingFeatures, setIsGeneratingFeatures] = useState(false);

  // Logs state (kept for internal tracking)
  const [logs, setLogs] = useState<string>('');
  const logsRef = useRef<string>('');

  // Phase tracking and status
  const [currentPhase, setCurrentPhase] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const statusCheckRef = useRef<boolean>(false);
  const stateRestoredRef = useRef<boolean>(false);
  const pendingStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset all state when project changes
  useEffect(() => {
    setIsCreating(false);
    setIsRegenerating(false);
    setIsGeneratingFeatures(false);
    setCurrentPhase('');
    setErrorMessage('');
    setLogs('');
    logsRef.current = '';
    stateRestoredRef.current = false;
    statusCheckRef.current = false;

    if (pendingStatusTimeoutRef.current) {
      clearTimeout(pendingStatusTimeoutRef.current);
      pendingStatusTimeoutRef.current = null;
    }
  }, [currentProject?.path]);

  // Check if spec regeneration is running when component mounts or project changes
  useEffect(() => {
    const checkStatus = async () => {
      if (!currentProject || statusCheckRef.current) return;
      statusCheckRef.current = true;

      try {
        const api = getElectronAPI();
        if (!api.specRegeneration) {
          statusCheckRef.current = false;
          return;
        }

        const status = await api.specRegeneration.status(currentProject.path);
        logger.debug(
          '[useSpecGeneration] Status check on mount:',
          status,
          'for project:',
          currentProject.path
        );

        if (status.success && status.isRunning) {
          logger.debug('[useSpecGeneration] Spec generation is running for this project.');

          setIsCreating(true);
          setIsRegenerating(true);
          if (status.currentPhase) {
            setCurrentPhase(status.currentPhase);
          } else {
            setCurrentPhase('initialization');
          }

          if (pendingStatusTimeoutRef.current) {
            clearTimeout(pendingStatusTimeoutRef.current);
          }
          pendingStatusTimeoutRef.current = setTimeout(() => {
            logger.debug(
              '[useSpecGeneration] No events received for current project - clearing tentative state'
            );
            setIsCreating(false);
            setIsRegenerating(false);
            setCurrentPhase('');
            pendingStatusTimeoutRef.current = null;
          }, 3000);
        } else if (status.success && !status.isRunning) {
          setIsCreating(false);
          setIsRegenerating(false);
          setCurrentPhase('');
          stateRestoredRef.current = false;
        }
      } catch (error) {
        logger.error('[useSpecGeneration] Failed to check status:', error);
      } finally {
        statusCheckRef.current = false;
      }
    };

    stateRestoredRef.current = false;
    checkStatus();
  }, [currentProject]);

  // Sync state when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (
        !document.hidden &&
        currentProject &&
        (isCreating || isRegenerating || isGeneratingFeatures)
      ) {
        try {
          const api = getElectronAPI();
          if (!api.specRegeneration) return;

          const status = await api.specRegeneration.status(currentProject.path);
          logger.debug('[useSpecGeneration] Visibility change - status check:', status);

          if (!status.isRunning) {
            logger.debug(
              '[useSpecGeneration] Visibility change: Backend indicates generation complete - clearing state'
            );
            setIsCreating(false);
            setIsRegenerating(false);
            setIsGeneratingFeatures(false);
            setCurrentPhase('');
            stateRestoredRef.current = false;
            loadSpec();
          } else if (status.currentPhase) {
            setCurrentPhase(status.currentPhase);
          }
        } catch (error) {
          logger.error('[useSpecGeneration] Failed to check status on visibility change:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentProject, isCreating, isRegenerating, isGeneratingFeatures, loadSpec]);

  // Periodic status check
  useEffect(() => {
    if (!currentProject || (!isCreating && !isRegenerating && !isGeneratingFeatures)) return;

    const intervalId = setInterval(async () => {
      try {
        const api = getElectronAPI();
        if (!api.specRegeneration) return;

        const status = await api.specRegeneration.status(currentProject.path);

        if (!status.isRunning) {
          logger.debug(
            '[useSpecGeneration] Periodic check: Backend indicates generation complete - clearing state'
          );
          setIsCreating(false);
          setIsRegenerating(false);
          setIsGeneratingFeatures(false);
          setCurrentPhase('');
          stateRestoredRef.current = false;
          loadSpec();
        } else if (status.currentPhase && status.currentPhase !== currentPhase) {
          logger.debug('[useSpecGeneration] Periodic check: Phase updated from backend', {
            old: currentPhase,
            new: status.currentPhase,
          });
          setCurrentPhase(status.currentPhase);
        }
      } catch (error) {
        logger.error('[useSpecGeneration] Periodic status check error:', error);
      }
    }, STATUS_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [currentProject, isCreating, isRegenerating, isGeneratingFeatures, currentPhase, loadSpec]);

  // Subscribe to spec regeneration events
  useEffect(() => {
    if (!currentProject) return;

    const api = getElectronAPI();
    if (!api.specRegeneration) return;

    const unsubscribe = api.specRegeneration.onEvent((event: SpecRegenerationEvent) => {
      logger.debug(
        '[useSpecGeneration] Regeneration event:',
        event.type,
        'for project:',
        event.projectPath,
        'current project:',
        currentProject?.path
      );

      if (event.projectPath !== currentProject?.path) {
        logger.debug('[useSpecGeneration] Ignoring event - not for current project');
        return;
      }

      if (pendingStatusTimeoutRef.current) {
        clearTimeout(pendingStatusTimeoutRef.current);
        pendingStatusTimeoutRef.current = null;
        logger.debug(
          '[useSpecGeneration] Event confirmed this is for current project - clearing timeout'
        );
      }

      if (event.type === 'spec_regeneration_progress') {
        setIsCreating(true);
        setIsRegenerating(true);

        const phaseMatch = event.content.match(/\[Phase:\s*([^\]]+)\]/);
        if (phaseMatch) {
          const phase = phaseMatch[1];
          setCurrentPhase(phase);
          logger.debug(`[useSpecGeneration] Phase updated: ${phase}`);

          if (phase === 'complete') {
            logger.debug('[useSpecGeneration] Phase is complete - clearing state');
            setIsCreating(false);
            setIsRegenerating(false);
            stateRestoredRef.current = false;
            setTimeout(() => {
              loadSpec();
            }, SPEC_FILE_WRITE_DELAY);
          }
        }

        if (
          event.content.includes('All tasks completed') ||
          event.content.includes('✓ All tasks completed')
        ) {
          logger.debug(
            '[useSpecGeneration] Detected completion in progress message - clearing state'
          );
          setIsCreating(false);
          setIsRegenerating(false);
          setCurrentPhase('');
          stateRestoredRef.current = false;
          setTimeout(() => {
            loadSpec();
          }, SPEC_FILE_WRITE_DELAY);
        }

        const newLog = logsRef.current + event.content;
        logsRef.current = newLog;
        setLogs(newLog);
        logger.debug('[useSpecGeneration] Progress:', event.content.substring(0, 100));

        if (errorMessage) {
          setErrorMessage('');
        }
      } else if (event.type === 'spec_regeneration_tool') {
        const isFeatureTool =
          event.tool === 'mcp__automaker-tools__UpdateFeatureStatus' ||
          event.tool === 'UpdateFeatureStatus' ||
          event.tool?.includes('Feature');

        if (isFeatureTool) {
          if (currentPhase !== 'feature_generation') {
            setCurrentPhase('feature_generation');
            setIsCreating(true);
            setIsRegenerating(true);
            logger.debug(
              '[useSpecGeneration] Detected feature creation tool - setting phase to feature_generation'
            );
          }
        }

        const toolInput = event.input
          ? ` (${JSON.stringify(event.input).substring(0, 100)}...)`
          : '';
        const toolLog = `\n[Tool] ${event.tool}${toolInput}\n`;
        const newLog = logsRef.current + toolLog;
        logsRef.current = newLog;
        setLogs(newLog);
        logger.debug('[useSpecGeneration] Tool:', event.tool, event.input);
      } else if (event.type === 'spec_regeneration_complete') {
        const completionLog = logsRef.current + `\n[Complete] ${event.message}\n`;
        logsRef.current = completionLog;
        setLogs(completionLog);

        const isFinalCompletionMessage =
          event.message?.includes('All tasks completed') ||
          event.message === 'All tasks completed!' ||
          event.message === 'All tasks completed' ||
          event.message === 'Spec regeneration complete!' ||
          event.message === 'Initial spec creation complete!';

        const hasCompletePhase = logsRef.current.includes('[Phase: complete]');

        const isIntermediateCompletion =
          event.message?.includes('Features are being generated') ||
          event.message?.includes('features are being generated');

        const shouldComplete =
          (isFinalCompletionMessage || hasCompletePhase) && !isIntermediateCompletion;

        if (shouldComplete) {
          logger.debug('[useSpecGeneration] Final completion detected - clearing state', {
            isFinalCompletionMessage,
            hasCompletePhase,
            message: event.message,
          });
          setIsRegenerating(false);
          setIsCreating(false);
          setIsGeneratingFeatures(false);
          setCurrentPhase('');
          setShowRegenerateDialog(false);
          setShowCreateDialog(false);
          setProjectDefinition('');
          setProjectOverview('');
          setErrorMessage('');
          stateRestoredRef.current = false;

          setTimeout(() => {
            loadSpec();
          }, SPEC_FILE_WRITE_DELAY);

          const isRegeneration = event.message?.includes('regeneration');
          const isFeatureGeneration = event.message?.includes('Feature generation');
          toast.success(
            isFeatureGeneration
              ? 'Feature Generation Complete'
              : isRegeneration
                ? 'Spec Regeneration Complete'
                : 'Spec Creation Complete',
            {
              description: isFeatureGeneration
                ? 'Features have been created from the app specification.'
                : 'Your app specification has been saved.',
              icon: createElement(CheckCircle2, { className: 'w-4 h-4' }),
            }
          );
        } else if (isIntermediateCompletion) {
          setIsCreating(true);
          setIsRegenerating(true);
          setCurrentPhase('feature_generation');
          logger.debug(
            '[useSpecGeneration] Intermediate completion, continuing with feature generation'
          );
        }

        logger.debug('[useSpecGeneration] Spec generation event:', event.message);
      } else if (event.type === 'spec_regeneration_error') {
        setIsRegenerating(false);
        setIsCreating(false);
        setIsGeneratingFeatures(false);
        setCurrentPhase('error');
        setErrorMessage(event.error);
        stateRestoredRef.current = false;
        const errorLog = logsRef.current + `\n\n[ERROR] ${event.error}\n`;
        logsRef.current = errorLog;
        setLogs(errorLog);
        logger.error('[useSpecGeneration] Regeneration error:', event.error);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentProject?.path, loadSpec, errorMessage, currentPhase]);

  // Handler functions
  const handleCreateSpec = useCallback(async () => {
    if (!currentProject || !projectOverview.trim()) return;

    setIsCreating(true);
    setShowCreateDialog(false);
    setCurrentPhase('initialization');
    setErrorMessage('');
    logsRef.current = '';
    setLogs('');
    logger.debug('[useSpecGeneration] Starting spec creation, generateFeatures:', generateFeatures);
    try {
      const api = getElectronAPI();
      if (!api.specRegeneration) {
        logger.error('[useSpecGeneration] Spec regeneration not available');
        setIsCreating(false);
        return;
      }
      const result = await api.specRegeneration.create(
        currentProject.path,
        projectOverview.trim(),
        generateFeatures,
        analyzeProjectOnCreate,
        generateFeatures ? featureCountOnCreate : undefined
      );

      if (!result.success) {
        const errorMsg = result.error || 'Unknown error';
        logger.error('[useSpecGeneration] Failed to start spec creation:', errorMsg);
        setIsCreating(false);
        setCurrentPhase('error');
        setErrorMessage(errorMsg);
        const errorLog = `[Error] Failed to start spec creation: ${errorMsg}\n`;
        logsRef.current = errorLog;
        setLogs(errorLog);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[useSpecGeneration] Failed to create spec:', errorMsg);
      setIsCreating(false);
      setCurrentPhase('error');
      setErrorMessage(errorMsg);
      const errorLog = `[Error] Failed to create spec: ${errorMsg}\n`;
      logsRef.current = errorLog;
      setLogs(errorLog);
    }
  }, [
    currentProject,
    projectOverview,
    generateFeatures,
    analyzeProjectOnCreate,
    featureCountOnCreate,
  ]);

  const handleRegenerate = useCallback(async () => {
    if (!currentProject || !projectDefinition.trim()) return;

    setIsRegenerating(true);
    setShowRegenerateDialog(false);
    setCurrentPhase('initialization');
    setErrorMessage('');
    logsRef.current = '';
    setLogs('');
    logger.debug(
      '[useSpecGeneration] Starting spec regeneration, generateFeatures:',
      generateFeaturesOnRegenerate
    );
    try {
      const api = getElectronAPI();
      if (!api.specRegeneration) {
        logger.error('[useSpecGeneration] Spec regeneration not available');
        setIsRegenerating(false);
        return;
      }
      const result = await api.specRegeneration.generate(
        currentProject.path,
        projectDefinition.trim(),
        generateFeaturesOnRegenerate,
        analyzeProjectOnRegenerate,
        generateFeaturesOnRegenerate ? featureCountOnRegenerate : undefined
      );

      if (!result.success) {
        const errorMsg = result.error || 'Unknown error';
        logger.error('[useSpecGeneration] Failed to start regeneration:', errorMsg);
        setIsRegenerating(false);
        setCurrentPhase('error');
        setErrorMessage(errorMsg);
        const errorLog = `[Error] Failed to start regeneration: ${errorMsg}\n`;
        logsRef.current = errorLog;
        setLogs(errorLog);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[useSpecGeneration] Failed to regenerate spec:', errorMsg);
      setIsRegenerating(false);
      setCurrentPhase('error');
      setErrorMessage(errorMsg);
      const errorLog = `[Error] Failed to regenerate spec: ${errorMsg}\n`;
      logsRef.current = errorLog;
      setLogs(errorLog);
    }
  }, [
    currentProject,
    projectDefinition,
    generateFeaturesOnRegenerate,
    analyzeProjectOnRegenerate,
    featureCountOnRegenerate,
  ]);

  const handleGenerateFeatures = useCallback(async () => {
    if (!currentProject) return;

    setIsGeneratingFeatures(true);
    setShowRegenerateDialog(false);
    setCurrentPhase('initialization');
    setErrorMessage('');
    logsRef.current = '';
    setLogs('');
    logger.debug('[useSpecGeneration] Starting feature generation from existing spec');
    try {
      const api = getElectronAPI();
      if (!api.specRegeneration) {
        logger.error('[useSpecGeneration] Spec regeneration not available');
        setIsGeneratingFeatures(false);
        return;
      }
      const result = await api.specRegeneration.generateFeatures(currentProject.path);

      if (!result.success) {
        const errorMsg = result.error || 'Unknown error';
        logger.error('[useSpecGeneration] Failed to start feature generation:', errorMsg);
        setIsGeneratingFeatures(false);
        setCurrentPhase('error');
        setErrorMessage(errorMsg);
        const errorLog = `[Error] Failed to start feature generation: ${errorMsg}\n`;
        logsRef.current = errorLog;
        setLogs(errorLog);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[useSpecGeneration] Failed to generate features:', errorMsg);
      setIsGeneratingFeatures(false);
      setCurrentPhase('error');
      setErrorMessage(errorMsg);
      const errorLog = `[Error] Failed to generate features: ${errorMsg}\n`;
      logsRef.current = errorLog;
      setLogs(errorLog);
    }
  }, [currentProject]);

  return {
    // Dialog state
    showCreateDialog,
    setShowCreateDialog,
    showRegenerateDialog,
    setShowRegenerateDialog,

    // Create state
    projectOverview,
    setProjectOverview,
    isCreating,
    generateFeatures,
    setGenerateFeatures,
    analyzeProjectOnCreate,
    setAnalyzeProjectOnCreate,
    featureCountOnCreate,
    setFeatureCountOnCreate,

    // Regenerate state
    projectDefinition,
    setProjectDefinition,
    isRegenerating,
    generateFeaturesOnRegenerate,
    setGenerateFeaturesOnRegenerate,
    analyzeProjectOnRegenerate,
    setAnalyzeProjectOnRegenerate,
    featureCountOnRegenerate,
    setFeatureCountOnRegenerate,

    // Feature generation state
    isGeneratingFeatures,

    // Status state
    currentPhase,
    errorMessage,
    logs,

    // Handlers
    handleCreateSpec,
    handleRegenerate,
    handleGenerateFeatures,
  };
}
