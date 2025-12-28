/**
 * Vibe-Kanban MCP Client
 *
 * Wraps Vibe-Kanban MCP tools with error handling, retry logic,
 * and project auto-detection/creation.
 *
 * This client handles all Vibe-Kanban operations:
 * - Project management (find/create/list)
 * - Task management (create/update/list/get/delete)
 * - Repository management (list repos)
 * - Workspace sessions (start workspace for task execution)
 *
 * Vibe-Kanban MCP Tools Reference:
 * - mcp__vibe_kanban__list_projects
 * - mcp__vibe_kanban__list_tasks
 * - mcp__vibe_kanban__create_task
 * - mcp__vibe_kanban__update_task
 * - mcp__vibe_kanban__get_task
 * - mcp__vibe_kanban__delete_task
 * - mcp__vibe_kanban__list_repos
 * - mcp__vibe_kanban__start_workspace_session
 */

import type {
  VibeKanbanTask,
  VibeKanbanProject,
  VibeKanbanRepo,
  OrchestratorTaskState,
} from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import { getMCPBridge } from '../lib/mcp-bridge.js';

// Re-export types for convenience
export type { VibeKanbanTask, VibeKanbanProject, VibeKanbanRepo };

/**
 * Map orchestrator states to Vibe-Kanban statuses
 */
const STATE_TO_VIBE_STATUS: Record<OrchestratorTaskState, VibeKanbanTask['status']> = {
  todo: 'todo',
  researching: 'inprogress',
  in_progress: 'inprogress',
  in_review: 'inreview',
  queue_for_pr: 'inprogress',
  pr_created: 'inprogress',
  pr_fixes_needed: 'inprogress',
  ready_for_merge: 'inreview',
  completed: 'done',
};

/**
 * Map Vibe-Kanban statuses to orchestrator states
 */
const VIBE_STATUS_TO_STATE: Partial<Record<VibeKanbanTask['status'], OrchestratorTaskState>> = {
  todo: 'todo',
  inprogress: 'in_progress',
  inreview: 'in_review',
  done: 'completed',
  cancelled: 'todo', // Reset to todo on cancel
};

/**
 * Options for listing tasks
 */
export interface ListTasksOptions {
  /** Filter by status */
  status?: VibeKanbanTask['status'];
  /** Maximum number of results */
  limit?: number;
}

/**
 * Options for creating a task
 */
export interface CreateTaskOptions {
  /** Task title */
  title: string;
  /** Task description (supports markdown) */
  description?: string;
  /** Parent task ID */
  parentId?: string;
}

/**
 * Options for updating a task
 */
export interface UpdateTaskOptions {
  /** New title */
  title?: string;
  /** New description */
  description?: string;
  /** New status (orchestrator state) */
  status?: OrchestratorTaskState;
  /** Append to description */
  appendToDescription?: string;
}

/**
 * Options for starting a workspace session
 */
export interface WorkspaceSessionOptions {
  /** Task ID */
  taskId: string;
  /** Executor type */
  executor?: 'CLAUDE_CODE' | 'CODEX' | 'GEMINI' | 'CURSOR_AGENT' | 'OPENCODE';
  /** Executor variant */
  variant?: string;
  /** Repositories to include */
  repos: Array<{
    repoId: string;
    baseBranch: string;
  }>;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

/**
 * Vibe-Kanban Client Error
 */
export class VibeKanbanError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'VibeKanbanError';
  }
}

/**
 * Vibe-Kanban MCP Client
 *
 * This client uses the MCP tools available in the Claude Code environment.
 * The tools are called through the global tool interface.
 */
export class VibeKanbanClient {
  private projectId: string | null = null;
  private projectName: string;
  private projectCache: Map<string, VibeKanbanProject> = new Map();
  private retryConfig: RetryConfig;
  private connected = false;
  private events?: EventEmitter;

  constructor(
    options: { projectName?: string; retryConfig?: RetryConfig; events?: EventEmitter } = {}
  ) {
    this.projectName = options.projectName || 'DevFlow';
    this.retryConfig = options.retryConfig || DEFAULT_RETRY;
    this.events = options.events;

    // Initialize MCP bridge if events provided
    if (this.events) {
      getMCPBridge(this.events);
    }
  }

  /**
   * Initialize the client and find/create project
   */
  async connect(): Promise<void> {
    try {
      // Try to find existing project by name
      const project = await this.findProjectByName(this.projectName);

      if (project) {
        this.projectId = project.id;
        this.projectCache.set(project.id, project);
        console.log(`[VibeKanban] Connected to existing project: ${project.name} (${project.id})`);
      } else {
        // Create new project
        const newProject = await this.createProject(this.projectName);
        this.projectId = newProject.id;
        this.projectCache.set(newProject.id, newProject);
        console.log(`[VibeKanban] Created new project: ${newProject.name} (${newProject.id})`);
      }

      this.connected = true;
    } catch (error) {
      throw new VibeKanbanError(
        `Failed to connect to Vibe-Kanban: ${(error as Error).message}`,
        'CONNECTION_ERROR',
        error
      );
    }
  }

