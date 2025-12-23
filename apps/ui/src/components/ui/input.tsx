import * as React from 'react';

import { cn } from '@/lib/utils';

interface InputProps extends React.ComponentProps<'input'> {
  startAddon?: React.ReactNode;
  endAddon?: React.ReactNode;
}

function Input({ className, type, startAddon, endAddon, ...props }: InputProps) {
  const hasAddons = startAddon || endAddon;

  const inputElement = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground/50 selection:bg-cyan-500/30 selection:text-cyan-100',
        'bg-white/5 border-white/10 h-9 w-full min-w-0 rounded-xl border px-3 py-1 text-sm shadow-sm outline-none transition-all duration-200',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'backdrop-blur-sm',
        // Hover state
        'hover:bg-white/10 hover:border-white/20',
        // Focus state with ring
        'focus:bg-white/10 focus:border-cyan-500/50',
        'focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20 focus-visible:ring-[4px]',
        'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
        // Adjust padding for addons
        startAddon && 'pl-0',
        endAddon && 'pr-0',
        hasAddons && 'border-0 shadow-none focus-visible:ring-0 bg-transparent',
        className
      )}
      {...props}
    />
  );

  if (!hasAddons) {
    return inputElement;
  }

  return (
    <div
      className={cn(
        'flex items-center h-9 w-full rounded-lg border border-input/50 bg-input/50 shadow-xs backdrop-blur-sm transition-all duration-300',
        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]',
        'focus-within:bg-input/80 focus-within:border-ring/50',
        'focus-within:border-ring focus-within:ring-ring/20 focus-within:ring-[4px]',
        'has-[input:disabled]:opacity-50 has-[input:disabled]:cursor-not-allowed',
        'has-[input[aria-invalid]]:ring-destructive/20 has-[input[aria-invalid]]:border-destructive'
      )}
    >
      {startAddon && (
        <span className="flex items-center justify-center px-3 text-muted-foreground text-sm">
          {startAddon}
        </span>
      )}
      {inputElement}
      {endAddon && (
        <span className="flex items-center justify-center px-3 text-muted-foreground text-sm">
          {endAddon}
        </span>
      )}
    </div>
  );
}

export { Input };
