// @ts-nocheck
import { memo, useEffect, useMemo, useState } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Lock, Hand, Sparkles } from 'lucide-react';
import { getBlockingDependencies } from '@automaker/dependency-resolver';
import { useShallow } from 'zustand/react/shallow';

/** Uniform badge style for all card badges */
const uniformBadgeClass =
  'inline-flex items-center justify-center w-6 h-6 rounded-md border-[1.5px]';

interface CardBadgesProps {
  feature: Feature;
}

/**
 * CardBadges - Shows error badges below the card header
 * Note: Blocked/Lock badges are now shown in PriorityBadges for visual consistency
 */
export const CardBadges = memo(function CardBadges({ feature }: CardBadgesProps) {
  if (!feature.error) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1.5 min-h-[24px]">
      {/* Error badge */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                uniformBadgeClass,
                'bg-[var(--status-error-bg)] border-[var(--status-error)]/40 text-[var(--status-error)]'
              )}
              data-testid={`error-badge-${feature.id}`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[250px]">
            <p>{feature.error}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});

interface PriorityBadgesProps {
  feature: Feature;
}

export const PriorityBadges = memo(function PriorityBadges({ feature }: PriorityBadgesProps) {
  const { enableDependencyBlocking, features } = useAppStore(
    useShallow((state) => ({
      enableDependencyBlocking: state.enableDependencyBlocking,
      features: state.features,
    }))
  );
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Calculate blocking dependencies (if feature is in backlog and has incomplete dependencies)
  const blockingDependencies = useMemo(() => {
    if (!enableDependencyBlocking || feature.status !== 'backlog') {
      return [];
    }
    return getBlockingDependencies(feature, features);
  }, [enableDependencyBlocking, feature, features]);

  const isJustFinished = useMemo(() => {
    if (!feature.justFinishedAt || feature.status !== 'waiting_approval' || feature.error) {
      return false;
    }
    const finishedTime = new Date(feature.justFinishedAt).getTime();
    const twoMinutes = 2 * 60 * 1000;
    return currentTime - finishedTime < twoMinutes;
  }, [feature.justFinishedAt, feature.status, feature.error, currentTime]);

  useEffect(() => {
    if (!feature.justFinishedAt || feature.status !== 'waiting_approval') {
      return;
    }

    const finishedTime = new Date(feature.justFinishedAt).getTime();
    const twoMinutes = 2 * 60 * 1000;
    const timeRemaining = twoMinutes - (currentTime - finishedTime);

    if (timeRemaining <= 0) {
      return;
    }

    // eslint-disable-next-line no-undef
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      // eslint-disable-next-line no-undef
      clearInterval(interval);
    };
  }, [feature.justFinishedAt, feature.status, currentTime]);

  const isBlocked =
    blockingDependencies.length > 0 && !feature.error && feature.status === 'backlog';
  const showManualVerification =
    feature.skipTests && !feature.error && feature.status === 'backlog';

  const showBadges = feature.priority || showManualVerification || isBlocked || isJustFinished;

  if (!showBadges) {
    return null;
  }

  return (
    <div className="absolute top-2 left-2 flex items-center gap-1">
      {/* Priority badge */}
      {feature.priority && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  feature.priority === 1 &&
                    'bg-[var(--status-error-bg)] border-[var(--status-error)]/40 text-[var(--status-error)]',
                  feature.priority === 2 &&
                    'bg-[var(--status-warning-bg)] border-[var(--status-warning)]/40 text-[var(--status-warning)]',
                  feature.priority === 3 &&
                    'bg-[var(--status-info-bg)] border-[var(--status-info)]/40 text-[var(--status-info)]'
                )}
                data-testid={`priority-badge-${feature.id}`}
              >
                <span className="font-bold text-xs">
                  {feature.priority === 1 ? 'H' : feature.priority === 2 ? 'M' : 'L'}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>
                {feature.priority === 1
                  ? 'High Priority'
                  : feature.priority === 2
                    ? 'Medium Priority'
                    : 'Low Priority'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Manual verification badge */}
      {showManualVerification && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-[var(--status-warning-bg)] border-[var(--status-warning)]/40 text-[var(--status-warning)]'
                )}
                data-testid={`skip-tests-badge-${feature.id}`}
              >
                <Hand className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>Manual verification required</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Blocked badge */}
      {isBlocked && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-orange-500/20 border-orange-500/50 text-orange-500'
                )}
                data-testid={`blocked-badge-${feature.id}`}
              >
                <Lock className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[250px]">
              <p className="font-medium mb-1">
                Blocked by {blockingDependencies.length} incomplete{' '}
                {blockingDependencies.length === 1 ? 'dependency' : 'dependencies'}
              </p>
              <p className="text-muted-foreground">
                {blockingDependencies
                  .map((depId) => {
                    const dep = features.find((f) => f.id === depId);
                    return dep?.description || depId;
                  })
                  .join(', ')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Just Finished badge */}
      {isJustFinished && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  uniformBadgeClass,
                  'bg-[var(--status-success-bg)] border-[var(--status-success)]/40 text-[var(--status-success)] animate-pulse'
                )}
                data-testid={`just-finished-badge-${feature.id}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>Agent just finished working on this feature</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});
