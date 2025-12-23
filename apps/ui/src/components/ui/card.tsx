import * as React from 'react';

import { cn } from '@/lib/utils';

interface CardProps extends React.ComponentProps<'div'> {
  gradient?: boolean;
}

function Card({ className, gradient = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-white/5 text-card-foreground flex flex-col gap-1 rounded-[1.5rem] border border-white/10 backdrop-blur-xl py-6 transition-all duration-300',
        // Prism hover effect
        'hover:-translate-y-1 hover:bg-white/[0.06] hover:border-white/15',
        // Gradient border option
        gradient &&
          'relative before:absolute before:inset-0 before:rounded-xl before:p-[1px] before:bg-gradient-to-br before:from-white/20 before:to-transparent before:pointer-events-none before:-z-10',
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm leading-relaxed', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-3 px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
