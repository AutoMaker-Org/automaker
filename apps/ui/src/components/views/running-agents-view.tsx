import { useState, useEffect, useCallback } from 'react';
import { Bot, Folder, Loader2, RefreshCw, Square, Activity, FileText } from 'lucide-react';
import { getElectronAPI, RunningAgent } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { AgentOutputModal } from './board-view/dialogs/agent-output-modal';

export function RunningAgentsView() {
  const [runningAgents, setRunningAgents] = useState<RunningAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<RunningAgent | null>(null);
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

  const handleViewLogs = useCallback((agent: RunningAgent) => {
    setSelectedAgent(agent);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-500/10">
            <Activity className="h-6 w-6 text-brand-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Running Agents</h1>
            <p className="text-sm text-muted-foreground">
              {runningAgents.length === 0
                ? 'No agents currently running'
                : `${runningAgents.length} agent${runningAgents.length === 1 ? '' : 's'} running across all projects`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Content */}
      {runningAgents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="p-4 rounded-full bg-muted/50 mb-4">
            <Bot className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-2">No Running Agents</h2>
          <p className="text-muted-foreground max-w-md">
            Agents will appear here when they are actively working on features. Start an agent from
            the Kanban board by dragging a feature to "In Progress".
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="space-y-3">
            {runningAgents.map((agent) => (
              <div
                key={`${agent.projectPath}-${agent.featureId}`}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Status indicator */}
                  <div className="relative">
                    <Bot className="h-8 w-8 text-brand-500" />
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                    </span>
                  </div>

                  {/* Agent info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate" title={agent.title || agent.featureId}>
                        {agent.title || agent.featureId}
                      </span>
                      {agent.isAutoMode && (
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-brand-500/10 text-brand-500 border border-brand-500/30">
                          AUTO
                        </span>
                      )}
                    </div>
                    {agent.description && (
                      <p
                        className="text-sm text-muted-foreground truncate max-w-md"
                        title={agent.description}
                      >
                        {agent.description}
                      </p>
                    )}
                    <button
                      onClick={() => handleNavigateToProject(agent)}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Folder className="h-3.5 w-3.5" />
                      <span className="truncate">{agent.projectName}</span>
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewLogs(agent)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    View Logs
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleNavigateToProject(agent)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    View Project
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleStopAgent(agent.featureId)}
                  >
                    <Square className="h-3.5 w-3.5 mr-1.5" />
                    Stop
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent Output Modal */}
      {selectedAgent && (
        <AgentOutputModal
          open={true}
          onClose={() => setSelectedAgent(null)}
          projectPath={selectedAgent.projectPath}
          featureDescription={
            selectedAgent.description || selectedAgent.title || selectedAgent.featureId
          }
          featureId={selectedAgent.featureId}
          featureStatus="running"
        />
      )}
    </div>
  );
}
