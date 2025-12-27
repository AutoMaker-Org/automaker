import { useState } from 'react';
import { useTrashOperations } from './use-trash-operations';
import type { TrashedProject } from '@/lib/electron';

interface UseTrashDialogProps {
  restoreTrashedProject: (projectId: string) => void;
  deleteTrashedProject: (projectId: string) => void;
  emptyTrash: () => void;
  trashedProjects: TrashedProject[];
}

/**
 * Hook that combines trash operations with dialog state management
 */
export function useTrashDialog({
  restoreTrashedProject,
  deleteTrashedProject,
  emptyTrash,
  trashedProjects,
}: UseTrashDialogProps) {
  // Dialog state
  const [showTrashDialog, setShowTrashDialog] = useState(false);

  // Reuse existing trash operations logic
  const trashOperations = useTrashOperations({
    restoreTrashedProject,
    deleteTrashedProject,
    emptyTrash,
    trashedProjects,
  });

  return {
    // Dialog state
    showTrashDialog,
    setShowTrashDialog,

    // Trash operations (spread from existing hook)
    ...trashOperations,
  };
}
