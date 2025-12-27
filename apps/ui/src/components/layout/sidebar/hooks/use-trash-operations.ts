import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { getElectronAPI, type TrashedProject } from '@/lib/electron';

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
    (projectId: string) => {
      restoreTrashedProject(projectId);
      toast.success('Project restored', {
        description: 'Added back to your project list.',
      });
    },
    [restoreTrashedProject]
  );

  const handleDeleteProjectFromDisk = useCallback(
    async (trashedProject: TrashedProject) => {
      const confirmed = window.confirm(
        `Delete "${trashedProject.name}" from disk?\nThis sends the folder to your system Trash.`
      );
      if (!confirmed) return;

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
    if (trashedProjects.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      'Clear all projects from recycle bin? This does not delete folders from disk.'
    );
    if (!confirmed) return;

    setIsEmptyingTrash(true);
    try {
      emptyTrash();
      toast.success('Recycle bin cleared');
    } finally {
      setIsEmptyingTrash(false);
    }
  }, [emptyTrash, trashedProjects.length]);

  return {
    activeTrashId,
    isEmptyingTrash,
    handleRestoreProject,
    handleDeleteProjectFromDisk,
    handleEmptyTrash,
  };
}
