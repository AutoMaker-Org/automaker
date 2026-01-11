import * as React from 'react';

import { cn } from '@/lib/utils';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal';
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, orientation = 'vertical', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative overflow-hidden',
        orientation === 'vertical' ? 'overflow-y-auto' : 'overflow-x-auto',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
