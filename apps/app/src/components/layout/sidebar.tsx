"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useAppStore, formatShortcut, type ThemeMode } from "@/store/app-store";
import { CoursePromoBadge } from "@/components/ui/course-promo-badge";
import {
  FolderOpen,
  Plus,
  Settings,
  FileText,
  LayoutGrid,
  Bot,
  Folder,
  X,
  PanelLeft,
  PanelLeftClose,
  ChevronDown,
  Redo2,
  Check,
  BookOpen,
  GripVertical,
  RotateCcw,
  Trash2,
  Undo2,
  UserCircle,
  MoreVertical,
  Palette,
  Monitor,
  Search,
  Bug,
  Activity,
  Recycle,
  Sparkles,
  Loader2,
  Terminal,
  Rocket,
  Zap,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from "@/hooks/use-keyboard-shortcuts";
import {
  getElectronAPI,
  Project,
  TrashedProject,
  RunningAgent,
} from "@/lib/electron";
import {
  initializeProject,
  hasAppSpec,
  hasAutomakerDir,
} from "@/lib/project-init";
import { toast } from "sonner";
import { themeOptions } from "@/config/theme-options";
import type { SpecRegenerationEvent } from "@/types/electron";
import { DeleteProjectDialog } from "@/components/views/settings-view/components/delete-project-dialog";
import { NewProjectModal } from "@/components/new-project-modal";
import {
  ProjectSetupDialog,
  type FeatureCount,
} from "@/components/layout/project-setup-dialog";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getHttpApiClient } from "@/lib/http-api-client";
import type { StarterTemplate } from "@/lib/templates";

interface NavSection {
  label?: string;
  items: NavItem[];
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
  shortcut?: string;
}

// Sortable Project Item Component
interface SortableProjectItemProps {
  project: Project;
  currentProjectId: string | undefined;
  isHighlighted: boolean;
  onSelect: (project: Project) => void;
}

function SortableProjectItem({
  project,
  currentProjectId,
  isHighlighted,
  onSelect,
}: SortableProjectItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200",
        "text-muted-foreground hover:text-foreground hover:bg-accent/80",
        isDragging && "bg-accent shadow-lg scale-[1.02]",
        isHighlighted &&
          "bg-brand-500/10 text-foreground ring-1 ring-brand-500/20"
      )}
      data-testid={`project-option-${project.id}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 rounded-md hover:bg-accent/50 cursor-grab active:cursor-grabbing transition-colors"
        data-testid={`project-drag-handle-${project.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
      </button>

      {/* Project content - clickable area */}
      <div
        className="flex items-center gap-2.5 flex-1 min-w-0"
        onClick={() => onSelect(project)}
      >
        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium">
          {project.name}
        </span>
        {currentProjectId === project.id && (
          <Check className="h-4 w-4 text-brand-500 shrink-0" />
        )}
      </div>
    </div>
  );
}

// Theme options for project theme selector - derived from the shared config
const PROJECT_THEME_OPTIONS = [
  { value: "", label: "Use Global", icon: Monitor },
  ...themeOptions.map((opt) => ({
    value: opt.value,
    label: opt.label,
    icon: opt.Icon,
  })),
] as const;

// Reusable Bug Report Button Component
const BugReportButton = ({
  sidebarExpanded,
  onClick
}: {
  sidebarExpanded: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "titlebar-no-drag p-1.5 rounded-lg",
        "text-muted-foreground hover:text-foreground hover:bg-accent/80",
        "transition-all duration-200 ease-out",
        "hover:scale-105 active:scale-95",
        sidebarExpanded && "absolute right-3"
      )}
      title="Report Bug / Feature Request"
      data-testid={sidebarExpanded ? "bug-report-link" : "bug-report-link-collapsed"}
    >
      <Bug className="w-4 h-4" />
    </button>
  );
};

