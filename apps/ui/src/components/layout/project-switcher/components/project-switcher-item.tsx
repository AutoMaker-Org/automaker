import { Folder, LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { cn, sanitizeForTestId } from '@/lib/utils';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import type { Project } from '@/lib/electron';

interface ProjectSwitcherItemProps {
  project: Project;
  isActive: boolean;
  hotkeyIndex?: number; // 0-9 for hotkeys 1-9, 0
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

export function ProjectSwitcherItem({
  project,
  isActive,
  hotkeyIndex,
  onClick,
  onContextMenu,
}: ProjectSwitcherItemProps) {
  // Convert index to hotkey label: 0 -> "1", 1 -> "2", ..., 8 -> "9", 9 -> "0"
  const hotkeyLabel =
    hotkeyIndex !== undefined && hotkeyIndex >= 0 && hotkeyIndex <= 9
      ? hotkeyIndex === 9
        ? '0'
        : String(hotkeyIndex + 1)
      : undefined;
  // Get the icon component from lucide-react
  const getIconComponent = (): LucideIcon => {
    if (project.icon && project.icon in LucideIcons) {
      return (LucideIcons as unknown as Record<string, LucideIcon>)[project.icon];
    }
    return Folder;
  };

  const IconComponent = getIconComponent();
  const hasCustomIcon = !!project.customIconPath;

  // Combine project.id with sanitized name for uniqueness and readability
  // Format: project-switcher-{id}-{sanitizedName}
  const testId = `project-switcher-${project.id}-${sanitizeForTestId(project.name)}`;

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      data-testid={testId}
      className={cn(
        'group w-full aspect-square rounded-xl flex items-center justify-center relative overflow-hidden',
        'transition-all duration-200 ease-out',
        isActive
          ? [
              // Active: Premium gradient with glow
              'bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10',
              'border border-brand-500/30',
              'shadow-md shadow-brand-500/10',
            ]
          : [
              // Inactive: Subtle hover state
              'hover:bg-accent/50',
              'border border-transparent hover:border-border/40',
              'hover:shadow-sm',
            ],
        'hover:scale-105 active:scale-95'
      )}
      title={project.name}
    >
      {hasCustomIcon ? (
        <img
          src={getAuthenticatedImageUrl(project.customIconPath!, project.path)}
          alt={project.name}
          className={cn(
            'w-8 h-8 rounded-lg object-cover transition-all duration-200',
            isActive ? 'ring-1 ring-brand-500/50' : 'group-hover:scale-110'
          )}
        />
      ) : (
        <IconComponent
          className={cn(
            'w-6 h-6 transition-all duration-200',
            isActive
              ? 'text-brand-500 drop-shadow-sm'
              : 'text-muted-foreground group-hover:text-brand-400 group-hover:scale-110'
          )}
        />
      )}

      {/* Tooltip on hover */}
      <span
        className={cn(
          'absolute left-full ml-3 px-2.5 py-1.5 rounded-lg',
          'bg-popover text-popover-foreground text-xs font-medium',
          'border border-border shadow-lg',
          'opacity-0 group-hover:opacity-100',
          'transition-all duration-200 whitespace-nowrap z-50',
          'translate-x-1 group-hover:translate-x-0 pointer-events-none'
        )}
      >
        {project.name}
      </span>

      {/* Hotkey badge */}
      {hotkeyLabel && (
        <span
          className={cn(
            'absolute bottom-0.5 right-0.5 min-w-[16px] h-4 px-1',
            'flex items-center justify-center',
            'text-[10px] font-medium rounded',
            'bg-muted/80 text-muted-foreground',
            'border border-border/50',
            'pointer-events-none'
          )}
        >
          {hotkeyLabel}
        </span>
      )}
    </button>
  );
}
