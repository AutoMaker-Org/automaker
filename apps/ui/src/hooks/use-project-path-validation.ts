import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { Project } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { validateProjectPath } from '@/lib/validate-project-path';

interface UseProjectPathValidationOptions {
  /**
   * Whether to navigate to /board after successful path refresh.
   * Defaults to true.
   */
  navigateOnRefresh?: boolean;
}

export function useProjectPathValidation(options: UseProjectPathValidationOptions = {}) {
  const { navigateOnRefresh = true } = options;
  const navigate = useNavigate();
  const { projects, setProjects, setCurrentProject, removeProject } = useAppStore();

  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [invalidProject, setInvalidProject] = useState<Project | null>(null);

  const showValidationDialog = useCallback((project: Project) => {
    setInvalidProject(project);
    setValidationDialogOpen(true);
  }, []);

  const handleRefreshPath = useCallback(
    async (project: Project, newPath: string) => {
      try {
        // Validate new path
        const isValid = await validateProjectPath({ ...project, path: newPath });

        if (!isValid) {
          toast.error('Invalid path', {
            description: 'Selected path does not exist or is not accessible',
          });
          return; // Stay on dialog
        }

        // Update project in store
        const updatedProjects = projects.map((p) =>
          p.id === project.id ? { ...p, path: newPath, lastOpened: new Date().toISOString() } : p
        );
        setProjects(updatedProjects);

        // Update current project reference
        setCurrentProject({ ...project, path: newPath });

        // Close dialog
        setValidationDialogOpen(false);

        // Navigate to board if requested
        if (navigateOnRefresh) {
          navigate({ to: '/board' });
        }

        toast.success('Project path updated');
      } catch (error) {
        console.error('Failed to update project path:', error);
        toast.error('Failed to update path', {
          description: 'An unexpected error occurred. Please try again.',
        });
      }
    },
    [projects, setProjects, setCurrentProject, navigate, navigateOnRefresh]
  );

  const handleRemoveProject = useCallback(
    (project: Project) => {
      removeProject(project.id);
      setCurrentProject(null);
      setValidationDialogOpen(false);
      navigate({ to: '/' });
      toast.info('Project removed', { description: project.name });
    },
    [removeProject, setCurrentProject, navigate]
  );

  const handleDismiss = useCallback(() => {
    setCurrentProject(null);
    setValidationDialogOpen(false);
  }, [setCurrentProject]);

  return {
    validationDialogOpen,
    setValidationDialogOpen,
    invalidProject,
    showValidationDialog,
    handleRefreshPath,
    handleRemoveProject,
    handleDismiss,
  };
}
