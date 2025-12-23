import { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { PrismField } from './prism-field';
import { NoiseOverlay } from './noise-overlay';

interface ShellProps {
  children: ReactNode;
  className?: string;
  showBackgroundElements?: boolean;
}

export function Shell({ children, className, showBackgroundElements = true }: ShellProps) {
  return (
    <div
      className={cn(
        'relative min-h-screen w-full overflow-hidden bg-background text-foreground transition-colors duration-500',
        className
      )}
    >
      {/* Animated Background Layers */}
      {showBackgroundElements && (
        <>
          <PrismField />
          <NoiseOverlay />
        </>
      )}

      {/* Content wrapper */}
      <div className="relative z-10 flex h-screen flex-col">{children}</div>
    </div>
  );
}
