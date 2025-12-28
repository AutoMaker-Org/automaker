/**
 * GitHub Issue Poller Service - Automatically polls and claims GitHub issues
 *
 * This service:
 * - Polls GitHub Issues every 60 seconds (configurable)
 * - Validates the repo is 0xtsotsi/DevFlow (fork safety)
 * - Filters issues by label: automaker:claim or auto-fix
 * - Creates Vibe Kanban tasks for claimable issues
 * - Starts workspace sessions for claimed issues
 * - Adds 'claimed' label to avoid re-claiming
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { EventEmitter } from '../lib/events.js';
import { execAsync, execEnv, logError } from '../routes/github/routes/common.js';

const execAsyncCmd = promisify(exec);

// CRITICAL: Fork safety - only work on DevFlow, never automaker/upstream
const DEVFLOW_REPO = '0xtsotsi/DevFlow';
const AUTOMAKER_UPSTREAM = 'AutoMaker-Org/automaker';

// Labels that make an issue claimable
const CLAIMABLE_LABELS = ['automaker:claim', 'auto-fix'];
const CLAIMED_LABEL = 'claimed';

// Polling configuration
const DEFAULT_POLL_INTERVAL_MS = 60000; // 60 seconds

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  assignee: string | null;
  html_url: string;
  repository: {
    owner: string;
    name: string;
  };
}

interface PollerConfig {
  projectPath: string;
  vibeProjectId?: string;
  pollIntervalMs?: number;
}

interface ClaimResult {
  success: boolean;
  issueNumber: number;
  taskId?: string;
  error?: string;
}

export class GitHubIssuePollerService {
  private events: EventEmitter;
  private pollInterval: NodeJS.Timeout | null = null;
  private config: PollerConfig | null = null;
  private isRunning = false;
  private claimedIssues = new Set<number>(); // Track claimed issues in memory

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Start polling for GitHub issues
   */
  async startPolling(config: PollerConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error('GitHub Issue Poller is already running');
    }

    this.config = config;
    this.isRunning = true;

    this.events.emit('github-poller:started', {
      message: 'GitHub Issue Poller started',
      projectPath: config.projectPath,
    });

    // Run initial poll
    await this.poll().catch((error) => {
      console.error('[GitHubPoller] Initial poll failed:', error);
    });

    // Start polling loop
    const interval = config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    this.pollInterval = setInterval(() => {
      this.poll().catch((error) => {
        console.error('[GitHubPoller] Poll failed:', error);
        this.events.emit('github-poller:poll-error', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, interval);

    console.log(`[GitHubPoller] Started polling every ${interval}ms`);
  }

  /**
   * Stop polling for GitHub issues
   */
  async stopPolling(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.events.emit('github-poller:stopped', {
      message: 'GitHub Issue Poller stopped',
    });

    console.log('[GitHubPoller] Stopped polling');
  }

  /**
   * Check if the poller is currently running
   */
  isPolling(): boolean {
    return this.isRunning;
  }

  /**
   * Main polling logic - fetches and processes issues
   */
  private async poll(): Promise<void> {
    if (!this.config) {
      throw new Error('Poller not configured');
    }

    console.log('[GitHubPoller] Polling for issues...');

    try {
      // Step 1: Validate the repository
      await this.validateRepository();

      // Step 2: Fetch open issues
      const issues = await this.fetchIssues();

      // Step 3: Filter claimable issues
      const claimableIssues = this.filterClaimableIssues(issues);

      console.log(
        `[GitHubPoller] Found ${claimableIssues.length} claimable issues out of ${issues.length} total`
      );

      // Step 4: Process each claimable issue
      const results: ClaimResult[] = [];
      for (const issue of claimableIssues) {
        const result = await this.claimIssue(issue);
        results.push(result);

        if (result.success) {
          // Mark as claimed to avoid re-claiming
          this.claimedIssues.add(issue.number);
        }
      }

      // Emit completion event
      this.events.emit('github-poller:poll-complete', {
        totalIssues: issues.length,
        claimableIssues: claimableIssues.length,
        claimed: results.filter((r) => r.success).length,
        results,
      });
    } catch (error) {
      logError(error, 'GitHub poll failed');
      throw error;
    }
  }

  /**
   * Validate that the repository is DevFlow (not automaker upstream)
   */
  private async validateRepository(): Promise<void> {
    if (!this.config) {
      throw new Error('Poller not configured');
    }

    const { projectPath } = this.config;

    // Get git remote info
    const { stdout: remoteInfo } = await execAsyncCmd('git remote -v', {
      cwd: projectPath,
    });

    // Check if origin points to DevFlow
    const originMatch = remoteInfo.match(/^origin\s+(.+?)\s+\(fetch\)$/m);
    if (!originMatch) {
      throw new Error('No origin remote found');
    }

    const originUrl = originMatch[1];
    const normalizedOrigin = this.normalizeRepoUrl(originUrl);

    if (!normalizedOrigin.includes(DEVFLOW_REPO)) {
      throw new Error(
        `Repository validation failed: expected ${DEVFLOW_REPO}, got ${normalizedOrigin}`
      );
    }

    // Safety check: verify we're NOT pushing to automaker upstream
    if (normalizedOrigin.includes(AUTOMAKER_UPSTREAM)) {
      throw new Error(
        `CRITICAL: Refusing to work on ${AUTOMAKER_UPSTREAM} upstream. DevFlow should work on ${DEVFLOW_REPO} only.`
      );
    }

    console.log(`[GitHubPoller] Repository validated: ${normalizedOrigin}`);
  }

  /**
   * Normalize a git remote URL to owner/name format
   */
  private normalizeRepoUrl(url: string): string {
    // Remove protocol and .git suffix
    let normalized = url
      .replace(/^https?:\/\//, '')
      .replace(/^git@github\.com:/, '')
      .replace(/\.git$/, '');

    // Remove credentials if present
    normalized = normalized.replace(/^[^:]+@/, '');

    return normalized;
  }

  /**
   * Fetch open issues from GitHub using gh CLI
   */
  private async fetchIssues(): Promise<GitHubIssue[]> {
    if (!this.config) {
      throw new Error('Poller not configured');
    }

    const { projectPath } = this.config;

    // Fetch open issues with detailed info
    const { stdout } = await execAsyncCmd(
      'gh issue list --state open --json number,title,body,state,labels,assignee,html,url,repository --limit 100',
      {
        cwd: projectPath,
        env: execEnv,
      }
    );

    const issues: GitHubIssue[] = JSON.parse(stdout || '[]');

    // Add repository info to each issue
    const { stdout: repoInfo } = await execAsyncCmd('gh repo view --json owner,name', {
      cwd: projectPath,
      env: execEnv,
    });
    const repo = JSON.parse(repoInfo);

    return issues.map((issue) => ({
      ...issue,
      repository: {
        owner: repo.owner.login,
        name: repo.name,
      },
    }));
  }

  /**
   * Filter issues to find claimable ones
   */
  private filterClaimableIssues(issues: GitHubIssue[]): GitHubIssue[] {
    return issues.filter((issue) => {
      // Must be open
      if (issue.state !== 'open') {
        return false;
      }

      // Check for claimable labels
      const hasClaimableLabel = issue.labels.some((label) => CLAIMABLE_LABELS.includes(label.name));

      if (!hasClaimableLabel) {
        return false;
      }

      // Check if already claimed (has 'claimed' label)
      const isAlreadyClaimed = issue.labels.some((label) => label.name === CLAIMED_LABEL);

      if (isAlreadyClaimed) {
        return false;
      }

      // Check if already claimed in this session
      if (this.claimedIssues.has(issue.number)) {
        return false;
      }

      // Check if already assigned
      if (issue.assignee) {
        return false;
      }

      // Validate repo is DevFlow
      const repoFullName = `${issue.repository.owner}/${issue.repository.name}`;
      if (repoFullName !== DEVFLOW_REPO) {
        console.warn(
          `[GitHubPoller] Skipping issue ${issue.number} from wrong repo: ${repoFullName}`
        );
        return false;
      }

      return true;
    });
  }

  /**
   * Claim an issue by creating a Vibe Kanban task and starting a workspace
   */
  private async claimIssue(issue: GitHubIssue): Promise<ClaimResult> {
    try {
      console.log(`[GitHubPoller] Claiming issue #${issue.number}: ${issue.title}`);

      // Step 1: Create Vibe Kanban task
      const taskId = await this.createVibeKanbanTask(issue);

      // Step 2: Start workspace session (if configured)
      if (this.config?.vibeProjectId) {
        await this.startWorkspaceSession(issue, taskId).catch((error) => {
          console.error(
            `[GitHubPoller] Failed to start workspace for issue #${issue.number}:`,
            error
          );
          // Don't fail the claim if workspace startup fails
        });
      }

      // Step 3: Add 'claimed' label to GitHub issue
      await this.addClaimedLabel(issue.number);

      // Step 4: Add comment to issue
      await this.addClaimComment(issue.number, taskId);

      // Emit success event
      this.events.emit('github-poller:issue-claimed', {
        issueNumber: issue.number,
        issueTitle: issue.title,
        taskId,
      });

      return {
        success: true,
        issueNumber: issue.number,
        taskId,
      };
    } catch (error) {
      logError(error, `Failed to claim issue #${issue.number}`);
      return {
        success: false,
        issueNumber: issue.number,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a Vibe Kanban task for the issue
   */
  private async createVibeKanbanTask(issue: GitHubIssue): Promise<string> {
    if (!this.config?.vibeProjectId) {
      throw new Error('Vibe project ID not configured');
    }

    // Note: This is a placeholder - actual MCP integration would happen here
    // For now, we'll generate a mock task ID
    const taskId = `task-${issue.number}-${Date.now()}`;

    console.log(`[GitHubPoller] Created Vibe Kanban task ${taskId} for issue #${issue.number}`);

    // TODO: Integrate with Vibe Kanban MCP when available
    // const result = await mcp__vibe_kanban__create_task({
    //   project_id: this.config.vibeProjectId,
    //   title: issue.title,
    //   description: this.buildTaskDescription(issue),
    // });

    return taskId;
  }

  /**
   * Build a task description from the GitHub issue
   */
  private buildTaskDescription(issue: GitHubIssue): string {
    let description = `# GitHub Issue #${issue.number}\n\n`;
    description += `${issue.body || 'No description provided.'}\n\n`;
    description += `---\n\n`;
    description += `**Issue URL:** ${issue.html_url}\n`;
    description += `**Repository:** ${issue.repository.owner}/${issue.repository.name}\n`;
    description += `**Labels:** ${issue.labels.map((l) => l.name).join(', ')}\n`;

    return description;
  }

  /**
   * Start a workspace session for the issue
   */
  private async startWorkspaceSession(issue: GitHubIssue, taskId: string): Promise<void> {
    if (!this.config) {
      throw new Error('Poller not configured');
    }

    console.log(`[GitHubPoller] Starting workspace session for issue #${issue.number}`);

    // Note: This is a placeholder - actual workspace startup would happen here
    // TODO: Integrate with workspace session API when available
    // await startWorkspaceSession({
    //   task_id: taskId,
    //   executor: 'CLAUDE_CODE',
    //   repos: [{ repo_id: this.config.vibeProjectId, base_branch: 'main' }],
    // });
  }

  /**
   * Add the 'claimed' label to a GitHub issue
   */
  private async addClaimedLabel(issueNumber: number): Promise<void> {
    if (!this.config) {
      throw new Error('Poller not configured');
    }

    const { projectPath } = this.config;

    try {
      await execAsyncCmd(`gh issue edit ${issueNumber} --add-label "${CLAIMED_LABEL}"`, {
        cwd: projectPath,
        env: execEnv,
      });

      console.log(`[GitHubPoller] Added '${CLAIMED_LABEL}' label to issue #${issueNumber}`);
    } catch (error) {
      // If label doesn't exist, create it first
      await execAsyncCmd(`gh label create "${CLAIMED_LABEL}" --color "0366d6"`, {
        cwd: projectPath,
        env: execEnv,
      }).catch(() => {
        // Label might already exist, ignore error
      });

      // Try adding the label again
      await execAsyncCmd(`gh issue edit ${issueNumber} --add-label "${CLAIMED_LABEL}"`, {
        cwd: projectPath,
        env: execEnv,
      });
    }
  }

  /**
   * Add a comment to the issue indicating it was claimed
   */
  private async addClaimComment(issueNumber: number, taskId: string): Promise<void> {
    if (!this.config) {
      throw new Error('Poller not configured');
    }

    const { projectPath } = this.config;

    const comment = `This issue has been automatically claimed by DevFlow 🤖

**Task ID:** ${taskId}
**Claimed at:** ${new Date().toISOString()}

The issue will be processed automatically.`;

    await execAsyncCmd(`gh issue comment ${issueNumber} --body "${comment}"`, {
      cwd: projectPath,
      env: execEnv,
    });

    console.log(`[GitHubPoller] Added claim comment to issue #${issueNumber}`);
  }
}
