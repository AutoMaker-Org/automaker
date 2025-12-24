import { useEffect, useMemo, useState } from 'react';
import { Feature, useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Lock, Hand, Sparkles } from 'lucide-react';
import { getBlockingDependencies } from '@automaker/dependency-resolver';

interface CardBadgeProps {
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
  title?: string;
}

/**
 * Shared badge component matching the "Just Finished" badge style
 * Used for priority badges and other card badges
 */
function CardBadge({ children, className, 'data-testid': dataTestId, title }: CardBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        className
      )}
      data-testid={dataTestId}
      title={title}
    >
      {children}
    </div>
  );
}

interface CardBadgesProps {
  feature: Feature;
}

export function CardBadges({ feature }: CardBadgesProps) {
  const { enableDependencyBlocking, features } = useAppStore();

  // Calculate blocking dependencies (if feature is in backlog and has incomplete dependencies)
  const blockingDependencies = useMemo(() => {
    if (!enableDependencyBlocking || feature.status !== 'backlog') {
      return [];
    }
    return getBlockingDependencies(feature, features);
  }, [enableDependencyBlocking, feature, features]);

  // Status badges row (error, blocked)
  const showStatusBadges =
    feature.error ||
    (blockingDependencies.length > 0 &&
      !feature.error &&
      !feature.skipTests &&
      feature.status === 'backlog');

  if (!showStatusBadges) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1.5 min-h-[24px]">
      {/* Error badge */}
      {feature.error && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                  'bg-[var(--status-error-bg)] border-[var(--status-error)]/40 text-[var(--status-error)]'
                )}
                data-testid={`error-badge-${feature.id}`}
              >
                <AlertCircle className="w-3 h-3" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[250px]">
              <p>{feature.error}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Blocked badge */}
      {blockingDependencies.length > 0 &&
        !feature.error &&
        !feature.skipTests &&
        feature.status === 'backlog' && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border-2 px-1.5 py-0.5 text-[10px] font-bold',
                    'bg-orange-500/20 border-orange-500/50 text-orange-500'
                  )}
                  data-testid={`blocked-badge-${feature.id}`}
                >
                  <Lock className="w-3 h-3" />
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
    </div>
  );
}

interface PriorityBadgesProps {
  feature: Feature;
}

export function PriorityBadges({ feature }: PriorityBadgesProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

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

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [feature.justFinishedAt, feature.status, currentTime]);

  const showPriorityBadges =
    feature.priority ||
    (feature.skipTests && !feature.error && feature.status === 'backlog') ||
    isJustFinished;

  if (!showPriorityBadges) {
    return null;
  }

  return (
    <div className="absolute top-2 left-2 flex items-center gap-1.5">
      {/* Priority badge */}
      {feature.priority && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <CardBadge
                className={cn(
                  'bg-opacity-90 border rounded-[6px] px-1.5 py-0.5 flex items-center justify-center border-[1.5px] w-5 h-5', // badge style from example
                  feature.priority === 1 &&
                    'bg-[var(--status-error-bg)] border-[var(--status-error)]/40 text-[var(--status-error)]',
                  feature.priority === 2 &&
                    'bg-[var(--status-warning-bg)] border-[var(--status-warning)]/40 text-[var(--status-warning)]',
                  feature.priority === 3 &&
                    'bg-[var(--status-info-bg)] border-[var(--status-info)]/40 text-[var(--status-info)]'
                )}
                data-testid={`priority-badge-${feature.id}`}
              >
                {feature.priority === 1 ? (
                  <span className="font-bold text-xs flex items-center gap-0.5">H</span>
                ) : feature.priority === 2 ? (
                  <span className="font-bold text-xs flex items-center gap-0.5">M</span>
                ) : (
                  <span className="font-bold text-xs flex items-center gap-0.5">L</span>
                )}
              </CardBadge>
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
      {feature.skipTests && !feature.error && feature.status === 'backlog' && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <CardBadge
                className="bg-[var(--status-warning-bg)] border-[var(--status-warning)]/40 text-[var(--status-warning)]"
                data-testid={`skip-tests-badge-${feature.id}`}
              >
                <Hand className="w-3 h-3" />
              </CardBadge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>Manual verification required</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Just Finished badge */}
      {isJustFinished && (
        <CardBadge
          className="bg-[var(--status-success-bg)] border-[var(--status-success)]/40 text-[var(--status-success)] animate-pulse"
          data-testid={`just-finished-badge-${feature.id}`}
          title="Agent just finished working on this feature"
        >
          <Sparkles className="w-3 h-3" />
        </CardBadge>
      )}
    </div>
  );
}
