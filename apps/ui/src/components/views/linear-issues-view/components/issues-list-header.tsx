import { memo } from 'react';
import { RefreshCw, Settings, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface IssuesListHeaderProps {
  totalCount: number;
  selectedCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onSettingsClick?: () => void;
  autoValidate?: boolean;
  onAutoValidateChange?: (enabled: boolean) => void;
  autoConvert?: boolean;
  onAutoConvertChange?: (enabled: boolean) => void;
}

export const IssuesListHeader = memo(function IssuesListHeader({
  totalCount,
  selectedCount,
  refreshing,
  onRefresh,
  onSettingsClick,
  autoValidate = false,
  onAutoValidateChange,
  autoConvert = false,
  onAutoConvertChange,
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

      <div className="flex items-center gap-3">
        {/* Auto-validate toggle */}
        {onAutoValidateChange && (
          <div className="flex items-center gap-2">
            <Switch
              id="auto-validate"
              checked={autoValidate}
              onCheckedChange={onAutoValidateChange}
              className="h-4 w-8"
            />
            <Label
              htmlFor="auto-validate"
              className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1"
            >
              <Wand2 className="h-3 w-3" />
              Auto-validate
            </Label>
          </div>
        )}

        {/* Auto-convert toggle - only visible when auto-validate is enabled */}
        {autoValidate && onAutoConvertChange && (
          <div className="flex items-center gap-2">
            <Switch
              id="auto-convert"
              checked={autoConvert}
              onCheckedChange={onAutoConvertChange}
              className="h-4 w-8"
            />
            <Label htmlFor="auto-convert" className="text-xs text-muted-foreground cursor-pointer">
              Auto-convert valid
            </Label>
          </div>
        )}

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
    </div>
  );
});
