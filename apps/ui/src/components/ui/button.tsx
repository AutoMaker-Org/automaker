import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-300 cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/40 hover:-translate-y-0.5',
        destructive:
          'bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/25 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border border-border/50 bg-background/50 backdrop-blur-sm shadow-sm hover:bg-accent hover:text-accent-foreground dark:bg-white/5 dark:hover:bg-white/10 hover:border-accent',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-md',
        ghost: 'hover:bg-accent/50 hover:text-accent-foreground hover:backdrop-blur-sm',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100',
        glass:
          'border border-white/10 bg-white/5 text-foreground shadow-sm drop-shadow-sm backdrop-blur-md hover:bg-white/10 hover:border-white/20 hover:shadow-md transition-all duration-300',
        'animated-outline': 'relative overflow-hidden rounded-xl hover:bg-transparent shadow-none',
        'prism-primary':
          'bg-cyan-400 text-slate-950 font-extrabold shadow-lg shadow-cyan-400/20 hover:brightness-110 hover:shadow-cyan-400/40 transition-all duration-200 tracking-wide',
        'prism-glass':
          'glass hover:bg-white/10 text-xs font-bold rounded-xl transition-all duration-200',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-xs',
        lg: 'h-11 rounded-md px-8 has-[>svg]:px-5 text-base',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

// Loading spinner component
function ButtonSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  }) {
  const isDisabled = disabled || loading;

  // Special handling for animated-outline variant
  if (variant === 'animated-outline' && !asChild) {
    return (
      <button
        className={cn(
          buttonVariants({ variant, size }),
          'group p-[1px]', // Force 1px padding for the gradient border, group for hover animation
          className
        )}
        data-slot="button"
        disabled={isDisabled}
        {...props}
      >
        {/* Animated rotating gradient border - only animates on hover for GPU efficiency */}
        <span className="absolute inset-[-1000%] animated-outline-gradient opacity-75 transition-opacity duration-300 group-hover:animate-[spin_3s_linear_infinite] group-hover:opacity-100" />

        {/* Inner content container */}
        <span
          className={cn(
            'animated-outline-inner inline-flex h-full w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] px-4 py-1 text-sm font-medium backdrop-blur-3xl transition-all duration-200',
            size === 'sm' && 'px-3 text-xs gap-1.5',
            size === 'lg' && 'px-8',
            size === 'icon' && 'p-0 gap-0'
          )}
        >
          {loading && <ButtonSpinner />}
          {children}
        </span>
      </button>
    );
  }

  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={isDisabled}
      {...props}
    >
      {loading && <ButtonSpinner />}
      {children}
    </Comp>
  );
}

export { Button, buttonVariants };
