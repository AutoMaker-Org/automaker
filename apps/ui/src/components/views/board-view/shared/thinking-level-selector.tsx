import { Label } from '@/components/ui/label';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThinkingLevel } from '@/store/app-store';
import { THINKING_LEVEL_LABELS } from './model-constants';
import { getThinkingLevelsForModel } from '@automaker/types';

interface ThinkingLevelSelectorProps {
  selectedLevel: ThinkingLevel;
  onLevelSelect: (level: ThinkingLevel) => void;
  testIdPrefix?: string;
  /** Model ID is required for correct thinking level filtering.
   *  Without it, adaptive thinking won't be available for Opus 4.6. */
  model?: string;
}

export function ThinkingLevelSelector({
  selectedLevel,
  onLevelSelect,
  testIdPrefix = 'thinking-level',
  model,
}: ThinkingLevelSelectorProps) {
  const levels = getThinkingLevelsForModel(model || '');

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <Label className="flex items-center gap-2 text-sm">
        <Brain className="w-3.5 h-3.5 text-muted-foreground" />
        Thinking Level
      </Label>
      <div className="flex gap-2 flex-wrap">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onLevelSelect(level)}
            className={cn(
              'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors min-w-[60px]',
              selectedLevel === level
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent border-input'
            )}
            data-testid={`${testIdPrefix}-${level}`}
          >
            {THINKING_LEVEL_LABELS[level]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {levels.includes('adaptive')
          ? 'Adaptive thinking lets the model decide how much reasoning to use.'
          : 'Higher levels give more time to reason through complex problems.'}
      </p>
    </div>
  );
}
