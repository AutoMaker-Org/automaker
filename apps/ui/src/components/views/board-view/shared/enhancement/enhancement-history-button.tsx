import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import { EnhancementMode, ENHANCEMENT_MODE_LABELS } from './enhancement-constants';

/**
 * Base interface for history entries
 */
export interface BaseHistoryEntry {
  timestamp: string;
  source: 'initial' | 'enhance' | 'edit';
  enhancementMode?: EnhancementMode;
}

interface EnhancementHistoryButtonProps<T extends BaseHistoryEntry> {
  /** Array of history entries */
  history: T[];
  /** Current value to compare against for highlighting */
  currentValue: string;
  /** Callback when a history entry is restored */
  onRestore: (value: string) => void;
  /** Function to extract the text value from a history entry */
  valueAccessor: (entry: T) => string;
  /** Title for the history popover (e.g., "Version History", "Prompt History") */
  title?: string;
  /** Message shown when restoring an entry */
  restoreMessage?: string;
}

/**
 * Reusable history button component for enhancement-related history
 *
 * Displays a popover with a list of historical versions that can be restored.
 * Used in edit-feature-dialog and follow-up-dialog for description/prompt history.
 */
export function EnhancementHistoryButton<T extends BaseHistoryEntry>({
  history,
  currentValue,
  onRestore,
  valueAccessor,
  title = 'Version History',
  restoreMessage = 'Restored from history',
}: EnhancementHistoryButtonProps<T>) {
  const [showHistory, setShowHistory] = useState(false);

  // Memoize reversed history to avoid creating new array on every render
  // NOTE: This hook MUST be called before any early returns to follow Rules of Hooks
  const reversedHistory = useMemo(() => [...history].reverse(), [history]);

  // Early return AFTER all hooks are called
  if (history.length === 0) {
    return null;
  }

  const getSourceLabel = (entry: T): string => {
    if (entry.source === 'initial') {
      return 'Original';
    }
    if (entry.source === 'enhance') {
      const mode = entry.enhancementMode ?? 'improve';
      const label = ENHANCEMENT_MODE_LABELS[mode as EnhancementMode] ?? mode;
      return `Enhanced (${label})`;
    }
    return 'Edited';
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Popover open={showHistory} onOpenChange={setShowHistory}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground"
        >
          <History className="w-3.5 h-3.5" />
          History ({history.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-xs text-muted-foreground mt-1">Click a version to restore it</p>
        </div>
        <div className="max-h-64 overflow-y-auto p-2 space-y-1">
          {reversedHistory.map((entry, index) => {
            const value = valueAccessor(entry);
            const isCurrentVersion = value === currentValue;
            const sourceLabel = getSourceLabel(entry);
            const formattedDate = formatDate(entry.timestamp);

            return (
              <button
                key={`${entry.timestamp}-${index}`}
                onClick={() => {
                  onRestore(value);
                  setShowHistory(false);
                  toast.success(restoreMessage);
                }}
                className={`w-full text-left p-2 rounded-md hover:bg-muted transition-colors ${
                  isCurrentVersion ? 'bg-muted/50 border border-primary/20' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{sourceLabel}</span>
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {value.slice(0, 100)}
                  {value.length > 100 ? '...' : ''}
                </p>
                {isCurrentVersion && (
                  <span className="text-xs text-primary font-medium mt-1 block">
                    Current version
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
