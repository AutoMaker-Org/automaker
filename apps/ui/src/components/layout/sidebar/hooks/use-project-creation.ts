import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI } from '@/lib/electron';

const logger = createLogger('ProjectCreation');
import { initializeProject } from '@/lib/project-init';
import { toast } from 'sonner';
import type { StarterTemplate } from '@/lib/templates';
import type { ThemeMode } from '@/store/app-store';
import type { TrashedProject, Project } from '@/lib/electron';

interface UseProjectCreationProps {
  trashedProjects: TrashedProject[];
  currentProject: Project | null;
  globalTheme: ThemeMode;
  upsertAndSetCurrentProject: (path: string, name: string, theme: ThemeMode) => Project;
}

export function useProjectCreation({
  trashedProjects,
  currentProject,
  globalTheme,
  upsertAndSetCurrentProject,
}: UseProjectCreationProps) {
  // Modal state
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Onboarding state
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');

  /**
   * Common logic for all project creation flows
   */
  const finalizeProjectCreation = useCallback(
    async (projectPath: string, projectName: string) => {
      try {
        // Initialize .automaker directory structure
        await initializeProject(projectPath);

        // Write initial app_spec.txt with proper XML structure
        // Note: Must follow XML format as defined in apps/server/src/lib/app-spec-format.ts
        const api = getElectronAPI();
        await api.writeFile(
          `${projectPath}/.automaker/app_spec.txt`,
          `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    Describe your project here. This file will be analyzed by an AI agent
    to understand your project structure and tech stack.
  </overview>

  <technology_stack>
    <!-- The AI agent will fill this in after analyzing your project -->
  </technology_stack>

  <core_capabilities>
    <!-- List core features and capabilities -->
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
        );

        // Determine theme: try trashed project theme, then current project theme, then global
        const trashedProject = trashedProjects.find((p) => p.path === projectPath);
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;

        upsertAndSetCurrentProject(projectPath, projectName, effectiveTheme);

        setShowNewProjectModal(false);

        // Show onboarding dialog for new project
        setNewProjectName(projectName);
        setNewProjectPath(projectPath);
        setShowOnboardingDialog(true);

        toast.success('Project created successfully');
      } catch (error) {
        logger.error('Failed to finalize project:', error);
        toast.error('Failed to initialize project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject]
  );

  /**
   * Create a blank project with .automaker structure
   */
  const handleCreateBlankProject = useCallback(
    async (projectName: string, parentDir: string) => {
      setIsCreatingProject(true);
      try {
        const api = getElectronAPI();
        const projectPath = `${parentDir}/${projectName}`;

        // Create project directory
        await api.mkdir(projectPath);

        // Finalize project setup
        await finalizeProjectCreation(projectPath, projectName);
      } catch (error) {
        logger.error('Failed to create blank project:', error);
        toast.error('Failed to create project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsCreatingProject(false);
      }
    },
    [finalizeProjectCreation]
  );

  /**
   * Create project from a starter template
   */
  const handleCreateFromTemplate = useCallback(
    async (template: StarterTemplate, projectName: string, parentDir: string) => {
      setIsCreatingProject(true);
      try {
        const api = getElectronAPI();

        // Clone template repository
        const cloneResult = await api.templates.clone(template.repoUrl, projectName, parentDir);
        if (!cloneResult.success) {
          throw new Error(cloneResult.error || 'Failed to clone template');
        }
        const projectPath = cloneResult.projectPath!;

        // Initialize .automaker directory structure
        await initializeProject(projectPath);

        // Write app_spec.txt with template-specific info
        await api.writeFile(
          `${projectPath}/.automaker/app_spec.txt`,
          `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    This project was created from the "${template.name}" starter template.
    ${template.description}
  </overview>

  <technology_stack>
    ${template.techStack.map((tech) => `<technology>${tech}</technology>`).join('\n    ')}
  </technology_stack>

  <core_capabilities>
    ${template.features.map((feature) => `<capability>${feature}</capability>`).join('\n    ')}
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
        );

        // Determine theme
        const trashedProject = trashedProjects.find((p) => p.path === projectPath);
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;

        upsertAndSetCurrentProject(projectPath, projectName, effectiveTheme);
        setShowNewProjectModal(false);
        setNewProjectName(projectName);
        setNewProjectPath(projectPath);
        setShowOnboardingDialog(true);

        toast.success('Project created from template', {
          description: `Created ${projectName} from ${template.name}`,
        });
      } catch (error) {
        logger.error('Failed to create from template:', error);
        toast.error('Failed to create project from template', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsCreatingProject(false);
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject]
  );

  /**
   * Create project from a custom GitHub URL
   */
  const handleCreateFromCustomUrl = useCallback(
    async (repoUrl: string, projectName: string, parentDir: string) => {
      setIsCreatingProject(true);
      try {
        const api = getElectronAPI();

        // Clone custom repository
        const cloneResult = await api.templates.clone(repoUrl, projectName, parentDir);
        if (!cloneResult.success) {
          throw new Error(cloneResult.error || 'Failed to clone repository');
        }
        const projectPath = cloneResult.projectPath!;

        // Initialize .automaker directory structure
        await initializeProject(projectPath);

        // Write app_spec.txt with custom URL info
        await api.writeFile(
          `${projectPath}/.automaker/app_spec.txt`,
          `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    This project was cloned from ${repoUrl}.
    The AI agent will analyze the project structure.
  </overview>

  <technology_stack>
    <!-- The AI agent will fill this in after analyzing your project -->
  </technology_stack>

  <core_capabilities>
    <!-- List core features and capabilities -->
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
        );

        // Determine theme
        const trashedProject = trashedProjects.find((p) => p.path === projectPath);
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;

        upsertAndSetCurrentProject(projectPath, projectName, effectiveTheme);
        setShowNewProjectModal(false);
        setNewProjectName(projectName);
        setNewProjectPath(projectPath);
        setShowOnboardingDialog(true);

        toast.success('Project created from repository', {
          description: `Created ${projectName} from ${repoUrl}`,
        });
      } catch (error) {
        logger.error('Failed to create from custom URL:', error);
        toast.error('Failed to create project from URL', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsCreatingProject(false);
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject]
  );

  return {
    // Modal state
    showNewProjectModal,
    setShowNewProjectModal,
    isCreatingProject,

    // Onboarding state
    showOnboardingDialog,
    setShowOnboardingDialog,
    newProjectName,
    setNewProjectName,
    newProjectPath,
    setNewProjectPath,

    // Handlers
    handleCreateBlankProject,
    handleCreateFromTemplate,
    handleCreateFromCustomUrl,
  };
}
