import { CircleDot, RefreshCw, Zap, Import } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface IssuesListHeaderProps {
  openCount: number;
  closedCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  autoValidate: boolean;
  onAutoValidateChange: (enabled: boolean) => void;
  onImportClick: () => void;
}

export function IssuesListHeader({
  openCount,
  closedCount,
  refreshing,
  onRefresh,
  autoValidate,
  onAutoValidateChange,
  onImportClick,
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
      <div className="flex items-center gap-3">
        {/* Auto-validate toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <Zap
                  className={cn(
                    'h-4 w-4',
                    autoValidate ? 'text-yellow-500' : 'text-muted-foreground'
                  )}
                />
                <Switch
                  checked={autoValidate}
                  onCheckedChange={onAutoValidateChange}
                  aria-label="Auto-validate issues"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Auto-validate: {autoValidate ? 'ON' : 'OFF'}</p>
              <p className="text-xs text-muted-foreground">
                {autoValidate
                  ? 'Issues are validated automatically when loaded'
                  : 'Click validate button for each issue'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Import button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onImportClick}>
                <Import className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Import issues as tasks</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Refresh button */}
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>
    </div>
  );
}