  /**
   * Disconnect from Vibe-Kanban
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.projectId = null;
    this.projectCache.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.projectId !== null;
  }

  /**
   * Get current project ID
   */
  getProjectId(): string {
    if (!this.projectId) {
      throw new VibeKanbanError('Not connected to a project', 'NOT_CONNECTED');
    }
    return this.projectId;
  }

  /**
   * List all projects
   */
  async listProjects(): Promise<VibeKanbanProject[]> {
    this.ensureConnected();

    try {
      const result = await this.callTool('mcp__vibe_kanban__list_projects', {});

      if (!result?.success) {
        throw new Error('Failed to list projects');
      }

      // Cache projects
      const projects = result.data || [];
      for (const project of projects) {
        this.projectCache.set(project.id, project);
      }

      return projects;
    } catch (error) {
      throw this.wrapError('Failed to list projects', error);
    }
  }

  /**
   * Find project by name
   */
  async findProjectByName(name: string): Promise<VibeKanbanProject | null> {
    try {
      const projects = await this.listProjects();
      return projects.find((p) => p.name === name) || null;
    } catch {
      return null;
    }
  }

  /**
   * Create a new project
   * Note: This may not be supported by the MCP API - included for completeness
   */
  async createProject(name: string): Promise<VibeKanbanProject> {
    // Try to find first - in most cases we'll use existing projects
    const existing = await this.findProjectByName(name);
    if (existing) {
      return existing;
    }

    // If project creation is not available, use the first available project
    const projects = await this.listProjects();
    if (projects.length > 0) {
      console.warn(
        `[VibeKanban] Using existing project "${projects[0].name}" instead of "${name}"`
      );
      return projects[0];
    }

    throw new VibeKanbanError('No projects available and cannot create new one', 'NO_PROJECTS');
  }

  /**
   * List tasks in current project
   */
  async listTasks(options?: ListTasksOptions): Promise<VibeKanbanTask[]> {
    this.ensureConnected();

    try {
      const params: Record<string, unknown> = {
        project_id: this.projectId,
      };

      if (options?.status) {
        params.status = options.status;
      }
      if (options?.limit) {
        params.limit = options.limit;
      }

      const result = await this.callTool('mcp__vibe_kanban__list_tasks', params);

      if (!result?.success) {
        throw new Error('Failed to list tasks');
      }

      return result.data || [];
    } catch (error) {
      throw this.wrapError('Failed to list tasks', error);
    }
  }

