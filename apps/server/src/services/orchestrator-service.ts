/**
 * Orchestrator Service
 *
 * Main autonomous development workflow orchestrator.
 * Polls Vibe-Kanban, coordinates research, manages task lifecycle,
 * and integrates with GitHub for PR operations.
 *
 * Workflow Phases:
 * - Phase 1: Research (Greptile, Exa, LSP)
 * - Phase 2: Task Creation & Auto-Start
 * - Phase 3: In-Review Detection & Validation
 * - Phase 4: PR Creation
 * - Phase 5: PR Conflict & Comment Resolution
 * - Phase 6: Fix Implementation Loop
 * - Phase 7: Final PR Push & Human Approval
 */

import type { EventEmitter } from '../lib/events.js';
import type {
  OrchestratorConfig,
  OrchestratorState,
  OrchestratorTaskState,
  OrchestratorPhase,
  OrchestratorStats,
  ServiceStatus,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from '@automaker/types';
import { VibeKanbanClient } from './vibe-kanban-client.js';
import { ExaResearchClient } from './exa-research-client.js';
import { ResearchService } from './research-service.js';
import { PRReviewService } from './pr-review-service.js';
import { OrchestratorStateMachine } from '../lib/orchestrator-state-machine.js';
import { getGreptileClient } from './greptile-client.js';
import { getMCPBridge } from '../lib/mcp-bridge.js';

/**
 * Task tracking for active processing
 */
interface TrackedTask {
  id: string;
  state: OrchestratorTaskState;
  phase: OrchestratorPhase;
  startedAt: Date;
  lastActivityAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Orchestrator Service Error
 */
export class OrchestratorServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'OrchestratorServiceError';
  }
}

/**
 * Orchestrator Service Options
 */
export interface OrchestratorServiceOptions {
  /** Custom configuration */
  config?: Partial<OrchestratorConfig>;
}

/**
 * Main Orchestrator Service
 *
 * Manages the complete autonomous development workflow.
 */
export class OrchestratorService {
  private config: OrchestratorConfig;
  private events: EventEmitter;
  private vibeKanban: VibeKanbanClient;
  private exaClient: ExaResearchClient;
  private researchService: ResearchService;
  private prReviewService: PRReviewService;
  private stateMachine: OrchestratorStateMachine;

  // Runtime state
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private currentPhase: OrchestratorPhase = 'idle';
  private trackedTasks = new Map<string, TrackedTask>();
  private startTime: Date | null = null;
  private lastPollAt: Date | null = null;

  // Statistics
  private stats: OrchestratorStats = {
    totalTasksProcessed: 0,
    tasksCompleted: 0,
    prsCreated: 0,
    prsMerged: 0,
    researchQueries: 0,
    fixesApplied: 0,
    errorsEncountered: 0,
    uptime: 0,
  };

  // Service status
  private servicesStatus: ServiceStatus = {
    vibeKanban: 'disconnected',
    exa: 'disconnected',
    greptile: 'disconnected',
    github: 'disconnected',
  };

  constructor(events: EventEmitter, options?: OrchestratorServiceOptions) {
    this.events = events;

    // Initialize MCP bridge
    getMCPBridge(events);

    // Merge config with defaults
    this.config = {
      pollInterval: 30000,
      projectId: null,
      projectName: process.env.ORCHESTRATOR_PROJECT_NAME || 'DevFlow',
      exaApiKey: process.env.EXA_API_KEY || '9b2f9ab7-c27c-4763-b0ef-2c743232dab9',
      exaMcpUrl: 'https://mcp.exa.ai/mcp',
      maxConcurrentResearch: 3,
      autoStartTasks: true,
      githubRepository: process.env.ORCHESTRATOR_GITHUB_REPO || 'oxtsotsi/DevFlow',
      defaultBaseBranch: 'main',
      isRunning: false,
      greptileApiKey: process.env.GREPTILE_API_KEY,
      greptileApiUrl: process.env.GREPTILE_API_URL,
      autoStartWorkspaceSessions: process.env.ORCHESTRATOR_AUTO_START_WORKSPACE === 'true',
      ...options?.config,
    };

    // Initialize clients with events
    this.vibeKanban = new VibeKanbanClient({
      projectName: this.config.projectName,
      events,
    });

    this.exaClient = new ExaResearchClient(this.config.exaApiKey, this.config.exaMcpUrl, {
      events,
    });

    // Initialize services with events
    this.researchService = new ResearchService(
      this.exaClient,
      events,
      this.config.githubRepository
    );

    // Initialize Greptile client
    if (this.config.githubRepository) {
      getGreptileClient({
        repository: this.config.githubRepository,
        branch: this.config.defaultBaseBranch,
        apiKey: this.config.greptileApiKey,
        apiUrl: this.config.greptileApiUrl,
        events,
      });
    }

    this.prReviewService = new PRReviewService({
      githubRepository: this.config.githubRepository,
      defaultBaseBranch: this.config.defaultBaseBranch,
      events: this.events,
    });

    // Initialize state machine
    this.stateMachine = new OrchestratorStateMachine(this.events);
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new OrchestratorServiceError('Orchestrator is already running', 'ALREADY_RUNNING');
    }

