import { memo } from 'react';
import { RefreshCw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IssuesListHeaderProps {
  totalCount: number;
  selectedCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onSettingsClick?: () => void;
}

export const IssuesListHeader = memo(function IssuesListHeader({
  totalCount,
  selectedCount,
  refreshing,
  onRefresh,
  onSettingsClick,
}: IssuesListHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Linear Issues</h2>
        <span className="text-sm text-muted-foreground">
          {totalCount} issue{totalCount !== 1 ? 's' : ''}
          {selectedCount > 0 && ` (${selectedCount} selected)`}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {onSettingsClick && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSettingsClick}>
            <Settings className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>
    </div>
  );
});
