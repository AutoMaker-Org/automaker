/**
 * Running Agents View
 *
 * Displays all currently running agents across all projects.
 * Uses React Query for data fetching with automatic polling.
 */

import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { Bot, Folder, RefreshCw, Square, Activity, FileText } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI, type RunningAgent } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { AgentOutputModal } from './board-view/dialogs/agent-output-modal';
import { useRunningAgents } from '@/hooks/queries';
import { useStopFeature } from '@/hooks/mutations';

export function RunningAgentsView() {
  const [selectedAgent, setSelectedAgent] = useState<RunningAgent | null>(null);
  const { setCurrentProject, projects } = useAppStore();
  const navigate = useNavigate();

  const logger = createLogger('RunningAgentsView');

  // Use React Query for running agents with auto-refresh
  const { data, isLoading, isFetching, refetch } = useRunningAgents();

  const runningAgents = data?.agents ?? [];

  // Use mutation for stopping features
  const stopFeature = useStopFeature();

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleStopAgent = useCallback(
    async (agent: RunningAgent) => {
      const api = getElectronAPI();
      // Handle backlog plans separately - they use a different API
      const isBacklogPlan = agent.featureId.startsWith('backlog-plan:');
      if (isBacklogPlan && api.backlogPlan) {
        logger.debug('Stopping backlog plan agent', { featureId: agent.featureId });
        try {
          await api.backlogPlan.stop();
        } catch (error) {
          logger.error('Failed to stop backlog plan', { featureId: agent.featureId, error });
        } finally {
          refetch();
        }
        return;
      }
      // Use mutation for regular features
      stopFeature.mutate({ featureId: agent.featureId, projectPath: agent.projectPath });
    },
    [stopFeature, refetch, logger]
  );

  const handleNavigateToProject = useCallback(
    (agent: RunningAgent) => {
      const project = projects.find((p) => p.path === agent.projectPath);
      if (project) {
        logger.debug('Navigating to running agent project', {
          projectPath: agent.projectPath,
          featureId: agent.featureId,
        });
        setCurrentProject(project);
        navigate({ to: '/board' });
      } else {
        logger.debug('Project not found for running agent', {
          projectPath: agent.projectPath,
          featureId: agent.featureId,
        });
      }
    },
    [projects, setCurrentProject, navigate]
  );

  const handleViewLogs = useCallback((agent: RunningAgent) => {
    logger.debug('Opening running agent logs', {
      featureId: agent.featureId,
      projectPath: agent.projectPath,
    });
    setSelectedAgent(agent);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="xl" />
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
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
          {isFetching ? (
            <Spinner size="sm" className="mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
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
                <div className="flex items-center gap-2 shrink-0">
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
                    onClick={() => handleStopAgent(agent)}
                    disabled={stopFeature.isPending}
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
          branchName={selectedAgent.branchName}
        />
      )}
    </div>
  );
}
