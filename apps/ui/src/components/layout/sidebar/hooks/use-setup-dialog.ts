import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';

const logger = createLogger('SetupDialog');
import { toast } from 'sonner';
import type { FeatureCount } from '@/components/views/spec-view/types';

interface UseSetupDialogProps {
  setSpecCreatingForProject: (path: string | null) => void;
  newProjectPath: string;
  setNewProjectName: (name: string) => void;
  setNewProjectPath: (path: string) => void;
  setShowOnboardingDialog: (show: boolean) => void;
}

export function useSetupDialog({
  setSpecCreatingForProject,
  newProjectPath,
  setNewProjectName,
  setNewProjectPath,
  setShowOnboardingDialog,
}: UseSetupDialogProps) {
  // Setup dialog state
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [setupProjectPath, setSetupProjectPath] = useState('');
  const [projectOverview, setProjectOverview] = useState('');
  const [generateFeatures, setGenerateFeatures] = useState(true);
  const [analyzeProject, setAnalyzeProject] = useState(true);
  const [featureCount, setFeatureCount] = useState<FeatureCount>(50);

  /**
   * Handle creating initial spec for new project
   */
  const handleCreateInitialSpec = useCallback(async () => {
    if (!setupProjectPath || !projectOverview.trim()) return;

    // Set store state immediately so the loader shows up right away
    setSpecCreatingForProject(setupProjectPath);
    setShowSetupDialog(false);

    try {
      const api = getElectronAPI();
      if (!api.specRegeneration) {
        toast.error('Spec regeneration not available');
        setSpecCreatingForProject(null);
        return;
      }

      const result = await api.specRegeneration.create(
        setupProjectPath,
        projectOverview.trim(),
        generateFeatures,
        analyzeProject,
        generateFeatures ? featureCount : undefined // only pass maxFeatures if generating features
      );

      if (!result.success) {
        logger.error('Failed to start spec creation:', result.error);
        setSpecCreatingForProject(null);
        toast.error('Failed to create specification', {
          description: result.error,
        });
      } else {
        // Show processing toast to inform user
        toast.info('Generating app specification...', {
          description: "This may take a minute. You'll be notified when complete.",
        });
      }
      // If successful, we'll wait for the events to update the state
    } catch (error) {
      logger.error('Failed to create spec:', error);
      setSpecCreatingForProject(null);
      toast.error('Failed to create specification', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [
    setupProjectPath,
    projectOverview,
    generateFeatures,
    analyzeProject,
    featureCount,
    setSpecCreatingForProject,
  ]);

  /**
   * Handle skipping setup
   */
  const handleSkipSetup = useCallback(() => {
    setShowSetupDialog(false);
    setProjectOverview('');
    setSetupProjectPath('');

    // Clear onboarding state if we came from onboarding
    if (newProjectPath) {
      setNewProjectName('');
      setNewProjectPath('');
    }

    toast.info('Setup skipped', {
      description: 'You can set up your app_spec.txt later from the Spec view.',
    });
  }, [newProjectPath, setNewProjectName, setNewProjectPath]);

  /**
   * Handle onboarding dialog - generate spec
   */
  const handleOnboardingGenerateSpec = useCallback(() => {
    setShowOnboardingDialog(false);
    // Navigate to the setup dialog flow
    setSetupProjectPath(newProjectPath);
    setProjectOverview('');
    setShowSetupDialog(true);
  }, [newProjectPath, setShowOnboardingDialog]);

  /**
   * Handle onboarding dialog - skip
   */
  const handleOnboardingSkip = useCallback(() => {
    setShowOnboardingDialog(false);
    setNewProjectName('');
    setNewProjectPath('');
    toast.info('You can generate your app_spec.txt anytime from the Spec view', {
      description: 'Your project is ready to use!',
    });
  }, [setShowOnboardingDialog, setNewProjectName, setNewProjectPath]);

  return {
    // State
    showSetupDialog,
    setShowSetupDialog,
    setupProjectPath,
    setSetupProjectPath,
    projectOverview,
    setProjectOverview,
    generateFeatures,
    setGenerateFeatures,
    analyzeProject,
    setAnalyzeProject,
    featureCount,
    setFeatureCount,

    // Handlers
    handleCreateInitialSpec,
    handleSkipSetup,
    handleOnboardingGenerateSpec,
    handleOnboardingSkip,
  };
}
