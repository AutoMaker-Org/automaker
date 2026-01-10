import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Plus,
  Sparkles,
  Play,
  Square,
  FileText,
  FolderOpen,
  Terminal,
  Bot,
  Settings,
  Github,
  BookOpen,
  Wand2,
  Search,
  LayoutGrid,
} from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { currentProject, getAutoModeState, setAutoModeRunning } = useAppStore();

  const autoModeState = currentProject ? getAutoModeState(currentProject.id) : null;
  const isAutoModeRunning = autoModeState?.isRunning ?? false;

  const runCommand = useCallback(
    (command: () => void) => {
      onOpenChange(false);
      command();
    },
    [onOpenChange]
  );

  const handleNavigate = useCallback(
    (path: string) => {
      runCommand(() => navigate({ to: path }));
    },
    [navigate, runCommand]
  );

  const handleToggleAutoMode = useCallback(() => {
    if (currentProject) {
      runCommand(() => setAutoModeRunning(currentProject.id, !isAutoModeRunning));
    }
  }, [currentProject, isAutoModeRunning, setAutoModeRunning, runCommand]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search commands..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {currentProject && (
          <>
            <CommandGroup heading="Quick Actions">
              <CommandItem onSelect={() => handleNavigate('/board')}>
                <Plus className="mr-2 h-4 w-4" />
                <span>Add Feature</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/ideation')}>
                <Sparkles className="mr-2 h-4 w-4" />
                <span>Generate Ideas</span>
              </CommandItem>
              <CommandItem onSelect={handleToggleAutoMode}>
                {isAutoModeRunning ? (
                  <>
                    <Square className="mr-2 h-4 w-4" />
                    <span>Stop Auto Mode</span>
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    <span>Start Auto Mode</span>
                  </>
                )}
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Navigation">
              <CommandItem onSelect={() => handleNavigate('/board')}>
                <LayoutGrid className="mr-2 h-4 w-4" />
                <span>Kanban Board</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/running-agents')}>
                <Bot className="mr-2 h-4 w-4" />
                <span>Running Agents</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/terminal')}>
                <Terminal className="mr-2 h-4 w-4" />
                <span>Terminal</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Project">
              <CommandItem onSelect={() => handleNavigate('/spec')}>
                <FileText className="mr-2 h-4 w-4" />
                <span>App Specification</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/context')}>
                <FolderOpen className="mr-2 h-4 w-4" />
                <span>Context Files</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/github-issues')}>
                <Github className="mr-2 h-4 w-4" />
                <span>GitHub Issues</span>
              </CommandItem>
              <CommandItem onSelect={() => handleNavigate('/github-prs')}>
                <Github className="mr-2 h-4 w-4" />
                <span>Pull Requests</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => handleNavigate('/profiles')}>
            <Wand2 className="mr-2 h-4 w-4" />
            <span>AI Profiles</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate('/wiki')}>
            <BookOpen className="mr-2 h-4 w-4" />
            <span>Documentation</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Projects">
          <CommandItem onSelect={() => handleNavigate('/dashboard')}>
            <Search className="mr-2 h-4 w-4" />
            <span>All Projects</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
