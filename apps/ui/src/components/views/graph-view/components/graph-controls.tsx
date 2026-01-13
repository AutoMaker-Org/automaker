import { useReactFlow, Panel } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Lock,
  Unlock,
  GitBranch,
  ArrowRight,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GraphControlsProps {
  isLocked: boolean;
  onToggleLock: () => void;
  onRunLayout: (direction: 'LR' | 'TB') => void;
  layoutDirection: 'LR' | 'TB';
}

export function GraphControls({
  isLocked,
  onToggleLock,
  onRunLayout,
  layoutDirection,
}: GraphControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="bottom-left" className="flex flex-col gap-2">
      <TooltipProvider delayDuration={200}>
        <div
          className="flex flex-col gap-1 p-1.5 rounded-lg backdrop-blur-sm border border-border shadow-lg text-popover-foreground"
          style={{ backgroundColor: 'color-mix(in oklch, var(--popover) 90%, transparent)' }}
        >
          {/* Zoom controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => zoomIn({ duration: 200 })}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Zoom In</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => zoomOut({ duration: 200 })}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Zoom Out</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => fitView({ padding: 0.2, duration: 300 })}
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Fit View</TooltipContent>
          </Tooltip>

          <div className="h-px bg-border my-1" />

          {/* Layout controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 w-8 p-0',
                  layoutDirection === 'LR' && 'bg-brand-500/20 text-brand-500'
                )}
                onClick={() => onRunLayout('LR')}
              >
                <ArrowRight className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Horizontal Layout</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 w-8 p-0',
                  layoutDirection === 'TB' && 'bg-brand-500/20 text-brand-500'
                )}
                onClick={() => onRunLayout('TB')}
              >
                <ArrowDown className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Vertical Layout</TooltipContent>
          </Tooltip>

          <div className="h-px bg-border my-1" />

          {/* Lock toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-8 w-8 p-0', isLocked && 'bg-brand-500/20 text-brand-500')}
                onClick={onToggleLock}
              >
                {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{isLocked ? 'Unlock Nodes' : 'Lock Nodes'}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </Panel>
  );
}
