import { create } from 'zustand';
import type { Project, TrashedProject } from '@/lib/electron';

/**
 * Project Store - Manages project list, current project, and project history
 * Separated from main AppStore to prevent unnecessary re-renders of other components
 * when project state changes.
 */

export interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  trashedProjects: TrashedProject[];
  projectHistory: string[]; // Array of project IDs in MRU order
  projectHistoryIndex: number; // Current position in history (-1 when on current project)
  lastProjectDir: string;
  recentFolders: string[];
}

export interface ProjectActions {
  // Project CRUD
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;

  // Current project management
  setCurrentProject: (project: Project | null) => void;
  upsertAndSetCurrentProject: (path: string, name: string, theme?: string) => void;

  // Project history
  cycleNextProject: () => void;
  cyclePrevProject: () => void;
  clearProjectHistory: () => void;

  // Project trash
  moveProjectToTrash: (projectId: string) => void;
  restoreTrashedProject: (projectId: string) => void;
  deleteTrashedProject: (projectId: string) => void;
  emptyTrash: () => void;

  // Project reordering
  reorderProjects: (oldIndex: number, newIndex: number) => void;

  // Directory tracking
  setLastProjectDir: (dir: string) => void;
  setRecentFolders: (folders: string[]) => void;
}

export type ProjectStore = ProjectState & ProjectActions;

const initialState: ProjectState = {
  projects: [],
  currentProject: null,
  trashedProjects: [],
  projectHistory: [],
  projectHistoryIndex: -1,
  lastProjectDir: '',
  recentFolders: [],
};

export const useProjectStore = create<ProjectStore>()((set, get) => ({
  ...initialState,

  setProjects: (projects) => set({ projects }),

  addProject: (project) => {
    const projects = get().projects;
    const existing = projects.findIndex((p) => p.path === project.path);
    if (existing >= 0) {
      const updated = [...projects];
      updated[existing] = {
        ...project,
        lastOpened: new Date().toISOString(),
      };
      set({ projects: updated });
    } else {
      set({
        projects: [...projects, { ...project, lastOpened: new Date().toISOString() }],
      });
    }
  },

  removeProject: (projectId) => {
    set({ projects: get().projects.filter((p) => p.id !== projectId) });
  },

  moveProjectToTrash: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;

    const remainingProjects = get().projects.filter((p) => p.id !== projectId);
    const existingTrash = get().trashedProjects.filter((p) => p.id !== projectId);
    const trashedProject: TrashedProject = {
      ...project,
      trashedAt: new Date().toISOString(),
      deletedFromDisk: false,
    };

    const isCurrent = get().currentProject?.id === projectId;
    const nextCurrentProject = isCurrent ? null : get().currentProject;

    set({
      projects: remainingProjects,
      trashedProjects: [trashedProject, ...existingTrash],
      currentProject: nextCurrentProject,
    });
  },

  restoreTrashedProject: (projectId) => {
    const trashed = get().trashedProjects.find((p) => p.id === projectId);
    if (!trashed) return;

    const remainingTrash = get().trashedProjects.filter((p) => p.id !== projectId);
    const existingProjects = get().projects;
    const samePathProject = existingProjects.find((p) => p.path === trashed.path);
    const projectsWithoutId = existingProjects.filter((p) => p.id !== projectId);

    // If a project with the same path already exists, keep it and just remove from trash
    if (samePathProject) {
      set({
        trashedProjects: remainingTrash,
        currentProject: samePathProject,
      });
      return;
    }

    const restoredProject: Project = {
      id: trashed.id,
      name: trashed.name,
      path: trashed.path,
      lastOpened: new Date().toISOString(),
      theme: trashed.theme,
    };

    set({
      trashedProjects: remainingTrash,
      projects: [...projectsWithoutId, restoredProject],
      currentProject: restoredProject,
    });
  },

  deleteTrashedProject: (projectId) => {
    set({
      trashedProjects: get().trashedProjects.filter((p) => p.id !== projectId),
    });
  },

  emptyTrash: () => set({ trashedProjects: [] }),

  reorderProjects: (oldIndex, newIndex) => {
    const projects = [...get().projects];
    const [movedProject] = projects.splice(oldIndex, 1);
    projects.splice(newIndex, 0, movedProject);
    set({ projects });
  },

  setCurrentProject: (project) => {
    set({ currentProject: project });
    if (project) {
      // Add to project history (MRU order)
      const currentHistory = get().projectHistory;
      // Remove this project if it's already in history
      const filteredHistory = currentHistory.filter((id) => id !== project.id);
      // Add to the front (most recent)
      const newHistory = [project.id, ...filteredHistory];
      // Reset history index to 0 (current project)
      set({ projectHistory: newHistory, projectHistoryIndex: 0 });
    } else {
      set({ projectHistory: [], projectHistoryIndex: -1 });
    }
  },

  upsertAndSetCurrentProject: (path, name, theme) => {
    const { projects, trashedProjects, currentProject } = get();
    const existingProject = projects.find((p) => p.path === path);
    let project: Project;

    if (existingProject) {
      // Update existing project, preserving theme and other properties
      project = {
        ...existingProject,
        name,
        lastOpened: new Date().toISOString(),
      };
      const updatedProjects = projects.map((p) => (p.id === existingProject.id ? project : p));
      set({ projects: updatedProjects });
    } else {
      // Create new project - check for trashed project with same path first
      const trashedProject = trashedProjects.find((p) => p.path === path);
      const effectiveTheme = theme || trashedProject?.theme || currentProject?.theme;
      project = {
        id: `project-${Date.now()}`,
        name,
        path,
        lastOpened: new Date().toISOString(),
        ...(effectiveTheme && { theme: effectiveTheme }),
      };
      set({ projects: [...projects, project] });
    }

    get().setCurrentProject(project);
  },

  cycleNextProject: () => {
    const { projects, projectHistory, projectHistoryIndex } = get();
    if (projects.length === 0 || projectHistory.length === 0) return;

    let nextIndex = projectHistoryIndex + 1;
    if (nextIndex >= projectHistory.length) {
      nextIndex = 0;
    }

    const projectId = projectHistory[nextIndex];
    const project = projects.find((p) => p.id === projectId);

    if (project) {
      set({ currentProject: project, projectHistoryIndex: nextIndex });
    }
  },

  cyclePrevProject: () => {
    const { projects, projectHistory, projectHistoryIndex } = get();
    if (projects.length === 0 || projectHistory.length === 0) return;

    let nextIndex = projectHistoryIndex - 1;
    if (nextIndex < 0) {
      nextIndex = projectHistory.length - 1;
    }

    const projectId = projectHistory[nextIndex];
    const project = projects.find((p) => p.id === projectId);

    if (project) {
      set({ currentProject: project, projectHistoryIndex: nextIndex });
    }
  },

  clearProjectHistory: () => {
    set({ projectHistory: [], projectHistoryIndex: -1 });
  },

  setLastProjectDir: (dir) => set({ lastProjectDir: dir }),

  setRecentFolders: (folders) => set({ recentFolders: folders }),
}));
