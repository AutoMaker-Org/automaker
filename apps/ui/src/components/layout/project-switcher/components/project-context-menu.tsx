import { useEffect, useRef, useState, memo, useCallback, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Edit2, Trash2, Palette, ChevronRight, Moon, Sun, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type ThemeMode, useAppStore } from '@/store/app-store';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { Project } from '@/lib/electron';
import {
  PROJECT_DARK_THEMES,
  PROJECT_LIGHT_THEMES,
  THEME_SUBMENU_CONSTANTS,
} from '@/components/layout/sidebar/constants';
import { useThemePreview } from '@/components/layout/sidebar/hooks';

/**
 * Constant representing the "use global theme" option.
 * An empty string is used to indicate that no project-specific theme is set.
 */
const USE_GLOBAL_THEME = '' as const;

/**
 * Z-index values for context menu layering.
 * Ensures proper stacking order when menus overlap.
 */
const Z_INDEX = {
  /** Base z-index for the main context menu */
  CONTEXT_MENU: 100,
  /** Higher z-index for theme submenu to appear above parent menu */
  THEME_SUBMENU: 101,
} as const;

/**
 * Represents a selectable theme option in the theme submenu.
 * Uses ThemeMode from app-store for type safety.
 */
interface ThemeOption {
  /** The theme mode value (e.g., 'dark', 'light', 'dracula') */
  value: ThemeMode;
  /** Display label for the theme option */
  label: string;
  /** Lucide icon component to display alongside the label */
  icon: LucideIcon;
  /** CSS color value for the icon */
  color: string;
}

/**
 * Props for the ThemeButton component.
 * Defines the interface for rendering individual theme selection buttons.
 */
interface ThemeButtonProps {
  /** The theme option data to display */
  option: ThemeOption;
  /** Whether this theme is currently selected */
  isSelected: boolean;
  /** Handler for pointer enter events (used for preview) */
  onPointerEnter: () => void;
  /** Handler for pointer leave events (used to clear preview) */
  onPointerLeave: (e: React.PointerEvent) => void;
  /** Handler for click events (used to select theme) */
  onClick: () => void;
}

/**
 * A reusable button component for individual theme options.
 * Implements hover preview and selection functionality.
 * Memoized to prevent unnecessary re-renders when parent state changes.
 */
const ThemeButton = memo(function ThemeButton({
  option,
  isSelected,
  onPointerEnter,
  onPointerLeave,
  onClick,
}: ThemeButtonProps) {
  const Icon = option.icon;
  return (
    <button
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md',
        'text-xs text-left',
        'hover:bg-accent transition-colors',
        'focus:outline-none focus:bg-accent',
        isSelected && 'bg-accent'
      )}
      data-testid={`project-theme-${option.value}`}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: option.color }} />
      <span>{option.label}</span>
    </button>
  );
});

/**
 * Props for the ThemeColumn component.
 * Defines the interface for rendering a column of related theme options (e.g., dark or light themes).
 */
interface ThemeColumnProps {
  /** Column header title (e.g., "Dark", "Light") */
  title: string;
  /** Icon to display in the column header */
  icon: LucideIcon;
  /** Array of theme options to display in this column */
  themes: ThemeOption[];
  /** Currently selected theme value, or null if using global theme */
  selectedTheme: ThemeMode | null;
  /** Handler called when user hovers over a theme option for preview */
  onPreviewEnter: (value: ThemeMode) => void;
  /** Handler called when user stops hovering over a theme option */
  onPreviewLeave: (e: React.PointerEvent) => void;
  /** Handler called when user clicks to select a theme */
  onSelect: (value: ThemeMode) => void;
}

/**
 * A reusable column component for displaying themed options.
 * Renders a group of related themes (e.g., all dark themes or all light themes)
 * with a header and scrollable list of ThemeButton components.
 * Memoized to prevent unnecessary re-renders.
 */
const ThemeColumn = memo(function ThemeColumn({
  title,
  icon: Icon,
  themes,
  selectedTheme,
  onPreviewEnter,
  onPreviewLeave,
  onSelect,
}: ThemeColumnProps) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="w-3 h-3" />
        {title}
      </div>
      <div className="space-y-0.5">
        {themes.map((option) => (
          <ThemeButton
            key={option.value}
            option={option}
            isSelected={selectedTheme === option.value}
            onPointerEnter={() => onPreviewEnter(option.value)}
            onPointerLeave={onPreviewLeave}
            onClick={() => onSelect(option.value)}
          />
        ))}
      </div>
    </div>
  );
});

/**
 * Props for the ProjectContextMenu component.
 * Defines the interface for the project right-click context menu.
 */
interface ProjectContextMenuProps {
  /** The project this context menu is for */
  project: Project;
  /** Screen coordinates where the context menu should appear */
  position: { x: number; y: number };
  /** Callback to close the context menu */
  onClose: () => void;
  /** Callback when user selects "Edit Name & Icon" option */
  onEdit: (project: Project) => void;
}

