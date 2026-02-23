import { useRef, useEffect, useCallback } from 'react';
import { X, Circle, MoreHorizontal, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EditorTab } from '../use-file-editor-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onCloseAll: () => void;
  /** Called when the save button is clicked (mobile only) */
  onSave?: () => void;
  /** Whether there are unsaved changes (controls enabled state of save button) */
  isDirty?: boolean;
  /** Whether to show the save button in the tab bar (intended for mobile) */
  showSaveButton?: boolean;
}

/** Get a file icon color based on extension */
function getFileColor(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  // Files without an extension (no dot, or dotfile with dot at position 0)
  const ext = dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-blue-400';
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'text-yellow-400';
    case 'css':
    case 'scss':
    case 'less':
      return 'text-purple-400';
    case 'html':
    case 'htm':
      return 'text-orange-400';
    case 'json':
      return 'text-yellow-300';
    case 'md':
    case 'mdx':
      return 'text-gray-300';
    case 'py':
      return 'text-green-400';
    case 'rs':
      return 'text-orange-500';
    case 'go':
      return 'text-cyan-400';
    case 'rb':
      return 'text-red-400';
    case 'java':
    case 'kt':
      return 'text-red-500';
    case 'sql':
      return 'text-blue-300';
    case 'yaml':
    case 'yml':
      return 'text-pink-400';
    case 'toml':
      return 'text-gray-400';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'text-green-300';
    default:
      return 'text-muted-foreground';
  }
}

export function EditorTabs({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onCloseAll,
  onSave,
  isDirty,
  showSaveButton,
}: EditorTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  // Scroll the active tab into view when it changes
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [activeTabId]);

  const scrollBy = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = direction === 'left' ? -200 : 200;
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  }, []);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border bg-muted/30" data-testid="editor-tabs">
      {/* Scroll left arrow */}
      <button
        onClick={() => scrollBy('left')}
        className="shrink-0 p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        title="Scroll tabs left"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Scrollable tab area */}
      <div
        ref={scrollRef}
        className="flex items-center overflow-x-auto flex-1 min-w-0 scrollbar-none"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const fileColor = getFileColor(tab.fileName);

          return (
            <div
              key={tab.id}
              ref={isActive ? activeTabRef : undefined}
              className={cn(
                'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer border-r border-border min-w-0 max-w-[200px] shrink-0 text-sm transition-colors',
                isActive
                  ? 'bg-background text-foreground border-b-2 border-b-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              onClick={() => onTabSelect(tab.id)}
              title={tab.filePath}
            >
              {/* Dirty indicator */}
              {tab.isDirty ? (
                <Circle className="w-2 h-2 shrink-0 fill-current text-primary" />
              ) : (
                <span
                  className={cn('w-2 h-2 rounded-full shrink-0', fileColor.replace('text-', 'bg-'))}
                />
              )}

              {/* File name */}
              <span className="truncate">{tab.fileName}</span>

              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                className={cn(
                  'p-0.5 rounded shrink-0 transition-colors',
                  'opacity-0 group-hover:opacity-100',
                  isActive && 'opacity-60',
                  'hover:bg-accent'
                )}
                title="Close"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Scroll right arrow */}
      <button
        onClick={() => scrollBy('right')}
        className="shrink-0 p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        title="Scroll tabs right"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Tab actions: save button (mobile) + close-all dropdown */}
      <div className="shrink-0 flex items-center px-1 gap-0.5 border-l border-border">
        {/* Save button — shown in the tab bar on mobile */}
        {showSaveButton && onSave && (
          <button
            onClick={onSave}
            disabled={!isDirty}
            className={cn(
              'p-1 rounded transition-colors',
              isDirty
                ? 'text-primary hover:text-primary hover:bg-muted/50'
                : 'text-muted-foreground/40 cursor-not-allowed'
            )}
            title="Save file (Ctrl+S)"
            aria-label="Save file"
          >
            <Save className="w-4 h-4" />
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Tab actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onCloseAll} className="gap-2 cursor-pointer">
              <X className="w-4 h-4" />
              <span>Close All</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
