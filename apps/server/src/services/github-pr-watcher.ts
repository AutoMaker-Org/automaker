/**
 * GitHub PR Watcher Service
 *
 * Monitors PR comments/reviews and auto-fixes issues by:
 * 1. Receiving GitHub webhooks for PR comments
 * 2. Validating PR is from 0xtsotsi/DevFlow (NOT automaker upstream)
 * 3. Parsing comment intent (fix request vs. discussion)
 * 4. Creating Vibe Kanban tasks for actionable comments
 * 5. Starting workspace sessions to apply fixes
 * 6. Committing and pushing to PR branch (origin ONLY)
 * 7. Replying to comment with status
 */

import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

// CRITICAL: Only process PRs from DevFlow fork
const DEVFLOW_REPO = '0xtsotsi/DevFlow';
const UPSTREAM_REPO = 'AutoMaker-Org/automaker';

export interface PRCommentEvent {
  prNumber: number;
  commentId: string;
  author: string;
  body: string;
  createdAt: string;
  path?: string;
  line?: number;
  repository: string;
  commentType: 'pr_review_comment' | 'issue_comment';
  headRefName?: string;
  baseRefName?: string;
}

export interface FixAction {
  commentId: string;
  taskId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
}

export interface WebhookPayload {
  action: string;
  comment?: {
    id: number;
    body: string;
    user: {
      login: string;
    };
    created_at: string;
    path?: string;
    line?: number;
    commit_id?: string;
    original_commit_id?: string;
  };
  issue?: {
    number: number;
    pull_request?: {
      number: number;
      head?: {
        ref: string;
      };
      base?: {
        ref: string;
      };
    };
  };
  pull_request?: {
    number: number;
    head?: {
      ref: string;
    };
    base?: {
      ref: string;
    };
  };
  repository?: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
  sender?: {
    login: string;
  };
}

export interface PRWatcherServiceConfig {
  webhookSecret?: string;
  dataDir: string;
}

export class PRWatcherService {
  private webhookSecret?: string;
  private dataDir: string;
  private activeFixes = new Map<string, FixAction>();

  constructor(config: PRWatcherServiceConfig) {
    this.webhookSecret = config.webhookSecret;
    this.dataDir = config.dataDir;
  }

  /**
   * Verify GitHub webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      console.warn('[PR Watcher] No webhook secret configured, skipping signature verification');
      return true;
    }

    const signatureParts = signature.split('=');
    if (signatureParts.length !== 2) {
      return false;
    }

    const algorithm = signatureParts[0];
    const hash = signatureParts[1];

    if (algorithm !== 'sha256') {
      return false;
    }

    const expectedHash = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
  }

  /**
   * Parse webhook payload and extract PR comment event
   */
  parseWebhookPayload(payload: WebhookPayload): PRCommentEvent | null {
    try {
      // Validate repository
      const repoFullName = payload.repository?.full_name;
      if (!repoFullName) {
        console.error('[PR Watcher] Missing repository in webhook payload');
        return null;
      }

      // CRITICAL SAFETY CHECK: Only process DevFlow repo
      if (repoFullName !== DEVFLOW_REPO) {
        console.log(
          `[PR Watcher] Ignoring event from ${repoFullName} (only ${DEVFLOW_REPO} allowed)`
        );
        return null;
      }

      // Extract PR number and branch info
      let prNumber: number;
      let headRefName: string | undefined;
      let baseRefName: string | undefined;

      if (payload.pull_request) {
        prNumber = payload.pull_request.number;
        headRefName = payload.pull_request.head?.ref;
        baseRefName = payload.pull_request.base?.ref;
      } else if (payload.issue?.pull_request) {
        prNumber = payload.issue.number;
        headRefName = payload.issue.pull_request?.head?.ref;
        baseRefName = payload.issue.pull_request?.base?.ref;
      } else {
        console.error('[PR Watcher] No PR number found in webhook');
        return null;
      }

      // Extract comment details
      const comment = payload.comment;
      if (!comment) {
        console.error('[PR Watcher] No comment found in webhook');
        return null;
      }

      // Determine comment type based on presence of path/line
      const commentType: 'pr_review_comment' | 'issue_comment' =
        comment.path && comment.line ? 'pr_review_comment' : 'issue_comment';

      const event: PRCommentEvent = {
        prNumber,
        commentId: comment.id.toString(),
        author: comment.user.login,
        body: comment.body,
        createdAt: comment.created_at,
        path: comment.path,
        line: comment.line,
        repository: repoFullName,
        commentType,
        headRefName,
        baseRefName,
      };

      return event;
    } catch (error) {
      console.error('[PR Watcher] Error parsing webhook payload:', error);
      return null;
    }
  }

