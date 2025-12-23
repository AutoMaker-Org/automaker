import { cn } from '@/lib/utils';
import { HTMLAttributes, forwardRef } from 'react';

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  accent?: 'cyan' | 'blue' | 'orange' | 'green' | 'none';
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, accent = 'none', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'glass-panel rounded-2xl flex flex-col',
          accent === 'cyan' && 'col-accent-cyan',
          accent === 'blue' && 'col-accent-blue',
          accent === 'orange' && 'col-accent-orange',
          accent === 'green' && 'col-accent-green',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
GlassPanel.displayName = 'GlassPanel';
