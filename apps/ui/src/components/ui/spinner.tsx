import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerVariant = 'primary' | 'foreground' | 'muted';

const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
};

const variantClasses: Record<SpinnerVariant, string> = {
  primary: 'text-primary',
  foreground: 'text-primary-foreground',
  muted: 'text-muted-foreground',
};

interface SpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Color variant - use 'foreground' when on primary backgrounds */
  variant?: SpinnerVariant;
  /** Additional class names */
  className?: string;
}

/**
 * Themed spinner component using the primary brand color.
 * Use this for all loading indicators throughout the app for consistency.
 * Use variant='foreground' when placing on primary-colored backgrounds.
 */
export function Spinner({ size = 'md', variant = 'primary', className }: SpinnerProps) {
  return (
    <Loader2
      className={cn(sizeClasses[size], 'animate-spin', variantClasses[variant], className)}
      aria-hidden="true"
      data-testid="spinner"
    />
  );
}
