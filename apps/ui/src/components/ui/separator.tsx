import * as React from 'react';
import { cn } from '@/lib/utils';

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual orientation of the separator */
  orientation?: 'horizontal' | 'vertical';
  /** If true, the separator is purely decorative and hidden from screen readers.
   * If false, it has a semantic 'separator' role. */
  decorative?: boolean;
}

/**
 * A visual divider between sections of content.
 * Uses a semantic separator role when decorative=false for accessibility.
 */
const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
    <div
      ref={ref}
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      aria-hidden={decorative ? true : undefined}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  )
);
Separator.displayName = 'Separator';

export { Separator };
