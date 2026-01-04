/**
 * Auto Mode Resume Dialog
 *
 * Shows when auto mode is paused due to usage limits or consecutive failures.
 * Allows users to schedule when auto mode should automatically resume.
 */

import { useState, useMemo, useEffect } from 'react';
import { Clock, AlertTriangle, Timer, Calendar, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore, type ClaudeUsage, type AutoModeResumeSchedule } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';

// Quick duration options (in minutes)
const DURATION_OPTIONS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '1h 30m', minutes: 90 },
  { label: '2h', minutes: 120 },
];

function formatTimeUntil(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();

  if (diffMs <= 0) return 'now';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `${minutes}m`;
  }
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AutoModeResumeDialog() {
  const {
    autoModePauseDialogOpen,
    autoModePauseReason,
    closeAutoModePauseDialog,
    setAutoModeResumeSchedule,
    claudeUsage,
    setClaudeUsage,
    currentProject,
    projects,
  } = useAppStore();

  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [customMinutes, setCustomMinutes] = useState<string>('');
  const [useResetTime, setUseResetTime] = useState(false);
  const [fetchingUsage, setFetchingUsage] = useState(false);

  // Get the project ID from the pause reason path or current project
  const projectId = useMemo(() => {
    if (autoModePauseReason?.projectPath) {
      const project = projects.find((p) => p.path === autoModePauseReason.projectPath);
      return project?.id;
    }
    return currentProject?.id;
  }, [autoModePauseReason?.projectPath, projects, currentProject?.id]);

  // Calculate the earliest reset time from usage data
  const resetTime = useMemo((): Date | null => {
    if (!claudeUsage) return null;

    const candidates: Date[] = [];

    // Session reset time (if at limit)
    if (claudeUsage.sessionPercentage >= 100 && claudeUsage.sessionResetTime) {
      const sessionReset = new Date(claudeUsage.sessionResetTime);
      if (!isNaN(sessionReset.getTime()) && sessionReset > new Date()) {
        candidates.push(sessionReset);
      }
    }

    // Weekly reset time (if at limit)
    if (claudeUsage.weeklyPercentage >= 100 && claudeUsage.weeklyResetTime) {
      const weeklyReset = new Date(claudeUsage.weeklyResetTime);
      if (!isNaN(weeklyReset.getTime()) && weeklyReset > new Date()) {
        candidates.push(weeklyReset);
      }
    }

    // Return the earliest reset time
    if (candidates.length === 0) return null;
    return new Date(Math.min(...candidates.map((d) => d.getTime())));
  }, [claudeUsage]);

  // Fetch latest usage data when dialog opens
  useEffect(() => {
    if (autoModePauseDialogOpen) {
      const fetchUsage = async () => {
        setFetchingUsage(true);
        try {
          const api = getElectronAPI();
          if (api.claude) {
            const data = await api.claude.getUsage();
            if (!('error' in data)) {
              setClaudeUsage(data);
            }
          }
        } catch (error) {
          console.error('Failed to fetch Claude usage:', error);
        } finally {
          setFetchingUsage(false);
        }
      };
      fetchUsage();
    }
  }, [autoModePauseDialogOpen, setClaudeUsage]);

  // Reset state when dialog opens
  useEffect(() => {
    if (autoModePauseDialogOpen) {
      setSelectedDuration(null);
      setCustomMinutes('');
      setUseResetTime(false);
    }
  }, [autoModePauseDialogOpen]);

  // Calculate the resume time based on selection
  const resumeAt = useMemo((): Date | null => {
    if (useResetTime && resetTime) {
      return resetTime;
    }

    const minutes = selectedDuration || (customMinutes ? parseInt(customMinutes, 10) : 0);
    if (minutes > 0) {
      return new Date(Date.now() + minutes * 60 * 1000);
    }

    return null;
  }, [selectedDuration, customMinutes, useResetTime, resetTime]);

  const handleScheduleResume = () => {
    if (!resumeAt || !projectId) return;

    const schedule: AutoModeResumeSchedule = {
      resumeAt: resumeAt.toISOString(),
      reason: useResetTime ? 'usage_reset' : 'manual_schedule',
      scheduledAt: new Date().toISOString(),
      lastKnownUsage: claudeUsage || undefined,
    };

    setAutoModeResumeSchedule(projectId, schedule);
    closeAutoModePauseDialog();
  };

  const handleKeepPaused = () => {
    closeAutoModePauseDialog();
  };

  const handleDurationSelect = (minutes: number) => {
    setSelectedDuration(minutes);
    setCustomMinutes('');
    setUseResetTime(false);
  };

  const handleCustomMinutesChange = (value: string) => {
    // Only allow numbers
    if (value === '' || /^\d+$/.test(value)) {
      setCustomMinutes(value);
      setSelectedDuration(null);
      setUseResetTime(false);
    }
  };

  const handleUseResetTime = () => {
    setUseResetTime(true);
    setSelectedDuration(null);
    setCustomMinutes('');
  };

  // Determine error type for display
  const isUsageLimit =
    autoModePauseReason?.errorType === 'quota_exhausted' ||
    autoModePauseReason?.errorType === 'rate_limit';

  return (
    <Dialog open={autoModePauseDialogOpen} onOpenChange={() => {}}>
      <DialogContent
        className="bg-popover border-border max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="w-5 h-5" />
            {isUsageLimit ? 'Usage Limit Reached' : 'Auto Mode Paused'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 pt-2">
              <p className="text-muted-foreground">
                {isUsageLimit
                  ? 'You have reached your Claude Code usage limit. Auto Mode has been paused to prevent repeated failures.'
                  : autoModePauseReason?.message ||
                    'Auto Mode has been paused due to repeated failures.'}
              </p>

              {resetTime && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-blue-300">
                    Usage resets at {formatTime(resetTime)} ({formatTimeUntil(resetTime)})
                  </span>
                </div>
              )}

              <div className="space-y-3">
                <Label className="text-sm font-medium">Resume Auto Mode in:</Label>

                {/* Quick duration buttons */}
                <div className="flex flex-wrap gap-2">
                  {DURATION_OPTIONS.map((option) => (
                    <Button
                      key={option.minutes}
                      variant={selectedDuration === option.minutes ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleDurationSelect(option.minutes)}
                      className={cn(
                        'min-w-[60px]',
                        selectedDuration === option.minutes && 'bg-primary text-primary-foreground'
                      )}
                    >
                      <Timer className="w-3 h-3 mr-1" />
                      {option.label}
                    </Button>
                  ))}
                </div>

                {/* Custom duration input */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">or</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="text"
                      placeholder="Custom"
                      value={customMinutes}
                      onChange={(e) => handleCustomMinutesChange(e.target.value)}
                      className="w-20 h-8 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                </div>

                {/* Resume at reset button */}
                {resetTime && (
                  <Button
                    variant={useResetTime ? 'default' : 'outline'}
                    size="sm"
                    onClick={handleUseResetTime}
                    className={cn(
                      'w-full justify-start',
                      useResetTime && 'bg-primary text-primary-foreground'
                    )}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Resume at reset ({formatTime(resetTime)})
                  </Button>
                )}

                {/* Preview of selected time */}
                {resumeAt && (
                  <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm">
                    <span className="text-muted-foreground">Auto Mode will resume at </span>
                    <span className="font-medium text-foreground">{formatTime(resumeAt)}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      ({formatTimeUntil(resumeAt)} from now)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex gap-2 sm:justify-end pt-4">
          <Button variant="ghost" onClick={handleKeepPaused} className="px-4">
            <X className="w-4 h-4 mr-2" />
            Keep Paused
          </Button>
          <Button
            onClick={handleScheduleResume}
            disabled={!resumeAt || !projectId}
            className="px-4"
          >
            <Clock className="w-4 h-4 mr-2" />
            Schedule Resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