/**
 * A context menu component for project-specific actions.
 *
 * Provides options for:
 * - Editing project name and icon
 * - Setting project-specific theme (with live preview on hover)
 * - Removing project from the workspace
 *
 * Features viewport-aware positioning for the theme submenu to prevent
 * overflow, and implements delayed hover handling to improve UX when
 * navigating between the trigger button and submenu.
 *
 * @param props - Component props
 * @returns The rendered context menu or null if not visible
 */
export function ProjectContextMenu({
  project,
  position,
  onClose,
  onEdit,
}: ProjectContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    moveProjectToTrash,
    theme: globalTheme,
    setTheme,
    setProjectTheme,
    setPreviewTheme,
  } = useAppStore();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);
  const [removeConfirmed, setRemoveConfirmed] = useState(false);
  const themeSubmenuRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { handlePreviewEnter, handlePreviewLeave } = useThemePreview({ setPreviewTheme });

  // Handler to open theme submenu and cancel any pending close
  const handleThemeMenuEnter = useCallback(() => {
    // Cancel any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setShowThemeSubmenu(true);
  }, []);

  // Handler to close theme submenu with a small delay
  // This prevents the submenu from closing when mouse crosses the gap between trigger and submenu
  const handleThemeMenuLeave = useCallback(() => {
    // Add a small delay before closing to allow mouse to reach submenu
    closeTimeoutRef.current = setTimeout(() => {
      setShowThemeSubmenu(false);
      setPreviewTheme(null);
    }, 100); // 100ms delay is enough to cross the gap
  }, [setPreviewTheme]);

  /**
   * Calculates theme submenu position to prevent viewport overflow.
   *
   * This memoized calculation determines the optimal vertical position and maximum
   * height for the theme submenu based on the current viewport dimensions and
   * the trigger button's position.
   *
   * @returns Object containing:
   *   - top: Vertical offset from default position (negative values shift submenu up)
   *   - maxHeight: Maximum height constraint to prevent overflow with scrolling
   */
  const submenuPosition = useMemo(() => {
    const { ESTIMATED_SUBMENU_HEIGHT, COLLISION_PADDING, THEME_BUTTON_OFFSET } =
      THEME_SUBMENU_CONSTANTS;

    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Calculate where the submenu's bottom edge would be if positioned normally
    const submenuBottomY = position.y + THEME_BUTTON_OFFSET + ESTIMATED_SUBMENU_HEIGHT;

    // Check if submenu would overflow bottom of viewport
    const wouldOverflowBottom = submenuBottomY > viewportHeight - COLLISION_PADDING;

    // If it would overflow, calculate how much to shift it up
    if (wouldOverflowBottom) {
      // Calculate the offset needed to align submenu bottom with viewport bottom minus padding
      const overflowAmount = submenuBottomY - (viewportHeight - COLLISION_PADDING);
      return {
        top: -overflowAmount,
        maxHeight: Math.min(ESTIMATED_SUBMENU_HEIGHT, viewportHeight - COLLISION_PADDING * 2),
      };
    }

    // Default: submenu opens at top of parent (aligned with the theme button)
    return {
      top: 0,
      maxHeight: Math.min(
        ESTIMATED_SUBMENU_HEIGHT,
        viewportHeight - position.y - THEME_BUTTON_OFFSET - COLLISION_PADDING
      ),
    };
  }, [position.y]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      // Don't close if a confirmation dialog is open (dialog is in a portal)
      if (showRemoveDialog) return;

      if (menuRef.current && !menuRef.current.contains(event.target as globalThis.Node)) {
        setPreviewTheme(null);
        onClose();
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      // Don't close if a confirmation dialog is open (let the dialog handle escape)
      if (showRemoveDialog) return;

      if (event.key === 'Escape') {
        setPreviewTheme(null);
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, setPreviewTheme, showRemoveDialog]);

  const handleEdit = () => {
    onEdit(project);
  };

  const handleRemove = () => {
    setShowRemoveDialog(true);
  };

  const handleThemeSelect = useCallback(
    (value: ThemeMode | typeof USE_GLOBAL_THEME) => {
      setPreviewTheme(null);
      const isUsingGlobal = value === USE_GLOBAL_THEME;
      setTheme(isUsingGlobal ? globalTheme : value);
      setProjectTheme(project.id, isUsingGlobal ? null : value);
      setShowThemeSubmenu(false);
    },
    [globalTheme, project.id, setPreviewTheme, setProjectTheme, setTheme]
  );

  const handleConfirmRemove = useCallback(() => {
    moveProjectToTrash(project.id);
    toast.success('Project removed', {
      description: `${project.name} has been removed from your projects list`,
    });
    setRemoveConfirmed(true);
  }, [moveProjectToTrash, project.id, project.name]);

  const handleDialogClose = useCallback(
    (isOpen: boolean) => {
      setShowRemoveDialog(isOpen);
      // Close the context menu when dialog closes (whether confirmed or cancelled)
      // This prevents the context menu from reappearing after dialog interaction
      if (!isOpen) {
        // Reset confirmation state
        setRemoveConfirmed(false);
        // Always close the context menu when dialog closes
        onClose();
      }
    },
    [onClose]
  );

  return (
    <>
      {/* Hide context menu when confirm dialog is open */}
      {!showRemoveDialog && (
        <div
          ref={menuRef}
          className={cn(
            'fixed min-w-48 rounded-lg',
            'bg-popover text-popover-foreground',
            'border border-border shadow-lg',
            'animate-in fade-in zoom-in-95 duration-100'
          )}
          style={{
            top: position.y,
            left: position.x,
            zIndex: Z_INDEX.CONTEXT_MENU,
          }}
          data-testid="project-context-menu"
        >
          <div className="p-1">
            <button
              onClick={handleEdit}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md',
                'text-sm font-medium text-left',
                'hover:bg-accent transition-colors',
                'focus:outline-none focus:bg-accent'
              )}
              data-testid="edit-project-button"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit Name & Icon</span>
            </button>

            {/* Theme Submenu Trigger */}
            <div
              className="relative"
              onMouseEnter={handleThemeMenuEnter}
              onMouseLeave={handleThemeMenuLeave}
            >
              <button
                onClick={() => setShowThemeSubmenu(!showThemeSubmenu)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md',
                  'text-sm font-medium text-left',
                  'hover:bg-accent transition-colors',
                  'focus:outline-none focus:bg-accent'
                )}
                data-testid="theme-project-button"
              >
                <Palette className="w-4 h-4" />
                <span className="flex-1">Project Theme</span>
                {project.theme && (
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {project.theme}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>

              {/* Theme Submenu */}
              {showThemeSubmenu && (
                <div
                  ref={themeSubmenuRef}
                  className={cn(
                    'absolute left-full ml-1 min-w-[420px] rounded-lg',
                    'bg-popover text-popover-foreground',
                    'border border-border shadow-lg',
                    'animate-in fade-in zoom-in-95 duration-100'
                  )}
                  style={{
                    zIndex: Z_INDEX.THEME_SUBMENU,
                    top: `${submenuPosition.top}px`,
                  }}
                  data-testid="project-theme-submenu"
                  onMouseEnter={handleThemeMenuEnter}
                  onMouseLeave={handleThemeMenuLeave}
                >
                  <div className="p-2">
                    {/* Use Global Option */}
                    <button
                      onPointerEnter={() => handlePreviewEnter(globalTheme)}
                      onPointerLeave={handlePreviewLeave}
                      onClick={() => handleThemeSelect(USE_GLOBAL_THEME)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md',
                        'text-sm font-medium text-left',
                        'hover:bg-accent transition-colors',
                        'focus:outline-none focus:bg-accent',
                        !project.theme && 'bg-accent'
                      )}
                      data-testid="project-theme-global"
                    >
                      <Monitor className="w-4 h-4" />
                      <span>Use Global</span>
                      <span className="text-[10px] text-muted-foreground ml-1 capitalize">
                        ({globalTheme})
                      </span>
                    </button>

                    <div className="h-px bg-border my-2" />

                    {/* Two Column Layout - Using reusable ThemeColumn component */}
                    {/* Dynamic max height with scroll for viewport overflow handling */}
                    <div
                      className="flex gap-2 overflow-y-auto scrollbar-styled"
                      style={{
                        maxHeight: `${Math.max(0, submenuPosition.maxHeight - THEME_SUBMENU_CONSTANTS.SUBMENU_HEADER_HEIGHT)}px`,
                      }}
                    >
                      <ThemeColumn
                        title="Dark"
                        icon={Moon}
                        themes={PROJECT_DARK_THEMES as ThemeOption[]}
                        selectedTheme={project.theme as ThemeMode | null}
                        onPreviewEnter={handlePreviewEnter}
                        onPreviewLeave={handlePreviewLeave}
                        onSelect={handleThemeSelect}
                      />
                      <ThemeColumn
                        title="Light"
                        icon={Sun}
                        themes={PROJECT_LIGHT_THEMES as ThemeOption[]}
                        selectedTheme={project.theme as ThemeMode | null}
                        onPreviewEnter={handlePreviewEnter}
                        onPreviewLeave={handlePreviewLeave}
                        onSelect={handleThemeSelect}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleRemove}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md',
                'text-sm font-medium text-left',
                'text-destructive hover:bg-destructive/10',
                'transition-colors',
                'focus:outline-none focus:bg-destructive/10'
              )}
              data-testid="remove-project-button"
            >
              <Trash2 className="w-4 h-4" />
              <span>Remove Project</span>
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showRemoveDialog}
        onOpenChange={handleDialogClose}
        onConfirm={handleConfirmRemove}
        title="Remove Project"
        description={`Are you sure you want to remove "${project.name}" from the project list? This won't delete any files on disk.`}
        icon={Trash2}
        iconClassName="text-destructive"
        confirmText="Remove"
        confirmVariant="destructive"
      />
    </>
  );
}
