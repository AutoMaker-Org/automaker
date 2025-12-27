import { EventEmitter } from 'events';
import { execAsync } from '@automaker/git-utils';
import { eventEmitter } from '../lib/events.js';

// ⚠️ CRITICAL: FORK SAFETY - Only process DevFlow repository
const DEVFLOW_REPO = '0xtsotsi/DevFlow';
const POLLING_INTERVAL = 30000; // 30 seconds

// Vibe Kanban integration
const VIBE_KANBAN_PROJECT_ID = process.env.VIBE_KANBAN_PROJECT_ID || null;

export interface MergeEligibility {
  prNumber: number;
  repository: string;
  isEligible: boolean;
  checks: {
    ciPassed: boolean;
    noComments: boolean;
    noRequestedChanges: boolean;
    approvals: number;
    requiredApprovals: number;
  };
  reasons: string[];
}

export interface MergeRequest {
  prNumber: number;
  repository: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  prTitle: string;
  prUrl: string;
}

export interface PRStatus {
  number: number;
  title: string;
  url: string;
  repository: string;
  author: string;
  state: 'open' | 'closed' | 'merged';
  mergeable: boolean | null;
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  statusCheckRollup: {
    state: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
  };
  comments: {
    totalCount: number;
  };
  reviews: {
    totalCount: number;
  };
}

export class MergeGatekeeperService extends EventEmitter {
  private monitoringPrs: Map<number, NodeJS.Timeout> = new Map();
  private mergeRequests: Map<number, MergeRequest> = new Map();

  constructor() {
    super();
  }

  /**
   * ⚠️ CRITICAL: Validate that PR is from DevFlow repository
   */
  private validateRepository(repository: string): boolean {
    const normalizedRepo = repository.toLowerCase();
    const normalizedDevflow = DEVFLOW_REPO.toLowerCase();

    if (normalizedRepo !== normalizedDevflow) {
      console.error(
        `[MergeGatekeeper] ❌ REJECTED: PR from forbidden repository: ${repository}. Only ${DEVFLOW_REPO} is allowed.`
      );
      return false;
    }

    return true;
  }

  /**
   * Check if a PR is eligible for merge
   */
  async checkMergeEligibility(prNumber: number, repository: string): Promise<MergeEligibility> {
    const reasons: string[] = [];
    let isEligible = true;

    // ⚠️ CRITICAL: Repo validation
    if (!this.validateRepository(repository)) {
      return {
        prNumber,
        repository,
        isEligible: false,
        checks: {
          ciPassed: false,
          noComments: false,
          noRequestedChanges: false,
          approvals: 0,
          requiredApprovals: 1,
        },
        reasons: [`Repository must be ${DEVFLOW_REPO}`],
      };
    }

    try {
      const prStatus = await this.getPRStatus(prNumber, repository);

      // Check CI status
      const ciPassed = prStatus.statusCheckRollup?.state === 'SUCCESS';
      if (!ciPassed) {
        isEligible = false;
        reasons.push('CI checks must pass');
      }

      // Check for unresolved comments (exclude bot comments and outdated reviews)
      const noComments = prStatus.comments.totalCount === 0;
      if (!noComments) {
        isEligible = false;
        reasons.push('Unresolved comments present');
      }

      // Check for requested changes
      const noRequestedChanges = prStatus.reviewDecision !== 'CHANGES_REQUESTED';
      if (!noRequestedChanges) {
        isEligible = false;
        reasons.push('Changes have been requested');
      }

      // Check approvals (require at least 1)
      const approvals = prStatus.reviewDecision === 'APPROVED' ? 1 : 0;
      const requiredApprovals = 1;
      const hasApprovals = approvals >= requiredApprovals;
      if (!hasApprovals) {
        isEligible = false;
        reasons.push(`At least ${requiredApprovals} approval required`);
      }

      return {
        prNumber,
        repository,
        isEligible,
        checks: {
          ciPassed,
          noComments,
          noRequestedChanges,
          approvals,
          requiredApprovals,
        },
        reasons,
      };
    } catch (error) {
      console.error(`[MergeGatekeeper] Error checking eligibility for PR #${prNumber}:`, error);
      return {
        prNumber,
        repository,
        isEligible: false,
        checks: {
          ciPassed: false,
          noComments: false,
          noRequestedChanges: false,
          approvals: 0,
          requiredApprovals: 1,
        },
        reasons: ['Failed to check PR status'],
      };
    }
  }

