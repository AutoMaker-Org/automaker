import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { toast } from 'sonner';

const logger = createLogger('TrashOperations');
import { getElectronAPI, type TrashedProject } from '@/lib/electron';
import { validateProjectPath } from '@/lib/validate-project-path';

interface UseTrashOperationsProps {
  restoreTrashedProject: (projectId: string) => void;
  deleteTrashedProject: (projectId: string) => void;
  emptyTrash: () => void;
  trashedProjects: TrashedProject[];
}

export function useTrashOperations({
  restoreTrashedProject,
  deleteTrashedProject,
  emptyTrash,
  trashedProjects,
}: UseTrashOperationsProps) {
  const [activeTrashId, setActiveTrashId] = useState<string | null>(null);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);

  const handleRestoreProject = useCallback(
    async (projectId: string) => {
      try {
        const project = trashedProjects.find((p) => p.id === projectId);
        if (!project) {
          toast.error('Project not found');
          return;
        }

        // Validate project path before restoring
        const isValid = await validateProjectPath(project);
        if (!isValid) {
          toast.error('Project path not found', {
            description:
              'The project directory no longer exists. Remove it from the recycle bin and re-add the project from its new location.',
          });
          return;
        }

        restoreTrashedProject(projectId);
        toast.success('Project restored', {
          description: 'Added back to your project list.',
        });
      } catch (error) {
        logger.error('Failed to restore project:', error);
        toast.error('Failed to restore project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [restoreTrashedProject, trashedProjects]
  );

  const handleDeleteProjectFromDisk = useCallback(
    async (trashedProject: TrashedProject) => {
      setActiveTrashId(trashedProject.id);
      try {
        const api = getElectronAPI();
        if (!api.trashItem) {
          throw new Error('System Trash is not available in this build.');
        }

        const result = await api.trashItem(trashedProject.path);
        if (!result.success) {
          throw new Error(result.error || 'Failed to delete project folder');
        }

        deleteTrashedProject(trashedProject.id);
        toast.success('Project folder sent to system Trash', {
          description: trashedProject.path,
        });
      } catch (error) {
        logger.error('Failed to delete project from disk:', error);
        toast.error('Failed to delete project folder', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setActiveTrashId(null);
      }
    },
    [deleteTrashedProject]
  );

  const handleEmptyTrash = useCallback(() => {
    setIsEmptyingTrash(true);
    try {
      emptyTrash();
      toast.success('Recycle bin cleared');
    } catch (error) {
      logger.error('Failed to empty trash:', error);
      toast.error('Failed to clear recycle bin', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsEmptyingTrash(false);
    }
  }, [emptyTrash]);

  return {
    activeTrashId,
    isEmptyingTrash,
    handleRestoreProject,
    handleDeleteProjectFromDisk,
    handleEmptyTrash,
  };
}
