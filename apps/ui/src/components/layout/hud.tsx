import { ChevronDown, Command, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HudProps {
  onOpenProjectPicker: () => void;
  onOpenFolder: () => void;
}

export function Hud({ onOpenProjectPicker, onOpenFolder }: HudProps) {
  const { currentProject, projects, setCurrentProject } = useAppStore();

  if (!currentProject) return null;

  return (
    <div className="fixed top-4 left-4 z-50 flex items-center gap-3">
      {/* Project Pill */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div
            className={cn(
              'group flex items-center gap-3 px-4 py-2 rounded-full cursor-pointer',
              'bg-white/5 backdrop-blur-md border border-white/10',
              'hover:bg-white/10 transition-colors'
            )}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)] animate-pulse" />
            <span className="font-mono text-sm font-medium tracking-tight">
              {currentProject.name}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 glass border-white/10" align="start">
          <DropdownMenuLabel>Switch Project</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.slice(0, 5).map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => setCurrentProject(p)}
              className="font-mono text-xs"
            >
              {p.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenProjectPicker}>
            <Command className="mr-2 w-3 h-3" />
            All Projects...
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenFolder}>
            <Folder className="mr-2 w-3 h-3" />
            Open Local Folder...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dynamic Status / Breadcrumbs could go here */}
    </div>
  );
}
