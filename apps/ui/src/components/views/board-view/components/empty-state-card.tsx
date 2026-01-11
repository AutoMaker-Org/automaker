import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { formatShortcut } from '@/store/app-store';
import { getEmptyStateConfig, type EmptyStateConfig } from '../constants';
import { Lightbulb, Play, Clock, CheckCircle2, Sparkles, Wand2 } from 'lucide-react';

const ICON_MAP = {
  lightbulb: Lightbulb,
  play: Play,
  clock: Clock,
  check: CheckCircle2,
  sparkles: Sparkles,
} as const;

interface EmptyStateCardProps {
  columnId: string;
  columnTitle?: string;
  /** Keyboard shortcut for adding features (from settings) */
  addFeatureShortcut?: string;
  /** Whether the column is empty due to active filters */
  isFilteredEmpty?: boolean;
  /** Whether we're in read-only mode (hide actions) */
  isReadOnly?: boolean;
  /** Called when user clicks "Use AI Suggestions" */
  onAiSuggest?: () => void;
  /** Card opacity (matches board settings) */
  opacity?: number;
  /** Enable glassmorphism effect */
  glassmorphism?: boolean;
  /** Custom config override for pipeline steps */
  customConfig?: Partial<EmptyStateConfig>;
}

export const EmptyStateCard = memo(function EmptyStateCard({
  columnId,
  addFeatureShortcut,
  isFilteredEmpty = false,
  isReadOnly = false,
  onAiSuggest,
  customConfig,
}: EmptyStateCardProps) {
  // Get base config and merge with custom overrides
  const baseConfig = getEmptyStateConfig(columnId);
  const config: EmptyStateConfig = { ...baseConfig, ...customConfig };

  const IconComponent = ICON_MAP[config.icon];
  const showActions = !isReadOnly && !isFilteredEmpty;
  const showShortcut = columnId === 'backlog' && addFeatureShortcut && showActions;

  // Action button handler
  const handlePrimaryAction = () => {
    if (!config.primaryAction) return;
    if (config.primaryAction.actionType === 'ai-suggest') {
      onAiSuggest?.();
    }
  };

  return (
    <div
      className={cn(
        'w-full h-full min-h-[200px] flex-1',
        'flex flex-col items-center justify-center',
        'text-center px-4',
        'transition-all duration-300 ease-out',
        'animate-in fade-in duration-300',
        'group'
      )}
      data-testid={`empty-state-card-${columnId}`}
    >
      {/* Icon */}
      <div className="mb-3 text-muted-foreground/30">
        <IconComponent className="w-8 h-8" />
      </div>

      {/* Title */}
      <h4 className="font-medium text-sm text-muted-foreground/50 mb-1">
        {isFilteredEmpty ? 'No Matching Items' : config.title}
      </h4>

      {/* Description */}
      <p className="text-xs text-muted-foreground/40 leading-relaxed max-w-[180px]">
        {isFilteredEmpty ? 'No features match your current filters.' : config.description}
      </p>

      {/* Keyboard shortcut hint for backlog */}
      {showShortcut && (
        <div className="flex items-center gap-1.5 mt-3 text-muted-foreground/40">
          <span className="text-xs">Press</span>
          <Kbd className="bg-muted/30 border-0 px-1.5 py-0.5 text-[10px] text-muted-foreground/50">
            {formatShortcut(addFeatureShortcut, true)}
          </Kbd>
          <span className="text-xs">to add</span>
        </div>
      )}

      {/* AI Suggest action for backlog */}
      {showActions && config.primaryAction && config.primaryAction.actionType === 'ai-suggest' && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-4 h-7 text-xs text-muted-foreground/50 hover:text-muted-foreground/70"
          onClick={handlePrimaryAction}
          data-testid={`empty-state-primary-action-${columnId}`}
        >
          <Wand2 className="w-3 h-3 mr-1.5" />
          {config.primaryAction.label}
        </Button>
      )}

      {/* Filtered empty state hint */}
      {isFilteredEmpty && (
        <p className="text-[10px] mt-2 text-muted-foreground/30 italic">
          Clear filters to see all items
        </p>
      )}
    </div>
  );
});
