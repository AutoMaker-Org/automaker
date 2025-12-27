import { useState, useEffect, useCallback } from 'react';
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
import { cn } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import type { AutoUpdateSettings } from '@automaker/types';

interface UpdatesSectionProps {
  autoUpdate: AutoUpdateSettings;
  onAutoUpdateChange: (settings: Partial<AutoUpdateSettings>) => void;
}

interface UpdateInfo {
  automakerPath: string;
  isGitRepo: boolean;
  gitAvailable: boolean;
  currentCommit: string | null;
  currentCommitShort: string | null;
  currentBranch: string | null;
  hasLocalChanges: boolean;
  upstreamUrl: string;
  autoUpdateEnabled: boolean;
  checkIntervalMinutes: number;
}

export function UpdatesSection({ autoUpdate, onAutoUpdateChange }: UpdatesSectionProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [remoteCommit, setRemoteCommit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch update info
  const fetchInfo = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (!api.updates?.info) return;

      const result = await api.updates.info();
      if (result.success && result.result) {
        setUpdateInfo(result.result);
      }
    } catch (err) {
      console.error('Failed to fetch update info:', err);
    }
  }, []);

  // Fetch update info on mount
  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  // Listen for update-pulled events from the useAutoUpdate hook
  useEffect(() => {
    const handleUpdatePulled = () => {
      // Refetch info and clear update available state
      fetchInfo();
      setUpdateAvailable(false);
      setRemoteCommit(null);
    };

    window.addEventListener('automaker:update-pulled', handleUpdatePulled);
    return () => window.removeEventListener('automaker:update-pulled', handleUpdatePulled);
  }, [fetchInfo]);

  // Check for updates
  const handleCheckForUpdates = useCallback(async () => {
    setIsChecking(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api.updates?.check) {
        toast.error('Updates API not available');
        return;
      }

      const result = await api.updates.check();

      if (!result.success) {
        setError(result.error || 'Failed to check for updates');
        toast.error(result.error || 'Failed to check for updates');
        return;
      }

      if (result.result) {
        if (result.result.error) {
          setError(result.result.error);
          toast.error(result.result.error);
        } else if (result.result.updateAvailable) {
          setUpdateAvailable(true);
          setRemoteCommit(result.result.remoteCommitShort);
          toast.success('Update available!', {
            description: `New version: ${result.result.remoteCommitShort}`,
          });
        } else {
          setUpdateAvailable(false);
          toast.success('You are up to date!');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check for updates';
      setError(message);
      toast.error(message);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Pull updates
  const handlePullUpdates = useCallback(async () => {
    setIsPulling(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api.updates?.pull) {
        toast.error('Updates API not available');
        return;
      }

      const result = await api.updates.pull();

      if (!result.success) {
        setError(result.error || 'Failed to pull updates');
        toast.error(result.error || 'Failed to pull updates');
        return;
      }

      if (result.result) {
        if (result.result.alreadyUpToDate) {
          toast.success('Already up to date!');
        } else {
          setUpdateAvailable(false);
          // Refresh the info
          const infoResult = await api.updates.info();
          if (infoResult.success && infoResult.result) {
            setUpdateInfo(infoResult.result);
          }

          // Show restart toast
          toast.success('Update installed!', {
            description: result.result.message,
            duration: Infinity,
            action: {
              label: 'Restart Now',
              onClick: () => {
                // For Electron, we need to reload the window
                // The server will need to be restarted separately
                window.location.reload();
              },
            },
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pull updates';
      setError(message);
      toast.error(message);
    } finally {
      setIsPulling(false);
    }
  }, []);

  // Extract repo name from URL for display
  const getRepoDisplayName = (url: string) => {
    const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    return match ? match[1] : url;
  };

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
        {updateInfo && (
          <div className="p-4 rounded-xl bg-accent/20 border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-medium">Current Installation</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Commit:</span>
                <code className="font-mono text-foreground">
                  {updateInfo.currentCommitShort || 'Unknown'}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Branch:</span>
                <span className="text-foreground">{updateInfo.currentBranch || 'Unknown'}</span>
              </div>
              {updateInfo.hasLocalChanges && (
                <div className="flex items-center gap-2 text-yellow-500">
                  <AlertCircle className="w-4 h-4" />
                  <span>Local changes detected</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Update Status */}
        {updateAvailable && remoteCommit && (
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="font-medium text-green-500">Update Available</span>
              </div>
              <code className="font-mono text-sm text-green-500">{remoteCommit}</code>
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
                window.open(url, '_blank');
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
          <Button
            onClick={handleCheckForUpdates}
            disabled={isChecking || isPulling}
            variant="outline"
          >
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
            <Button onClick={handlePullUpdates} disabled={isPulling || isChecking}>
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