  /**
   * Parse comment to determine if it's a fix request
   */
  parseCommentIntent(event: PRCommentEvent): {
    isFixRequest: boolean;
    description?: string;
    priority: 'low' | 'medium' | 'high';
  } {
    const body = event.body.toLowerCase().trim();

    // Fix request patterns
    const fixPatterns = [
      /^(fix|please fix|should fix|needs fix|can you fix|could you fix)/i,
      /(change this to|should be|needs to be|make it)/i,
      /(incorrect|wrong|buggy|broken|error|issue)/i,
      /^(update|replace|refactor|improve)/i,
    ];

    const isFixRequest = fixPatterns.some((pattern) => pattern.test(body));

    if (!isFixRequest) {
      return { isFixRequest: false, priority: 'low' };
    }

    // Extract description
    const description = event.body.trim();

    // Determine priority
    let priority: 'low' | 'medium' | 'high' = 'medium';
    if (body.includes('critical') || body.includes('urgent') || body.includes('blocker')) {
      priority = 'high';
    } else if (body.includes('minor') || body.includes('nitpick') || body.includes('optional')) {
      priority = 'low';
    }

    return { isFixRequest: true, description, priority };
  }

  /**
   * Validate git remote configuration before operations
   * CRITICAL: Ensures we don't push to upstream
   */
  async validateGitRemotes(projectPath: string): Promise<{
    isValid: boolean;
    origin?: string;
    upstream?: string;
    error?: string;
  }> {
    try {
      const { stdout } = await execAsync('git remote -v', { cwd: projectPath });
      const remotes = stdout.trim();

      let origin: string | undefined;
      let upstream: string | undefined;

      for (const line of remotes.split('\n')) {
        const match = line.match(/^(\w+)\s+(.+?)\s+\(fetch\)$/);
        if (match) {
          const [, name, url] = match;
          if (name === 'origin') {
            origin = url;
          } else if (name === 'upstream') {
            upstream = url;
          }
        }
      }

      // Validate origin points to DevFlow
      if (!origin || !origin.includes('0xtsotsi/DevFlow')) {
        return {
          isValid: false,
          origin,
          upstream,
          error: `origin does not point to ${DEVFLOW_REPO}`,
        };
      }

      // Warn if upstream exists (but don't fail)
      if (upstream) {
        console.warn(`[PR Watcher] upstream detected: ${upstream} - will NEVER push to upstream`);
      }

      return { isValid: true, origin, upstream };
    } catch (error) {
      return {
        isValid: false,
        error: `Failed to validate git remotes: ${error}`,
      };
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(projectPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
      });
      return stdout.trim();
    } catch (error) {
      console.error('[PR Watcher] Failed to get current branch:', error);
      return null;
    }
  }

  /**
   * Checkout PR branch
   */
  async checkoutBranch(projectPath: string, branchName: string): Promise<boolean> {
    try {
      // Fetch latest from origin
      await execAsync(`git fetch origin ${branchName}`, { cwd: projectPath });

      // Checkout the branch
      await execAsync(`git checkout ${branchName}`, { cwd: projectPath });

      // Pull latest changes
      await execAsync('git pull origin', { cwd: projectPath });

      console.log(`[PR Watcher] Checked out branch: ${branchName}`);
      return true;
    } catch (error) {
      console.error(`[PR Watcher] Failed to checkout branch ${branchName}:`, error);
      return false;
    }
  }

  /**
   * Commit and push changes to PR branch (origin ONLY)
   */
  async commitAndPushFix(
    projectPath: string,
    branchName: string,
    message: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify we're on the correct branch
      const currentBranch = await this.getCurrentBranch(projectPath);
      if (currentBranch !== branchName) {
        return {
          success: false,
          error: `Not on correct branch: expected ${branchName}, got ${currentBranch}`,
        };
      }

      // Validate remotes again before pushing
      const validation = await this.validateGitRemotes(projectPath);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Git remote validation failed: ${validation.error}`,
        };
      }

      // Stage all changes
      await execAsync('git add -A', { cwd: projectPath });

      // Check if there are changes to commit
      const { stdout: statusOutput } = await execAsync('git status --porcelain', {
        cwd: projectPath,
      });

      if (!statusOutput.trim()) {
        return {
          success: false,
          error: 'No changes to commit',
        };
      }

      // Commit changes
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: projectPath,
      });

      // CRITICAL: Push to origin ONLY
      await execAsync(`git push origin ${branchName}`, { cwd: projectPath });

      console.log(`[PR Watcher] Committed and pushed to origin/${branchName}`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to commit and push: ${error}`,
      };
    }
  }

  /**
   * Reply to GitHub comment with status
   */
  async replyToComment(
    projectPath: string,
    prNumber: number,
    commentId: string,
    message: string
  ): Promise<boolean> {
    try {
      // Use gh CLI to create a comment reply
      const commentBody = message
        .split('\n')
        .map((line) => `"${line.replace(/"/g, '\\"')}"`)
        .join(' ');

      await execAsync(`gh pr comment ${prNumber} --body ${commentBody}`, { cwd: projectPath });

      console.log(`[PR Watcher] Replied to comment ${commentId} on PR #${prNumber}`);
      return true;
    } catch (error) {
      console.error('[PR Watcher] Failed to reply to comment:', error);
      return false;
    }
  }

  /**
   * Process a PR comment event
   */
  async processComment(
    event: PRCommentEvent,
    projectPath: string
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    try {
      console.log(`[PR Watcher] Processing comment ${event.commentId} on PR #${event.prNumber}`);

      // 1. Parse comment intent
      const intent = this.parseCommentIntent(event);
      if (!intent.isFixRequest) {
        console.log('[PR Watcher] Comment is not a fix request, skipping');
        return { success: false, error: 'Not a fix request' };
      }

      console.log(`[PR Watcher] Fix request detected: ${intent.description}`);

      // 2. Validate git remotes
      const remoteValidation = await this.validateGitRemotes(projectPath);
      if (!remoteValidation.isValid) {
        throw new Error(`Git remote validation failed: ${remoteValidation.error}`);
      }

      // 3. Checkout PR branch if specified
      if (event.headRefName) {
        const checkoutSuccess = await this.checkoutBranch(projectPath, event.headRefName);
        if (!checkoutSuccess) {
          throw new Error(`Failed to checkout branch ${event.headRefName}`);
        }
      }

      // 4. Create Vibe Kanban task (would use MCP tools in production)
      // For now, return a placeholder task ID
      const taskId = `fix-${event.commentId}`;
      console.log(`[PR Watcher] Created task ${taskId} for fix`);

      // Track the fix action
      const fixAction: FixAction = {
        commentId: event.commentId,
        taskId,
        status: 'in_progress',
      };
      this.activeFixes.set(event.commentId, fixAction);

      // 5. Start workspace session (would be implemented by workspace service)
      console.log(`[PR Watcher] Workspace session would be started here`);

      // 6. After fix is applied, commit and push
      // const commitResult = await this.commitAndPushFix(
      //   projectPath,
      //   event.headRefName || 'main',
      //   `Fix: ${intent.description}`
      // );

      // 7. Reply to comment with status
      await this.replyToComment(
        projectPath,
        event.prNumber,
        event.commentId,
        `✅ Fix started for PR #${event.prNumber}\n\nTask: ${taskId}\nStatus: In progress`
      );

      return { success: true, taskId };
    } catch (error) {
      console.error('[PR Watcher] Error processing comment:', error);

      // Reply with error
      await this.replyToComment(
        projectPath,
        event.prNumber,
        event.commentId,
        `❌ Failed to process fix request: ${error}`
      );

      return { success: false, error: String(error) };
    }
  }

  /**
   * Get status of an active fix
   */
  getFixStatus(commentId: string): FixAction | undefined {
    return this.activeFixes.get(commentId);
  }

  /**
   * Update fix status
   */
  updateFixStatus(commentId: string, status: FixAction['status'], error?: string): void {
    const fix = this.activeFixes.get(commentId);
    if (fix) {
      fix.status = status;
      fix.error = error;
      this.activeFixes.set(commentId, fix);
    }
  }
}
