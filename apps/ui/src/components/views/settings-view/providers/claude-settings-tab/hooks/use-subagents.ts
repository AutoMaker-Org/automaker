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

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import type { AgentDefinition } from '@automaker/types';
import { getElectronAPI } from '@/lib/electron';

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
  const currentProject = useAppStore((state) => state.currentProject);
  const [isLoading, setIsLoading] = useState(false);
  const [subagentsWithScope, setSubagentsWithScope] = useState<SubagentWithScope[]>([]);

  // Fetch filesystem agents
  const fetchFilesystemAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api.settings) {
        console.warn('Settings API not available');
        return;
      }
      const data = await api.settings.discoverAgents(currentProject?.path, ['user', 'project']);

      if (data.success && data.agents) {
        // Transform filesystem agents to SubagentWithScope format
        const agents: SubagentWithScope[] = data.agents.map(
          ({ name, definition, source, filePath }: FilesystemAgent) => ({
            name,
            definition,
            scope: source === 'user' ? 'global' : 'project',
            type: 'filesystem' as const,
            source,
            filePath,
          })
        );
        setSubagentsWithScope(agents);
      }
    } catch (error) {
      console.error('Failed to fetch filesystem agents:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject?.path]);

  // Fetch filesystem agents on mount and when project changes
  useEffect(() => {
    fetchFilesystemAgents();
  }, [fetchFilesystemAgents]);

  return {
    subagentsWithScope,
    isLoading,
    hasProject: !!currentProject,
    refreshFilesystemAgents: fetchFilesystemAgents,
  };
}
