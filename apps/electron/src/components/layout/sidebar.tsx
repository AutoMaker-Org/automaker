"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useAppStore, formatShortcut } from "@/store/app-store";
import { services, isBootstrapped } from "@/services";
import {
  FolderOpen,
  Plus,
  Settings,
  FileText,
  LayoutGrid,
  Bot,
  Folder,
  X,
  Wrench,
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
  Moon,
  Sun,
  Terminal,
  Ghost,
  Snowflake,
  Flame,
  Sparkles as TokyoNightIcon,
  Eclipse,
  Trees,
  Cat,
  Atom,
  Radio,
  Monitor,
  Search,
  Bug,
  Activity,
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
import { Project, TrashedProject } from "@/lib/electron";
import {
  initializeProject,
  hasAppSpec,
  hasAutomakerDir,
} from "@/lib/project-init";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { SpecRegenerationEvent } from "@/types/electron";
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
        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent",
        isDragging && "bg-accent shadow-lg",
        isHighlighted && "bg-brand-500/10 text-foreground"
      )}
      data-testid={`project-option-${project.id}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 rounded hover:bg-sidebar-accent/20 cursor-grab active:cursor-grabbing"
        data-testid={`project-drag-handle-${project.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Project content - clickable area */}
      <div
        className="flex items-center gap-2 flex-1 min-w-0"
        onClick={() => onSelect(project)}
      >
        <Folder className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-sm">{project.name}</span>
        {currentProjectId === project.id && (
          <Check className="h-4 w-4 text-brand-500 shrink-0" />
        )}
      </div>
    </div>
  );
}

// Theme options for project theme selector
const PROJECT_THEME_OPTIONS = [
  { value: "", label: "Use Global", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "retro", label: "Retro", icon: Terminal },
  { value: "dracula", label: "Dracula", icon: Ghost },
  { value: "nord", label: "Nord", icon: Snowflake },
  { value: "monokai", label: "Monokai", icon: Flame },
  { value: "tokyonight", label: "Tokyo Night", icon: TokyoNightIcon },
  { value: "solarized", label: "Solarized", icon: Eclipse },
  { value: "gruvbox", label: "Gruvbox", icon: Trees },
  { value: "catppuccin", label: "Catppuccin", icon: Cat },
  { value: "onedark", label: "One Dark", icon: Atom },
  { value: "synthwave", label: "Synthwave", icon: Radio },
] as const;

