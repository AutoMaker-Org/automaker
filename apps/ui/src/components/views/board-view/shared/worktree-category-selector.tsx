import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Folder, Bug, Flame, RefreshCw, Wrench, FileText } from 'lucide-react';
import type { WorktreeCategory } from '@automaker/types';

interface WorktreeCategorySelectorProps {
  selectedCategory: WorktreeCategory;
  onCategorySelect: (category: WorktreeCategory) => void;
  testIdPrefix?: string;
  disabled?: boolean;
}

interface CategoryOption {
  value: WorktreeCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    value: 'feature',
    label: 'Feature',
    icon: Folder,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/50',
  },
  {
    value: 'bugfix',
    label: 'Bugfix',
    icon: Bug,
    color: 'text-red-500',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
  },
  {
    value: 'hotfix',
    label: 'Hotfix',
    icon: Flame,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500/50',
  },
  {
    value: 'refactor',
    label: 'Refactor',
    icon: RefreshCw,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/50',
  },
  {
    value: 'chore',
    label: 'Chore',
    icon: Wrench,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/20',
    borderColor: 'border-gray-500/50',
  },
  {
    value: 'docs',
    label: 'Docs',
    icon: FileText,
    color: 'text-green-500',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/50',
  },
];

export function WorktreeCategorySelector({
  selectedCategory,
  onCategorySelect,
  testIdPrefix = 'worktree-category',
  disabled = false,
}: WorktreeCategorySelectorProps) {
  return (
    <div className="space-y-2">
      <Label>Worktree Type</Label>
      <div className="grid grid-cols-3 gap-2">
        {CATEGORY_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedCategory === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onCategorySelect(option.value)}
              disabled={disabled}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isSelected
                  ? `${option.bgColor} ${option.color} border-2 ${option.borderColor}`
                  : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
              data-testid={`${testIdPrefix}-${option.value}-button`}
            >
              <Icon className={cn('w-4 h-4', isSelected && option.color)} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Export category options for use elsewhere (e.g., badges)
export { CATEGORY_OPTIONS };
export type { CategoryOption };
