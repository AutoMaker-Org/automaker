import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore, Feature } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('BoardFeatures');

interface UseBoardFeaturesProps {
  currentProject: { path: string; id: string } | null;
}

export function useBoardFeatures({ currentProject }: UseBoardFeaturesProps) {
  const { features, setFeatures } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [persistedCategories, setPersistedCategories] = useState<string[]>([]);

  // Track previous project path to detect project switches
  const prevProjectPathRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const isSwitchingProjectRef = useRef(false);

  // Load features using features API
  // IMPORTANT: Do NOT add 'features' to dependency array - it would cause infinite reload loop
  const loadFeatures = useCallback(async () => {
    if (!currentProject) return;

    const currentPath = currentProject.path;
    const previousPath = prevProjectPathRef.current;
    const isProjectSwitch = previousPath !== null && currentPath !== previousPath;

    // Get cached features from store (without adding to dependencies)
    const cachedFeatures = useAppStore.getState().features;

    // If project switched, mark it but don't clear features yet
    // We'll clear after successful API load to prevent data loss
    if (isProjectSwitch) {
      logger.info(`Project switch detected: ${previousPath} -> ${currentPath}`);
      isSwitchingProjectRef.current = true;
      isInitialLoadRef.current = true;
    }

    // Update the ref to track current project
    prevProjectPathRef.current = currentPath;

    // Only show loading spinner on initial load to prevent board flash during reloads
    if (isInitialLoadRef.current) {
      setIsLoading(true);
    }

    try {
      const api = getElectronAPI();
      if (!api.features) {
        logger.error('Features API not available');
        // Keep cached features if API is unavailable
        return;
      }

      const result = await api.features.getAll(currentProject.path);

      if (result.success && result.features) {
        const featuresWithIds = result.features.map((f: any, index: number) => ({
          ...f,
          id: f.id || `feature-${index}-${Date.now()}`,
          status: f.status || 'backlog',
          startedAt: f.startedAt, // Preserve startedAt timestamp
          // Ensure model and thinkingLevel are set for backward compatibility
          model: f.model || 'opus',
          thinkingLevel: f.thinkingLevel || 'none',
        }));
        // Successfully loaded features - now safe to set them
        setFeatures(featuresWithIds);

        // Only clear categories on project switch AFTER successful load
        if (isProjectSwitch) {
          setPersistedCategories([]);
        }

        // Check for interrupted features and resume them
        // This handles server restarts where features were in pipeline steps
        if (api.autoMode?.resumeInterrupted) {
          try {
            await api.autoMode.resumeInterrupted(currentProject.path);
            logger.info('Checked for interrupted features');
          } catch (resumeError) {
            logger.warn('Failed to check for interrupted features:', resumeError);
          }
        }
      } else if (!result.success && result.error) {
        logger.error('API returned error:', result.error);
        // If it's a new project or the error indicates no features found,
        // that's expected - start with empty array
        if (isProjectSwitch) {
          setFeatures([]);
          setPersistedCategories([]);
        }
        // Otherwise keep cached features
      }
    } catch (error) {
      logger.error('Failed to load features:', error);
      // On error, keep existing cached features for the current project
      // Only clear on project switch if we have no features from server
      if (isProjectSwitch && cachedFeatures.length === 0) {
        setFeatures([]);
        setPersistedCategories([]);
      }
    } finally {
      setIsLoading(false);
      isInitialLoadRef.current = false;
      isSwitchingProjectRef.current = false;
    }
  }, [currentProject, setFeatures]);

  // Load persisted categories from file
  const loadCategories = useCallback(async () => {
    if (!currentProject) return;

    try {
      const api = getElectronAPI();
      const result = await api.readFile(`${currentProject.path}/.automaker/categories.json`);

      if (result.success && result.content) {
        const parsed = JSON.parse(result.content);
        if (Array.isArray(parsed)) {
          setPersistedCategories(parsed);
        }
      } else {
        // File doesn't exist, ensure categories are cleared
        setPersistedCategories([]);
      }
    } catch (error) {
      logger.error('Failed to load categories:', error);
      // If file doesn't exist, ensure categories are cleared
      setPersistedCategories([]);
    }
  }, [currentProject]);

  // Save a new category to the persisted categories file
  const saveCategory = useCallback(
    async (category: string) => {
      if (!currentProject || !category.trim()) return;

      try {
        const api = getElectronAPI();

        // Read existing categories
        let categories: string[] = [...persistedCategories];

        // Add new category if it doesn't exist
        if (!categories.includes(category)) {
          categories.push(category);
          categories.sort(); // Keep sorted

          // Write back to file
          await api.writeFile(
            `${currentProject.path}/.automaker/categories.json`,
            JSON.stringify(categories, null, 2)
          );

          // Update state
          setPersistedCategories(categories);
        }
      } catch (error) {
        logger.error('Failed to save category:', error);
      }
    },
    [currentProject, persistedCategories]
  );

  // Subscribe to spec regeneration complete events to refresh kanban board
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.specRegeneration) return;

    const unsubscribe = api.specRegeneration.onEvent((event) => {
      // Refresh the kanban board when spec regeneration completes for the current project
      if (
        event.type === 'spec_regeneration_complete' &&
        currentProject &&
        event.projectPath === currentProject.path
      ) {
        logger.info('Spec regeneration complete, refreshing features');
        loadFeatures();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentProject, loadFeatures]);

  // Listen for auto mode feature completion and errors to reload features
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode || !currentProject) return;

    const { removeRunningTask } = useAppStore.getState();
    const projectId = currentProject.id;

    const unsubscribe = api.autoMode.onEvent((event) => {
      // Use event's projectPath or projectId if available, otherwise use current project
      // Board view only reacts to events for the currently selected project
      const eventProjectId = ('projectId' in event && event.projectId) || projectId;

      if (event.type === 'auto_mode_feature_complete') {
        // Reload features when a feature is completed
        logger.info('Feature completed, reloading features...');
        loadFeatures();
        // Play ding sound when feature is done (unless muted)
        const { muteDoneSound } = useAppStore.getState();
        if (!muteDoneSound) {
          const audio = new Audio('/sounds/ding.mp3');
          audio.play().catch((err) => logger.warn('Could not play ding sound:', err));
        }
      } else if (event.type === 'plan_approval_required') {
        // Reload features when plan is generated and requires approval
        // This ensures the feature card shows the "Approve Plan" button
        logger.info('Plan approval required, reloading features...');
        loadFeatures();
      } else if (event.type === 'pipeline_step_started') {
        // Pipeline steps update the feature status to `pipeline_*` before the step runs.
        // Reload so the card moves into the correct pipeline column immediately.
        logger.info('Pipeline step started, reloading features...');
        loadFeatures();
      } else if (event.type === 'auto_mode_error') {
        // Reload features when an error occurs (feature moved to waiting_approval)
        logger.info('Feature error, reloading features...', event.error);

        // Remove from running tasks so it moves to the correct column
        if (event.featureId) {
          removeRunningTask(eventProjectId, event.featureId);
        }

        loadFeatures();

        // Check for authentication errors and show a more helpful message
        const isAuthError =
          event.errorType === 'authentication' ||
          (event.error &&
            (event.error.includes('Authentication failed') ||
              event.error.includes('Invalid API key')));

        if (isAuthError) {
          toast.error('Authentication Failed', {
            description:
              "Your API key is invalid or expired. Please check Settings or run 'claude login' in terminal.",
            duration: 10000,
          });
        } else {
          toast.error('Agent encountered an error', {
            description: event.error || 'Check the logs for details',
          });
        }
      }
    });

    return unsubscribe;
  }, [loadFeatures, currentProject]);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // Load persisted categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  return {
    features,
    isLoading,
    persistedCategories,
    loadFeatures,
    loadCategories,
    saveCategory,
  };
}
