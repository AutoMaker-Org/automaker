import { Label } from '@/components/ui/label';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReasoningEffort } from '@automaker/types';
import { REASONING_EFFORT_LEVELS, REASONING_EFFORT_LABELS } from './model-constants';

interface ReasoningEffortSelectorProps {
  selectedEffort: ReasoningEffort;
  onEffortSelect: (effort: ReasoningEffort) => void;
  testIdPrefix?: string;
}

export function ReasoningEffortSelector({
  selectedEffort,
  onEffortSelect,
  testIdPrefix = 'reasoning-effort',
}: ReasoningEffortSelectorProps) {
  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <Label className="flex items-center gap-2 text-sm">
        <Brain className="w-3.5 h-3.5 text-muted-foreground" />
        Reasoning Effort
      </Label>
      <div className="flex gap-2 flex-wrap">
        {REASONING_EFFORT_LEVELS.map((effort) => (
          <button
            key={effort}
            type="button"
            onClick={() => onEffortSelect(effort)}
            className={cn(
              'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors min-w-[60px]',
              selectedEffort === effort
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent border-input'
            )}
            data-testid={`${testIdPrefix}-${effort}`}
          >
            {REASONING_EFFORT_LABELS[effort]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Higher efforts give more reasoning tokens for complex problems.
      </p>
    </div>
  );
}
