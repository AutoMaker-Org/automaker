import { CircleDot, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IssuesListHeaderProps {
  openCount: number;
  closedCount: number;
  refreshing: boolean;
  onRefresh: () => void;
}

export function IssuesListHeader({
  openCount,
  closedCount,
  refreshing,
  onRefresh,
}: IssuesListHeaderProps) {
  const totalIssues = openCount + closedCount;

  return (
    <div className="flex items-center justify-between p-4 border-b border-border">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-500/10">
          <CircleDot className="h-5 w-5 text-green-500" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Issues</h1>
          <p className="text-xs text-muted-foreground">
            {totalIssues === 0 ? 'No issues found' : `${openCount} open, ${closedCount} closed`}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
      </Button>
    </div>
  );
}
