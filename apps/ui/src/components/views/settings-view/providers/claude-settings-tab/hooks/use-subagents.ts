/**
 * Subagents Hook - Manages custom subagent definitions
 *
 * Provides read-only view of custom subagent configurations
 * used for specialized task delegation. Supports:
 * - Programmatic agents (stored in settings JSON) - global and project-level
 * - Filesystem agents (AGENT.md files in .claude/agents/) - user and project-level (read-only)
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import type { AgentDefinition } from '@automaker/types';
import { getElectronAPI } from '@/lib/electron';

export type SubagentScope = 'global' | 'project';
export type SubagentType = 'programmatic' | 'filesystem';
export type FilesystemSource = 'user' | 'project';

export interface SubagentWithScope {
  name: string;
  definition: AgentDefinition;
  scope: SubagentScope; // For programmatic agents
  type: SubagentType;
  // For filesystem agents:
  source?: FilesystemSource;
  filePath?: string;
}

interface FilesystemAgent {
  name: string;
  definition: AgentDefinition;
  source: FilesystemSource;
  filePath: string;
}

export function useSubagents() {
  const { settings, currentProject, projectSettings } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [subagentsWithScope, setSubagentsWithScope] = useState<SubagentWithScope[]>([]);
  const [filesystemAgents, setFilesystemAgents] = useState<FilesystemAgent[]>([]);

  // Fetch filesystem agents
  const fetchFilesystemAgents = async () => {
    try {
      const api = getElectronAPI();
      const data = await api.settings.discoverAgents(currentProject?.path, ['user', 'project']);

      if (data.success) {
        setFilesystemAgents(data.agents || []);
      }
    } catch (error) {
      console.error('Failed to fetch filesystem agents:', error);
    }
  };

  // Fetch filesystem agents on mount and when project changes
  useEffect(() => {
    fetchFilesystemAgents();
  }, [currentProject?.path]);

  // Merge programmatic and filesystem agents
  useEffect(() => {
    const globalSubagents = settings?.customSubagents || {};
    const projectSubagents = projectSettings?.customSubagents || {};

    const merged: SubagentWithScope[] = [];

    // Add programmatic global agents
    Object.entries(globalSubagents).forEach(([name, definition]) => {
      merged.push({ name, definition, scope: 'global', type: 'programmatic' });
    });

    // Add programmatic project agents (override globals with same name)
    Object.entries(projectSubagents).forEach(([name, definition]) => {
      const globalIndex = merged.findIndex((s) => s.name === name && s.scope === 'global');
      if (globalIndex !== -1) {
        merged.splice(globalIndex, 1);
      }
      merged.push({ name, definition, scope: 'project', type: 'programmatic' });
    });

    // Add filesystem agents
    filesystemAgents.forEach(({ name, definition, source, filePath }) => {
      // Remove any programmatic agents with the same name (filesystem takes precedence)
      const programmaticIndex = merged.findIndex((s) => s.name === name);
      if (programmaticIndex !== -1) {
        merged.splice(programmaticIndex, 1);
      }

      merged.push({
        name,
        definition,
        scope: source === 'user' ? 'global' : 'project',
        type: 'filesystem',
        source,
        filePath,
      });
    });

    setSubagentsWithScope(merged);
  }, [settings?.customSubagents, projectSettings?.customSubagents, filesystemAgents]);

  return {
    subagentsWithScope,
    isLoading,
    hasProject: !!currentProject,
    refreshFilesystemAgents: fetchFilesystemAgents,
  };
}