    console.log('[Orchestrator] Starting...');
    this.setPhase('idle');

    try {
      // Connect to Vibe-Kanban
      await this.vibeKanban.connect();
      this.servicesStatus.vibeKanban = 'connected';
      console.log('[Orchestrator] Vibe-Kanban connected');

      // Connect to Exa
      await this.exaClient.connect();
      this.servicesStatus.exa = 'connected';
      console.log('[Orchestrator] Exa connected');

      // Set project ID if auto-detected
      if (!this.config.projectId) {
        const projects = await this.vibeKanban.listProjects();
        if (projects.length > 0) {
          this.config.projectId = projects[0].id;
          console.log(`[Orchestrator] Using project: ${projects[0].name} (${projects[0].id})`);
        } else {
          throw new OrchestratorServiceError('No Vibe-Kanban projects found', 'NO_PROJECT');
        }
      }

      // Start running
      this.isRunning = true;
      this.config.isRunning = true;
      this.startTime = new Date();

      // Emit started event
      this.events.emit('orchestrator:started', {
        timestamp: new Date().toISOString(),
        config: this.config,
      });

      console.log('[Orchestrator] Started successfully');

      // Start polling loop
      this.scheduleNextPoll();
    } catch (error) {
      this.servicesStatus.vibeKanban = 'error';
      this.servicesStatus.exa = 'error';
      this.stats.errorsEncountered++;

      this.events.emit('orchestrator:error', {
        error: (error as Error).message,
        phase: this.currentPhase,
        timestamp: new Date().toISOString(),
      });

      throw new OrchestratorServiceError(
        `Failed to start orchestrator: ${(error as Error).message}`,
        'START_FAILED',
        error
      );
    }
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[Orchestrator] Stopping...');

    this.isRunning = false;
    this.config.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Disconnect from services
    try {
      await this.vibeKanban.disconnect();
      await this.exaClient.disconnect();
    } catch (error) {
      console.warn('[Orchestrator] Error during disconnect:', error);
    }

    this.servicesStatus = {
      vibeKanban: 'disconnected',
      exa: 'disconnected',
      greptile: 'disconnected',
      github: 'disconnected',
    };

    // Emit stopped event
    this.events.emit('orchestrator:stopped', {
      timestamp: new Date().toISOString(),
      reason: 'user_requested',
    });

