/**
 * Skeleton Components
 *
 * Loading placeholder components for content that's being fetched.
 */

import { cn } from '@/lib/utils';

interface SkeletonPulseProps {
  className?: string;
}

/**
 * Pulsing skeleton placeholder for loading states
 */
export function SkeletonPulse({ className }: SkeletonPulseProps) {
  return <div className={cn('animate-pulse bg-muted/50 rounded', className)} />;
}
