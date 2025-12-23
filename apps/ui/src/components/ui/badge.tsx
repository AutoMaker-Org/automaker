import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shadow-sm',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-white hover:bg-destructive/90',
        outline: 'text-foreground border-border bg-background/50 backdrop-blur-sm',
        // Semantic status variants using CSS variables
        success:
          'border-transparent bg-[var(--status-success-bg)] text-[var(--status-success)] border border-[var(--status-success)]/30',
        warning:
          'border-transparent bg-[var(--status-warning-bg)] text-[var(--status-warning)] border border-[var(--status-warning)]/30',
        error:
          'border-transparent bg-[var(--status-error-bg)] text-[var(--status-error)] border border-[var(--status-error)]/30',
        info: 'border-transparent bg-[var(--status-info-bg)] text-[var(--status-info)] border border-[var(--status-info)]/30',
        // Muted variants for subtle indication
        muted: 'border-border/50 bg-muted/50 text-muted-foreground',
        brand: 'border-transparent bg-brand-500/15 text-brand-500 border border-brand-500/30',
        // Prism variants
        prism:
          'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 font-mono tracking-wide rounded-md',
        'prism-orange':
          'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-mono tracking-wide rounded-md',
        'prism-green':
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-mono tracking-wide rounded-md',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-0.5 text-[10px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
