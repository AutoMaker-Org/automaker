/**
 * Updates Section Component
 *
 * Settings panel for configuring and managing auto-updates.
 * Uses the centralized updates-store for state and actions.
 */

import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  GitBranch,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn, getRepoDisplayName } from '@/lib/utils';
import { toast } from 'sonner';
import { useUpdatesStore } from '@/store/updates-store';
import type { AutoUpdateSettings } from '@automaker/types';

// ============================================================================
// Types
// ============================================================================

interface UpdatesSectionProps {
  autoUpdate: AutoUpdateSettings;
  onAutoUpdateChange: (settings: Partial<AutoUpdateSettings>) => void;
}

// ============================================================================
// Component
// ============================================================================

export function UpdatesSection({ autoUpdate, onAutoUpdateChange }: UpdatesSectionProps) {
  // Use centralized store
  const {
    info,
    updateAvailable,
    remoteVersionShort,
    isChecking,
    isPulling,
    isLoadingInfo,
    error,
    fetchInfo,
    checkForUpdates,
    pullUpdates,
    clearError,
  } = useUpdatesStore();

  // Fetch info on mount
  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  // Handle check for updates with toast notifications
  const handleCheckForUpdates = async () => {
    clearError();
    const hasUpdate = await checkForUpdates();

    if (hasUpdate) {
      toast.success('Update available!', {
        description: `New version: ${useUpdatesStore.getState().remoteVersionShort}`,
      });
    } else if (!useUpdatesStore.getState().error) {
      toast.success('You are up to date!');
    } else {
      toast.error(useUpdatesStore.getState().error || 'Failed to check for updates');
    }
  };

  // Handle pull updates with toast notifications
  const handlePullUpdates = async () => {
    clearError();
    const result = await pullUpdates();

    if (result) {
      if (result.alreadyUpToDate) {
        toast.success('Already up to date!');
      } else {
        toast.success('Update installed!', {
          description: result.message,
          duration: Infinity,
          action: {
            label: 'Restart Now',
            onClick: () => {
              window.location.reload();
            },
          },
          cancel: {
            label: 'Later',
            onClick: () => {
              // Just dismiss - user will restart manually later
            },
          },
        });
      }
    } else if (useUpdatesStore.getState().error) {
      toast.error(useUpdatesStore.getState().error || 'Failed to pull updates');
    }
  };

  const isLoading = isChecking || isPulling || isLoadingInfo;

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <RefreshCw className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Updates</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Check for and install updates from the upstream repository.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Current Version Info */}
        {info && (
          <div className="p-4 rounded-xl bg-accent/20 border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-medium">Current Installation</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version:</span>
                <code className="font-mono text-foreground">
                  {info.currentVersionShort || 'Unknown'}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Branch:</span>
                <span className="text-foreground">{info.currentBranch || 'Unknown'}</span>
              </div>
              {info.hasLocalChanges && (
                <div className="flex items-center gap-2 text-yellow-500">
                  <AlertCircle className="w-4 h-4" />
                  <span>Local changes detected</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Update Status */}
        {updateAvailable && remoteVersionShort && (
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="font-medium text-green-500">Update Available</span>
              </div>
              <code className="font-mono text-sm text-green-500">{remoteVersionShort}</code>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-500">{error}</span>
            </div>
          </div>
        )}

        {/* Auto-Update Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="auto-update-enabled"
            checked={autoUpdate.enabled}
            onCheckedChange={(checked) => onAutoUpdateChange({ enabled: !!checked })}
            className="mt-1"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="auto-update-enabled"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4 text-brand-500" />
              Enable automatic update checks
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Periodically check for new updates from the upstream repository.
            </p>
          </div>
        </div>

        {/* Check Interval */}
        <div className="space-y-2">
          <Label htmlFor="check-interval" className="text-sm font-medium">
            Check interval (minutes)
          </Label>
          <Input
            id="check-interval"
            type="number"
            min={1}
            max={60}
            value={autoUpdate.checkIntervalMinutes}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value) && value >= 1 && value <= 60) {
                onAutoUpdateChange({ checkIntervalMinutes: value });
              }
            }}
            className="w-32"
            disabled={!autoUpdate.enabled}
          />
          <p className="text-xs text-muted-foreground">
            How often to check for updates (1-60 minutes).
          </p>
        </div>

        {/* Upstream URL */}
        <div className="space-y-2">
          <Label htmlFor="upstream-url" className="text-sm font-medium">
            Upstream repository URL
          </Label>
          <div className="flex gap-2">
            <Input
              id="upstream-url"
              type="url"
              value={autoUpdate.upstreamUrl}
              onChange={(e) => onAutoUpdateChange({ upstreamUrl: e.target.value })}
              placeholder="https://github.com/AutoMaker-Org/automaker.git"
              className="flex-1 font-mono text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const url = autoUpdate.upstreamUrl.replace(/\.git$/, '');
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              title="Open repository"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Repository to check for updates. Default: {getRepoDisplayName(autoUpdate.upstreamUrl)}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-border/30">
          <Button onClick={handleCheckForUpdates} disabled={isLoading} variant="outline">
            {isChecking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Check for Updates
              </>
            )}
          </Button>

          {updateAvailable && (
            <Button onClick={handlePullUpdates} disabled={isLoading}>
              {isPulling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Update Now
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
