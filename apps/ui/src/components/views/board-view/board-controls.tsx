import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ImageIcon, Archive, HelpCircle } from 'lucide-react';

interface BoardControlsProps {
  isMounted: boolean;
  onShowBoardBackground: () => void;
  onShowCompletedModal: () => void;
  completedCount: number;
  /** Callback to start the onboarding wizard tour */
  onStartTour?: () => void;
}

export function BoardControls({
  isMounted,
  onShowBoardBackground,
  onShowCompletedModal,
  completedCount,
  onStartTour,
}: BoardControlsProps) {
  if (!isMounted) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {/* Board Tour Button - always visible when handler is provided */}
        {onStartTour && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onStartTour}
                className="h-8 px-2 min-w-[32px] focus-visible:ring-2 focus-visible:ring-primary"
                data-testid="board-tour-button"
                aria-label="Take a board tour - learn how to use the kanban board"
              >
                <HelpCircle className="w-4 h-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Take a Board Tour</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Board Background Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onShowBoardBackground}
              className="h-8 px-2"
              data-testid="board-background-button"
            >
              <ImageIcon className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Board Background Settings</p>
          </TooltipContent>
        </Tooltip>

        {/* Completed/Archived Features Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onShowCompletedModal}
              className="h-8 px-2 relative"
              data-testid="completed-features-button"
            >
              <Archive className="w-4 h-4" />
              {completedCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-brand-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {completedCount > 99 ? '99+' : completedCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Completed Features ({completedCount})</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