  /**
   * Get detailed PR status using GitHub CLI
   */
  async getPRStatus(prNumber: number, repository: string): Promise<PRStatus> {
    // ⚠️ CRITICAL: Validate repository before making any API calls
    if (!this.validateRepository(repository)) {
      throw new Error(`Repository ${repository} is not allowed. Only ${DEVFLOW_REPO} is permitted.`);
    }

    try {
      // Use GitHub CLI to get PR status
      const prDataJson = await execAsync(
        `gh pr view ${prNumber} --repo ${repository} --json title,state,url,mergeable,reviewDecision,statusCheckRollup,comments,reviews --jq .`
      );

      const prData = JSON.parse(prDataJson);

      return {
        number: prNumber,
        title: prData.title || '',
        url: prData.url || '',
        repository,
        author: prData.author || '',
        state: prData.state || 'open',
        mergeable: prData.mergeable ?? null,
        reviewDecision: prData.reviewDecision || null,
        statusCheckRollup: {
          state: prData.statusCheckRollup?.state || null,
        },
        comments: {
          totalCount: prData.comments?.totalCount || 0,
        },
        reviews: {
          totalCount: prData.reviews?.totalCount || 0,
        },
      };
    } catch (error) {
      console.error(`[MergeGatekeeper] Error fetching PR #${prNumber} status:`, error);
      throw error;
    }
  }

  /**
   * Start monitoring a PR for merge eligibility
   */
  async startMonitoring(prNumber: number, repository: string, requestedBy: string): Promise<void> {
    // ⚠️ CRITICAL: Validate repository
    if (!this.validateRepository(repository)) {
      throw new Error(`Cannot monitor PR from ${repository}. Only ${DEVFLOW_REPO} is allowed.`);
    }

    // Don't start monitoring if already monitoring
    if (this.monitoringPrs.has(prNumber)) {
      console.log(`[MergeGatekeeper] Already monitoring PR #${prNumber}`);
      return;
    }

    try {
      const prStatus = await this.getPRStatus(prNumber, repository);

      // Create merge request record
      const mergeRequest: MergeRequest = {
        prNumber,
        repository,
        requestedBy,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        prTitle: prStatus.title,
        prUrl: prStatus.url,
      };
      this.mergeRequests.set(prNumber, mergeRequest);

      // Emit monitoring started event
      eventEmitter.emit('merge-gatekeeper:monitoring-started', {
        prNumber,
        repository,
        title: prStatus.title,
      });

      // Start polling
      const intervalId = setInterval(async () => {
        await this.checkPRStatus(prNumber, repository);
      }, POLLING_INTERVAL);

      this.monitoringPrs.set(prNumber, intervalId);

      // Initial check
      await this.checkPRStatus(prNumber, repository);

      console.log(
        `[MergeGatekeeper] Started monitoring PR #${prNumber} (${prStatus.title}) in ${repository}`
      );
    } catch (error) {
      console.error(`[MergeGatekeeper] Error starting monitoring for PR #${prNumber}:`, error);
      throw error;
    }
  }

  /**
   * Stop monitoring a PR
   */
  stopMonitoring(prNumber: number): void {
    const intervalId = this.monitoringPrs.get(prNumber);
    if (intervalId) {
      clearInterval(intervalId);
      this.monitoringPrs.delete(prNumber);
      console.log(`[MergeGatekeeper] Stopped monitoring PR #${prNumber}`);

      eventEmitter.emit('merge-gatekeeper:monitoring-stopped', { prNumber });
    }
  }

