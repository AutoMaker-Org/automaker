import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PrioritySelectProps {
  selectedPriority: number;
  onPrioritySelect: (priority: number) => void;
  testIdPrefix?: string;
  className?: string;
  disabled?: boolean;
}

const priorities = [
  {
    value: 1,
    label: 'High',
    description: 'Urgent, needs immediate attention',
    icon: ChevronUp,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    value: 2,
    label: 'Medium',
    description: 'Normal priority, standard workflow',
    icon: AlertCircle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  {
    value: 3,
    label: 'Low',
    description: 'Can wait, not time-sensitive',
    icon: ChevronDown,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
];

/**
 * PrioritySelect - Compact dropdown selector for feature priority
 *
 * A lightweight alternative to PrioritySelector for contexts where
 * space is limited (e.g., mass edit, bulk operations).
 *
 * Shows icon + priority level in dropdown, with description below.
 *
 * @example
 * ```tsx
 * <PrioritySelect
 *   selectedPriority={priority}
 *   onPrioritySelect={setPriority}
 *   testIdPrefix="mass-edit-priority"
 * />
 * ```
 */
export function PrioritySelect({
  selectedPriority,
  onPrioritySelect,
  testIdPrefix = 'priority',
  className,
  disabled = false,
}: PrioritySelectProps) {
  const selectedPriorityObj = priorities.find((p) => p.value === selectedPriority);

  return (
    <div className={cn('space-y-2', className)}>
      <Select
        value={selectedPriority.toString()}
        onValueChange={(value: string) => onPrioritySelect(parseInt(value, 10))}
        disabled={disabled}
      >
        <SelectTrigger className="h-9" data-testid={`${testIdPrefix}-select-trigger`}>
          <SelectValue>
            {selectedPriorityObj && (
              <div className="flex items-center gap-2">
                <selectedPriorityObj.icon className={cn('h-4 w-4', selectedPriorityObj.color)} />
                <span>{selectedPriorityObj.label}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {priorities.map((p) => {
            const Icon = p.icon;
            return (
              <SelectItem
                key={p.value}
                value={p.value.toString()}
                data-testid={`${testIdPrefix}-option-${p.label.toLowerCase()}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-3.5 w-3.5', p.color)} />
                  <span>{p.label}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {selectedPriorityObj && (
        <p className="text-xs text-muted-foreground">{selectedPriorityObj.description}</p>
      )}
    </div>
  );
}
