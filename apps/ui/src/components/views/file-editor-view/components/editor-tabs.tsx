import { X, Circle, MoreHorizontal, Save } from 'lucide-react';
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
  if (tabs.length === 0) return null;

  return (
    <div
      className="flex items-center border-b border-border bg-muted/30 overflow-x-auto"
      data-testid="editor-tabs"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const fileColor = getFileColor(tab.fileName);

        return (
          <div
            key={tab.id}
            className={cn(
              'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer border-r border-border min-w-0 max-w-[200px] text-sm transition-colors',
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
              <span className={cn('w-2 h-2 rounded-full shrink-0', fileColor)} />
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

      {/* Tab actions: save button (mobile) + close-all dropdown */}
      <div className="ml-auto shrink-0 flex items-center px-1 gap-0.5">
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
