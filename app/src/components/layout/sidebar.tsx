"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
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
  Check,
  BookOpen,
  GripVertical,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
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
  NAV_SHORTCUTS,
  UI_SHORTCUTS,
  ACTION_SHORTCUTS,
  KeyboardShortcut,
} from "@/hooks/use-keyboard-shortcuts";
import { getElectronAPI, Project, TrashedProject } from "@/lib/electron";
import { initializeProject } from "@/lib/project-init";
import { safeJoin } from "@/lib/path-utils";
import { toast } from "sonner";
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
  index: number;
  currentProjectId: string | undefined;
  onSelect: (project: Project) => void;
}

function SortableProjectItem({
  project,
  index,
  currentProjectId,
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
        isDragging && "bg-accent shadow-lg"
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

      {/* Hotkey indicator */}
      {index < 9 && (
        <span
          className="flex items-center justify-center w-5 h-5 text-[10px] font-mono rounded bg-sidebar-accent/10 border border-sidebar-border text-muted-foreground"
          data-testid={`project-hotkey-${index + 1}`}
        >
          {index + 1}
        </span>
      )}

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

export function Sidebar() {
  const {
    projects,
    trashedProjects,
    currentProject,
    currentView,
    sidebarOpen,
    addProject,
    setCurrentProject,
    setCurrentView,
    toggleSidebar,
    restoreTrashedProject,
    deleteTrashedProject,
    emptyTrash,
    reorderProjects,
  } = useAppStore();

  // State for project picker dropdown
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [showTrashDialog, setShowTrashDialog] = useState(false);
  const [activeTrashId, setActiveTrashId] = useState<string | null>(null);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);

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

  /**
   * Opens the system folder selection dialog and initializes the selected project.
   * Used by both the 'O' keyboard shortcut and the folder icon button.
   */
  const handleOpenFolder = useCallback(async () => {
    const api = await getElectronAPI();
    if (!api) {
      console.error("Failed to get Electron API");
      return;
    }
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0];
      const name = path.split("/").pop() || "Untitled Project";

      try {
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

        if (initResult.createdFiles && initResult.createdFiles.length > 0) {
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
      const confirmed = window.confirm(
        `Delete "${trashedProject.name}" from disk?\nThis sends the folder to your system Trash.`
      );
      if (!confirmed) return;

      setActiveTrashId(trashedProject.id);
      try {
        const api = await getElectronAPI();
        if (!api) {
          console.error("Failed to get Electron API");
          return;
        }
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
          shortcut: NAV_SHORTCUTS.board,
        },
        {
          id: "agent",
          label: "Agent Runner",
          icon: Bot,
          shortcut: NAV_SHORTCUTS.agent,
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
          shortcut: NAV_SHORTCUTS.spec,
        },
        {
          id: "context",
          label: "Context",
          icon: BookOpen,
          shortcut: NAV_SHORTCUTS.context,
        },
        {
          id: "tools",
          label: "Agent Tools",
          icon: Wrench,
          shortcut: NAV_SHORTCUTS.tools,
        },
      ],
    },
  ];

  // Handler for selecting a project by number key
  const selectProjectByNumber = useCallback(
    (num: number) => {
      const projectIndex = num - 1;
      if (projectIndex >= 0 && projectIndex < projects.length) {
        setCurrentProject(projects[projectIndex]);
        setIsProjectPickerOpen(false);
      }
    },
    [projects, setCurrentProject]
  );

  // Handle keyboard events when project picker is open
  useEffect(() => {
    if (!isProjectPickerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= 9) {
        event.preventDefault();
        selectProjectByNumber(num);
      } else if (event.key === "Escape") {
        setIsProjectPickerOpen(false);
      } else if (event.key.toLowerCase() === "p") {
        // Toggle off when P is pressed while dropdown is open
        event.preventDefault();
        setIsProjectPickerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProjectPickerOpen, selectProjectByNumber]);

  // Build keyboard shortcuts for navigation
  const navigationShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcuts: KeyboardShortcut[] = [];

    // Sidebar toggle shortcut - always available
    shortcuts.push({
      key: UI_SHORTCUTS.toggleSidebar,
      action: () => toggleSidebar(),
      description: "Toggle sidebar",
    });

    // Open project shortcut - opens the folder selection dialog directly
    shortcuts.push({
      key: ACTION_SHORTCUTS.openProject,
      action: () => handleOpenFolder(),
      description: "Open folder selection dialog",
    });

    // Project picker shortcut - only when we have projects
    if (projects.length > 0) {
      shortcuts.push({
        key: ACTION_SHORTCUTS.projectPicker,
        action: () => setIsProjectPickerOpen((prev) => !prev),
        description: "Toggle project picker",
      });
    }

    // Only enable nav shortcuts if there's a current project
    if (currentProject) {
      navSections.forEach((section) => {
        section.items.forEach((item) => {
          if (item.shortcut) {
            shortcuts.push({
              key: item.shortcut,
              action: () => setCurrentView(item.id as any),
              description: `Navigate to ${item.label}`,
            });
          }
        });
      });

      // Add settings shortcut
      shortcuts.push({
        key: NAV_SHORTCUTS.settings,
        action: () => setCurrentView("settings"),
        description: "Navigate to Settings",
      });
    }

    return shortcuts;
  }, [
    currentProject,
    setCurrentView,
    toggleSidebar,
    projects.length,
    handleOpenFolder,
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
        sidebarOpen ? "w-16 lg:w-60" : "w-16"
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
            className="ml-1 px-1 py-0.5 bg-sidebar-accent/10 rounded text-[10px] font-mono"
            data-testid="sidebar-toggle-shortcut"
          >
            {UI_SHORTCUTS.toggleSidebar}
          </span>
        </div>
      </button>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Logo */}
        <div
          className={cn(
            "h-20 pt-8 flex items-center justify-center border-b border-sidebar-border shrink-0 titlebar-drag-region",
            sidebarOpen ? "px-3 lg:px-6" : "px-3"
          )}
        >
          <div
            className="flex items-center titlebar-no-drag cursor-pointer"
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
              title={`Open Folder (${ACTION_SHORTCUTS.openProject})`}
              data-testid="open-project-button"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span className="hidden lg:flex items-center justify-center w-5 h-5 text-[10px] font-mono rounded bg-white/5 border border-white/10 text-zinc-500 ml-2">
                {ACTION_SHORTCUTS.openProject}
              </span>
            </button>
            <button
              onClick={() => setShowTrashDialog(true)}
              className="group flex items-center justify-center px-3 py-2.5 rounded-lg relative overflow-hidden transition-all text-muted-foreground hover:text-primary hover:bg-destructive/10 border border-sidebar-border"
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

        {/* Project Selector */}
        {sidebarOpen && projects.length > 0 && (
          <div className="px-2 mt-3">
            <DropdownMenu
              open={isProjectPickerOpen}
              onOpenChange={setIsProjectPickerOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-sidebar-accent/10 border border-sidebar-border hover:bg-sidebar-accent/20 transition-all text-foreground titlebar-no-drag"
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
                      className="hidden lg:flex items-center justify-center w-5 h-5 text-[10px] font-mono rounded bg-sidebar-accent/10 border border-sidebar-border text-muted-foreground"
                      data-testid="project-picker-shortcut"
                    >
                      {ACTION_SHORTCUTS.projectPicker}
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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={projects.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {projects.map((project, index) => (
                      <SortableProjectItem
                        key={project.id}
                        project={project}
                        index={index}
                        currentProjectId={currentProject?.id}
                        onSelect={(p) => {
                          setCurrentProject(p);
                          setIsProjectPickerOpen(false);
                        }}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </DropdownMenuContent>
            </DropdownMenu>
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
                              "hidden lg:flex items-center justify-center w-5 h-5 text-[10px] font-mono rounded bg-white/5 border border-white/10 text-zinc-500",
                              isActive &&
                                "bg-brand-500/10 border-brand-500/20 text-brand-400"
                            )}
                            data-testid={`shortcut-${item.id}`}
                          >
                            {item.shortcut}
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

      {/* Bottom Section - User / Settings */}
      <div className="border-t border-sidebar-border bg-sidebar-accent/10 shrink-0">
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
                  "hidden lg:flex items-center justify-center w-5 h-5 text-[10px] font-mono rounded bg-white/5 border border-white/10 text-zinc-500",
                  isActiveRoute("settings") &&
                    "bg-brand-500/10 border-brand-500/20 text-brand-400"
                )}
                data-testid="shortcut-settings"
              >
                {NAV_SHORTCUTS.settings}
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
    </aside>
  );
}