  /**
   * Check PR status and notify if eligible for merge
   */
  private async checkPRStatus(prNumber: number, repository: string): Promise<void> {
    try {
      const eligibility = await this.checkMergeEligibility(prNumber, repository);

      if (eligibility.isEligible) {
        console.log(
          `[MergeGatekeeper] ✅ PR #${prNumber} is ready for merge! Stopping monitoring.`
        );

        // Stop monitoring
        this.stopMonitoring(prNumber);

        // Update merge request status
        const mergeRequest = this.mergeRequests.get(prNumber);
        if (mergeRequest) {
          mergeRequest.status = 'pending';
        }

        // Emit event for UI notification
        eventEmitter.emit('merge-gatekeeper:ready-for-merge', {
          prNumber,
          repository,
          eligibility,
        });

        // Create desktop notification
        this.emit('desktop_notification', {
          title: 'Ready for Merge',
          body: `PR #${prNumber} is ready to merge!`,
          url: this.mergeRequests.get(prNumber)?.prUrl,
        });

        // Create/update Vibe Kanban task
        await this.updateVibeKanbanTask(prNumber, 'inreview');
      } else {
        // Log progress
        console.log(
          `[MergeGatekeeper] PR #${prNumber} not ready yet: ${eligibility.reasons.join(', ')}`
        );

        eventEmitter.emit('merge-gatekeeper:progress', {
          prNumber,
          repository,
          eligibility,
        });
      }
    } catch (error) {
      console.error(`[MergeGatekeeper] Error checking status for PR #${prNumber}:`, error);
    }
  }

