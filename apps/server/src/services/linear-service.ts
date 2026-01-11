/**
 * Linear Service - Manages Linear API integration
 *
 * Handles authentication, issue fetching, and caching for Linear integration.
 * Uses @linear/sdk for type-safe GraphQL API access.
 */

import { LinearClient, type Issue, type Team, type Project } from '@linear/sdk';
import { createLogger } from '@automaker/utils';
import type {
  LinearTeam,
  LinearProject,
  LinearUser,
  LinearIssue,
  LinearWorkflowState,
  LinearConnectionStatus,
  LinearIssueFilters,
  LinearIssuesResult,
  LinearTeamsResult,
  LinearProjectsResult,
  LinearIssueResult,
} from '@automaker/types';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('LinearService');

// Cache TTL in milliseconds
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * LinearService - Provides Linear API integration
 *
 * Features:
 * - Connection checking with API key validation
 * - Team and project listing with caching
 * - Issue fetching with comprehensive filtering
 * - Automatic cache invalidation
 */
export class LinearService {
  private client: LinearClient | null = null;
  private apiKey: string | null = null;
  private settingsService: SettingsService;
  private teamsCache: CacheEntry<LinearTeam[]> | null = null;
  private projectsCache = new Map<string, CacheEntry<LinearProject[]>>();
  private currentUser: LinearUser | null = null;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  /**
   * Get or create Linear client with current API key
   */
  private async getClient(): Promise<LinearClient | null> {
    const credentials = await this.settingsService.getCredentials();
    const newApiKey = credentials?.apiKeys?.linear;

    if (!newApiKey) {
      this.client = null;
      this.apiKey = null;
      return null;
    }

    // Reinitialize if key changed
    if (this.apiKey !== newApiKey) {
      this.client = new LinearClient({ apiKey: newApiKey });
      this.apiKey = newApiKey;
      // Clear caches when key changes
      this.clearCache();
    }

    return this.client;
  }

  /**
   * Check connection to Linear API
   */
  async checkConnection(): Promise<LinearConnectionStatus> {
    try {
      const client = await this.getClient();
      if (!client) {
        return { connected: false, error: 'No API key configured' };
      }

      const viewer = await client.viewer;
      const organization = await viewer.organization;

      this.currentUser = {
        id: viewer.id,
        name: viewer.name,
        displayName: viewer.displayName,
        email: viewer.email ?? undefined,
        avatarUrl: viewer.avatarUrl ?? undefined,
        isMe: true,
      };

      return {
        connected: true,
        user: this.currentUser,
        organization: {
          id: organization.id,
          name: organization.name,
          urlKey: organization.urlKey,
        },
      };
    } catch (error) {
      logger.error('Linear connection check failed:', error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Get all teams the user has access to
   */
  async getTeams(): Promise<LinearTeamsResult> {
    try {
      // Check cache
      if (this.teamsCache && Date.now() - this.teamsCache.timestamp < CACHE_TTL) {
        return { success: true, teams: this.teamsCache.data };
      }

      const client = await this.getClient();
      if (!client) {
        return { success: false, error: 'Not connected to Linear' };
      }

      const teamsResponse = await client.teams();
      const teams: LinearTeam[] = teamsResponse.nodes.map((team) => ({
        id: team.id,
        key: team.key,
        name: team.name,
        description: team.description ?? undefined,
        color: team.color ?? undefined,
        icon: team.icon ?? undefined,
      }));

      // Update cache
      this.teamsCache = { data: teams, timestamp: Date.now() };

      return { success: true, teams };
    } catch (error) {
      logger.error('Failed to fetch Linear teams:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch teams',
      };
    }
  }

  /**
   * Get projects for a team
   */
  async getProjects(teamId: string): Promise<LinearProjectsResult> {
    try {
      // Check cache
      const cached = this.projectsCache.get(teamId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return { success: true, projects: cached.data };
      }

      const client = await this.getClient();
      if (!client) {
        return { success: false, error: 'Not connected to Linear' };
      }

      const team = await client.team(teamId);
      const projectsResponse = await team.projects();

      const projects: LinearProject[] = projectsResponse.nodes.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description ?? undefined,
        state: project.state,
        targetDate: project.targetDate ?? undefined,
        startDate: project.startDate ?? undefined,
        progress: project.progress,
        teamId: teamId,
      }));

      // Update cache
      this.projectsCache.set(teamId, { data: projects, timestamp: Date.now() });

      return { success: true, projects };
    } catch (error) {
      logger.error('Failed to fetch Linear projects:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch projects',
      };
    }
  }

