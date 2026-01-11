import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearService } from '@/services/linear-service.js';
import type { SettingsService } from '@/services/settings-service.js';

// Mock functions must be hoisted to be available in vi.mock() factory
const { mockTeams, mockTeam, mockIssues, mockIssue, mockViewer } = vi.hoisted(() => ({
  mockTeams: vi.fn(),
  mockTeam: vi.fn(),
  mockIssues: vi.fn(),
  mockIssue: vi.fn(),
  mockViewer: vi.fn(),
}));

// Mock the entire @linear/sdk module using a class
vi.mock('@linear/sdk', () => {
  return {
    LinearClient: class MockLinearClient {
      get viewer() {
        return mockViewer();
      }
      teams = mockTeams;
      team = mockTeam;
      issues = mockIssues;
      issue = mockIssue;
    },
  };
});

describe('linear-service.ts', () => {
  let linearService: LinearService;
  let mockSettingsService: SettingsService;

  // Test data
  const mockOrganization = {
    id: 'org-1',
    name: 'Test Org',
    urlKey: 'test-org',
  };

  const mockViewerData = {
    id: 'user-1',
    name: 'Test User',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.png',
    get organization() {
      return Promise.resolve(mockOrganization);
    },
  };

  const mockState = {
    id: 'state-1',
    name: 'In Progress',
    color: '#F2C94C',
    type: 'started',
    position: 1,
  };

  const mockTeamData = {
    id: 'team-1',
    key: 'ENG',
    name: 'Engineering',
    description: 'Engineering team',
    color: '#5E6AD2',
    icon: 'team',
  };

  const mockAssignee = {
    id: 'user-1',
    name: 'Test User',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.png',
  };

  const mockCreator = {
    id: 'user-2',
    name: 'Creator',
    displayName: 'Creator User',
    avatarUrl: null,
  };

  const createMockIssue = () => ({
    id: 'issue-1',
    identifier: 'ENG-123',
    title: 'Test Issue',
    description: 'Test description',
    priority: 2,
    priorityLabel: 'High',
    url: 'https://linear.app/test-org/issue/ENG-123',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    dueDate: null,
    estimate: 3,
    get state() {
      return Promise.resolve(mockState);
    },
    get team() {
      return Promise.resolve(mockTeamData);
    },
    get assignee() {
      return Promise.resolve(mockAssignee);
    },
    get creator() {
      return Promise.resolve(mockCreator);
    },
    get project() {
      return Promise.resolve(null);
    },
    labels: () => Promise.resolve({ nodes: [] }),
    get parent() {
      return Promise.resolve(null);
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock implementations
    mockViewer.mockResolvedValue(mockViewerData);
    mockTeams.mockResolvedValue({ nodes: [mockTeamData] });
    mockTeam.mockResolvedValue({
      ...mockTeamData,
      projects: () =>
        Promise.resolve({
          nodes: [
            {
              id: 'project-1',
              name: 'Project Alpha',
              description: 'Test project',
              state: 'started',
              targetDate: null,
              startDate: null,
              progress: 0.5,
            },
          ],
        }),
    });
    mockIssues.mockResolvedValue({
      nodes: [createMockIssue()],
      pageInfo: {
        hasNextPage: false,
        endCursor: null,
      },
    });
    mockIssue.mockResolvedValue(createMockIssue());

    // Create mock settings service
    mockSettingsService = {
      getCredentials: vi.fn().mockResolvedValue({
        apiKeys: {
          linear: 'lin_api_test_key',
        },
      }),
    } as unknown as SettingsService;

    linearService = new LinearService(mockSettingsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkConnection', () => {
    it('should return connected status when API key is valid', async () => {
      const result = await linearService.checkConnection();

      expect(result.connected).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.name).toBe('Test User');
      expect(result.organization).toBeDefined();
      expect(result.organization?.name).toBe('Test Org');
    });

    it('should return error when no API key configured', async () => {
      mockSettingsService.getCredentials = vi.fn().mockResolvedValue({
        apiKeys: {},
      });

      const result = await linearService.checkConnection();

      expect(result.connected).toBe(false);
      expect(result.error).toBe('No API key configured');
    });

    it('should return error when API key is empty', async () => {
      mockSettingsService.getCredentials = vi.fn().mockResolvedValue({
        apiKeys: { linear: '' },
      });

      const result = await linearService.checkConnection();

      expect(result.connected).toBe(false);
      expect(result.error).toBe('No API key configured');
    });
  });

  describe('getTeams', () => {
    it('should return teams list', async () => {
      const result = await linearService.getTeams();

      expect(result.success).toBe(true);
      expect(result.teams).toBeDefined();
      expect(result.teams?.length).toBe(1);
      expect(result.teams?.[0].name).toBe('Engineering');
      expect(result.teams?.[0].key).toBe('ENG');
    });

    it('should return error when not connected', async () => {
      mockSettingsService.getCredentials = vi.fn().mockResolvedValue({
        apiKeys: {},
      });

      const result = await linearService.getTeams();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not connected to Linear');
    });
  });

  describe('getProjects', () => {
    it('should return projects for a team', async () => {
      const result = await linearService.getProjects('team-1');

      expect(result.success).toBe(true);
      expect(result.projects).toBeDefined();
      expect(result.projects?.length).toBe(1);
      expect(result.projects?.[0].name).toBe('Project Alpha');
    });

    it('should return error when not connected', async () => {
      mockSettingsService.getCredentials = vi.fn().mockResolvedValue({
        apiKeys: {},
      });

      const result = await linearService.getProjects('team-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not connected to Linear');
    });
  });

  describe('getIssues', () => {
    it('should return issues with filters', async () => {
      const result = await linearService.getIssues({
        teamId: 'team-1',
      });

      expect(result.success).toBe(true);
      expect(result.issues).toBeDefined();
      expect(result.issues?.length).toBe(1);
      expect(result.issues?.[0].identifier).toBe('ENG-123');
      expect(result.issues?.[0].title).toBe('Test Issue');
    });

    it('should return error when not connected', async () => {
      mockSettingsService.getCredentials = vi.fn().mockResolvedValue({
        apiKeys: {},
      });

      const result = await linearService.getIssues({ teamId: 'team-1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not connected to Linear');
    });

    it('should include pagination info', async () => {
      const result = await linearService.getIssues({});

      expect(result.success).toBe(true);
      expect(result.pageInfo).toBeDefined();
      expect(result.pageInfo?.hasNextPage).toBe(false);
    });
  });

  describe('getIssue', () => {
    it('should return a single issue', async () => {
      const result = await linearService.getIssue('issue-1');

      expect(result.success).toBe(true);
      expect(result.issue).toBeDefined();
      expect(result.issue?.id).toBe('issue-1');
      expect(result.issue?.identifier).toBe('ENG-123');
    });

    it('should return error when not connected', async () => {
      mockSettingsService.getCredentials = vi.fn().mockResolvedValue({
        apiKeys: {},
      });

      const result = await linearService.getIssue('issue-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not connected to Linear');
    });
  });

  describe('clearCache', () => {
    it('should clear all caches', async () => {
      // Populate caches
      await linearService.getTeams();
      await linearService.getProjects('team-1');
      await linearService.checkConnection();

      // Clear cache
      linearService.clearCache();

      // getCurrentUser should return null after clearing
      expect(linearService.getCurrentUser()).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('should return null before connection check', () => {
      expect(linearService.getCurrentUser()).toBeNull();
    });

    it('should return user after successful connection', async () => {
      await linearService.checkConnection();

      const user = linearService.getCurrentUser();
      expect(user).toBeDefined();
      expect(user?.name).toBe('Test User');
    });
  });
});
