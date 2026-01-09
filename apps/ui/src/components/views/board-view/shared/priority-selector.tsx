import { cn } from '@/lib/utils';

interface PrioritySelectorProps {
  selectedPriority: number;
  onPrioritySelect: (priority: number) => void;
  testIdPrefix?: string;
}

export function PrioritySelector({
  selectedPriority,
  onPrioritySelect,
  testIdPrefix = 'priority',
}: PrioritySelectorProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onPrioritySelect(1)}
        className={cn(
          'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          selectedPriority === 1
            ? 'bg-red-500/20 text-red-500 border-2 border-red-500/50'
            : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted'
        )}
        data-testid={`${testIdPrefix}-high-button`}
      >
        High
      </button>
      <button
        type="button"
        onClick={() => onPrioritySelect(2)}
        className={cn(
          'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          selectedPriority === 2
            ? 'bg-yellow-500/20 text-yellow-500 border-2 border-yellow-500/50'
            : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted'
        )}
        data-testid={`${testIdPrefix}-medium-button`}
      >
        Medium
      </button>
      <button
        type="button"
        onClick={() => onPrioritySelect(3)}
        className={cn(
          'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          selectedPriority === 3
            ? 'bg-blue-500/20 text-blue-500 border-2 border-blue-500/50'
            : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted'
        )}
        data-testid={`${testIdPrefix}-low-button`}
      >
        Low
      </button>
    </div>
  );
}
