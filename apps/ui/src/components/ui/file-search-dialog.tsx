import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  FileText,
  FileCode,
  FileJson,
  FileType,
  Image,
  Cog,
  Package,
  FileTerminal,
  File,
  Loader2,
  FileSearch,
  Text,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import type { FileSearchResultItem, ContentSearchResultItem } from '@/lib/electron';

type SearchMode = 'files' | 'content';

interface FileSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootPath: string;
  onFileSelect: (filePath: string) => void;
}

function getFileIcon(name: string) {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  const baseName = name.toLowerCase();

  if (
    baseName.startsWith('.') ||
    baseName === 'tsconfig.json' ||
    baseName.endsWith('.config.ts') ||
    baseName.endsWith('.config.js')
  )
    return Cog;
  if (baseName === 'package.json' || baseName === 'package-lock.json') return Package;

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
    case 'py':
    case 'rs':
    case 'go':
    case 'rb':
    case 'java':
    case 'cpp':
    case 'c':
    case 'h':
    case 'hpp':
    case 'cs':
    case 'php':
    case 'swift':
    case 'html':
    case 'htm':
    case 'xml':
      return FileCode;
    case 'md':
    case 'mdx':
    case 'txt':
      return FileText;
    case 'json':
    case 'jsonc':
      return FileJson;
    case 'css':
    case 'scss':
    case 'less':
      return FileType;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return Image;
    case 'sh':
    case 'bash':
    case 'zsh':
      return FileTerminal;
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'ini':
    case 'env':
      return Cog;
    default:
      return File;
  }
}

function getFileIconColor(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-blue-400';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'text-yellow-400';
    case 'json':
    case 'jsonc':
      return 'text-yellow-500';
    case 'css':
    case 'scss':
    case 'less':
      return 'text-purple-400';
    case 'html':
    case 'htm':
      return 'text-orange-400';
    case 'md':
    case 'mdx':
      return 'text-sky-400';
    case 'py':
      return 'text-green-400';
    case 'rs':
      return 'text-orange-500';
    case 'go':
      return 'text-cyan-400';
    default:
      return 'text-muted-foreground';
  }
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function FileSearchDialog({
  open,
  onOpenChange,
  rootPath,
  onFileSelect,
}: FileSearchDialogProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('files');
  const [fileResults, setFileResults] = useState<FileSearchResultItem[]>([]);
  const [contentResults, setContentResults] = useState<ContentSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setFileResults([]);
      setContentResults([]);
      setSelectedIndex(0);
      setMode('files');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Perform search with debounce
  const performSearch = useCallback(
    async (searchQuery: string, searchMode: SearchMode) => {
      if (!searchQuery.trim() || !rootPath) {
        setFileResults([]);
        setContentResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const api = getElectronAPI();
        if (searchMode === 'files') {
          const result = await api.searchFiles(rootPath, searchQuery.trim(), undefined, 50);
          if (result.success) {
            setFileResults(result.results);
          }
        } else {
          const result = await api.searchContent(rootPath, searchQuery.trim(), { limit: 30 });
          if (result.success) {
            setContentResults(result.results);
          }
        }
      } catch {
        // Silently handle errors
      } finally {
        setIsSearching(false);
      }
    },
    [rootPath]
  );

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setFileResults([]);
      setContentResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(
      () => {
        performSearch(query, mode);
      },
      mode === 'files' ? 150 : 300
    );

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode, performSearch]);

  // Current results for keyboard navigation
  const totalResults = mode === 'files' ? fileResults.length : contentResults.length;

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (filePath: string) => {
      onFileSelect(filePath);
      onOpenChange(false);
    },
    [onFileSelect, onOpenChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, totalResults - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (mode === 'files' && fileResults[selectedIndex]) {
          handleSelect(fileResults[selectedIndex].path);
        } else if (mode === 'content' && contentResults[selectedIndex]) {
          handleSelect(contentResults[selectedIndex].path);
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setMode((prev) => (prev === 'files' ? 'content' : 'files'));
        setSelectedIndex(0);
      }
    },
    [totalResults, selectedIndex, fileResults, contentResults, mode, handleSelect]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>File Search</DialogTitle>
        <DialogDescription>Search for files and content in the project</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[600px] gap-0" showCloseButton={false}>
        {/* Mode Tabs */}
        <div className="flex items-center border-b border-border bg-muted/30">
          <button
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm transition-colors border-b-2',
              mode === 'files'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => {
              setMode('files');
              setSelectedIndex(0);
            }}
            data-testid="search-mode-files"
          >
            <FileSearch className="h-3.5 w-3.5" />
            Files
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm transition-colors border-b-2',
              mode === 'content'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => {
              setMode('content');
              setSelectedIndex(0);
            }}
            data-testid="search-mode-content"
          >
            <Text className="h-3.5 w-3.5" />
            Content
          </button>
          <div className="ml-auto pr-3 text-[10px] text-muted-foreground/50">Tab to switch</div>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2 border-b border-border px-3 h-12">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'files' ? 'Search files by name...' : 'Search file content...'}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            data-testid="file-search-input"
          />
          {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[400px] overflow-y-auto scroll-py-1"
          data-testid="file-search-results"
        >
          {!query.trim() ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {mode === 'files' ? 'Type to search for files...' : 'Type to search file content...'}
            </div>
          ) : isSearching && totalResults === 0 ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : totalResults === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No results found</div>
          ) : mode === 'files' ? (
            <div className="p-1">
              {fileResults.map((result, idx) => {
                const Icon = getFileIcon(result.name);
                const iconColor = getFileIconColor(result.name);
                return (
                  <button
                    key={result.path}
                    data-index={idx}
                    className={cn(
                      'flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-left text-sm transition-colors',
                      idx === selectedIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50'
                    )}
                    onClick={() => handleSelect(result.path)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    data-testid={`search-result-${result.name}`}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate font-medium">
                        {highlightMatch(result.name, query)}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {highlightMatch(result.relativePath, query)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-1">
              {contentResults.map((result, idx) => {
                const Icon = getFileIcon(result.name);
                const iconColor = getFileIconColor(result.name);
                return (
                  <button
                    key={result.path}
                    data-index={idx}
                    className={cn(
                      'flex flex-col w-full px-2 py-2 rounded-sm text-left text-sm transition-colors gap-1',
                      idx === selectedIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50'
                    )}
                    onClick={() => handleSelect(result.path)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    data-testid={`content-result-${result.name}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
                      <span className="truncate font-medium">{result.name}</span>
                      <span className="truncate text-xs text-muted-foreground ml-auto">
                        {result.relativePath}
                      </span>
                    </div>
                    {result.matches.slice(0, 3).map((match, mIdx) => (
                      <div key={mIdx} className="flex items-start gap-2 pl-6 text-xs">
                        <span className="shrink-0 text-muted-foreground font-mono w-8 text-right">
                          {match.line}
                        </span>
                        <span className="truncate text-muted-foreground font-mono">
                          {highlightMatch(match.content, query)}
                        </span>
                      </div>
                    ))}
                    {result.matches.length > 3 && (
                      <span className="text-[10px] text-muted-foreground/60 pl-6">
                        +{result.matches.length - 3} more matches
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 bg-muted/20 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-muted font-mono">&uarr;&darr;</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-muted font-mono">Enter</kbd> Open
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-muted font-mono">Tab</kbd> Switch mode
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-muted font-mono">Esc</kbd> Close
            </span>
          </div>
          {totalResults > 0 && (
            <span>
              {totalResults} result{totalResults !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