  /**
   * Get issues with filters
   */
  async getIssues(filters: LinearIssueFilters): Promise<LinearIssuesResult> {
    try {
      const client = await this.getClient();
      if (!client) {
        return { success: false, error: 'Not connected to Linear' };
      }

      // Ensure we have current user for myIssuesOnly filter
      if (filters.myIssuesOnly && !this.currentUser) {
        await this.checkConnection();
      }

      // Build filter object for Linear API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linearFilter: Record<string, any> = {};

      if (filters.teamId) {
        linearFilter.team = { id: { eq: filters.teamId } };
      }

      if (filters.projectId) {
        linearFilter.project = { id: { eq: filters.projectId } };
      }

      if (filters.stateType && filters.stateType.length > 0) {
        linearFilter.state = { type: { in: filters.stateType } };
      } else if (!filters.includeCompleted) {
        // By default, exclude completed and canceled issues
        linearFilter.state = { type: { nin: ['completed', 'canceled'] } };
      }

      if (filters.assigneeId) {
        linearFilter.assignee = { id: { eq: filters.assigneeId } };
      } else if (filters.myIssuesOnly && this.currentUser) {
        linearFilter.assignee = { id: { eq: this.currentUser.id } };
      }

      if (filters.labelIds && filters.labelIds.length > 0) {
        linearFilter.labels = { some: { id: { in: filters.labelIds } } };
      }

      if (filters.labelName) {
        linearFilter.labels = { some: { name: { eq: filters.labelName } } };
      }

      if (filters.search) {
        linearFilter.or = [
          { title: { containsIgnoreCase: filters.search } },
          { identifier: { containsIgnoreCase: filters.search } },
        ];
      }

      const issuesResponse = await client.issues({
        filter: linearFilter,
        first: filters.limit ?? 50,
        after: filters.cursor,
      });

      const issues: LinearIssue[] = await Promise.all(
        issuesResponse.nodes.map(async (issue) => this.mapIssue(issue))
      );

      return {
        success: true,
        issues,
        pageInfo: {
          hasNextPage: issuesResponse.pageInfo.hasNextPage,
          endCursor: issuesResponse.pageInfo.endCursor ?? undefined,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch Linear issues:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch issues',
      };
    }
  }

  /**
   * Get a single issue by ID
   */
  async getIssue(issueId: string): Promise<LinearIssueResult> {
    try {
      const client = await this.getClient();
      if (!client) {
        return { success: false, error: 'Not connected to Linear' };
      }

      const issue = await client.issue(issueId);
      return {
        success: true,
        issue: await this.mapIssue(issue),
      };
    } catch (error) {
      logger.error('Failed to fetch Linear issue:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch issue',
      };
    }
  }

  /**
   * Map Linear SDK Issue to our LinearIssue type
   */
  private async mapIssue(issue: Issue): Promise<LinearIssue> {
    const state = await issue.state;
    const team = await issue.team;
    const assignee = await issue.assignee;
    const creator = await issue.creator;
    const project = await issue.project;
    const labels = await issue.labels();
    const parent = await issue.parent;

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? undefined,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      state: state
        ? {
            id: state.id,
            name: state.name,
            color: state.color,
            type: state.type as LinearWorkflowState['type'],
            position: state.position,
          }
        : { id: '', name: 'Unknown', color: '#888', type: 'backlog', position: 0 },
      team: team
        ? {
            id: team.id,
            key: team.key,
            name: team.name,
          }
        : { id: '', key: '', name: 'Unknown' },
      assignee: assignee
        ? {
            id: assignee.id,
            name: assignee.name,
            displayName: assignee.displayName,
            email: assignee.email ?? undefined,
            avatarUrl: assignee.avatarUrl ?? undefined,
          }
        : undefined,
      creator: creator
        ? {
            id: creator.id,
            name: creator.name,
            displayName: creator.displayName,
            avatarUrl: creator.avatarUrl ?? undefined,
          }
        : undefined,
      project: project
        ? {
            id: project.id,
            name: project.name,
            state: project.state,
            progress: project.progress,
            teamId: team?.id ?? '',
          }
        : undefined,
      labels: labels.nodes.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description ?? undefined,
      })),
      estimate: issue.estimate ?? undefined,
      url: issue.url,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      startedAt: issue.startedAt?.toISOString(),
      completedAt: issue.completedAt?.toISOString(),
      canceledAt: issue.canceledAt?.toISOString(),
      dueDate: issue.dueDate ?? undefined,
      parent: parent
        ? {
            id: parent.id,
            identifier: parent.identifier,
            title: parent.title,
          }
        : undefined,
    };
  }

  /**
   * Clear all caches (call when API key changes)
   */
  clearCache(): void {
    this.teamsCache = null;
    this.projectsCache.clear();
    this.currentUser = null;
    logger.debug('Linear cache cleared');
  }

  /**
   * Get current authenticated user (if available)
   */
  getCurrentUser(): LinearUser | null {
    return this.currentUser;
  }
}
