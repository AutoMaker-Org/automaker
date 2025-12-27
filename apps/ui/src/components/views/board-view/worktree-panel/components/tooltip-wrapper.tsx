import type { ReactElement, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TooltipWrapperProps {
  /** The element to wrap with a tooltip */
  children: ReactElement;
  /** The content to display in the tooltip */
  tooltipContent: ReactNode;
  /** Whether to show the tooltip (if false, renders children without tooltip) */
  showTooltip: boolean;
  /** The side where the tooltip should appear */
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * A reusable wrapper that conditionally adds a tooltip to its children.
 * When showTooltip is false, it renders the children directly without any tooltip.
 * This is useful for adding tooltips to disabled elements that need to show
 * a reason for being disabled.
 */
export function TooltipWrapper({
  children,
  tooltipContent,
  showTooltip,
  side = 'left',
}: TooltipWrapperProps) {
  if (!showTooltip) {
    return children;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* The div wrapper is necessary for tooltips to work on disabled elements */}
          <div>{children}</div>
        </TooltipTrigger>
        <TooltipContent side={side}>
          <p>{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
