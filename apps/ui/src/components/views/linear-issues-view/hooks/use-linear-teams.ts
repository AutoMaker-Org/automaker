import { useState, useEffect, useCallback } from 'react';
import { getElectronAPI, LinearTeam, LinearProject } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('useLinearTeams');

export function useLinearTeams(isConnected: boolean) {
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<LinearTeam | null>(null);
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<LinearProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch teams
  const fetchTeams = useCallback(async () => {
    const api = getElectronAPI();
    if (!api.linear || !isConnected) return;

    try {
      setLoading(true);
      setError(null);
      const result = await api.linear.getTeams();

      if (result.success && result.teams) {
        setTeams(result.teams);
        // Auto-select first team if none selected
        if (!selectedTeam && result.teams.length > 0) {
          setSelectedTeam(result.teams[0]);
        }
      } else {
        setError(result.error || 'Failed to fetch teams');
      }
    } catch (err) {
      logger.error('Failed to fetch teams:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch teams');
    } finally {
      setLoading(false);
    }
  }, [isConnected, selectedTeam]);

  // Fetch projects when team changes
  const fetchProjects = useCallback(async (teamId: string) => {
    const api = getElectronAPI();
    if (!api.linear) return;

    try {
      const result = await api.linear.getProjects(teamId);

      if (result.success && result.projects) {
        setProjects(result.projects);
        setSelectedProject(null); // Reset project selection
      } else {
        setProjects([]);
      }
    } catch (err) {
      logger.error('Failed to fetch projects:', err);
      setProjects([]);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (isConnected) {
      fetchTeams();
    }
  }, [isConnected, fetchTeams]);

  // Fetch projects when team changes
  useEffect(() => {
    if (selectedTeam?.id) {
      fetchProjects(selectedTeam.id);
    } else {
      setProjects([]);
      setSelectedProject(null);
    }
  }, [selectedTeam?.id, fetchProjects]);

  return {
    teams,
    selectedTeam,
    setSelectedTeam,
    projects,
    selectedProject,
    setSelectedProject,
    loading,
    error,
    refresh: fetchTeams,
  };
}
