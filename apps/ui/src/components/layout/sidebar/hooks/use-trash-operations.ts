import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { getElectronAPI, type TrashedProject } from '@/lib/electron';

interface UseTrashOperationsProps {
  restoreTrashedProject: (projectId: string) => void;
  deleteTrashedProject: (projectId: string) => void;
  emptyTrash: () => void;
}

export function useTrashOperations({
  restoreTrashedProject,
  deleteTrashedProject,
  emptyTrash,
}: UseTrashOperationsProps) {
  const [activeTrashId, setActiveTrashId] = useState<string | null>(null);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);

  const handleRestoreProject = useCallback(
    (projectId: string) => {
      try {
        restoreTrashedProject(projectId);
        toast.success('Project restored', {
          description: 'Added back to your project list.',
        });
      } catch (error) {
        console.error('[Sidebar] Failed to restore project:', error);
        toast.error('Failed to restore project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [restoreTrashedProject]
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
        console.error('[Sidebar] Failed to delete project from disk:', error);
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
      console.error('[Sidebar] Failed to empty trash:', error);
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
