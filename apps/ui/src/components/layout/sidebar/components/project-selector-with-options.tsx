import {
  Folder,
  ChevronDown,
  MoreVertical,
  Palette,
  Monitor,
  Moon,
  Sun,
  Undo2,
  Redo2,
  RotateCcw,
  Trash2,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShortcut, type ThemeMode, useAppStore } from '@/store/app-store';
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
} from '@/components/ui/dropdown-menu';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableProjectItem, ThemeMenuItem } from './';
import { PROJECT_DARK_THEMES, PROJECT_LIGHT_THEMES } from '../constants';
import { useProjectPicker, useDragAndDrop, useProjectTheme } from '../hooks';
import { useKeyboardShortcutsConfig } from '@/hooks/use-keyboard-shortcuts';

interface ProjectSelectorWithOptionsProps {
  sidebarOpen: boolean;
  isProjectPickerOpen: boolean;
  setIsProjectPickerOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  setShowDeleteProjectDialog: (show: boolean) => void;
}

export function ProjectSelectorWithOptions({
  sidebarOpen,
  isProjectPickerOpen,
  setIsProjectPickerOpen,
  setShowDeleteProjectDialog,
}: ProjectSelectorWithOptionsProps) {
  const {
    projects,
    currentProject,
    projectHistory,
    setCurrentProject,
    reorderProjects,
    cyclePrevProject,
    cycleNextProject,
    clearProjectHistory,
  } = useAppStore();

  const shortcuts = useKeyboardShortcutsConfig();
  const {
    projectSearchQuery,
    setProjectSearchQuery,
    selectedProjectIndex,
    projectSearchInputRef,
    scrollContainerRef,
    filteredProjects,
  } = useProjectPicker({
    projects,
    currentProject,
    isProjectPickerOpen,
    setIsProjectPickerOpen,
    setCurrentProject,
  });

  const { sensors, handleDragEnd } = useDragAndDrop({ projects, reorderProjects });

  const {
    globalTheme,
    setTheme,
    setProjectTheme,
    setPreviewTheme,
    handlePreviewEnter,
    handlePreviewLeave,
  } = useProjectTheme();

  if (!sidebarOpen || projects.length === 0) {
    return null;
  }

  return (
    <div className="px-3 mt-3 flex items-center gap-2.5">
      <DropdownMenu open={isProjectPickerOpen} onOpenChange={setIsProjectPickerOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex-1 flex items-center justify-between px-3.5 py-3 rounded-xl',
              // Premium glass background
              'bg-gradient-to-br from-accent/40 to-accent/20',
              'hover:from-accent/50 hover:to-accent/30',
              'border border-border/50 hover:border-border/70',
              // Subtle inner shadow
              'shadow-sm shadow-black/5',
              'text-foreground titlebar-no-drag min-w-0',
              'transition-all duration-200 ease-out',
              isProjectPickerOpen &&
                'from-brand-500/10 to-brand-600/5 border-brand-500/30 ring-2 ring-brand-500/20 shadow-lg shadow-brand-500/5'
            )}
            data-testid="project-selector"
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <Folder className="h-4 w-4 text-brand-500 shrink-0" />
              <span className="text-sm font-medium truncate">
                {currentProject?.name || 'Select Project'}
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
                  'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
                  isProjectPickerOpen && 'rotate-180'
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
          {/* Search input */}
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
                  'w-full h-8 pl-8 pr-3 text-sm rounded-lg',
                  'border border-border bg-background/50',
                  'text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-500/50',
                  'transition-all duration-200'
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
                <div
                  ref={scrollContainerRef}
                  className="space-y-0.5 max-h-64 overflow-y-auto overflow-x-hidden scroll-smooth scrollbar-styled"
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
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Keyboard hint */}
          <div className="px-2 pt-2 mt-1.5 border-t border-border/50">
            <p className="text-[10px] text-muted-foreground text-center tracking-wide">
              <span className="text-foreground/60">↑↓</span> navigate{' '}
              <span className="mx-1 text-foreground/30">|</span>{' '}
              <span className="text-foreground/60">↵</span> select{' '}
              <span className="mx-1 text-foreground/30">|</span>{' '}
              <span className="text-foreground/60">esc</span> close
            </p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Project Options Menu */}
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
                'hidden lg:flex items-center justify-center w-[42px] h-[42px] rounded-lg',
                'text-muted-foreground hover:text-foreground',
                'bg-transparent hover:bg-accent/60',
                'border border-border/50 hover:border-border',
                'transition-all duration-200 ease-out titlebar-no-drag'
              )}
              title="Project options"
              data-testid="project-options-menu"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover/95 backdrop-blur-xl">
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
                className="w-[420px] bg-popover/95 backdrop-blur-xl"
                data-testid="project-theme-menu"
                onPointerLeave={() => {
                  // Clear preview theme when leaving the dropdown
                  setPreviewTheme(null);
                }}
              >
                <DropdownMenuRadioGroup
                  value={currentProject.theme || ''}
                  onValueChange={(value) => {
                    if (currentProject) {
                      setPreviewTheme(null);
                      if (value !== '') {
                        setTheme(value as ThemeMode);
                      } else {
                        setTheme(globalTheme);
                      }
                      setProjectTheme(
                        currentProject.id,
                        value === '' ? null : (value as ThemeMode)
                      );
                    }
                  }}
                >
                  <div
                    onPointerEnter={() => handlePreviewEnter(globalTheme)}
                    onPointerLeave={() => setPreviewTheme(null)}
                  >
                    <DropdownMenuRadioItem
                      value=""
                      data-testid="project-theme-global"
                      className="mx-2"
                    >
                      <Monitor className="w-4 h-4 mr-2" />
                      <span>Use Global</span>
                      <span className="text-[10px] text-muted-foreground ml-1 capitalize">
                        ({globalTheme})
                      </span>
                    </DropdownMenuRadioItem>
                  </div>
                  <DropdownMenuSeparator />
                  {/* Two Column Layout */}
                  <div className="flex gap-2 p-2">
                    {/* Dark Themes Column */}
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        <Moon className="w-3 h-3" />
                        Dark
                      </div>
                      <div className="space-y-0.5">
                        {PROJECT_DARK_THEMES.map((option) => (
                          <ThemeMenuItem
                            key={option.value}
                            option={option}
                            onPreviewEnter={handlePreviewEnter}
                            onPreviewLeave={handlePreviewLeave}
                          />
                        ))}
                      </div>
                    </div>
                    {/* Light Themes Column */}
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        <Sun className="w-3 h-3" />
                        Light
                      </div>
                      <div className="space-y-0.5">
                        {PROJECT_LIGHT_THEMES.map((option) => (
                          <ThemeMenuItem
                            key={option.value}
                            option={option}
                            onPreviewEnter={handlePreviewEnter}
                            onPreviewLeave={handlePreviewLeave}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Project History Section */}
            {projectHistory.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Project History
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={cyclePrevProject} data-testid="cycle-prev-project">
                  <Undo2 className="w-4 h-4 mr-2" />
                  <span className="flex-1">Previous</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-2">
                    {formatShortcut(shortcuts.cyclePrevProject, true)}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={cycleNextProject} data-testid="cycle-next-project">
                  <Redo2 className="w-4 h-4 mr-2" />
                  <span className="flex-1">Next</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-2">
                    {formatShortcut(shortcuts.cycleNextProject, true)}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={clearProjectHistory} data-testid="clear-project-history">
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
  );
}
