import { useState, useEffect, useCallback } from 'react';
import { Bot, Folder, Loader2, RefreshCw, Square, Activity } from 'lucide-react';
import { TopHeader } from '@/components/layout/top-header';
import { GlassPanel } from '@/components/ui/glass-panel';
import { getElectronAPI, RunningAgent } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';

export function RunningAgentsView() {
  const [runningAgents, setRunningAgents] = useState<RunningAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { setCurrentProject, projects } = useAppStore();
  const navigate = useNavigate();

  const fetchRunningAgents = useCallback(async () => {
    try {
      const api = getElectronAPI();
      if (api.runningAgents) {
        const result = await api.runningAgents.getAll();
        if (result.success && result.runningAgents) {
          setRunningAgents(result.runningAgents);
        }
      }
    } catch (error) {
      console.error('[RunningAgentsView] Error fetching running agents:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchRunningAgents();
  }, [fetchRunningAgents]);

  // Auto-refresh every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRunningAgents();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchRunningAgents]);

  // Subscribe to auto-mode events to update in real-time
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event) => {
      // When a feature completes or errors, refresh the list
      if (event.type === 'auto_mode_feature_complete' || event.type === 'auto_mode_error') {
        fetchRunningAgents();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchRunningAgents]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRunningAgents();
  }, [fetchRunningAgents]);

  const handleStopAgent = useCallback(
    async (featureId: string) => {
      try {
        const api = getElectronAPI();
        if (api.autoMode) {
          await api.autoMode.stopFeature(featureId);
          // Refresh list after stopping
          fetchRunningAgents();
        }
      } catch (error) {
        console.error('[RunningAgentsView] Error stopping agent:', error);
      }
    },
    [fetchRunningAgents]
  );

  const handleNavigateToProject = useCallback(
    (agent: RunningAgent) => {
      // Find the project by path
      const project = projects.find((p) => p.path === agent.projectPath);
      if (project) {
        setCurrentProject(project);
        navigate({ to: '/board' });
      }
    },
    [projects, setCurrentProject, navigate]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <TopHeader />

      <div className="flex-1 flex flex-col overflow-hidden p-6 pt-0">
        <GlassPanel className="flex-1 flex flex-col overflow-hidden relative shadow-2xl bg-black/40 backdrop-blur-xl border-white/5">
          <div className="flex-1 flex flex-col overflow-hidden p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-blue-600/20 border border-brand-500/30 flex items-center justify-center shadow-inner shadow-brand-500/20">
                  <Activity className="h-5 w-5 text-brand-400" />
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                    Running Agents
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {runningAgents.length === 0
                      ? 'No agents currently running'
                      : `${runningAgents.length} agent${runningAgents.length === 1 ? '' : 's'} running across all projects`}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-white/5 border-white/10 hover:bg-white/10 text-xs gap-2"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                Refresh
              </Button>
            </div>

            {/* Content */}
            {runningAgents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                  <Bot className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h2 className="text-lg font-medium mb-2 text-foreground">No Running Agents</h2>
                <p className="text-muted-foreground max-w-sm text-sm">
                  Agents will appear here when they are actively working on features. Start an agent
                  from the Kanban board.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto pr-2">
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {runningAgents.map((agent) => (
                    <div
                      key={`${agent.projectPath}-${agent.featureId}`}
                      className="group relative flex flex-col p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {/* Status indicator */}
                          <div className="relative">
                            <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center">
                              <Bot className="h-5 w-5 text-brand-400" />
                            </div>
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                            </span>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-sm truncate text-foreground">
                                {agent.featureId}
                              </span>
                              {agent.isAutoMode && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-brand-500/20 text-brand-400 border border-brand-500/20">
                                  AUTO
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Folder className="h-3 w-3" />
                              <span className="truncate max-w-[120px]">{agent.projectName}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-auto pt-3 flex items-center gap-2 border-t border-white/5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleNavigateToProject(agent)}
                          className="flex-1 h-8 text-xs hover:bg-white/10"
                        >
                          View Project
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStopAgent(agent.featureId)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                          title="Stop Agent"
                        >
                          <Square className="h-3.5 w-3.5 fill-current" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