export function Sidebar() {
  const {
    projects,
    trashedProjects,
    currentProject,
    currentView,
    sidebarOpen,
    projectHistory,
    upsertAndSetCurrentProject,
    setCurrentProject,
    setCurrentView,
    toggleSidebar,
    restoreTrashedProject,
    deleteTrashedProject,
    emptyTrash,
    reorderProjects,
    cyclePrevProject,
    cycleNextProject,
    clearProjectHistory,
    setProjectTheme,
    setTheme,
    setPreviewTheme,
    theme: globalTheme,
    moveProjectToTrash,
    specCreatingForProject,
    setSpecCreatingForProject,
  } = useAppStore();

  // Environment variable flags for hiding sidebar items
  // Note: Next.js requires static access to process.env variables (no dynamic keys)
  const hideTerminal = process.env.NEXT_PUBLIC_HIDE_TERMINAL === "true";
  const hideWiki = process.env.NEXT_PUBLIC_HIDE_WIKI === "true";
  const hideRunningAgents =
    process.env.NEXT_PUBLIC_HIDE_RUNNING_AGENTS === "true";
  const hideContext = process.env.NEXT_PUBLIC_HIDE_CONTEXT === "true";
  const hideSpecEditor = process.env.NEXT_PUBLIC_HIDE_SPEC_EDITOR === "true";
  const hideAiProfiles = process.env.NEXT_PUBLIC_HIDE_AI_PROFILES === "true";

  // Get customizable keyboard shortcuts
  const shortcuts = useKeyboardShortcutsConfig();

  // State for project picker dropdown
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);
  const [showTrashDialog, setShowTrashDialog] = useState(false);
  const [activeTrashId, setActiveTrashId] = useState<string | null>(null);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);

  // State for delete project confirmation dialog
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);

  // State for running agents count
  const [runningAgentsCount, setRunningAgentsCount] = useState(0);

  // State for new project modal
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // State for new project onboarding dialog
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");

  // State for new project setup dialog
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [setupProjectPath, setSetupProjectPath] = useState("");
  const [projectOverview, setProjectOverview] = useState("");
  const [generateFeatures, setGenerateFeatures] = useState(true);
  const [featureCount, setFeatureCount] = useState<FeatureCount>(50);
  const [showSpecIndicator, setShowSpecIndicator] = useState(true);

  // Derive isCreatingSpec from store state
  const isCreatingSpec = specCreatingForProject !== null;
  const creatingSpecProjectPath = specCreatingForProject;

  // Ref for project search input
  const projectSearchInputRef = useRef<HTMLInputElement>(null);

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1024px)"); // lg breakpoint

    const handleResize = () => {
      if (mediaQuery.matches && sidebarOpen) {
        // Auto-collapse on small screens
        toggleSidebar();
      }
    };

    // Check on mount
    handleResize();

    // Listen for changes
    mediaQuery.addEventListener("change", handleResize);
    return () => mediaQuery.removeEventListener("change", handleResize);
  }, [sidebarOpen, toggleSidebar]);

  // Filtered projects based on search query
  const filteredProjects = useMemo(() => {
    if (!projectSearchQuery.trim()) {
      return projects;
    }
    const query = projectSearchQuery.toLowerCase();
    return projects.filter((project) =>
      project.name.toLowerCase().includes(query)
    );
  }, [projects, projectSearchQuery]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedProjectIndex(0);
  }, [filteredProjects.length, projectSearchQuery]);

  // Reset search query when dropdown closes
  useEffect(() => {
    if (!isProjectPickerOpen) {
      setProjectSearchQuery("");
      setSelectedProjectIndex(0);
    }
  }, [isProjectPickerOpen]);

  // Focus the search input when dropdown opens
  useEffect(() => {
    if (isProjectPickerOpen) {
      // Small delay to ensure the dropdown is rendered
      setTimeout(() => {
        projectSearchInputRef.current?.focus();
      }, 0);
    }
  }, [isProjectPickerOpen]);

  // Sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Small distance to start drag
      },
    })
  );

  // Handle drag end for reordering projects
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = projects.findIndex((p) => p.id === active.id);
        const newIndex = projects.findIndex((p) => p.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          reorderProjects(oldIndex, newIndex);
        }
      }
    },
    [projects, reorderProjects]
  );

  // Subscribe to spec regeneration events
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.specRegeneration) return;

    const unsubscribe = api.specRegeneration.onEvent(
      (event: SpecRegenerationEvent) => {
        console.log(
          "[Sidebar] Spec regeneration event:",
          event.type,
          "for project:",
          event.projectPath
        );

        // Only handle events for the project we're currently setting up
        if (
          event.projectPath !== creatingSpecProjectPath &&
          event.projectPath !== setupProjectPath
        ) {
          console.log(
            "[Sidebar] Ignoring event - not for project being set up"
          );
          return;
        }

        if (event.type === "spec_regeneration_complete") {
          setSpecCreatingForProject(null);
          setShowSetupDialog(false);
          setProjectOverview("");
          setSetupProjectPath("");
          // Clear onboarding state if we came from onboarding
          setNewProjectName("");
          setNewProjectPath("");
          toast.success("App specification created", {
            description: "Your project is now set up and ready to go!",
          });
        } else if (event.type === "spec_regeneration_error") {
          setSpecCreatingForProject(null);
          toast.error("Failed to create specification", {
            description: event.error,
          });
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [
    setCurrentView,
    creatingSpecProjectPath,
    setupProjectPath,
    setSpecCreatingForProject,
  ]);

  // Fetch running agents count function - used for initial load and event-driven updates
  const fetchRunningAgentsCount = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (api.runningAgents) {
        const result = await api.runningAgents.getAll();
        if (result.success && result.runningAgents) {
          setRunningAgentsCount(result.runningAgents.length);
        }
      }
    } catch (error) {
      console.error("[Sidebar] Error fetching running agents count:", error);
    }
  }, []);

  // Subscribe to auto-mode events to update running agents count in real-time
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.autoMode) {
      // If autoMode is not available, still fetch initial count
      fetchRunningAgentsCount();
      return;
    }

    // Initial fetch on mount
    fetchRunningAgentsCount();

    const unsubscribe = api.autoMode.onEvent((event) => {
      // When a feature starts, completes, or errors, refresh the count
      if (
        event.type === "auto_mode_feature_complete" ||
        event.type === "auto_mode_error" ||
        event.type === "auto_mode_feature_start"
      ) {
        fetchRunningAgentsCount();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchRunningAgentsCount]);

  // Handle creating initial spec for new project
  const handleCreateInitialSpec = useCallback(async () => {
    if (!setupProjectPath || !projectOverview.trim()) return;

    // Set store state immediately so the loader shows up right away
    setSpecCreatingForProject(setupProjectPath);
    setShowSpecIndicator(true);
    setShowSetupDialog(false);

    try {
      const api = getElectronAPI();
      if (!api.specRegeneration) {
        toast.error("Spec regeneration not available");
        setSpecCreatingForProject(null);
        return;
      }
      const result = await api.specRegeneration.create(
        setupProjectPath,
        projectOverview.trim(),
        generateFeatures,
        undefined, // analyzeProject - use default
        generateFeatures ? featureCount : undefined // only pass maxFeatures if generating features
      );

      if (!result.success) {
        console.error("[Sidebar] Failed to start spec creation:", result.error);
        setSpecCreatingForProject(null);
        toast.error("Failed to create specification", {
          description: result.error,
        });
      } else {
        // Show processing toast to inform user
        toast.info("Generating app specification...", {
          description:
            "This may take a minute. You'll be notified when complete.",
        });
      }
      // If successful, we'll wait for the events to update the state
    } catch (error) {
      console.error("[Sidebar] Failed to create spec:", error);
      setSpecCreatingForProject(null);
      toast.error("Failed to create specification", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [
    setupProjectPath,
    projectOverview,
    generateFeatures,
    featureCount,
    setSpecCreatingForProject,
  ]);

  // Handle skipping setup
  const handleSkipSetup = useCallback(() => {
    setShowSetupDialog(false);
    setProjectOverview("");
    setSetupProjectPath("");
    // Clear onboarding state if we came from onboarding
    if (newProjectPath) {
      setNewProjectName("");
      setNewProjectPath("");
    }
    toast.info("Setup skipped", {
      description: "You can set up your app_spec.txt later from the Spec view.",
    });
  }, [newProjectPath]);

  // Handle onboarding dialog - generate spec
  const handleOnboardingGenerateSpec = useCallback(() => {
    setShowOnboardingDialog(false);
    // Navigate to the setup dialog flow
    setSetupProjectPath(newProjectPath);
    setProjectOverview("");
    setShowSetupDialog(true);
  }, [newProjectPath]);

  // Handle onboarding dialog - skip
  const handleOnboardingSkip = useCallback(() => {
    setShowOnboardingDialog(false);
    setNewProjectName("");
    setNewProjectPath("");
    toast.info(
      "You can generate your app_spec.txt anytime from the Spec view",
      {
        description: "Your project is ready to use!",
      }
    );
  }, []);

  /**
   * Create a blank project with just .automaker directory structure
   */
  const handleCreateBlankProject = useCallback(
    async (projectName: string, parentDir: string) => {
      setIsCreatingProject(true);
      try {
        const api = getElectronAPI();
        const projectPath = `${parentDir}/${projectName}`;

        // Create project directory
        const mkdirResult = await api.mkdir(projectPath);
        if (!mkdirResult.success) {
          toast.error("Failed to create project directory", {
            description: mkdirResult.error || "Unknown error occurred",
          });
          return;
        }

        // Initialize .automaker directory with all necessary files
        const initResult = await initializeProject(projectPath);

        if (!initResult.success) {
          toast.error("Failed to initialize project", {
            description: initResult.error || "Unknown error occurred",
          });
          return;
        }

        // Update the app_spec.txt with the project name
        // Note: Must follow XML format as defined in apps/server/src/lib/app-spec-format.ts
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

        const trashedProject = trashedProjects.find(
          (p) => p.path === projectPath
        );
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;
        const project = upsertAndSetCurrentProject(
          projectPath,
          projectName,
          effectiveTheme
        );

        setShowNewProjectModal(false);

        // Show onboarding dialog for new project
        setNewProjectName(projectName);
        setNewProjectPath(projectPath);
        setShowOnboardingDialog(true);

        toast.success("Project created", {
          description: `Created ${projectName} with .automaker directory`,
        });
      } catch (error) {
        console.error("[Sidebar] Failed to create project:", error);
        toast.error("Failed to create project", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsCreatingProject(false);
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject]
  );

  /**
   * Create a project from a GitHub starter template
   */
  const handleCreateFromTemplate = useCallback(
    async (
      template: StarterTemplate,
      projectName: string,
      parentDir: string
    ) => {
      setIsCreatingProject(true);
      try {
        const httpClient = getHttpApiClient();
        const api = getElectronAPI();

        // Clone the template repository
        const cloneResult = await httpClient.templates.clone(
          template.repoUrl,
          projectName,
          parentDir
        );

        if (!cloneResult.success || !cloneResult.projectPath) {
          toast.error("Failed to clone template", {
            description: cloneResult.error || "Unknown error occurred",
          });
          return;
        }

        const projectPath = cloneResult.projectPath;

        // Initialize .automaker directory with all necessary files
        const initResult = await initializeProject(projectPath);

        if (!initResult.success) {
          toast.error("Failed to initialize project", {
            description: initResult.error || "Unknown error occurred",
          });
          return;
        }

        // Update the app_spec.txt with template-specific info
        // Note: Must follow XML format as defined in apps/server/src/lib/app-spec-format.ts
        await api.writeFile(
          `${projectPath}/.automaker/app_spec.txt`,
          `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    This project was created from the "${template.name}" starter template.
    ${template.description}
  </overview>

  <technology_stack>
    ${template.techStack
      .map((tech) => `<technology>${tech}</technology>`)
      .join("\n    ")}
  </technology_stack>

  <core_capabilities>
    ${template.features
      .map((feature) => `<capability>${feature}</capability>`)
      .join("\n    ")}
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
        );

        const trashedProject = trashedProjects.find(
          (p) => p.path === projectPath
        );
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;
        const project = upsertAndSetCurrentProject(
          projectPath,
          projectName,
          effectiveTheme
        );

        setShowNewProjectModal(false);

        // Show onboarding dialog for new project
        setNewProjectName(projectName);
        setNewProjectPath(projectPath);
        setShowOnboardingDialog(true);

        toast.success("Project created from template", {
          description: `Created ${projectName} from ${template.name}`,
        });
      } catch (error) {
        console.error(
          "[Sidebar] Failed to create project from template:",
          error
        );
        toast.error("Failed to create project", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsCreatingProject(false);
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject]
  );

  /**
   * Create a project from a custom GitHub URL
   */
  const handleCreateFromCustomUrl = useCallback(
    async (repoUrl: string, projectName: string, parentDir: string) => {
      setIsCreatingProject(true);
      try {
        const httpClient = getHttpApiClient();
        const api = getElectronAPI();

        // Clone the repository
        const cloneResult = await httpClient.templates.clone(
          repoUrl,
          projectName,
          parentDir
        );

        if (!cloneResult.success || !cloneResult.projectPath) {
          toast.error("Failed to clone repository", {
            description: cloneResult.error || "Unknown error occurred",
          });
          return;
        }

        const projectPath = cloneResult.projectPath;

        // Initialize .automaker directory with all necessary files
        const initResult = await initializeProject(projectPath);

        if (!initResult.success) {
          toast.error("Failed to initialize project", {
            description: initResult.error || "Unknown error occurred",
          });
          return;
        }

        // Update the app_spec.txt with basic info
        // Note: Must follow XML format as defined in apps/server/src/lib/app-spec-format.ts
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

        const trashedProject = trashedProjects.find(
          (p) => p.path === projectPath
        );
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;
        const project = upsertAndSetCurrentProject(
          projectPath,
          projectName,
          effectiveTheme
        );

        setShowNewProjectModal(false);

        // Show onboarding dialog for new project
        setNewProjectName(projectName);
        setNewProjectPath(projectPath);
        setShowOnboardingDialog(true);

        toast.success("Project created from repository", {
          description: `Created ${projectName} from ${repoUrl}`,
        });
      } catch (error) {
        console.error("[Sidebar] Failed to create project from URL:", error);
        toast.error("Failed to create project", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsCreatingProject(false);
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject]
  );

  // Handle bug report button click
  const handleBugReportClick = useCallback(() => {
    const api = getElectronAPI();
    api.openExternalLink("https://github.com/AutoMaker-Org/automaker/issues");
  }, []);

  /**
   * Opens the system folder selection dialog and initializes the selected project.
   * Used by both the 'O' keyboard shortcut and the folder icon button.
   */
  const handleOpenFolder = useCallback(async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0];
      // Extract folder name from path (works on both Windows and Mac/Linux)
      const name =
        path.split(/[/\\]/).filter(Boolean).pop() || "Untitled Project";

      try {
        // Check if this is a brand new project (no .automaker directory)
        const hadAutomakerDir = await hasAutomakerDir(path);

        // Initialize the .automaker directory structure
        const initResult = await initializeProject(path);

        if (!initResult.success) {
          toast.error("Failed to initialize project", {
            description: initResult.error || "Unknown error occurred",
          });
          return;
        }

        // Upsert project and set as current (handles both create and update cases)
        // Theme preservation is handled by the store action
        const trashedProject = trashedProjects.find((p) => p.path === path);
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;
        const project = upsertAndSetCurrentProject(path, name, effectiveTheme);

        // Check if app_spec.txt exists
        const specExists = await hasAppSpec(path);

        if (!hadAutomakerDir && !specExists) {
          // This is a brand new project - show setup dialog
          setSetupProjectPath(path);
          setShowSetupDialog(true);
          toast.success("Project opened", {
            description: `Opened ${name}. Let's set up your app specification!`,
          });
        } else if (
          initResult.createdFiles &&
          initResult.createdFiles.length > 0
        ) {
          toast.success(
            initResult.isNewProject ? "Project initialized" : "Project updated",
            {
              description: `Set up ${initResult.createdFiles.length} file(s) in .automaker`,
            }
          );
        } else {
          toast.success("Project opened", {
            description: `Opened ${name}`,
          });
        }
      } catch (error) {
        console.error("[Sidebar] Failed to open project:", error);
        toast.error("Failed to open project", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }, [
    trashedProjects,
    upsertAndSetCurrentProject,
    currentProject,
    globalTheme,
  ]);

  const handleRestoreProject = useCallback(
    (projectId: string) => {
      restoreTrashedProject(projectId);
      toast.success("Project restored", {
        description: "Added back to your project list.",
      });
      setShowTrashDialog(false);
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
          throw new Error("System Trash is not available in this build.");
        }

        const result = await api.trashItem(trashedProject.path);
        if (!result.success) {
          throw new Error(result.error || "Failed to delete project folder");
        }

        deleteTrashedProject(trashedProject.id);
        toast.success("Project folder sent to system Trash", {
          description: trashedProject.path,
        });
      } catch (error) {
        console.error("[Sidebar] Failed to delete project from disk:", error);
        toast.error("Failed to delete project folder", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setActiveTrashId(null);
      }
    },
    [deleteTrashedProject]
  );

  const handleEmptyTrash = useCallback(() => {
    if (trashedProjects.length === 0) {
      setShowTrashDialog(false);
      return;
    }

    const confirmed = window.confirm(
      "Clear all projects from recycle bin? This does not delete folders from disk."
    );
    if (!confirmed) return;

    setIsEmptyingTrash(true);
    try {
      emptyTrash();
      toast.success("Recycle bin cleared");
      setShowTrashDialog(false);
    } finally {
      setIsEmptyingTrash(false);
    }
  }, [emptyTrash, trashedProjects.length]);

  const navSections: NavSection[] = useMemo(() => {
    const allToolsItems: NavItem[] = [
      {
        id: "spec",
        label: "Spec Editor",
        icon: FileText,
        shortcut: shortcuts.spec,
      },
      {
        id: "context",
        label: "Context",
        icon: BookOpen,
        shortcut: shortcuts.context,
      },
      {
        id: "profiles",
        label: "AI Profiles",
        icon: UserCircle,
        shortcut: shortcuts.profiles,
      },
      {
        id: "terminal",
        label: "Terminal",
        icon: Terminal,
        shortcut: shortcuts.terminal,
      },
    ];

    // Filter out hidden items
    const visibleToolsItems = allToolsItems.filter((item) => {
      if (item.id === "spec" && hideSpecEditor) {
        return false;
      }
      if (item.id === "context" && hideContext) {
        return false;
      }
      if (item.id === "profiles" && hideAiProfiles) {
        return false;
      }
      if (item.id === "terminal" && hideTerminal) {
        return false;
      }
      return true;
    });

    return [
      {
        label: "Project",
        items: [
          {
            id: "board",
            label: "Kanban Board",
            icon: LayoutGrid,
            shortcut: shortcuts.board,
          },
          {
            id: "agent",
            label: "Agent Runner",
            icon: Bot,
            shortcut: shortcuts.agent,
          },
        ],
      },
      {
        label: "Tools",
        items: visibleToolsItems,
      },
    ];
  }, [shortcuts, hideSpecEditor, hideContext, hideTerminal, hideAiProfiles]);

  // Handle selecting the currently highlighted project
  const selectHighlightedProject = useCallback(() => {
    if (
      filteredProjects.length > 0 &&
      selectedProjectIndex < filteredProjects.length
    ) {
      setCurrentProject(filteredProjects[selectedProjectIndex]);
      setIsProjectPickerOpen(false);
    }
  }, [filteredProjects, selectedProjectIndex, setCurrentProject]);

  // Handle keyboard events when project picker is open
  useEffect(() => {
    if (!isProjectPickerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProjectPickerOpen(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        selectHighlightedProject();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedProjectIndex((prev) =>
          prev < filteredProjects.length - 1 ? prev + 1 : prev
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedProjectIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (
        event.key.toLowerCase() === "p" &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        // Toggle off when P is pressed (not with modifiers) while dropdown is open
        // Only if not typing in the search input
        if (document.activeElement !== projectSearchInputRef.current) {
          event.preventDefault();
          setIsProjectPickerOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProjectPickerOpen, selectHighlightedProject, filteredProjects.length]);

  // Build keyboard shortcuts for navigation
  const navigationShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // Sidebar toggle shortcut - always available
    shortcutsList.push({
      key: shortcuts.toggleSidebar,
      action: () => toggleSidebar(),
      description: "Toggle sidebar",
    });

    // Open project shortcut - opens the folder selection dialog directly
    shortcutsList.push({
      key: shortcuts.openProject,
      action: () => handleOpenFolder(),
      description: "Open folder selection dialog",
    });

    // Project picker shortcut - only when we have projects
    if (projects.length > 0) {
      shortcutsList.push({
        key: shortcuts.projectPicker,
        action: () => setIsProjectPickerOpen((prev) => !prev),
        description: "Toggle project picker",
      });
    }

    // Project cycling shortcuts - only when we have project history
    if (projectHistory.length > 1) {
      shortcutsList.push({
        key: shortcuts.cyclePrevProject,
        action: () => cyclePrevProject(),
        description: "Cycle to previous project (MRU)",
      });
      shortcutsList.push({
        key: shortcuts.cycleNextProject,
        action: () => cycleNextProject(),
        description: "Cycle to next project (LRU)",
      });
    }

    // Only enable nav shortcuts if there's a current project
    if (currentProject) {
      navSections.forEach((section) => {
        section.items.forEach((item) => {
          if (item.shortcut) {
            shortcutsList.push({
              key: item.shortcut,
              action: () => setCurrentView(item.id as any),
              description: `Navigate to ${item.label}`,
            });
          }
        });
      });

      // Add settings shortcut
      shortcutsList.push({
        key: shortcuts.settings,
        action: () => setCurrentView("settings"),
        description: "Navigate to Settings",
      });
    }

    return shortcutsList;
  }, [
    shortcuts,
    currentProject,
    setCurrentView,
    toggleSidebar,
    projects.length,
    handleOpenFolder,
    projectHistory.length,
    cyclePrevProject,
    cycleNextProject,
    navSections,
  ]);

  // Register keyboard shortcuts
  useKeyboardShortcuts(navigationShortcuts);

  const isActiveRoute = (id: string) => {
    return currentView === id;
  };

  return (
    <aside
      className={cn(
        "flex-shrink-0 flex flex-col z-30 relative",
        // Glass morphism background with gradient
        "bg-gradient-to-b from-sidebar/95 via-sidebar/85 to-sidebar/90 backdrop-blur-2xl",
        // Premium border with subtle glow
        "border-r border-border/60 shadow-[1px_0_20px_-5px_rgba(0,0,0,0.1)]",
        // Smooth width transition
        "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        sidebarOpen ? "w-16 lg:w-72" : "w-16"
      )}
      data-testid="sidebar"
    >
      {/* Floating Collapse Toggle Button - Desktop only - At border intersection */}
      <button
        onClick={toggleSidebar}
        className={cn(
          "hidden lg:flex absolute top-[68px] -right-3 z-9999",
          "group/toggle items-center justify-center w-7 h-7 rounded-full",
          // Glass morphism button
          "bg-card/95 backdrop-blur-sm border border-border/80",
          // Premium shadow with glow on hover
          "shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-brand-500/10",
          "text-muted-foreground hover:text-brand-500 hover:bg-accent/80",
          "hover:border-brand-500/30",
          "transition-all duration-200 ease-out titlebar-no-drag",
          "hover:scale-110 active:scale-90"
        )}
        data-testid="sidebar-collapse-button"
      >
        {sidebarOpen ? (
          <PanelLeftClose className="w-3.5 h-3.5 pointer-events-none transition-transform duration-200" />
        ) : (
          <PanelLeft className="w-3.5 h-3.5 pointer-events-none transition-transform duration-200" />
        )}
        {/* Tooltip */}
        <div
          className={cn(
            "absolute left-full ml-3 px-2.5 py-1.5 rounded-lg",
            "bg-popover text-popover-foreground text-xs font-medium",
            "border border-border shadow-lg",
            "opacity-0 group-hover/toggle:opacity-100 transition-all duration-200",
            "whitespace-nowrap z-50 pointer-events-none",
            "translate-x-1 group-hover/toggle:translate-x-0"
          )}
          data-testid="sidebar-toggle-tooltip"
        >
          {sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}{" "}
          <span
            className="ml-1.5 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground"
            data-testid="sidebar-toggle-shortcut"
          >
            {formatShortcut(shortcuts.toggleSidebar, true)}
          </span>
        </div>
      </button>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Logo */}
        <div
          className={cn(
            "h-20 shrink-0 titlebar-drag-region",
            // Subtle bottom border with gradient fade
            "border-b border-border/40",
            // Background gradient for depth
            "bg-gradient-to-b from-transparent to-background/5",
            "flex items-center",
            sidebarOpen ? "px-3 lg:px-5 justify-start" : "px-3 justify-center"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-3 titlebar-no-drag cursor-pointer group",
              !sidebarOpen && "flex-col gap-1"
            )}
            onClick={() => setCurrentView("welcome")}
            data-testid="logo-button"
          >
            {!sidebarOpen ? (
              <div className="relative flex items-center justify-center rounded-lg">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 256 256"
                  role="img"
                  aria-label="Automaker Logo"
                  className="size-8 group-hover:rotate-12 transition-transform duration-300 ease-out"
                >
                  <defs>
                    <linearGradient
                      id="bg-collapsed"
                      x1="0"
                      y1="0"
                      x2="256"
                      y2="256"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop
                        offset="0%"
                        style={{ stopColor: "var(--brand-400)" }}
                      />
                      <stop
                        offset="100%"
                        style={{ stopColor: "var(--brand-600)" }}
                      />
                    </linearGradient>
                    <filter
                      id="iconShadow-collapsed"
                      x="-20%"
                      y="-20%"
                      width="140%"
                      height="140%"
                    >
                      <feDropShadow
                        dx="0"
                        dy="4"
                        stdDeviation="4"
                        floodColor="#000000"
                        floodOpacity="0.25"
                      />
                    </filter>
                  </defs>
                  <rect
                    x="16"
                    y="16"
                    width="224"
                    height="224"
                    rx="56"
                    fill="url(#bg-collapsed)"
                  />
                  <g
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="20"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#iconShadow-collapsed)"
                  >
                    <path d="M92 92 L52 128 L92 164" />
                    <path d="M144 72 L116 184" />
                    <path d="M164 92 L204 128 L164 164" />
                  </g>
                </svg>
              </div>
            ) : (
              <div className={cn("flex items-center gap-1", "hidden lg:flex")}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 256 256"
                  role="img"
                  aria-label="automaker"
                  className="h-[36.8px] w-[36.8px] group-hover:rotate-12 transition-transform duration-300 ease-out"
                >
                  <defs>
                    <linearGradient
                      id="bg-expanded"
                      x1="0"
                      y1="0"
                      x2="256"
                      y2="256"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop
                        offset="0%"
                        style={{ stopColor: "var(--brand-400)" }}
                      />
                      <stop
                        offset="100%"
                        style={{ stopColor: "var(--brand-600)" }}
                      />
                    </linearGradient>
                    <filter
                      id="iconShadow-expanded"
                      x="-20%"
                      y="-20%"
                      width="140%"
                      height="140%"
                    >
                      <feDropShadow
                        dx="0"
                        dy="4"
                        stdDeviation="4"
                        floodColor="#000000"
                        floodOpacity="0.25"
                      />
                    </filter>
                  </defs>
                  <rect
                    x="16"
                    y="16"
                    width="224"
                    height="224"
                    rx="56"
                    fill="url(#bg-expanded)"
                  />
                  <g
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="20"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#iconShadow-expanded)"
                  >
                    <path d="M92 92 L52 128 L92 164" />
                    <path d="M144 72 L116 184" />
                    <path d="M164 92 L204 128 L164 164" />
                  </g>
                </svg>
                <span className="font-bold text-foreground text-[1.7rem] tracking-tight leading-none translate-y-[-2px]">
                  automaker<span className="text-brand-500">.</span>
                </span>
              </div>
            )}
          </div>
          {/* Bug Report Button - Inside logo container when expanded */}
          {sidebarOpen && <BugReportButton sidebarExpanded onClick={handleBugReportClick} />}
        </div>

        {/* Bug Report Button - Collapsed sidebar version */}
        {!sidebarOpen && (
          <div className="px-3 mt-1.5 flex justify-center">
            <BugReportButton sidebarExpanded={false} onClick={handleBugReportClick} />
          </div>
        )}

        {/* Project Actions - Moved above project selector */}
        {sidebarOpen && (
          <div className="flex items-center gap-2.5 titlebar-no-drag px-3 mt-4">
            <button
              onClick={() => setShowNewProjectModal(true)}
              className={cn(
                "group flex items-center justify-center flex-1 px-3 py-2.5 rounded-xl",
                "relative overflow-hidden",
                "text-muted-foreground hover:text-foreground",
                // Glass background with gradient on hover
                "bg-accent/20 hover:bg-gradient-to-br hover:from-brand-500/15 hover:to-brand-600/10",
                "border border-border/40 hover:border-brand-500/30",
                // Premium shadow
                "shadow-sm hover:shadow-md hover:shadow-brand-500/5",
                "transition-all duration-200 ease-out",
                "hover:scale-[1.02] active:scale-[0.97]"
              )}
              title="New Project"
              data-testid="new-project-button"
            >
              <Plus className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:rotate-90 group-hover:text-brand-500" />
              <span className="ml-2 text-sm font-medium hidden lg:block whitespace-nowrap">
                New
              </span>
            </button>
            <button
              onClick={handleOpenFolder}
              className={cn(
                "group flex items-center justify-center flex-1 px-3 py-2.5 rounded-xl",
                "relative overflow-hidden",
                "text-muted-foreground hover:text-foreground",
                // Glass background
                "bg-accent/20 hover:bg-accent/40",
                "border border-border/40 hover:border-border/60",
                "shadow-sm hover:shadow-md",
                "transition-all duration-200 ease-out",
                "hover:scale-[1.02] active:scale-[0.97]"
              )}
              title={`Open Folder (${shortcuts.openProject})`}
              data-testid="open-project-button"
            >
              <FolderOpen className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className="hidden lg:flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-mono rounded-md bg-muted/80 text-muted-foreground ml-2">
                {formatShortcut(shortcuts.openProject, true)}
              </span>
            </button>
            <button
              onClick={() => setShowTrashDialog(true)}
              className={cn(
                "group flex items-center justify-center px-3 h-[42px] rounded-xl",
                "relative",
                "text-muted-foreground hover:text-destructive",
                // Subtle background that turns red on hover
                "bg-accent/20 hover:bg-destructive/15",
                "border border-border/40 hover:border-destructive/40",
                "shadow-sm hover:shadow-md hover:shadow-destructive/10",
                "transition-all duration-200 ease-out",
                "hover:scale-[1.02] active:scale-[0.97]"
              )}
              title="Recycle Bin"
              data-testid="trash-button"
            >
              <Recycle className="size-4 shrink-0 transition-transform duration-200 group-hover:rotate-12" />
              {trashedProjects.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 z-10 flex items-center justify-center min-w-4 h-4 px-1 text-[9px] font-bold rounded-full bg-red-500 text-white shadow-md ring-1 ring-red-600/50">
                  {trashedProjects.length > 9 ? "9+" : trashedProjects.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Project Selector with Cycle Buttons */}
        {sidebarOpen && projects.length > 0 && (
          <div className="px-3 mt-3 flex items-center gap-2.5">
            <DropdownMenu
              open={isProjectPickerOpen}
              onOpenChange={setIsProjectPickerOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex-1 flex items-center justify-between px-3.5 py-3 rounded-xl",
                    // Premium glass background
                    "bg-gradient-to-br from-accent/40 to-accent/20",
                    "hover:from-accent/50 hover:to-accent/30",
                    "border border-border/50 hover:border-border/70",
                    // Subtle inner shadow
                    "shadow-sm shadow-black/5",
                    "text-foreground titlebar-no-drag min-w-0",
                    "transition-all duration-200 ease-out",
                    "hover:scale-[1.01] active:scale-[0.99]",
                    isProjectPickerOpen &&
                      "from-brand-500/10 to-brand-600/5 border-brand-500/30 ring-2 ring-brand-500/20 shadow-lg shadow-brand-500/5"
                  )}
                  data-testid="project-selector"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Folder className="h-4 w-4 text-brand-500 shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {currentProject?.name || "Select Project"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="hidden lg:flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-mono rounded-md bg-muted text-muted-foreground"
                      data-testid="project-picker-shortcut"
                    >
                      {formatShortcut(shortcuts.projectPicker, true)}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
                        isProjectPickerOpen && "rotate-180"
                      )}
                    />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-72 bg-popover/95 backdrop-blur-xl border-border shadow-xl p-1.5"
                align="start"
                data-testid="project-picker-dropdown"
              >
                {/* Search input for type-ahead filtering */}
                <div className="px-1 pb-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      ref={projectSearchInputRef}
                      type="text"
                      placeholder="Search projects..."
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      className={cn(
                        "w-full h-9 pl-8 pr-3 text-sm rounded-lg",
                        "border border-border bg-background/50",
                        "text-foreground placeholder:text-muted-foreground",
                        "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50",
                        "transition-all duration-200"
                      )}
                      data-testid="project-search-input"
                    />
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No projects found
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={filteredProjects.map((p) => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-0.5 max-h-64 overflow-y-auto">
                        {filteredProjects.map((project, index) => (
                          <SortableProjectItem
                            key={project.id}
                            project={project}
                            currentProjectId={currentProject?.id}
                            isHighlighted={index === selectedProjectIndex}
                            onSelect={(p) => {
                              setCurrentProject(p);
                              setIsProjectPickerOpen(false);
                            }}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {/* Keyboard hint */}
                <div className="px-2 pt-2 mt-1.5 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground text-center tracking-wide">
                    <span className="text-foreground/60">arrow</span> navigate{" "}
                    <span className="mx-1 text-foreground/30">|</span>{" "}
                    <span className="text-foreground/60">enter</span> select{" "}
                    <span className="mx-1 text-foreground/30">|</span>{" "}
                    <span className="text-foreground/60">esc</span> close
                  </p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Project Options Menu - theme and history */}
            {currentProject && (
              <DropdownMenu
                onOpenChange={(open) => {
                  // Clear preview theme when the menu closes
                  if (!open) {
                    setPreviewTheme(null);
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "hidden lg:flex items-center justify-center w-[42px] h-[42px] rounded-lg",
                      "text-muted-foreground hover:text-foreground",
                      "bg-transparent hover:bg-accent/60",
                      "border border-border/50 hover:border-border",
                      "transition-all duration-200 ease-out titlebar-no-drag",
                      "hover:scale-[1.02] active:scale-[0.98]"
                    )}
                    title="Project options"
                    data-testid="project-options-menu"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 bg-popover/95 backdrop-blur-xl"
                >
                  {/* Project Theme Submenu */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger data-testid="project-theme-trigger">
                      <Palette className="w-4 h-4 mr-2" />
                      <span className="flex-1">Project Theme</span>
                      {currentProject.theme && (
                        <span className="text-[10px] text-muted-foreground ml-2 capitalize">
                          {currentProject.theme}
                        </span>
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      className="w-56 bg-popover/95 backdrop-blur-xl"
                      data-testid="project-theme-menu"
                      onPointerLeave={() => {
                        // Clear preview theme when leaving the dropdown
                        setPreviewTheme(null);
                      }}
                    >
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Select theme for this project
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup
                        value={currentProject.theme || ""}
                        onValueChange={(value) => {
                          if (currentProject) {
                            // Clear preview theme when a theme is selected
                            setPreviewTheme(null);
                            // If selecting an actual theme (not "Use Global"), also update global
                            if (value !== "") {
                              setTheme(value as any);
                            } else {
                              // Restore to global theme when "Use Global" is selected
                              setTheme(globalTheme);
                            }
                            setProjectTheme(
                              currentProject.id,
                              value === "" ? null : (value as any)
                            );
                          }
                        }}
                      >
                        {PROJECT_THEME_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const themeValue =
                            option.value === "" ? globalTheme : option.value;
                          return (
                            <div
                              key={option.value}
                              onPointerEnter={() => {
                                // Preview the theme on hover
                                setPreviewTheme(themeValue as any);
                              }}
                              onPointerLeave={(e) => {
                                // Clear preview theme when leaving this item
                                // Only clear if we're not moving to another theme item
                                const relatedTarget =
                                  e.relatedTarget as HTMLElement;
                                if (
                                  !relatedTarget ||
                                  !relatedTarget.closest(
                                    '[data-testid^="project-theme-"]'
                                  )
                                ) {
                                  setPreviewTheme(null);
                                }
                              }}
                            >
                              <DropdownMenuRadioItem
                                value={option.value}
                                data-testid={`project-theme-${
                                  option.value || "global"
                                }`}
                                onFocus={() => {
                                  // Preview the theme on keyboard navigation
                                  setPreviewTheme(themeValue as any);
                                }}
                                onBlur={() => {
                                  // Clear preview theme when losing focus
                                  // If moving to another item, its onFocus will set it again
                                  setPreviewTheme(null);
                                }}
                              >
                                <Icon className="w-4 h-4 mr-2" />
                                <span>{option.label}</span>
                                {option.value === "" && (
                                  <span className="text-[10px] text-muted-foreground ml-1 capitalize">
                                    ({globalTheme})
                                  </span>
                                )}
                              </DropdownMenuRadioItem>
                            </div>
                          );
                        })}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* Project History Section - only show when there's history */}
                  {projectHistory.length > 1 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Project History
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={cyclePrevProject}
                        data-testid="cycle-prev-project"
                      >
                        <Undo2 className="w-4 h-4 mr-2" />
                        <span className="flex-1">Previous</span>
                        <span className="text-[10px] font-mono text-muted-foreground ml-2">
                          {formatShortcut(shortcuts.cyclePrevProject, true)}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={cycleNextProject}
                        data-testid="cycle-next-project"
                      >
                        <Redo2 className="w-4 h-4 mr-2" />
                        <span className="flex-1">Next</span>
                        <span className="text-[10px] font-mono text-muted-foreground ml-2">
                          {formatShortcut(shortcuts.cycleNextProject, true)}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={clearProjectHistory}
                        data-testid="clear-project-history"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        <span>Clear history</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* Move to Trash Section */}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteProjectDialog(true)}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    data-testid="move-project-to-trash"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    <span>Move to Trash</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {/* Nav Items - Scrollable */}
        <nav className={cn("flex-1 overflow-y-auto px-3 pb-2", sidebarOpen ? "mt-5" : "mt-1.5")}>
          {!currentProject && sidebarOpen ? (
            // Placeholder when no project is selected (only in expanded state)
            <div className="flex items-center justify-center h-full px-4">
              <p className="text-muted-foreground text-sm text-center">
                <span className="hidden lg:block">
                  Select or create a project above
                </span>
              </p>
            </div>
          ) : currentProject ? (
            // Navigation sections when project is selected
            navSections.map((section, sectionIdx) => (
              <div key={sectionIdx} className={sectionIdx > 0 && sidebarOpen ? "mt-6" : ""}>
                {/* Section Label */}
                {section.label && sidebarOpen && (
                  <div className="hidden lg:block px-3 mb-2">
                    <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                      {section.label}
                    </span>
                  </div>
                )}
                {section.label && !sidebarOpen && (
                  <div className="h-px bg-border/30 mx-2 my-1.5"></div>
                )}

                {/* Nav Items */}
                <div className="space-y-1.5">
                  {section.items.map((item) => {
                    const isActive = isActiveRoute(item.id);
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.id}
                        onClick={() => setCurrentView(item.id as any)}
                        className={cn(
                          "group flex items-center w-full px-3 py-2.5 rounded-xl relative overflow-hidden titlebar-no-drag",
                          "transition-all duration-200 ease-out",
                          isActive
                            ? [
                                // Active: Premium gradient with glow
                                "bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10",
                                "text-foreground font-medium",
                                "border border-brand-500/30",
                                "shadow-md shadow-brand-500/10",
                              ]
                            : [
                                // Inactive: Subtle hover state
                                "text-muted-foreground hover:text-foreground",
                                "hover:bg-accent/50",
                                "border border-transparent hover:border-border/40",
                                "hover:shadow-sm",
                              ],
                          sidebarOpen ? "justify-start" : "justify-center",
                          "hover:scale-[1.02] active:scale-[0.97]"
                        )}
                        title={!sidebarOpen ? item.label : undefined}
                        data-testid={`nav-${item.id}`}
                      >
                        {isActive && (
                          <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-400 via-brand-500 to-brand-600 rounded-r-full shadow-sm shadow-brand-500/50"></div>
                        )}
                        <Icon
                          className={cn(
                            "w-[18px] h-[18px] shrink-0 transition-all duration-200",
                            isActive
                              ? "text-brand-500 drop-shadow-sm"
                              : "group-hover:text-brand-400 group-hover:scale-110"
                          )}
                        />
                        <span
                          className={cn(
                            "ml-3 font-medium text-sm flex-1 text-left",
                            sidebarOpen ? "hidden lg:block" : "hidden"
                          )}
                        >
                          {item.label}
                        </span>
                        {item.shortcut && sidebarOpen && (
                          <span
                            className={cn(
                              "hidden lg:flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-mono rounded-md transition-all duration-200",
                              isActive
                                ? "bg-brand-500/20 text-brand-400"
                                : "bg-muted text-muted-foreground group-hover:bg-accent"
                            )}
                            data-testid={`shortcut-${item.id}`}
                          >
                            {formatShortcut(item.shortcut, true)}
                          </span>
                        )}
                        {/* Tooltip for collapsed state */}
                        {!sidebarOpen && (
                          <span
                            className={cn(
                              "absolute left-full ml-3 px-2.5 py-1.5 rounded-lg",
                              "bg-popover text-popover-foreground text-xs font-medium",
                              "border border-border shadow-lg",
                              "opacity-0 group-hover:opacity-100",
                              "transition-all duration-200 whitespace-nowrap z-50",
                              "translate-x-1 group-hover:translate-x-0"
                            )}
                            data-testid={`sidebar-tooltip-${item.label.toLowerCase()}`}
                          >
                            {item.label}
                            {item.shortcut && (
                              <span className="ml-2 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
                                {formatShortcut(item.shortcut, true)}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : null}
        </nav>
      </div>

      {/* Bottom Section - Running Agents / Bug Report / Settings */}
      <div
        className={cn(
          "shrink-0",
          // Top border with gradient fade
          "border-t border-border/40",
          // Elevated background for visual separation
          "bg-gradient-to-t from-background/10 via-sidebar/50 to-transparent"
        )}
      >
        {/* Course Promo Badge */}
        <CoursePromoBadge sidebarOpen={sidebarOpen} />
        {/* Wiki Link */}
        {!hideWiki && (
          <div className="p-2 pb-0">
            <button
              onClick={() => setCurrentView("wiki")}
              className={cn(
                "group flex items-center w-full px-3 py-2.5 rounded-xl relative overflow-hidden titlebar-no-drag",
                "transition-all duration-200 ease-out",
                isActiveRoute("wiki")
                  ? [
                      "bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10",
                      "text-foreground font-medium",
                      "border border-brand-500/30",
                      "shadow-md shadow-brand-500/10",
                    ]
                  : [
                      "text-muted-foreground hover:text-foreground",
                      "hover:bg-accent/50",
                      "border border-transparent hover:border-border/40",
                      "hover:shadow-sm",
                    ],
                sidebarOpen ? "justify-start" : "justify-center",
                "hover:scale-[1.02] active:scale-[0.97]"
              )}
              title={!sidebarOpen ? "Wiki" : undefined}
              data-testid="wiki-link"
            >
              {isActiveRoute("wiki") && (
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-400 via-brand-500 to-brand-600 rounded-r-full shadow-sm shadow-brand-500/50"></div>
              )}
              <BookOpen
                className={cn(
                  "w-[18px] h-[18px] shrink-0 transition-all duration-200",
                  isActiveRoute("wiki")
                    ? "text-brand-500 drop-shadow-sm"
                    : "group-hover:text-brand-400 group-hover:scale-110"
                )}
              />
              <span
                className={cn(
                  "ml-3 font-medium text-sm flex-1 text-left",
                  sidebarOpen ? "hidden lg:block" : "hidden"
                )}
              >
                Wiki
              </span>
              {!sidebarOpen && (
                <span
                  className={cn(
                    "absolute left-full ml-3 px-2.5 py-1.5 rounded-lg",
                    "bg-popover text-popover-foreground text-xs font-medium",
                    "border border-border shadow-lg",
                    "opacity-0 group-hover:opacity-100",
                    "transition-all duration-200 whitespace-nowrap z-50",
                    "translate-x-1 group-hover:translate-x-0"
                  )}
                >
                  Wiki
                </span>
              )}
            </button>
          </div>
        )}
        {/* Running Agents Link */}
        {!hideRunningAgents && (
          <div className="p-2 pb-0">
            <button
              onClick={() => setCurrentView("running-agents")}
              className={cn(
                "group flex items-center w-full px-3 py-2.5 rounded-xl relative overflow-hidden titlebar-no-drag",
                "transition-all duration-200 ease-out",
                isActiveRoute("running-agents")
                  ? [
                      "bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10",
                      "text-foreground font-medium",
                      "border border-brand-500/30",
                      "shadow-md shadow-brand-500/10",
                    ]
                  : [
                      "text-muted-foreground hover:text-foreground",
                      "hover:bg-accent/50",
                      "border border-transparent hover:border-border/40",
                      "hover:shadow-sm",
                    ],
                sidebarOpen ? "justify-start" : "justify-center",
                "hover:scale-[1.02] active:scale-[0.97]"
              )}
              title={!sidebarOpen ? "Running Agents" : undefined}
              data-testid="running-agents-link"
            >
              {isActiveRoute("running-agents") && (
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-400 via-brand-500 to-brand-600 rounded-r-full shadow-sm shadow-brand-500/50"></div>
              )}
              <div className="relative">
                <Activity
                  className={cn(
                    "w-[18px] h-[18px] shrink-0 transition-all duration-200",
                    isActiveRoute("running-agents")
                      ? "text-brand-500 drop-shadow-sm"
                      : "group-hover:text-brand-400 group-hover:scale-110"
                  )}
                />
                {/* Running agents count badge - shown in collapsed state */}
                {!sidebarOpen && runningAgentsCount > 0 && (
                  <span
                    className={cn(
                      "absolute -top-1.5 -right-1.5 flex items-center justify-center",
                      "min-w-4 h-4 px-1 text-[9px] font-bold rounded-full",
                      "bg-brand-500 text-white shadow-sm",
                      "animate-in fade-in zoom-in duration-200"
                    )}
                    data-testid="running-agents-count-collapsed"
                  >
                    {runningAgentsCount > 99 ? "99" : runningAgentsCount}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "ml-3 font-medium text-sm flex-1 text-left",
                  sidebarOpen ? "hidden lg:block" : "hidden"
                )}
              >
                Running Agents
              </span>
              {/* Running agents count badge - shown in expanded state */}
              {sidebarOpen && runningAgentsCount > 0 && (
                <span
                  className={cn(
                    "hidden lg:flex items-center justify-center",
                    "min-w-6 h-6 px-1.5 text-xs font-semibold rounded-full",
                    "bg-brand-500 text-white shadow-sm",
                    "animate-in fade-in zoom-in duration-200",
                    isActiveRoute("running-agents") && "bg-brand-600"
                  )}
                  data-testid="running-agents-count"
                >
                  {runningAgentsCount > 99 ? "99" : runningAgentsCount}
                </span>
              )}
              {!sidebarOpen && (
                <span
                  className={cn(
                    "absolute left-full ml-3 px-2.5 py-1.5 rounded-lg",
                    "bg-popover text-popover-foreground text-xs font-medium",
                    "border border-border shadow-lg",
                    "opacity-0 group-hover:opacity-100",
                    "transition-all duration-200 whitespace-nowrap z-50",
                    "translate-x-1 group-hover:translate-x-0"
                  )}
                >
                  Running Agents
                  {runningAgentsCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-brand-500 text-white rounded-full text-[10px] font-semibold">
                      {runningAgentsCount}
                    </span>
                  )}
                </span>
              )}
            </button>
          </div>
        )}
        {/* Settings Link */}
        <div className="p-2">
          <button
            onClick={() => setCurrentView("settings")}
            className={cn(
              "group flex items-center w-full px-3 py-2.5 rounded-xl relative overflow-hidden titlebar-no-drag",
              "transition-all duration-200 ease-out",
              isActiveRoute("settings")
                ? [
                    "bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10",
                    "text-foreground font-medium",
                    "border border-brand-500/30",
                    "shadow-md shadow-brand-500/10",
                  ]
                : [
                    "text-muted-foreground hover:text-foreground",
                    "hover:bg-accent/50",
                    "border border-transparent hover:border-border/40",
                    "hover:shadow-sm",
                  ],
              sidebarOpen ? "justify-start" : "justify-center",
              "hover:scale-[1.02] active:scale-[0.97]"
            )}
            title={!sidebarOpen ? "Settings" : undefined}
            data-testid="settings-button"
          >
            {isActiveRoute("settings") && (
              <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-400 via-brand-500 to-brand-600 rounded-r-full shadow-sm shadow-brand-500/50"></div>
            )}
            <Settings
              className={cn(
                "w-[18px] h-[18px] shrink-0 transition-all duration-200",
                isActiveRoute("settings")
                  ? "text-brand-500 drop-shadow-sm"
                  : "group-hover:text-brand-400 group-hover:rotate-90 group-hover:scale-110"
              )}
            />
            <span
              className={cn(
                "ml-3 font-medium text-sm flex-1 text-left",
                sidebarOpen ? "hidden lg:block" : "hidden"
              )}
            >
              Settings
            </span>
            {sidebarOpen && (
              <span
                className={cn(
                  "hidden lg:flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-mono rounded-md transition-all duration-200",
                  isActiveRoute("settings")
                    ? "bg-brand-500/20 text-brand-400"
                    : "bg-muted text-muted-foreground group-hover:bg-accent"
                )}
                data-testid="shortcut-settings"
              >
                {formatShortcut(shortcuts.settings, true)}
              </span>
            )}
            {!sidebarOpen && (
              <span
                className={cn(
                  "absolute left-full ml-3 px-2.5 py-1.5 rounded-lg",
                  "bg-popover text-popover-foreground text-xs font-medium",
                  "border border-border shadow-lg",
                  "opacity-0 group-hover:opacity-100",
                  "transition-all duration-200 whitespace-nowrap z-50",
                  "translate-x-1 group-hover:translate-x-0"
                )}
              >
                Settings
                <span className="ml-2 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
                  {formatShortcut(shortcuts.settings, true)}
                </span>
              </span>
            )}
          </button>
        </div>
      </div>
      <Dialog open={showTrashDialog} onOpenChange={setShowTrashDialog}>
        <DialogContent className="bg-popover/95 backdrop-blur-xl border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recycle Bin</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Restore projects to the sidebar or delete their folders using your
              system Trash.
            </DialogDescription>
          </DialogHeader>

          {trashedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Recycle bin is empty.
            </p>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {trashedProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/50 p-4"
                >
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {project.name}
                    </p>
                    <p className="text-xs text-muted-foreground break-all">
                      {project.path}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80">
                      Trashed {new Date(project.trashedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRestoreProject(project.id)}
                      data-testid={`restore-project-${project.id}`}
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteProjectFromDisk(project)}
                      disabled={activeTrashId === project.id}
                      data-testid={`delete-project-disk-${project.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {activeTrashId === project.id
                        ? "Deleting..."
                        : "Delete from disk"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => deleteTrashedProject(project.id)}
                      data-testid={`remove-project-${project.id}`}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Remove from list
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <Button variant="ghost" onClick={() => setShowTrashDialog(false)}>
              Close
            </Button>
            {trashedProjects.length > 0 && (
              <Button
                variant="outline"
                onClick={handleEmptyTrash}
                disabled={isEmptyingTrash}
                data-testid="empty-trash"
              >
                {isEmptyingTrash ? "Clearing..." : "Empty Recycle Bin"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Project Setup Dialog */}
      <ProjectSetupDialog
        open={showSetupDialog}
        onOpenChange={setShowSetupDialog}
        projectOverview={projectOverview}
        onProjectOverviewChange={setProjectOverview}
        generateFeatures={generateFeatures}
        onGenerateFeaturesChange={setGenerateFeatures}
        featureCount={featureCount}
        onFeatureCountChange={setFeatureCount}
        onCreateSpec={handleCreateInitialSpec}
        onSkip={handleSkipSetup}
        isCreatingSpec={isCreatingSpec}
      />

      {/* New Project Onboarding Dialog */}
      <Dialog
        open={showOnboardingDialog}
        onOpenChange={(open) => {
          if (!open) {
            handleOnboardingSkip();
          }
        }}
      >
        <DialogContent className="max-w-2xl bg-popover/95 backdrop-blur-xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-500/10 border border-brand-500/20">
                <Rocket className="w-6 h-6 text-brand-500" />
              </div>
              <div>
                <DialogTitle className="text-2xl">
                  Welcome to {newProjectName}!
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1">
                  Your new project is ready. Let&apos;s get you started.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-6">
            {/* Main explanation */}
            <div className="space-y-3">
              <p className="text-sm text-foreground leading-relaxed">
                Would you like to auto-generate your{" "}
                <strong>app_spec.txt</strong>? This file helps describe your
                project and is used to pre-populate your backlog with features
                to work on.
              </p>
            </div>

            {/* Benefits list */}
            <div className="space-y-3 rounded-xl bg-muted/30 border border-border/50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Pre-populate your backlog
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically generate features based on your project
                    specification
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Better AI assistance
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Help AI agents understand your project structure and tech
                    stack
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Project documentation
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Keep a clear record of your project&apos;s capabilities and
                    features
                  </p>
                </div>
              </div>
            </div>

            {/* Info box */}
            <div className="rounded-xl bg-brand-500/5 border border-brand-500/10 p-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Tip:</strong> You can always
                generate or edit your app_spec.txt later from the Spec Editor in
                the sidebar.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={handleOnboardingSkip}
              className="text-muted-foreground hover:text-foreground"
            >
              Skip for now
            </Button>
            <Button
              onClick={handleOnboardingGenerateSpec}
              className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-600 text-white border-0"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate App Spec
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation Dialog */}
      <DeleteProjectDialog
        open={showDeleteProjectDialog}
        onOpenChange={setShowDeleteProjectDialog}
        project={currentProject}
        onConfirm={moveProjectToTrash}
      />

      {/* New Project Modal */}
      <NewProjectModal
        open={showNewProjectModal}
        onOpenChange={setShowNewProjectModal}
        onCreateBlankProject={handleCreateBlankProject}
        onCreateFromTemplate={handleCreateFromTemplate}
        onCreateFromCustomUrl={handleCreateFromCustomUrl}
        isCreating={isCreatingProject}
      />
    </aside>
  );
}
