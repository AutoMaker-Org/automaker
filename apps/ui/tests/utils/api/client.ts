/**
 * API client utilities for making API calls in tests
 * Provides type-safe wrappers around common API operations
 */

import { Page, APIResponse } from '@playwright/test';
import { API_BASE_URL, API_ENDPOINTS } from '../core/constants';

// ============================================================================
// Types
// ============================================================================

export interface WorktreeInfo {
  path: string;
  branch: string;
  isNew?: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

export interface WorktreeListResponse {
  success: boolean;
  worktrees: WorktreeInfo[];
  error?: string;
}

export interface WorktreeCreateResponse {
  success: boolean;
  worktree?: WorktreeInfo;
  error?: string;
}

export interface WorktreeDeleteResponse {
  success: boolean;
  error?: string;
}

export interface CommitResult {
  committed: boolean;
  branch?: string;
  commitHash?: string;
  message?: string;
}

export interface CommitResponse {
  success: boolean;
  result?: CommitResult;
  error?: string;
}

export interface SwitchBranchResult {
  previousBranch: string;
  currentBranch: string;
  message: string;
}

export interface SwitchBranchResponse {
  success: boolean;
  result?: SwitchBranchResult;
  error?: string;
  code?: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
}

export interface ListBranchesResult {
  currentBranch: string;
  branches: BranchInfo[];
}

export interface ListBranchesResponse {
  success: boolean;
  result?: ListBranchesResult;
  error?: string;
}

// ============================================================================
// Worktree API Client
// ============================================================================

export class WorktreeApiClient {
  constructor(private page: Page) {}

  /**
   * Create a new worktree
   */
  async create(
    projectPath: string,
    branchName: string,
    baseBranch?: string
  ): Promise<{ response: APIResponse; data: WorktreeCreateResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.create, {
      data: {
        projectPath,
        branchName,
        baseBranch,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * Delete a worktree
   */
  async delete(
    projectPath: string,
    worktreePath: string,
    deleteBranch: boolean = true
  ): Promise<{ response: APIResponse; data: WorktreeDeleteResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.delete, {
      data: {
        projectPath,
        worktreePath,
        deleteBranch,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * List all worktrees
   */
  async list(
    projectPath: string,
    includeDetails: boolean = true
  ): Promise<{ response: APIResponse; data: WorktreeListResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.list, {
      data: {
        projectPath,
        includeDetails,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * Commit changes in a worktree
   */
  async commit(
    worktreePath: string,
    message: string
  ): Promise<{ response: APIResponse; data: CommitResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.commit, {
      data: {
        worktreePath,
        message,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * Switch branches in a worktree
   */
  async switchBranch(
    worktreePath: string,
    branchName: string
  ): Promise<{ response: APIResponse; data: SwitchBranchResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.switchBranch, {
      data: {
        worktreePath,
        branchName,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * List all branches
   */
  async listBranches(
    worktreePath: string
  ): Promise<{ response: APIResponse; data: ListBranchesResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.listBranches, {
      data: {
        worktreePath,
      },
    });
    const data = await response.json();
    return { response, data };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a WorktreeApiClient instance
 */
export function createWorktreeApiClient(page: Page): WorktreeApiClient {
  return new WorktreeApiClient(page);
}

// ============================================================================
// Convenience Functions (for direct use without creating a client)
// ============================================================================

/**
 * Create a worktree via API
 */
export async function apiCreateWorktree(
  page: Page,
  projectPath: string,
  branchName: string,
  baseBranch?: string
): Promise<{ response: APIResponse; data: WorktreeCreateResponse }> {
  return new WorktreeApiClient(page).create(projectPath, branchName, baseBranch);
}

/**
 * Delete a worktree via API
 */
export async function apiDeleteWorktree(
  page: Page,
  projectPath: string,
  worktreePath: string,
  deleteBranch: boolean = true
): Promise<{ response: APIResponse; data: WorktreeDeleteResponse }> {
  return new WorktreeApiClient(page).delete(projectPath, worktreePath, deleteBranch);
}

/**
 * List worktrees via API
 */
export async function apiListWorktrees(
  page: Page,
  projectPath: string,
  includeDetails: boolean = true
): Promise<{ response: APIResponse; data: WorktreeListResponse }> {
  return new WorktreeApiClient(page).list(projectPath, includeDetails);
}

/**
 * Commit changes in a worktree via API
 */
export async function apiCommitWorktree(
  page: Page,
  worktreePath: string,
  message: string
): Promise<{ response: APIResponse; data: CommitResponse }> {
  return new WorktreeApiClient(page).commit(worktreePath, message);
}

/**
 * Switch branches in a worktree via API
 */
export async function apiSwitchBranch(
  page: Page,
  worktreePath: string,
  branchName: string
): Promise<{ response: APIResponse; data: SwitchBranchResponse }> {
  return new WorktreeApiClient(page).switchBranch(worktreePath, branchName);
}

/**
 * List branches via API
 */
export async function apiListBranches(
  page: Page,
  worktreePath: string
): Promise<{ response: APIResponse; data: ListBranchesResponse }> {
  return new WorktreeApiClient(page).listBranches(worktreePath);
}

// ============================================================================
// Authentication Utilities
// ============================================================================

/**
 * Authenticate with the server using an API key
 * This sets a session cookie that will be used for subsequent requests
 * Uses browser context to ensure cookies are properly set
 */
export async function authenticateWithApiKey(page: Page, apiKey: string): Promise<boolean> {
  try {
    // Ensure we're on a page (needed for cookies to work)
    const currentUrl = page.url();
    if (!currentUrl || currentUrl === 'about:blank') {
      await page.goto('http://localhost:3007', { waitUntil: 'domcontentloaded' });
    }

    // Use browser context fetch to ensure cookies are set in the browser
    const response = await page.evaluate(
      async ({ url, apiKey }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ apiKey }),
        });
        const data = await res.json();
        return { success: data.success, token: data.token };
      },
      { url: `${API_BASE_URL}/api/auth/login`, apiKey }
    );

    if (response.success && response.token) {
      // Manually set the cookie in the browser context
      // The server sets a cookie named 'automaker_session' (see SESSION_COOKIE_NAME in auth.ts)
      await page.context().addCookies([
        {
          name: 'automaker_session',
          value: response.token,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);

      // Verify the session is working by polling auth status
      // This replaces arbitrary timeout with actual condition check
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        const statusResponse = await page.evaluate(
          async ({ url }) => {
            const res = await fetch(url, {
              credentials: 'include',
            });
            return res.json();
          },
          { url: `${API_BASE_URL}/api/auth/status` }
        );

        if (statusResponse.authenticated === true) {
          return true;
        }
        attempts++;
        // Use a very short wait between polling attempts (this is acceptable for polling)
        await page.waitForFunction(() => true, { timeout: 50 });
      }

      return false;
    }

    return false;
  } catch (error) {
    console.error('Authentication error:', error);
    return false;
  }
}

/**
 * Authenticate using the API key from environment variable
 * Falls back to a test default if AUTOMAKER_API_KEY is not set
 */
export async function authenticateForTests(page: Page): Promise<boolean> {
  // Use the API key from environment, or a test default
  const apiKey = process.env.AUTOMAKER_API_KEY || 'test-api-key-for-e2e-tests';
  return authenticateWithApiKey(page, apiKey);
}
