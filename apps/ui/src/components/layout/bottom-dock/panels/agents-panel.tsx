import { useState, useEffect, useCallback } from 'react';
import { Bot, Square, Loader2, Activity } from 'lucide-react';
import { getElectronAPI, RunningAgent } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function AgentsPanel() {
  const { currentProject } = useAppStore();
  const [runningAgents, setRunningAgents] = useState<RunningAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [stoppingAgents, setStoppingAgents] = useState<Set<string>>(new Set());

  const fetchRunningAgents = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (api.runningAgents) {
        const result = await api.runningAgents.getAll();
        if (result.success && result.runningAgents) {
          // Filter to current project if one is selected
          const agents = currentProject?.path
            ? result.runningAgents.filter((a) => a.projectPath === currentProject.path)
            : result.runningAgents;
          setRunningAgents(agents);
        }
      }
    } catch (error) {
      console.error('Error fetching running agents:', error);
    } finally {
      setLoading(false);
    }
  }, [currentProject?.path]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchRunningAgents();
    const interval = setInterval(fetchRunningAgents, 2000);
    return () => clearInterval(interval);
  }, [fetchRunningAgents]);

  // Subscribe to auto-mode events
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event) => {
      if (event.type === 'auto_mode_feature_complete' || event.type === 'auto_mode_error') {
        fetchRunningAgents();
      }
    });

    return () => unsubscribe();
  }, [fetchRunningAgents]);

  const handleStopAgent = useCallback(async (featureId: string) => {
    setStoppingAgents((prev) => new Set(prev).add(featureId));
    try {
      const api = getElectronAPI();
      if (api.autoMode) {
        await api.autoMode.stopFeature(featureId);
        toast.success('Agent stopped');
      }
    } catch (error) {
      toast.error('Failed to stop agent');
    } finally {
      setStoppingAgents((prev) => {
        const next = new Set(prev);
        next.delete(featureId);
        return next;
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-green-500" />
          <span className="text-xs font-medium">{runningAgents.length} Running</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-2 space-y-2">
          {runningAgents.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">No agents running</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Enable Auto Mode to start processing features
              </p>
            </div>
          ) : (
            runningAgents.map((agent) => (
              <div key={agent.featureId} className="p-2 rounded-md border border-border bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{agent.featureTitle}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {agent.status === 'running' ? 'In progress...' : agent.status}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleStopAgent(agent.featureId)}
                    disabled={stoppingAgents.has(agent.featureId)}
                  >
                    {stoppingAgents.has(agent.featureId) ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Square className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                {agent.currentPhase && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {agent.currentPhase}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