    console.log('[Orchestrator] Stopped');
  }

  /**
   * Main polling loop
   *
   * This is the heart of the orchestrator - it continuously polls
   * Vibe-Kanban for state changes and processes tasks through their
   * lifecycle.
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.lastPollAt = new Date();
    this.setPhase('idle');

    // Update uptime
    if (this.startTime) {
      this.stats.uptime = Date.now() - this.startTime.getTime();
    }

    this.events.emit('orchestrator:poll', {
      timestamp: this.lastPollAt.toISOString(),
      activeTasks: Array.from(this.trackedTasks.keys()),
      phase: this.currentPhase,
    });

    try {
      // Process each phase in order
      await this.processTodoTasks(); // Phase 1: Research
      await this.processResearchingTasks(); // Phase 1 complete
      await this.processInProgressTasks(); // Phase 3: Ready for review
      await this.processInReviewTasks(); // Phase 3: Validation
      await this.processQueueForPRTasks(); // Phase 4: Create PR
      await this.monitorPullRequests(); // Phase 5: Monitor PR
      await this.processPRFixesNeeded(); // Phase 6: Apply fixes
      await this.processReadyForMerge(); // Phase 7: Final check
    } catch (error) {
      this.stats.errorsEncountered++;
      console.error('[Orchestrator] Poll error:', error);

      this.events.emit('orchestrator:error', {
        error: (error as Error).message,
        phase: this.currentPhase,
        timestamp: new Date().toISOString(),
      });
    }

    // Schedule next poll
    this.scheduleNextPoll();
  }

  /**
   * Phase 1: Process tasks in todo status
   * - Conduct research
   * - Create subtasks
   * - Move to researching
   */
  private async processTodoTasks(): Promise<void> {
    this.setPhase('researching');

    try {
      const tasks = await this.vibeKanban.listTasks({ status: 'todo' });

      for (const task of tasks) {
        // Skip if already being tracked
        if (this.trackedTasks.has(task.id)) {
          continue;
        }

        console.log(`[Orchestrator] Processing todo task: ${task.id} - ${task.title}`);

        // Start tracking
        this.trackTask(task.id, 'todo', 'researching');

        // Move to researching state in state machine
        await this.stateMachine.transition(task.id, 'researching', {
          description: task.description,
        });

        // Update Vibe-Kanban task
        await this.vibeKanban.updateTask(task.id, { status: 'researching' });

        // Conduct research (this will be continued in processResearchingTasks)
        this.stats.totalTasksProcessed++;
      }
    } catch (error) {
      console.error('[Orchestrator] Error processing todo tasks:', error);
    }
  }

  /**
   * Start workspace session for a task (hybrid approach)
   *
   * If autoStartWorkspaceSessions is enabled, automatically starts a Claude Code
   * workspace session for the task. Otherwise, the task is created but the session
   * must be manually started.
   */
  private async startWorkspaceSessionForTask(
    task: { id: string; title: string },
    repos: Array<{ id: string; branch?: string }>
  ): Promise<void> {
    // Check if auto-start is enabled
    if (!this.config.autoStartWorkspaceSessions) {
      console.log(
        `[Orchestrator] Auto-start disabled for task ${task.id} - task created but not started`
      );
      return;
    }

    try {
      const reposMapped = repos.map((r) => ({
        repo_id: r.id,
        base_branch: r.branch || this.config.defaultBaseBranch,
      }));

      await this.vibeKanban.startWorkspaceSession({
        taskId: task.id,
        executor: 'CLAUDE_CODE',
        repos: reposMapped,
      });

      console.log(`[Orchestrator] Started workspace session for task ${task.id}`);

      this.events.emit('orchestrator:workspace-started', {
        taskId: task.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[Orchestrator] Failed to start workspace for task ${task.id}:`, error);

      // Don't fail the task - just log the error
      this.events.emit('orchestrator:workspace-failed', {
        taskId: task.id,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Phase 1 (continued): Process tasks in researching status
   * - Complete research if needed
   * - Create subtasks
   * - Move to in_progress
   */
  private async processResearchingTasks(): Promise<void> {
    this.setPhase('researching');

    try {
      const tasks = await this.vibeKanban.listTasks({ status: 'inprogress' });
      const researchingTasks = tasks.filter(
        (t) => this.trackedTasks.get(t.id)?.state === 'researching'
      );

      for (const task of researchingTasks) {
        console.log(`[Orchestrator] Completing research for: ${task.id}`);

        try {
          // Conduct research
          const research = await this.researchService.conductResearch(task.id, task.description, {
            repositoryPath: process.cwd(),
            repository: this.config.githubRepository,
            branch: this.config.defaultBaseBranch,
          });

          this.stats.researchQueries++;

          // Create subtasks in Vibe-Kanban
          const createdSubtasks: Array<{ id: string; title: string }> = [];
          for (const subtask of research.subtasks) {
            try {
              const created = await this.vibeKanban.createSubtask(
                task.id,
                subtask.title,
                `${subtask.description}\n\n**Acceptance Criteria:**\n${subtask.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`
              );
              createdSubtasks.push({ id: created.id, title: subtask.title });

              this.events.emit('orchestrator:task-created', {
                taskId: created.id,
                title: subtask.title,
                parentId: task.id,
                timestamp: new Date().toISOString(),
              });
            } catch (error) {
              console.warn(`[Orchestrator] Failed to create subtask:`, error);
            }
          }

          // Start workspace sessions for subtasks if auto-start is enabled
          if (this.config.autoStartWorkspaceSessions && createdSubtasks.length > 0) {
            try {
              const repos = await this.vibeKanban.listRepos();
              for (const subtask of createdSubtasks) {
                await this.startWorkspaceSessionForTask(subtask, repos);
              }
            } catch (error) {
              console.warn('[Orchestrator] Failed to start workspace sessions:', error);
            }
          }

          // Transition to in_progress
          const result = await this.stateMachine.transition(task.id, 'in_progress', {
            subtasks: research.subtasks,
          });

          if (result.valid) {
            await this.vibeKanban.updateTask(task.id, { status: 'in_progress' });
            this.updateTaskState(task.id, 'in_progress', 'implementing');
          }
        } catch (error) {
          console.error(`[Orchestrator] Research failed for task ${task.id}:`, error);

          // Move back to todo on failure
          await this.vibeKanban.updateTask(task.id, { status: 'todo' });
          this.untrackTask(task.id);
        }
      }
    } catch (error) {
      console.error('[Orchestrator] Error processing researching tasks:', error);
    }
  }

  /**
   * Phase 3: Process tasks ready for review
   */
  private async processInProgressTasks(): Promise<void> {
    this.setPhase('implementing');

    // This phase tracks active implementation
    // The actual implementation happens via workspace sessions
    // which are triggered when tasks are created
  }

  /**
   * Phase 3: Process tasks in in_review status
   * - Validate changes
   * - Check acceptance criteria
   * - Move to queue_for_pr or back to in_progress
   */
  private async processInReviewTasks(): Promise<void> {
    this.setPhase('reviewing');

    try {
      const tasks = await this.vibeKanban.listTasks({ status: 'inreview' });

      for (const task of tasks) {
        const trackedTask = this.trackedTasks.get(task.id);
        if (!trackedTask || trackedTask.state !== 'in_review') {
          // Not yet in our tracking as in_review, add it
          this.updateTaskState(task.id, 'in_review', 'reviewing');
        }

        console.log(`[Orchestrator] Validating task: ${task.id}`);

        // Run validation (placeholder - would run actual checks)
        const issues = await this.validateTask(task);

        if (issues.length === 0) {
          // Validation passed - move to queue_for_pr
          const result = await this.stateMachine.transition(task.id, 'queue_for_pr', {
            issues: [],
          });

          if (result.valid) {
            await this.vibeKanban.updateTask(task.id, {
              status: 'in_progress',
              appendToDescription: '\n\n**Status:** Ready for PR creation',
            });
            this.updateTaskState(task.id, 'queue_for_pr', 'creating_pr');
          }
        } else {
          // Validation failed - move back to in_progress
          await this.vibeKanban.updateTask(task.id, {
            status: 'inprogress',
            appendToDescription: `\n\n**Issues Found:**\n${issues.join('\n')}`,
          });
          this.updateTaskState(task.id, 'in_progress', 'fixing');
        }
      }
    } catch (error) {
      console.error('[Orchestrator] Error processing in_review tasks:', error);
    }
  }

  /**
   * Phase 4: Process tasks ready for PR creation
   */
  private async processQueueForPRTasks(): Promise<void> {
    this.setPhase('creating_pr');

    try {
      // Find tasks marked as ready for PR
      const tasks = await this.vibeKanban.listTasks({ status: 'inprogress' });
      const readyForPR = tasks.filter(
        (t) =>
          t.description.includes('Ready for PR creation') ||
          this.trackedTasks.get(t.id)?.state === 'queue_for_pr'
      );

      for (const task of readyForPR) {
        console.log(`[Orchestrator] Creating PR for task: ${task.id}`);

        try {
          // Create PR using GitHub CLI
          const { stdout } = await execAsync(
            `gh pr create --title "${task.title}" --body "${this.generatePRBody(task)}" --base ${this.config.defaultBaseBranch} --repo ${this.config.githubRepository}`,
            { timeout: 30000 }
          );

          // Extract PR number from output
          const prMatch = stdout.match(/\/pull\/(\d+)/);
          const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;

          // Update task
          const result = await this.stateMachine.transition(task.id, 'pr_created', {
            prNumber,
          });

          if (result.valid) {
            await this.vibeKanban.updateTask(task.id, {
              status: 'inprogress',
              appendToDescription: `\n\n**PR Created:** #${prNumber}`,
            });
            this.updateTaskState(task.id, 'pr_created', 'monitoring_pr');

            this.stats.prsCreated++;

            this.events.emit('orchestrator:pr-created', {
              taskId: task.id,
              prNumber,
              prUrl: `https://github.com/${this.config.githubRepository}/pull/${prNumber}`,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error(`[Orchestrator] PR creation failed for task ${task.id}:`, error);

          // Add error to task description
          await this.vibeKanban.updateTask(task.id, {
            appendToDescription: `\n\n**PR Creation Failed:** ${(error as Error).message}`,
          });
        }
      }
    } catch (error) {
      console.error('[Orchestrator] Error creating PRs:', error);
    }
  }

  /**
   * Phase 5: Monitor PRs for comments and conflicts
   */
  private async monitorPullRequests(): Promise<void> {
    this.setPhase('monitoring_pr');

    try {
      // Get tasks with PRs created
      const prTasks = Array.from(this.trackedTasks.entries())
        .filter(([_, t]) => t.state === 'pr_created')
        .map(([id, _]) => id);

      for (const taskId of prTasks) {
        const task = await this.vibeKanban.getTask(taskId);
        const prMatch = task.description.match(/\*\*PR Created:\*\* #(\d+)/);

        if (prMatch) {
          const prNumber = parseInt(prMatch[1], 10);

          // Check for conflicts
          const hasConflicts = await this.prReviewService.checkForConflicts(prNumber);

          // Check CI status
          const ciStatus = await this.prReviewService.checkCIStatus(prNumber);

          // Analyze comments if CI failed or has conflicts
          if (hasConflicts || ciStatus === 'failure') {
            const analyses = await this.prReviewService.analyzePRComments(prNumber);

            if (analyses.length > 0) {
              // Move to pr_fixes_needed
              await this.stateMachine.transition(taskId, 'pr_fixes_needed');

              await this.vibeKanban.updateTask(taskId, {
                appendToDescription: `\n\n**PR Issues Detected:**\n${this.prReviewService.formatAnalysisAsMarkdown(String(prNumber), analyses)}`,
              });

              this.updateTaskState(taskId, 'pr_fixes_needed', 'fixing');
            }
          }
        }
      }
    } catch (error) {
      console.error('[Orchestrator] Error monitoring PRs:', error);
    }
  }

  /**
   * Phase 6: Process PR fixes needed
   */
  private async processPRFixesNeeded(): Promise<void> {
    this.setPhase('fixing');

    try {
      const tasks = await this.vibeKanban.listTasks({ status: 'inprogress' });
      const fixTasks = tasks.filter(
        (t) =>
          t.description.includes('PR Issues Detected') ||
          this.trackedTasks.get(t.id)?.state === 'pr_fixes_needed'
      );

      for (const task of fixTasks) {
        console.log(`[Orchestrator] Processing fixes for task: ${task.id}`);

        // Parse the issues from description
        const issues = this.parseIssuesFromDescription(task.description);

        // Generate fix suggestions and apply
        // This is where workspace sessions would be started
        // For now, we'll mark as ready for re-review
        await this.vibeKanban.updateTask(task.id, {
          status: 'inreview',
        });
        this.updateTaskState(task.id, 'in_review', 'reviewing');

        this.stats.fixesApplied++;
      }
    } catch (error) {
      console.error('[Orchestrator] Error processing PR fixes:', error);
    }
  }

  /**
   * Phase 7: Process ready for merge
   */
  private async processReadyForMerge(): Promise<void> {
    this.setPhase('finalizing');

    try {
      // Check PR tasks that are ready
      const prTasks = Array.from(this.trackedTasks.entries())
        .filter(([_, t]) => t.state === 'pr_created')
        .map(([id, _]) => id);

      for (const taskId of prTasks) {
        const task = await this.vibeKanban.getTask(taskId);
        const prMatch = task.description.match(/\*\*PR Created:\*\* #(\d+)/);

        if (prMatch) {
          const prNumber = parseInt(prMatch[1], 10);

          // Check CI status
          const ciStatus = await this.prReviewService.checkCIStatus(prNumber);
          const hasConflicts = await this.prReviewService.checkForConflicts(prNumber);

          if (ciStatus === 'success' && !hasConflicts) {
            // Ready for merge
            await this.stateMachine.transition(taskId, 'ready_for_merge');

            await this.vibeKanban.updateTask(taskId, {
              status: 'inreview',
              appendToDescription: '\n\n**Status:** Ready for merge ✅',
            });

            this.updateTaskState(taskId, 'ready_for_merge', 'idle');
          }
        }
      }

      // Check for completed tasks and mark them done
      const completedTasks = await this.vibeKanban.listTasks({ status: 'inreview' });
      for (const task of completedTasks) {
        if (task.description.includes('Ready for merge')) {
          await this.stateMachine.transition(task.id, 'completed');
          await this.vibeKanban.updateTask(task.id, { status: 'done' });

          this.stats.tasksCompleted++;
          this.untrackTask(task.id);

          console.log(`[Orchestrator] Task completed: ${task.id}`);
        }
      }
    } catch (error) {
      console.error('[Orchestrator] Error finalizing tasks:', error);
    }
  }

  /**
   * Validate a task's changes
   */
  private async validateTask(task: { id: string; description: string }): Promise<string[]> {
    const issues: string[] = [];

    // TODO: Implement actual validation
    // - Run linter
    // - Run type checker
    // - Run tests
    // - Check acceptance criteria

    return issues;
  }

  /**
   * Parse issues from task description
   */
  private parseIssuesFromDescription(description: string): string[] {
    const issues: string[] = [];
    const lines = description.split('\n');
    let inIssues = false;

    for (const line of lines) {
      if (line.includes('**PR Issues Detected:**')) {
        inIssues = true;
        continue;
      }
      if (inIssues) {
        if (line.startsWith('- ')) {
          issues.push(line.substring(2));
        }
      }
    }

    return issues;
  }

  /**
   * Generate PR body from task
   */
  private generatePRBody(task: { id: string; title: string; description: string }): string {
    return `## ${task.title}

${task.description}

---
Automated PR created by DevFlow Orchestrator
Task ID: ${task.id}`;
  }

  /**
   * Track a task
   */
  private trackTask(id: string, state: OrchestratorTaskState, phase: OrchestratorPhase): void {
    this.trackedTasks.set(id, {
      id,
      state,
      phase,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      metadata: {},
    });
  }

  /**
   * Update task state
   */
  private updateTaskState(
    id: string,
    state: OrchestratorTaskState,
    phase: OrchestratorPhase
  ): void {
    const tracked = this.trackedTasks.get(id);
    if (tracked) {
      tracked.state = state;
      tracked.phase = phase;
      tracked.lastActivityAt = new Date();
    }

    // Also update state machine
    this.stateMachine.setTaskState(id, {
      taskId: id,
      state,
      previousState: null,
      enteredAt: new Date(),
      metadata: {},
    });

    // Emit event
    this.events.emit('orchestrator:task-updated', {
      taskId: id,
      oldState: tracked?.state || 'todo',
      newStatus: state,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Untrack a task
   */
  private untrackTask(id: string): void {
    this.trackedTasks.delete(id);
    this.stateMachine.removeTaskState(id);
  }

  /**
   * Set current phase
   */
  private setPhase(phase: OrchestratorPhase): void {
    if (this.currentPhase !== phase) {
      const oldPhase = this.currentPhase;
      this.currentPhase = phase;

      this.events.emit('orchestrator:phase-changed', {
        from: oldPhase,
        to: phase,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Schedule next poll
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollTimer = setTimeout(() => {
      this.poll().catch((error) => {
        console.error('[Orchestrator] Poll loop error:', error);
      });
    }, this.config.pollInterval);
  }

  /**
   * Get current orchestrator state
   */
  getState(): OrchestratorState {
    return {
      isRunning: this.isRunning,
      currentPhase: this.currentPhase,
      activeTaskIds: Array.from(this.trackedTasks.keys()),
      lastPollAt: this.lastPollAt?.toISOString() || null,
      nextPollAt: this.pollTimer
        ? new Date(Date.now() + this.config.pollInterval).toISOString()
        : null,
      stats: { ...this.stats },
      config: { ...this.config },
      services: { ...this.servicesStatus },
    };
  }

  /**
   * Update orchestrator configuration
   */
  updateConfig(updates: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...updates };

    // If poll interval changed, reschedule
    if (this.isRunning && updates.pollInterval !== undefined) {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
      }
      this.scheduleNextPoll();
    }
  }

  /**
   * Get tracked tasks
   */
  getTrackedTasks(): Map<string, TrackedTask> {
    return new Map(this.trackedTasks);
  }
}

/**
 * Create an orchestrator service
 */
export function createOrchestratorService(
  events: EventEmitter,
  options?: OrchestratorServiceOptions
): OrchestratorService {
  return new OrchestratorService(events, options);
}

/**
 * Global orchestrator instance
 */
let globalOrchestrator: OrchestratorService | null = null;

export function getOrchestratorService(
  events?: EventEmitter,
  options?: OrchestratorServiceOptions
): OrchestratorService {
  if (!globalOrchestrator) {
    if (!events) {
      throw new OrchestratorServiceError(
        'Events emitter required for first-time initialization',
        'NO_EVENTS'
      );
    }
    globalOrchestrator = new OrchestratorService(events, options);
  }
  return globalOrchestrator;
}

export function resetOrchestratorService(): void {
  globalOrchestrator = null;
}
