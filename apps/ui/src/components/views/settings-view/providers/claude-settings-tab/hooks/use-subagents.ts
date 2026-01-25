/**
 * Subagents Hook - Manages custom subagent definitions
 *
 * Provides read-only view of custom subagent configurations
 * used for specialized task delegation. Supports:
 * - Filesystem agents (AGENT.md files in .claude/agents/) - user and project-level (read-only)
 *
 * Filesystem agents are discovered via the server API and displayed in the UI.
 * Agent definitions in settings JSON are used server-side only.
 */

import { useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import type { AgentDefinition } from '@automaker/types';
import { useDiscoveredAgents } from '@/hooks/queries';
import { queryKeys } from '@/lib/query-keys';

export type SubagentScope = 'global' | 'project';
export type SubagentType = 'filesystem';
export type FilesystemSource = 'user' | 'project';

export interface SubagentWithScope {
  name: string;
  definition: AgentDefinition;
  scope: SubagentScope;
  type: SubagentType;
  source: FilesystemSource;
  filePath: string;
}

interface FilesystemAgent {
  name: string;
  definition: AgentDefinition;
  source: FilesystemSource;
  filePath: string;
}

export function useSubagents() {
  const queryClient = useQueryClient();
  const currentProject = useAppStore((state) => state.currentProject);

  // Use React Query hook for fetching agents
  const {
    data: agents = [],
    isLoading,
    refetch,
  } = useDiscoveredAgents(currentProject?.path, ['user', 'project']);

  // Transform agents to SubagentWithScope format
  const subagentsWithScope = useMemo((): SubagentWithScope[] => {
    return agents.map(({ name, definition, source, filePath }: FilesystemAgent) => ({
      name,
      definition,
      scope: source === 'user' ? 'global' : 'project',
      type: 'filesystem' as const,
      source,
      filePath,
    }));
  }, [agents]);

  // Refresh function that invalidates the query cache
  const refreshFilesystemAgents = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.settings.agents(currentProject?.path ?? ''),
    });
    await refetch();
  }, [queryClient, currentProject?.path, refetch]);

  return {
    subagentsWithScope,
    isLoading,
    hasProject: !!currentProject,
    refreshFilesystemAgents,
  };
}
