import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProviderColor = 'purple' | 'sky' | 'emerald' | 'amber';

const COLOR_CLASSES: Record<
  ProviderColor,
  { card: string; check: string; iconBg: string; icon: string }
> = {
  purple: {
    card: 'border-purple-500/50 bg-purple-500/10 shadow-purple-500/10',
    check: 'text-purple-500',
    iconBg: 'bg-purple-500/20',
    icon: 'text-purple-500',
  },
  sky: {
    card: 'border-sky-500/50 bg-sky-500/10 shadow-sky-500/10',
    check: 'text-sky-500',
    iconBg: 'bg-sky-500/20',
    icon: 'text-sky-500',
  },
  emerald: {
    card: 'border-emerald-500/50 bg-emerald-500/10 shadow-emerald-500/10',
    check: 'text-emerald-500',
    iconBg: 'bg-emerald-500/20',
    icon: 'text-emerald-500',
  },
  amber: {
    card: 'border-amber-500/50 bg-amber-500/10 shadow-amber-500/10',
    check: 'text-amber-500',
    iconBg: 'bg-amber-500/20',
    icon: 'text-amber-500',
  },
};

interface ProviderCardProps {
  icon: LucideIcon;
  label: string;
  description: string;
  color: ProviderColor;
  isSelected: boolean;
  onClick: () => void;
}

export function ProviderCard({
  icon: Icon,
  label,
  description,
  color,
  isSelected,
  onClick,
}: ProviderCardProps) {
  const colorClasses = COLOR_CLASSES[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative p-4 rounded-xl border transition-all duration-200',
        'flex flex-col items-center gap-3 text-center',
        'hover:scale-[1.02] hover:shadow-md',
        isSelected ? colorClasses.card : 'border-border/50 hover:border-border bg-card/50'
      )}
    >
      {isSelected && (
        <div className="absolute top-2 right-2">
          <Check className={cn('w-4 h-4', colorClasses.check)} />
        </div>
      )}
      <div
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center',
          isSelected ? colorClasses.iconBg : 'bg-accent/50'
        )}
      >
        <Icon className={cn('w-6 h-6', isSelected ? colorClasses.icon : 'text-muted-foreground')} />
      </div>
      <div>
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    </button>
  );
}