export function Sidebar() {
  const {
    projects,
    trashedProjects,
    currentProject,
    currentView,
    sidebarOpen,
    projectHistory,
    addProject,
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
    theme: globalTheme,
  } = useAppStore();

  // Get customizable keyboard shortcuts
  const shortcuts = useKeyboardShortcutsConfig();

  // State for project picker dropdown
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);
  const [showTrashDialog, setShowTrashDialog] = useState(false);
  const [activeTrashId, setActiveTrashId] = useState<string | null>(null);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);

  // State for new project setup dialog
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [setupProjectPath, setSetupProjectPath] = useState("");
  const [projectOverview, setProjectOverview] = useState("");
  const [isCreatingSpec, setIsCreatingSpec] = useState(false);
  const [creatingSpecProjectPath, setCreatingSpecProjectPath] = useState<
    string | null
  >(null);
  const [generateFeatures, setGenerateFeatures] = useState(true);
  const [showSpecIndicator, setShowSpecIndicator] = useState(true);

  // Ref for project search input
  const projectSearchInputRef = useRef<HTMLInputElement>(null);

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
    if (!isBootstrapped()) return;

    const subscription = services.specRegeneration.onEvent(
      (event: SpecRegenerationEvent) => {
        console.log("[Sidebar] Spec regeneration event:", event.type);

        if (event.type === "spec_regeneration_complete") {
          setIsCreatingSpec(false);
          setCreatingSpecProjectPath(null);
          setShowSetupDialog(false);
          setProjectOverview("");
          setSetupProjectPath("");
          toast.success("App specification created", {
            description: "Your project is now set up and ready to go!",
          });
          // Navigate to spec view to show the new spec
          setCurrentView("spec");
        } else if (event.type === "spec_regeneration_error") {
          setIsCreatingSpec(false);
          setCreatingSpecProjectPath(null);
          toast.error("Failed to create specification", {
            description: event.error,
          });
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setCurrentView]);

  // Handle creating initial spec for new project
  const handleCreateInitialSpec = useCallback(async () => {
    if (!isBootstrapped()) return;
    if (!setupProjectPath || !projectOverview.trim()) return;

    setIsCreatingSpec(true);
    setCreatingSpecProjectPath(setupProjectPath);
    setShowSpecIndicator(true);
    setShowSetupDialog(false);

    try {
      const result = await services.specRegeneration.create(
        setupProjectPath,
        projectOverview.trim(),
        generateFeatures
      );

      if (!result.success) {
        console.error("[Sidebar] Failed to start spec creation:", result.error);
        setIsCreatingSpec(false);
        setCreatingSpecProjectPath(null);
        toast.error("Failed to create specification", {
          description: result.error,
        });
      }
      // If successful, we'll wait for the events to update the state
    } catch (error) {
      console.error("[Sidebar] Failed to create spec:", error);
      setIsCreatingSpec(false);
      setCreatingSpecProjectPath(null);
      toast.error("Failed to create specification", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [setupProjectPath, projectOverview, generateFeatures]);

  // Handle skipping setup
  const handleSkipSetup = useCallback(() => {
    setShowSetupDialog(false);
    setProjectOverview("");
    setSetupProjectPath("");
    toast.info("Setup skipped", {
      description: "You can set up your app_spec.txt later from the Spec view.",
    });
  }, []);

  /**
   * Opens the system folder selection dialog and initializes the selected project.
   * Used by both the 'O' keyboard shortcut and the folder icon button.
   */
  const handleOpenFolder = useCallback(async () => {
    if (!isBootstrapped()) return;

    const dialogResult = await services.dialog.openDirectory();
    if (!dialogResult.success || !dialogResult.data) return;

    const result = dialogResult.data;

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

        const project = {
          id: `project-${Date.now()}`,
          name,
          path,
          lastOpened: new Date().toISOString(),
        };

        addProject(project);
        setCurrentProject(project);

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
  }, [addProject, setCurrentProject]);

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
      if (!isBootstrapped()) return;

      const confirmed = window.confirm(
        `Delete "${trashedProject.name}" from disk?\nThis sends the folder to your system Trash.`
      );
      if (!confirmed) return;

      setActiveTrashId(trashedProject.id);
      try {
        const result = await services.fileSystem.trashItem(trashedProject.path);
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
      "Clear all trashed projects from Automaker? This does not delete folders from disk."
    );
    if (!confirmed) return;

    setIsEmptyingTrash(true);
    try {
      emptyTrash();
      toast.success("Trash cleared");
      setShowTrashDialog(false);
    } finally {
      setIsEmptyingTrash(false);
    }
  }, [emptyTrash, trashedProjects.length]);

  const navSections: NavSection[] = [
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
      items: [
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
          id: "tools",
          label: "Agent Tools",
          icon: Wrench,
          shortcut: shortcuts.tools,
        },
        {
          id: "profiles",
          label: "AI Profiles",
          icon: UserCircle,
          shortcut: shortcuts.profiles,
        },
      ],
    },
  ];

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
        "flex-shrink-0 border-r border-sidebar-border bg-sidebar backdrop-blur-md flex flex-col z-30 transition-all duration-300 relative",
        sidebarOpen ? "w-16 lg:w-72" : "w-16"
      )}
      data-testid="sidebar"
    >
      {/* Floating Collapse Toggle Button - Desktop only - At border intersection */}
      <button
        onClick={toggleSidebar}
        className="hidden lg:flex absolute top-[68px] -right-3 z-9999 group/toggle items-center justify-center w-6 h-6 rounded-full bg-sidebar-accent border border-border text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border transition-all shadow-lg titlebar-no-drag"
        data-testid="sidebar-collapse-button"
      >
        {sidebarOpen ? (
          <PanelLeftClose className="w-3.5 h-3.5 pointer-events-none" />
        ) : (
          <PanelLeft className="w-3.5 h-3.5 pointer-events-none" />
        )}
        {/* Tooltip */}
        <div
          className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover/toggle:opacity-100 transition-opacity whitespace-nowrap z-50 border border-border pointer-events-none"
          data-testid="sidebar-toggle-tooltip"
        >
          {sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}{" "}
          <span
            className="ml-1 px-1 py-0.5 bg-brand-500/10 border border-brand-500/30 rounded text-[10px] font-mono text-brand-400/70"
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
            "h-20 border-b border-sidebar-border shrink-0 titlebar-drag-region",
            sidebarOpen ? "pt-8 px-3 lg:px-6 flex items-center justify-between" : "pt-2 pb-2 px-3 flex flex-col items-center justify-center gap-2"
          )}
        >
          <div
            className={cn(
              "flex items-center titlebar-no-drag cursor-pointer",
              !sidebarOpen && "flex-col gap-1"
            )}
            onClick={() => setCurrentView("welcome")}
            data-testid="logo-button"
          >
            <div className="relative flex items-center justify-center rounded-lg group">
              <img
                src="/logo.png"
                alt="Automaker Logo"
                className="size-8 group-hover:rotate-12 transition-transform"
              />
            </div>
            <span
              className={cn(
                "ml-1 font-bold text-sidebar-foreground text-base tracking-tight",
                sidebarOpen ? "hidden lg:block" : "hidden"
              )}
            >
              Auto<span className="text-brand-500">maker</span>
            </span>
          </div>
          {/* Bug Report Button */}
          <button
            onClick={() => {
              if (isBootstrapped()) {
                services.app.openExternalLink("https://github.com/AutoMaker-Org/automaker/issues");
              }
            }}
            className="titlebar-no-drag p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-all"
            title="Report Bug / Feature Request"
            data-testid="bug-report-link"
          >
            <Bug className="w-4 h-4" />
          </button>
        </div>

        {/* Project Actions - Moved above project selector */}
        {sidebarOpen && (
          <div className="flex items-center gap-2 titlebar-no-drag px-2 mt-3">
            <button
              onClick={() => setCurrentView("welcome")}
              className="group flex items-center justify-center flex-1 px-3 py-2.5 rounded-lg relative overflow-hidden transition-all text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 border border-sidebar-border"
              title="New Project"
              data-testid="new-project-button"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="ml-2 text-sm font-medium hidden lg:block whitespace-nowrap">
                New
              </span>
            </button>
            <button
              onClick={handleOpenFolder}
              className="group flex items-center justify-center flex-1 px-3 py-2.5 rounded-lg relative overflow-hidden transition-all text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 border border-sidebar-border"
              title={`Open Folder (${shortcuts.openProject})`}
              data-testid="open-project-button"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span className="hidden lg:flex items-center justify-center min-w-5 h-5 px-1 text-[10px] font-mono rounded bg-brand-500/10 border border-brand-500/30 text-brand-400/70 ml-2">
                {formatShortcut(shortcuts.openProject, true)}
              </span>
            </button>
            <button
              onClick={() => setShowTrashDialog(true)}
              className="group flex items-center justify-center px-3 h-[42px] rounded-lg relative overflow-hidden transition-all text-muted-foreground hover:text-primary hover:bg-destructive/10 border border-sidebar-border"
              title="Trash"
              data-testid="trash-button"
            >
              <Trash2 className="size-4 shrink-0" />
              {trashedProjects.length > 0 && (
                <span className="absolute -top-[2px] -right-[2px] flex items-center justify-center w-5 h-5 text-[10px] font-medium rounded-full text-brand-500">
                  {trashedProjects.length > 9 ? "9+" : trashedProjects.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Project Selector with Cycle Buttons */}
        {sidebarOpen && projects.length > 0 && (
          <div className="px-2 mt-3 flex items-center gap-1.5">
            <DropdownMenu
              open={isProjectPickerOpen}
              onOpenChange={setIsProjectPickerOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  className="flex-1 flex items-center justify-between px-3 py-2.5 rounded-lg bg-sidebar-accent/10 border border-sidebar-border hover:bg-sidebar-accent/20 transition-all text-foreground titlebar-no-drag min-w-0"
                  data-testid="project-selector"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Folder className="h-4 w-4 text-brand-500 shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {currentProject?.name || "Select Project"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className="hidden lg:flex items-center justify-center min-w-5 h-5 px-1 text-[10px] font-mono rounded bg-brand-500/10 border border-brand-500/30 text-brand-400/70"
                      data-testid="project-picker-shortcut"
                    >
                      {formatShortcut(shortcuts.projectPicker, true)}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64 bg-popover border-border p-1"
                align="start"
                data-testid="project-picker-dropdown"
              >
                {/* Search input for type-ahead filtering */}
                <div className="px-2 pb-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      ref={projectSearchInputRef}
                      type="text"
                      placeholder="Search projects..."
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      className="w-full h-8 pl-7 pr-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
                      data-testid="project-search-input"
                    />
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
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
                    </SortableContext>
                  </DndContext>
                )}

                {/* Keyboard hint */}
                <div className="px-2 pt-2 mt-1 border-t border-border">
                  <p className="text-[10px] text-muted-foreground text-center">
                    ↑↓ navigate • Enter select • Esc close
                  </p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Project Options Menu - theme and history */}
            {currentProject && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="hidden lg:flex items-center justify-center w-8 h-[42px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 border border-sidebar-border transition-all titlebar-no-drag"
                    title="Project options"
                    data-testid="project-options-menu"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
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
                      className="w-48"
                      data-testid="project-theme-menu"
                    >
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Select theme for this project
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup
                        value={currentProject.theme || ""}
                        onValueChange={(value) => {
                          if (currentProject) {
                            setProjectTheme(
                              currentProject.id,
                              value === "" ? null : (value as any)
                            );
                          }
                        }}
                      >
                        {PROJECT_THEME_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          return (
                            <DropdownMenuRadioItem
                              key={option.value}
                              value={option.value}
                              data-testid={`project-theme-${
                                option.value || "global"
                              }`}
                            >
                              <Icon className="w-4 h-4 mr-2" />
                              <span>{option.label}</span>
                              {option.value === "" && (
                                <span className="text-[10px] text-muted-foreground ml-1 capitalize">
                                  ({globalTheme})
                                </span>
                              )}
                            </DropdownMenuRadioItem>
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
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {/* Nav Items - Scrollable */}
        <nav className="flex-1 overflow-y-auto px-2 mt-4 pb-2">
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
              <div key={sectionIdx} className={sectionIdx > 0 ? "mt-6" : ""}>
                {/* Section Label */}
                {section.label && sidebarOpen && (
                  <div className="hidden lg:block px-4 mb-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {section.label}
                    </span>
                  </div>
                )}
                {section.label && !sidebarOpen && (
                  <div className="h-px bg-sidebar-border mx-2 mb-2"></div>
                )}

                {/* Nav Items */}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = isActiveRoute(item.id);
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.id}
                        onClick={() => setCurrentView(item.id as any)}
                        className={cn(
                          "group flex items-center w-full px-2 lg:px-3 py-2.5 rounded-lg relative overflow-hidden transition-all titlebar-no-drag",
                          isActive
                            ? "bg-sidebar-accent/50 text-foreground border border-sidebar-border"
                            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50",
                          sidebarOpen ? "justify-start" : "justify-center"
                        )}
                        title={!sidebarOpen ? item.label : undefined}
                        data-testid={`nav-${item.id}`}
                      >
                        {isActive && (
                          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-500 rounded-l-md"></div>
                        )}
                        <Icon
                          className={cn(
                            "w-4 h-4 shrink-0 transition-colors",
                            isActive
                              ? "text-brand-500"
                              : "group-hover:text-brand-400"
                          )}
                        />
                        <span
                          className={cn(
                            "ml-2.5 font-medium text-sm flex-1 text-left",
                            sidebarOpen ? "hidden lg:block" : "hidden"
                          )}
                        >
                          {item.label}
                        </span>
                        {item.shortcut && sidebarOpen && (
                          <span
                            className={cn(
                              "hidden lg:flex items-center justify-center min-w-5 h-5 px-1 text-[10px] font-mono rounded bg-brand-500/10 border border-brand-500/30 text-brand-400/70",
                              isActive &&
                                "bg-brand-500/20 border-brand-500/50 text-brand-400"
                            )}
                            data-testid={`shortcut-${item.id}`}
                          >
                            {formatShortcut(item.shortcut, true)}
                          </span>
                        )}
                        {/* Tooltip for collapsed state */}
                        {!sidebarOpen && (
                          <span
                            className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-zinc-700"
                            data-testid={`sidebar-tooltip-${item.label.toLowerCase()}`}
                          >
                            {item.label}
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
      <div className="border-t border-sidebar-border bg-sidebar-accent/10 shrink-0">
        {/* Running Agents Link */}
        <div className="p-2 pb-0">
          <button
            onClick={() => setCurrentView("running-agents")}
            className={cn(
              "group flex items-center w-full px-2 lg:px-3 py-2.5 rounded-lg relative overflow-hidden transition-all titlebar-no-drag",
              isActiveRoute("running-agents")
                ? "bg-sidebar-accent/50 text-foreground border border-sidebar-border"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50",
              sidebarOpen ? "justify-start" : "justify-center"
            )}
            title={!sidebarOpen ? "Running Agents" : undefined}
            data-testid="running-agents-link"
          >
            {isActiveRoute("running-agents") && (
              <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-500 rounded-l-md"></div>
            )}
            <Activity
              className={cn(
                "w-4 h-4 shrink-0 transition-colors",
                isActiveRoute("running-agents")
                  ? "text-brand-500"
                  : "group-hover:text-brand-400"
              )}
            />
            <span
              className={cn(
                "ml-2.5 font-medium text-sm flex-1 text-left",
                sidebarOpen ? "hidden lg:block" : "hidden"
              )}
            >
              Running Agents
            </span>
            {!sidebarOpen && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-border">
                Running Agents
              </span>
            )}
          </button>
        </div>
        {/* Settings Link */}
        <div className="p-2">
          <button
            onClick={() => setCurrentView("settings")}
            className={cn(
              "group flex items-center w-full px-2 lg:px-3 py-2.5 rounded-lg relative overflow-hidden transition-all titlebar-no-drag",
              isActiveRoute("settings")
                ? "bg-sidebar-accent/50 text-foreground border border-sidebar-border"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50",
              sidebarOpen ? "justify-start" : "justify-center"
            )}
            title={!sidebarOpen ? "Settings" : undefined}
            data-testid="settings-button"
          >
            {isActiveRoute("settings") && (
              <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-500 rounded-l-md"></div>
            )}
            <Settings
              className={cn(
                "w-4 h-4 shrink-0 transition-colors",
                isActiveRoute("settings")
                  ? "text-brand-500"
                  : "group-hover:text-brand-400"
              )}
            />
            <span
              className={cn(
                "ml-2.5 font-medium text-sm flex-1 text-left",
                sidebarOpen ? "hidden lg:block" : "hidden"
              )}
            >
              Settings
            </span>
            {sidebarOpen && (
              <span
                className={cn(
                  "hidden lg:flex items-center justify-center min-w-5 h-5 px-1 text-[10px] font-mono rounded bg-brand-500/10 border border-brand-500/30 text-brand-400/70",
                  isActiveRoute("settings") &&
                    "bg-brand-500/20 border-brand-500/50 text-brand-400"
                )}
                data-testid="shortcut-settings"
              >
                {formatShortcut(shortcuts.settings, true)}
              </span>
            )}
            {!sidebarOpen && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-border">
                Settings
              </span>
            )}
          </button>
        </div>
      </div>
      <Dialog open={showTrashDialog} onOpenChange={setShowTrashDialog}>
        <DialogContent className="bg-popover border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle>Trash</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Restore projects to the sidebar or delete their folders using your
              system Trash.
            </DialogDescription>
          </DialogHeader>

          {trashedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Trash is empty.</p>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {trashedProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-sidebar-border bg-sidebar-accent/20 p-3"
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
                {isEmptyingTrash ? "Clearing..." : "Empty Trash"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Project Setup Dialog */}
      <Dialog
        open={showSetupDialog}
        onOpenChange={(open) => {
          if (!open && !isCreatingSpec) {
            handleSkipSetup();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Set Up Your Project</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              We didn&apos;t find an app_spec.txt file. Let us help you generate
              your app_spec.txt to help describe your project for our system.
              We&apos;ll analyze your project&apos;s tech stack and create a
              comprehensive specification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Overview</label>
              <p className="text-xs text-muted-foreground">
                Describe what your project does and what features you want to
                build. Be as detailed as you want - this will help us create a
                better specification.
              </p>
              <textarea
                className="w-full h-48 p-3 rounded-md border border-border bg-background font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                value={projectOverview}
                onChange={(e) => setProjectOverview(e.target.value)}
                placeholder="e.g., A project management tool that allows teams to track tasks, manage sprints, and visualize progress through kanban boards. It should support user authentication, real-time updates, and file attachments..."
                autoFocus
              />
            </div>

            <div className="flex items-start space-x-3 pt-2">
              <Checkbox
                id="sidebar-generate-features"
                checked={generateFeatures}
                onCheckedChange={(checked) =>
                  setGenerateFeatures(checked === true)
                }
              />
              <div className="space-y-1">
                <label
                  htmlFor="sidebar-generate-features"
                  className="text-sm font-medium cursor-pointer"
                >
                  Generate feature list
                </label>
                <p className="text-xs text-muted-foreground">
                  Automatically create features in the features folder from the
                  implementation roadmap after the spec is generated.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={handleSkipSetup}>
              Skip for now
            </Button>
            <Button
              onClick={handleCreateInitialSpec}
              disabled={!projectOverview.trim()}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Spec
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spec Creation Indicator - Bottom Right Toast */}
      {isCreatingSpec &&
        showSpecIndicator &&
        currentProject?.path === creatingSpecProjectPath && (
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-card border border-border rounded-lg shadow-lg p-4 max-w-sm">
            <Loader2 className="w-5 h-5 animate-spin text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Creating App Specification</p>
              <p className="text-xs text-muted-foreground truncate">
                Working on your project...
              </p>
            </div>
            <button
              onClick={() => setShowSpecIndicator(false)}
              className="p-1 hover:bg-muted rounded-md transition-colors flex-shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}
    </aside>
  );
}
