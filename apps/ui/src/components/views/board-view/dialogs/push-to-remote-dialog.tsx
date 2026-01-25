import { useState, useEffect } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { Upload, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import type { WorktreeInfo } from '../worktree-panel/types';

interface RemoteInfo {
  name: string;
  url: string;
}

const logger = createLogger('PushToRemoteDialog');

interface PushToRemoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktree: WorktreeInfo | null;
  onConfirm: (worktree: WorktreeInfo, remote: string) => void;
}

export function PushToRemoteDialog({
  open,
  onOpenChange,
  worktree,
  onConfirm,
}: PushToRemoteDialogProps) {
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch remotes when dialog opens
  useEffect(() => {
    if (open && worktree) {
      fetchRemotes();
    }
  }, [open, worktree]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedRemote('');
      setError(null);
    }
  }, [open]);

  // Auto-select default remote when remotes are loaded
  useEffect(() => {
    if (remotes.length > 0 && !selectedRemote) {
      // Default to 'origin' if available, otherwise first remote
      const defaultRemote = remotes.find((r) => r.name === 'origin') || remotes[0];
      setSelectedRemote(defaultRemote.name);
    }
  }, [remotes, selectedRemote]);

  const fetchRemotes = async () => {
    if (!worktree) return;

    setIsLoading(true);
    setError(null);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listRemotes(worktree.path);

      if (result.success && result.result) {
        // Extract just the remote info (name and URL), not the branches
        const remoteInfos: RemoteInfo[] = result.result.remotes.map((r) => ({
          name: r.name,
          url: r.url,
        }));
        setRemotes(remoteInfos);
        if (remoteInfos.length === 0) {
          setError('No remotes found in this repository. Please add a remote first.');
        }
      } else {
        setError(result.error || 'Failed to fetch remotes');
      }
    } catch (err) {
      logger.error('Failed to fetch remotes:', err);
      setError('Failed to fetch remotes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!worktree) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.listRemotes(worktree.path);

      if (result.success && result.result) {
        const remoteInfos: RemoteInfo[] = result.result.remotes.map((r) => ({
          name: r.name,
          url: r.url,
        }));
        setRemotes(remoteInfos);
        toast.success('Remotes refreshed');
      } else {
        toast.error(result.error || 'Failed to refresh remotes');
      }
    } catch (err) {
      logger.error('Failed to refresh remotes:', err);
      toast.error('Failed to refresh remotes');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConfirm = () => {
    if (!worktree || !selectedRemote) return;
    onConfirm(worktree, selectedRemote);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Push New Branch to Remote
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-2">
              <Sparkles className="w-3 h-3" />
              new
            </span>
          </DialogTitle>
          <DialogDescription>
            Push{' '}
            <span className="font-mono text-foreground">
              {worktree?.branch || 'current branch'}
            </span>{' '}
            to a remote repository for the first time.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRemotes}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="remote-select">Select Remote</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-6 px-2 text-xs"
                >
                  {isRefreshing ? (
                    <Spinner size="xs" className="mr-1" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
              <Select value={selectedRemote} onValueChange={setSelectedRemote}>
                <SelectTrigger id="remote-select">
                  <SelectValue placeholder="Select a remote" />
                </SelectTrigger>
                <SelectContent>
                  {remotes.map((remote) => (
                    <SelectItem key={remote.name} value={remote.name}>
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{remote.name}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {remote.url}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRemote && (
              <div className="mt-2 p-3 rounded-md bg-muted/50 border border-border">
                <p className="text-sm text-muted-foreground">
                  This will create a new remote branch{' '}
                  <span className="font-mono text-foreground">
                    {selectedRemote}/{worktree?.branch}
                  </span>{' '}
                  and set up tracking.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedRemote || isLoading}>
            <Upload className="w-4 h-4 mr-2" />
            Push to {selectedRemote || 'Remote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