  /**
   * Create a new task
   */
  async createTask(options: CreateTaskOptions): Promise<VibeKanbanTask> {
    this.ensureConnected();

    try {
      const description = options.description || '';

      const result = await this.callTool('mcp__vibe_kanban__create_task', {
        project_id: this.projectId,
        title: options.title,
        description,
      });

      if (!result?.success || !result.data) {
        throw new Error('Failed to create task');
      }

      const task = result.data;
      console.log(`[VibeKanban] Created task: ${task.id} - ${task.title}`);

      return task;
    } catch (error) {
      throw this.wrapError('Failed to create task', error);
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(taskId: string, options: UpdateTaskOptions): Promise<void> {
    this.ensureConnected();

    try {
      const updates: Record<string, unknown> = {};

      if (options.title !== undefined) {
        updates.title = options.title;
      }

      if (options.description !== undefined) {
        updates.description = options.description;
      }

      if (options.appendToDescription) {
        // Get current task first
        const current = await this.getTask(taskId);
        updates.description = `${current.description}\n\n${options.appendToDescription}`;
      }

      if (options.status !== undefined) {
        updates.status = STATE_TO_VIBE_STATUS[options.status];
      }

      const result = await this.callTool('mcp__vibe_kanban__update_task', {
        task_id: taskId,
        ...updates,
      });

      if (!result?.success) {
        throw new Error('Failed to update task');
      }

      console.log(`[VibeKanban] Updated task: ${taskId}`);
    } catch (error) {
      throw this.wrapError('Failed to update task', error);
    }
  }

  /**
   * Get a specific task
   */
  async getTask(taskId: string): Promise<VibeKanbanTask> {
    this.ensureConnected();

    try {
      const result = await this.callTool('mcp__vibe_kanban__get_task', {
        task_id: taskId,
      });

      if (!result?.success || !result.data) {
        throw new Error(`Task not found: ${taskId}`);
      }

      return result.data;
    } catch (error) {
      throw this.wrapError(`Failed to get task ${taskId}`, error);
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    this.ensureConnected();

    try {
      const result = await this.callTool('mcp__vibe_kanban__delete_task', {
        task_id: taskId,
      });

      if (!result?.success) {
        throw new Error('Failed to delete task');
      }

      console.log(`[VibeKanban] Deleted task: ${taskId}`);
    } catch (error) {
      throw this.wrapError(`Failed to delete task ${taskId}`, error);
    }
  }

  /**
   * List repositories in the project
   */
  async listRepos(): Promise<VibeKanbanRepo[]> {
    this.ensureConnected();

    try {
      const result = await this.callTool('mcp__vibe_kanban__list_repos', {
        project_id: this.projectId,
      });

      if (!result?.success) {
        throw new Error('Failed to list repos');
      }

      return result.data || [];
    } catch (error) {
      throw this.wrapError('Failed to list repos', error);
    }
  }

  /**
   * Start a workspace session for task execution
   */
  async startWorkspaceSession(options: WorkspaceSessionOptions): Promise<void> {
    this.ensureConnected();

    try {
      const repos = options.repos.map((r) => ({
        repo_id: r.repoId,
        base_branch: r.baseBranch,
      }));

      const result = await this.callTool('mcp__vibe_kanban__start_workspace_session', {
        task_id: options.taskId,
        executor: options.executor || 'CLAUDE_CODE',
        variant: options.variant,
        repos,
      });

      if (!result?.success) {
        throw new Error('Failed to start workspace session');
      }

      console.log(`[VibeKanban] Started workspace session for task: ${options.taskId}`);
    } catch (error) {
      throw this.wrapError('Failed to start workspace session', error);
    }
  }

  /**
   * Create a subtask with parent reference
   */
  async createSubtask(
    parentTaskId: string,
    title: string,
    description?: string
  ): Promise<VibeKanbanTask> {
    // Create the task
    const task = await this.createTask({
      title,
      description: `${description || ''}\n\n**Parent Task:** ${parentTaskId}`,
    });

    // In Vibe-Kanban, hierarchy might be handled differently
    // For now, we reference the parent in the description

    return task;
  }

  /**
   * Parse task description to extract structured data
   */
  parseTaskDescription(description: string): {
    title: string;
    body: string;
    tags: string[];
    parentTask?: string;
    acceptanceCriteria: string[];
  } {
    const lines = description.split('\n');
    let title = '';
    let body = '';
    const tags: string[] = [];
    let parentTask: string | undefined;
    const acceptanceCriteria: string[] = [];
    let inCriteria = false;

    for (const line of lines) {
      if (line.startsWith('# ')) {
        title = line.substring(2).trim();
      } else if (line.startsWith('**Parent Task:**')) {
        const match = line.match(/\*\*Parent Task:\*\* ([a-f0-9-]+)/i);
        if (match) {
          parentTask = match[1];
        }
      } else if (line.startsWith('**Tags:**')) {
        const tagMatch = line.match(/\*\*Tags:\*\*(.+)/i);
        if (tagMatch) {
          tags.push(...tagMatch[1].split(',').map((t) => t.trim().replace(/^@/, '')));
        }
      } else if (line.startsWith('## Acceptance Criteria')) {
        inCriteria = true;
      } else if (inCriteria && line.startsWith('- ')) {
        acceptanceCriteria.push(line.substring(2).trim());
      } else if (inCriteria && line.match(/^##?\s/)) {
        inCriteria = false;
      } else {
        body += line + '\n';
      }
    }

    return {
      title: title || 'Untitled',
      body: body.trim(),
      tags,
      parentTask,
      acceptanceCriteria,
    };
  }

  /**
   * Ensure client is connected
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new VibeKanbanError('Client not connected', 'NOT_CONNECTED');
    }
    if (!this.projectId) {
      throw new VibeKanbanError('No project selected', 'NO_PROJECT');
    }
  }

  /**
   * Wrap an error with context
   */
  private wrapError(message: string, error: unknown): VibeKanbanError {
    if (error instanceof VibeKanbanError) {
      return error;
    }
    return new VibeKanbanError(message, undefined, error);
  }

  /**
   * Call an MCP tool with retry logic
   */
  private async callTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const bridge = getMCPBridge();

    const result = await bridge.callTool(toolName, params);

    if (!result.success) {
      throw new VibeKanbanError(result.error || 'MCP tool call failed', 'MCP_ERROR');
    }

    return result;
  }

  /**
   * Set the project ID directly (for auto-detected projects)
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
    this.connected = true;
  }
}

/**
 * Create a singleton instance for use across the application
 */
let globalClient: VibeKanbanClient | null = null;

export function getVibeKanbanClient(options?: {
  projectName?: string;
  retryConfig?: RetryConfig;
}): VibeKanbanClient {
  if (!globalClient) {
    globalClient = new VibeKanbanClient(options);
  }
  return globalClient;
}

export function resetVibeKanbanClient(): void {
  globalClient = null;
}
