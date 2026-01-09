import { Zap, ClipboardList, FileText, ScrollText } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PlanningMode } from '@automaker/types';

interface PlanningModeSelectProps {
  mode: PlanningMode;
  onModeChange: (mode: PlanningMode) => void;
  requireApproval?: boolean;
  onRequireApprovalChange?: (require: boolean) => void;
  testIdPrefix?: string;
  className?: string;
  disabled?: boolean;
  /** If true, only renders the dropdown without description or checkbox */
  compact?: boolean;
}

const modes = [
  {
    value: 'skip' as const,
    label: 'Skip',
    description: 'Direct implementation, no upfront planning',
    icon: Zap,
    color: 'text-emerald-500',
  },
  {
    value: 'lite' as const,
    label: 'Lite',
    description: 'Think through approach, create task list',
    icon: ClipboardList,
    color: 'text-blue-500',
  },
  {
    value: 'spec' as const,
    label: 'Spec',
    description: 'Generate spec with acceptance criteria',
    icon: FileText,
    color: 'text-purple-500',
  },
  {
    value: 'full' as const,
    label: 'Full',
    description: 'Comprehensive spec with phased plan',
    icon: ScrollText,
    color: 'text-amber-500',
  },
];

/**
 * PlanningModeSelect - Compact dropdown selector for planning modes
 *
 * A lightweight alternative to PlanningModeSelector for contexts where
 * spec management UI is not needed (e.g., mass edit, bulk operations).
 *
 * Shows icon + label in dropdown, with description text below.
 * Does not include spec generation, approval, or require-approval checkbox.
 *
 * @example
 * ```tsx
 * <PlanningModeSelect
 *   mode={planningMode}
 *   onModeChange={(mode) => {
 *     setPlanningMode(mode);
 *     setRequireApproval(mode === 'spec' || mode === 'full');
 *   }}
 *   testIdPrefix="mass-edit-planning"
 * />
 * ```
 */
export function PlanningModeSelect({
  mode,
  onModeChange,
  requireApproval,
  onRequireApprovalChange,
  testIdPrefix = 'planning-mode',
  className,
  disabled = false,
  compact = false,
}: PlanningModeSelectProps) {
  const selectedMode = modes.find((m) => m.value === mode);

  // Disable approval checkbox for skip/lite modes since they don't use planning
  const isApprovalDisabled = disabled || mode === 'skip' || mode === 'lite';

  const selectDropdown = (
    <Select
      value={mode}
      onValueChange={(value: string) => onModeChange(value as PlanningMode)}
      disabled={disabled}
    >
      <SelectTrigger className="h-9" data-testid={`${testIdPrefix}-select-trigger`}>
        <SelectValue>
          {selectedMode && (
            <div className="flex items-center gap-2">
              <selectedMode.icon className={cn('h-4 w-4', selectedMode.color)} />
              <span>{selectedMode.label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {modes.map((m) => {
          const Icon = m.icon;
          return (
            <SelectItem
              key={m.value}
              value={m.value}
              data-testid={`${testIdPrefix}-option-${m.value}`}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn('h-3.5 w-3.5', m.color)} />
                <span>{m.label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  // Compact mode - just the dropdown
  if (compact) {
    return <div className={className}>{selectDropdown}</div>;
  }

  // Full mode with description and optional checkbox
  return (
    <div className={cn('space-y-2', className)}>
      {selectDropdown}
      {selectedMode && <p className="text-xs text-muted-foreground">{selectedMode.description}</p>}
      {onRequireApprovalChange && (
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id={`${testIdPrefix}-require-approval`}
            checked={requireApproval && !isApprovalDisabled}
            onCheckedChange={(checked) => onRequireApprovalChange(!!checked)}
            disabled={isApprovalDisabled}
            data-testid={`${testIdPrefix}-require-approval-checkbox`}
          />
          <Label
            htmlFor={`${testIdPrefix}-require-approval`}
            className={cn(
              'text-sm font-normal',
              isApprovalDisabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'
            )}
          >
            Require plan approval before execution
          </Label>
        </div>
      )}
    </div>
  );
}
