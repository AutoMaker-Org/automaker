import { useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface BoardSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isCreatingSpec: boolean;
  creatingSpecProjectPath?: string;
  currentProjectPath?: string;
}

export function BoardSearchBar({
  searchQuery,
  onSearchChange,
  isCreatingSpec,
  creatingSpecProjectPath,
  currentProjectPath,
}: BoardSearchBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when "/" is pressed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only focus if not typing in an input/textarea
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative max-w-md flex-1 flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Search features by keyword..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-12 border-border"
          data-testid="kanban-search-input"
        />
        {searchQuery ? (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            data-testid="kanban-search-clear"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <span
            className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-brand-500/10 border border-brand-500/30 text-brand-400/70"
            data-testid="kanban-search-hotkey"
          >
            /
          </span>
        )}
      </div>
      {/* Spec Creation Loading Badge */}
      {isCreatingSpec && currentProjectPath === creatingSpecProjectPath && (
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-brand-500/10 border border-brand-500/20 shrink-0"
          title="Creating App Specification"
          data-testid="spec-creation-badge"
        >
          <Spinner size="xs" className="shrink-0" />
          <span className="text-xs font-medium text-brand-500 whitespace-nowrap">
            Creating spec
          </span>
        </div>
      )}
    </div>
  );
}
