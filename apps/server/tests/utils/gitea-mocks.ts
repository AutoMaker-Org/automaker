/**
 * Mock utilities for Gitea forge integration tests
 * Provides reusable mocks and fixtures for forge-detector, gitea-client, and route tests
 */

import { vi } from 'vitest';
import type { ForgeType, ForgeRemoteInfo } from '@automaker/types';

/**
 * Create a mock SettingsService with configurable credentials
 */
export function createMockSettingsService(overrides?: {
  gitea?: string;
  anthropic?: string;
  google?: string;
  openai?: string;
}) {
  return {
    getCredentials: vi.fn().mockResolvedValue({
      version: 1,
      apiKeys: {
        anthropic: overrides?.anthropic ?? '',
        google: overrides?.google ?? '',
        openai: overrides?.openai ?? '',
        gitea: overrides?.gitea ?? '',
      },
    }),
    updateCredentials: vi.fn(),
    getMaskedCredentials: vi.fn(),
    hasCredentials: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Create a mock GiteaClient with all public methods as vi.fn()
 */
export function createMockGiteaClient() {
  return {
    listIssues: vi.fn().mockResolvedValue([]),
    listPRs: vi.fn().mockResolvedValue([]),
    createPR: vi
      .fn()
      .mockResolvedValue({
        number: 1,
        url: 'https://gitea.example.com/testowner/testrepo/pulls/1',
        state: 'OPEN',
      }),
    getPRByBranch: vi.fn().mockResolvedValue(null),
    getPR: vi.fn().mockResolvedValue(null),
    listIssueComments: vi
      .fn()
      .mockResolvedValue({ comments: [], totalCount: 0, hasNextPage: false, endCursor: undefined }),
  };
}

/**
 * Create a ForgeRemoteInfo object for a given forge type with sensible defaults
 */
export function createMockForgeInfo(type: ForgeType = 'gitea'): ForgeRemoteInfo {
  switch (type) {
    case 'github':
      return {
        type: 'github',
        baseUrl: 'https://github.com',
        owner: 'testowner',
        repo: 'testrepo',
        remoteUrl: 'https://github.com/testowner/testrepo.git',
      };
    case 'gitea':
      return {
        type: 'gitea',
        baseUrl: 'https://gitea.example.com',
        owner: 'testowner',
        repo: 'testrepo',
        remoteUrl: 'https://gitea.example.com/testowner/testrepo.git',
      };
    case 'unknown':
    default:
      return {
        type: 'unknown',
        baseUrl: null,
        owner: null,
        repo: null,
        remoteUrl: null,
      };
  }
}

/**
 * Sample Gitea API response objects for reuse across tests
 */
export const GITEA_FIXTURES = {
  user: {
    id: 1,
    login: 'testuser',
    full_name: 'Test User',
    avatar_url: 'https://gitea.example.com/avatars/1',
  },

  label: {
    id: 1,
    name: 'bug',
    color: 'ff0000',
  },

  issue: {
    number: 42,
    title: 'Fix login bug',
    state: 'open',
    user: {
      id: 1,
      login: 'testuser',
      full_name: 'Test User',
      avatar_url: 'https://gitea.example.com/avatars/1',
    },
    created_at: '2024-01-15T10:00:00Z',
    labels: [{ id: 1, name: 'bug', color: 'ff0000' }],
    html_url: 'https://gitea.example.com/testowner/testrepo/issues/42',
    body: 'Login form crashes on submit',
    assignees: [{ id: 2, login: 'devuser', avatar_url: 'https://gitea.example.com/avatars/2' }],
    pull_request: null,
  },

  issueWithPR: {
    number: 43,
    title: 'PR disguised as issue',
    state: 'open',
    user: {
      id: 1,
      login: 'testuser',
      full_name: 'Test User',
      avatar_url: 'https://gitea.example.com/avatars/1',
    },
    created_at: '2024-01-16T10:00:00Z',
    labels: [],
    html_url: 'https://gitea.example.com/testowner/testrepo/issues/43',
    body: '',
    assignees: null,
    pull_request: { merged: false },
  },

  pullRequest: {
    number: 10,
    title: 'Add dark mode',
    state: 'open',
    user: {
      id: 1,
      login: 'testuser',
      full_name: 'Test User',
      avatar_url: 'https://gitea.example.com/avatars/1',
    },
    created_at: '2024-01-20T10:00:00Z',
    labels: [{ id: 2, name: 'enhancement', color: '00ff00' }],
    html_url: 'https://gitea.example.com/testowner/testrepo/pulls/10',
    body: 'Adds dark mode support',
    head: { ref: 'feature/dark-mode', label: 'testowner:feature/dark-mode' },
    base: { ref: 'main', label: 'testowner:main' },
    draft: false,
    mergeable: true,
    merged: false,
  },

  mergedPullRequest: {
    number: 8,
    title: 'Fix CSS',
    state: 'closed',
    user: {
      id: 1,
      login: 'testuser',
      full_name: 'Test User',
      avatar_url: 'https://gitea.example.com/avatars/1',
    },
    created_at: '2024-01-10T10:00:00Z',
    labels: [],
    html_url: 'https://gitea.example.com/testowner/testrepo/pulls/8',
    body: 'Fixed CSS issues',
    head: { ref: 'fix/css', label: 'testowner:fix/css' },
    base: { ref: 'main', label: 'testowner:main' },
    draft: false,
    mergeable: false,
    merged: true,
  },

  comment: {
    id: 100,
    user: {
      id: 1,
      login: 'testuser',
      full_name: 'Test User',
      avatar_url: 'https://gitea.example.com/avatars/1',
    },
    body: 'Looks good to me!',
    created_at: '2024-01-15T12:00:00Z',
    updated_at: '2024-01-15T12:00:00Z',
  },

  reviewComment: {
    id: 200,
    user: {
      id: 2,
      login: 'reviewer',
      full_name: 'Reviewer',
      avatar_url: 'https://gitea.example.com/avatars/2',
    },
    body: 'Consider using a constant here',
    path: 'src/main.ts',
    line: 42,
    created_at: '2024-01-15T13:00:00Z',
  },
};