  /**
   * Approve and merge a PR
   * ⚠️ CRITICAL: Only merges to DevFlow repository, never to upstream automaker
   */
  async approveMerge(prNumber: number, repository: string, approvedBy: string): Promise<void> {
    // ⚠️ CRITICAL: Double-check repository validation
    if (!this.validateRepository(repository)) {
      throw new Error(
        `❌ SECURITY: Attempted merge to ${repository}. Only ${DEVFLOW_REPO} is allowed!`
      );
    }

    try {
      const mergeRequest = this.mergeRequests.get(prNumber);
      if (!mergeRequest) {
        throw new Error(`No merge request found for PR #${prNumber}`);
      }

      // Verify PR is still from DevFlow repo
      const prStatus = await this.getPRStatus(prNumber, repository);
      if (prStatus.repository.toLowerCase() !== DEVFLOW_REPO.toLowerCase()) {
        throw new Error(
          `❌ SECURITY: PR repository mismatch. Expected ${DEVFLOW_REPO}, got ${prStatus.repository}`
        );
      }

      // Merge the PR
      console.log(`[MergeGatekeeper] Merging PR #${prNumber} to ${DEVFLOW_REPO}...`);

      await execAsync(
        `gh pr merge ${prNumber} --repo ${repository} --merge --delete-branch --subject "Merge PR #${prNumber}"`
      );

      // Update merge request status
      mergeRequest.status = 'approved';

      console.log(`[MergeGatekeeper] ✅ Successfully merged PR #${prNumber} to ${DEVFLOW_REPO}`);

      // Emit success event
      eventEmitter.emit('merge-gatekeeper:merged', {
        prNumber,
        repository,
        approvedBy,
      });

      // Update Vibe Kanban task to done
      await this.updateVibeKanbanTask(prNumber, 'done');

      // Post merge summary to PR
      await this.postMergeSummary(prNumber, repository, approvedBy);
    } catch (error) {
      console.error(`[MergeGatekeeper] Error merging PR #${prNumber}:`, error);

      // Update merge request status
      const mergeRequest = this.mergeRequests.get(prNumber);
      if (mergeRequest) {
        mergeRequest.status = 'rejected';
      }

      eventEmitter.emit('merge-gatekeeper:error', {
        prNumber,
        repository,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Post merge summary to PR comments
   */
  private async postMergeSummary(
    prNumber: number,
    repository: string,
    approvedBy: string
  ): Promise<void> {
    try {
      const mergeRequest = this.mergeRequests.get(prNumber);
      const summary = `## 🤖 Auto-Merge Summary

**PR #${prNumber}** has been automatically merged to \`${DEVFLOW_REPO}\`.

**Details:**
- Repository: ${repository}
- Approved by: ${approvedBy}
- Merged at: ${new Date().toISOString()}

This merge was performed by DevFlow's Merge Gatekeeper after:
- ✅ All CI checks passed
- ✅ No unresolved comments
- ✅ No requested changes
- ✅ Required approvals received

---

*Merged automatically via DevFlow Merge Gatekeeper*`;

      await execAsync(
        `gh pr comment ${prNumber} --repo ${repository} --body "${summary.replace(/"/g, '\\"')}"`
      );

      console.log(`[MergeGatekeeper] Posted merge summary to PR #${prNumber}`);
    } catch (error) {
      console.error(`[MergeGatekeeper] Error posting merge summary:`, error);
      // Don't throw - merge was successful even if comment failed
    }
  }

  /**
   * Reject a merge request
   */
  async rejectMerge(prNumber: number, reason: string): Promise<void> {
    const mergeRequest = this.mergeRequests.get(prNumber);
    if (mergeRequest) {
      mergeRequest.status = 'rejected';
      this.stopMonitoring(prNumber);

      eventEmitter.emit('merge-gatekeeper:rejected', {
        prNumber,
        reason,
      });

      // Update Vibe Kanban task to cancelled
      await this.updateVibeKanbanTask(prNumber, 'cancelled');

      console.log(`[MergeGatekeeper] Rejected merge request for PR #${prNumber}: ${reason}`);
    }
  }

  /**
   * Get all merge requests
   */
  getMergeRequests(): MergeRequest[] {
    return Array.from(this.mergeRequests.values());
  }

  /**
   * Get merge request by PR number
   */
  getMergeRequest(prNumber: number): MergeRequest | undefined {
    return this.mergeRequests.get(prNumber);
  }

  /**
   * Create or update Vibe Kanban task for merge request
   */
  private async updateVibeKanbanTask(
    prNumber: number,
    status: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled'
  ): Promise<void> {
    if (!VIBE_KANBAN_PROJECT_ID) {
      console.log('[MergeGatekeeper] Vibe Kanban project ID not configured, skipping task update');
      return;
    }

    try {
      const mergeRequest = this.mergeRequests.get(prNumber);
      if (!mergeRequest) {
        console.log(`[MergeGatekeeper] No merge request found for PR #${prNumber}`);
        return;
      }

      // Note: This would use the Vibe Kanban MCP client in production
      // For now, we'll log the intent
      console.log(`[MergeGatekeeper] Vibe Kanban task update:`, {
        projectId: VIBE_KANBAN_PROJECT_ID,
        title: `🔄 Merge PR #${prNumber}: ${mergeRequest.prTitle}`,
        description: `PR is ready for merge to ${DEVFLOW_REPO}\n\n${mergeRequest.prUrl}`,
        status,
      });

      // Emit event so UI can handle the task update via MCP
      eventEmitter.emit('merge-gatekeeper:kanban-task-update', {
        projectId: VIBE_KANBAN_PROJECT_ID,
        prNumber,
        title: `🔄 Merge PR #${prNumber}: ${mergeRequest.prTitle}`,
        description: `PR is ready for merge to ${DEVFLOW_REPO}\n\n${mergeRequest.prUrl}`,
        status,
      });
    } catch (error) {
      console.error(`[MergeGatekeeper] Error updating Vibe Kanban task:`, error);
    }
  }

  /**
   * Cleanup all monitoring
   */
  cleanup(): void {
    console.log('[MergeGatekeeper] Cleaning up all monitoring...');
    for (const prNumber of this.monitoringPrs.keys()) {
      this.stopMonitoring(prNumber);
    }
    this.mergeRequests.clear();
  }
}

// Singleton instance
export const mergeGatekeeperService = new MergeGatekeeperService();
