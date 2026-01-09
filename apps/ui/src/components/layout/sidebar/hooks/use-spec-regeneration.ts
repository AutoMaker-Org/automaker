import { useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { toast } from 'sonner';

const logger = createLogger('SpecRegeneration');
import { getElectronAPI } from '@/lib/electron';
import type { SpecRegenerationEvent } from '@/types/electron';

interface UseSpecRegenerationProps {
  creatingSpecProjectPath: string | null;
  setupProjectPath: string;
  setSpecCreatingForProject: (path: string | null) => void;
  setShowSetupDialog: (show: boolean) => void;
  setProjectOverview: (overview: string) => void;
  setSetupProjectPath: (path: string) => void;
  setNewProjectName: (name: string) => void;
  setNewProjectPath: (path: string) => void;
}

export function useSpecRegeneration({
  creatingSpecProjectPath,
  setupProjectPath,
  setSpecCreatingForProject,
  setShowSetupDialog,
  setProjectOverview,
  setSetupProjectPath,
  setNewProjectName,
  setNewProjectPath,
}: UseSpecRegenerationProps) {
  // Subscribe to spec regeneration events
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.specRegeneration) return;

    const unsubscribe = api.specRegeneration.onEvent((event: SpecRegenerationEvent) => {
      logger.debug('Spec regeneration event:', event.type, 'for project:', event.projectPath);

      // Only handle events for the project we're currently setting up
      if (event.projectPath !== creatingSpecProjectPath && event.projectPath !== setupProjectPath) {
        logger.debug('Ignoring event - not for project being set up');
        return;
      }

      if (event.type === 'spec_regeneration_complete') {
        // Only show toast if we're in active creation flow (not regular regeneration)
        const isCreationFlow = creatingSpecProjectPath !== null;

        setSpecCreatingForProject(null);
        setShowSetupDialog(false);
        setProjectOverview('');
        setSetupProjectPath('');
        // Clear onboarding state if we came from onboarding
        setNewProjectName('');
        setNewProjectPath('');

        if (isCreationFlow) {
          toast.success('App specification created', {
            description: 'Your project is now set up and ready to go!',
          });
        }
      } else if (event.type === 'spec_regeneration_error') {
        setSpecCreatingForProject(null);
        toast.error('Failed to create specification', {
          description: event.error,
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [
    creatingSpecProjectPath,
    setupProjectPath,
    setSpecCreatingForProject,
    setShowSetupDialog,
    setProjectOverview,
    setSetupProjectPath,
    setNewProjectName,
    setNewProjectPath,
  ]);
}
