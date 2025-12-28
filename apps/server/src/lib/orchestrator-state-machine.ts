/**
 * Orchestrator State Machine
 *
 * Defines valid state transitions for task lifecycle with validation gates.
 *
 * State Flow:
 *
 *     ┌─────────┐
 *     │   todo  │  (Initial state)
 *     └────┬────┘
 *          │
 *          ▼
 *     ┌─────────────┐
 *     │ researching │  (Phase 1: Research in progress)
 *     └──────┬──────┘
 *            │
 *            ▼
 *     ┌─────────────┐
 *     │ in_progress │  (Phase 2: Implementation)
 *     └──────┬──────┘
 *            │
 *            ▼
 *     ┌─────────────┐
 *     │  in_review  │  (Phase 3: Validation)
 *     └──────┬──────┘
 *            │
 *     ┌──────┴──────┐
 *     │             │
 *     ▼             ▼
 * ┌─────────┐  ┌──────────────┐
 │  queue  │  │   in_progress │  (Validation failed, back to impl)
 * │ _for_pr │  └──────────────┘
 * └────┬────┘
 *      │
 *      ▼
 * ┌─────────────┐
 * │  pr_created │  (Phase 4: PR created)
 * └──────┬──────┘
 *        │
 *   ┌────┴────┐
 *   │         │
 *   ▼         ▼
 * ┌────────┐ ┌───────────────┐
 │  ready  │ │ pr_fixes_needed│  (Comments/conflicts found)
 * │ _merge │ └───────┬───────┘
 * └────┬───┘         │
 *      │             ▼
 *      │      ┌─────────────┐
 *      │      │  in_review  │  (Phase 6: After fixes)
 *      │      └──────┬──────┘
 *      │             │
 *      └──────┬──────┘
 *             │
 *             ▼
 *      ┌──────────┐
 *      │completed │  (Phase 7: Done)
 *      └──────────┘
 */

import type { EventEmitter } from './events.js';
import type { OrchestratorTaskState, StateTransitionResult } from '@automaker/types';

/**
 * State transition definition
 */
interface StateTransition {
  from: OrchestratorTaskState;
  to: OrchestratorTaskState;
  phase?: string;
  validation?: (context?: Record<string, unknown>) => Promise<boolean> | boolean;
  errorMessage?: string;
}

/**
 * State machine configuration
 */
interface StateMachineConfig {
  /** Whether to allow skipping validations */
  strictMode: boolean;
  /** Custom transitions */
  customTransitions?: StateTransition[];
}

/**
 * Task state with metadata
 */
export interface TaskState {
  taskId: string;
  state: OrchestratorTaskState;
  previousState: OrchestratorTaskState | null;
  enteredAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Orchestrator State Machine
 *
 * Manages task lifecycle state transitions with validation.
 */
export class OrchestratorStateMachine {
  private events: EventEmitter;
  private config: StateMachineConfig;
  private transitions: Map<string, StateTransition[]> = new Map();
  private taskStates: Map<string, TaskState> = new Map();

  constructor(events: EventEmitter, config?: Partial<StateMachineConfig>) {
    this.events = events;
    this.config = {
      strictMode: true,
      ...config,
    };
    this.initializeTransitions();
  }

  /**
   * Initialize all valid state transitions
   */
  private initializeTransitions(): void {
    // todo -> researching (Phase 1 start)
    this.addTransition({
      from: 'todo',
      to: 'researching',
      phase: 'research',
    });

    // researching -> in_progress (Phase 2: Research complete, start implementation)
    this.addTransition({
      from: 'researching',
      to: 'in_progress',
      phase: 'implement',
      validation: async (ctx) => {
        // Validate: research complete, subtasks created
        const hasSubtasks = Array.isArray(ctx?.subtasks) && ctx.subtasks.length > 0;
        return hasSubtasks || !this.config.strictMode;
      },
      errorMessage: 'Research must produce at least one subtask',
    });

    // in_progress -> in_review (Phase 3: Implementation complete, ready for review)
    this.addTransition({
      from: 'in_progress',
      to: 'in_review',
      phase: 'review',
    });

    // in_review -> queue_for_pr (Validation passed, ready for PR)
    this.addTransition({
      from: 'in_review',
      to: 'queue_for_pr',
      phase: 'create_pr',
      validation: async (ctx) => {
        // Validate: no issues found
        const issues = ctx?.issues as string[] | undefined;
        return !issues || issues.length === 0 || !this.config.strictMode;
      },
      errorMessage: 'Cannot create PR with unresolved issues',
    });

    // in_review -> in_progress (Validation failed, needs fixes)
    this.addTransition({
      from: 'in_review',
      to: 'in_progress',
      phase: 'fix',
    });

    // queue_for_pr -> pr_created (PR created successfully)
    this.addTransition({
      from: 'queue_for_pr',
      to: 'pr_created',
      phase: 'monitor_pr',
      validation: async (ctx) => {
        // Validate: PR created successfully
        return !!ctx?.prNumber || !this.config.strictMode;
      },
      errorMessage: 'PR creation must succeed',
    });

    // pr_created -> pr_fixes_needed (Phase 5: Issues found in PR)
    this.addTransition({
      from: 'pr_created',
      to: 'pr_fixes_needed',
      phase: 'fix',
    });

    // pr_fixes_needed -> in_review (Phase 6: Fixes implemented)
    this.addTransition({
      from: 'pr_fixes_needed',
      to: 'in_review',
      phase: 'review',
      validation: async (ctx) => {
        // Validate: fixes committed
        return !!ctx?.fixesApplied || !this.config.strictMode;
      },
      errorMessage: 'Fixes must be applied before returning to review',
    });

    // pr_created -> ready_for_merge (Phase 7: All checks passed)
    this.addTransition({
      from: 'pr_created',
      to: 'ready_for_merge',
      phase: 'finalize',
      validation: async (ctx) => {
        // Validate: all checks passed
        const checks = ctx?.ciChecks as { passed: boolean } | undefined;
        return checks?.passed !== false || !this.config.strictMode;
      },
      errorMessage: 'All CI checks must pass before ready for merge',
    });

    // ready_for_merge -> completed (Human approved)
    this.addTransition({
      from: 'ready_for_merge',
      to: 'completed',
      phase: 'complete',
    });

    // Emergency transitions (can go back to todo from anywhere)
    this.addTransition({ from: 'researching', to: 'todo' });
    this.addTransition({ from: 'in_progress', to: 'todo' });
    this.addTransition({ from: 'in_review', to: 'todo' });
    this.addTransition({ from: 'queue_for_pr', to: 'todo' });
    this.addTransition({ from: 'pr_created', to: 'todo' });
    this.addTransition({ from: 'pr_fixes_needed', to: 'todo' });
    this.addTransition({ from: 'ready_for_merge', to: 'todo' });

    // Add custom transitions if provided
    if (this.config.customTransitions) {
      for (const transition of this.config.customTransitions) {
        this.addTransition(transition);
      }
    }
  }

  /**
   * Add a transition to the state machine
   */
  addTransition(transition: StateTransition): void {
    const key = transition.from;
    const existing = this.transitions.get(key) || [];
    existing.push(transition);
    this.transitions.set(key, existing);
  }

  /**
   * Get all valid transitions from a state
   */
  getValidTransitions(from: OrchestratorTaskState): OrchestratorTaskState[] {
    const transitions = this.transitions.get(from) || [];
    return transitions.map((t) => t.to);
  }

  /**
   * Check if a transition is valid
   */
  isValidTransition(from: OrchestratorTaskState, to: OrchestratorTaskState): boolean {
    const transitions = this.transitions.get(from) || [];
    return transitions.some((t) => t.to === to);
  }

  /**
   * Get the transition definition
   */
  getTransition(
    from: OrchestratorTaskState,
    to: OrchestratorTaskState
  ): StateTransition | undefined {
    const transitions = this.transitions.get(from) || [];
    return transitions.find((t) => t.to === to);
  }

  /**
   * Transition a task to a new state
   */
  async transition(
    taskId: string,
    to: OrchestratorTaskState,
    context?: Record<string, unknown>
  ): Promise<StateTransitionResult> {
    // Get current state
    const currentState = this.getTaskState(taskId);
    const from = currentState?.state || 'todo';

    // Check if transition is valid
    if (!this.isValidTransition(from, to)) {
      const result: StateTransitionResult = {
        valid: false,
        error: `Invalid transition from ${from} to ${to}`,
        warnings: [],
      };

      this.events.emit('orchestrator:invalid-transition', {
        taskId,
        from,
        to,
        timestamp: new Date().toISOString(),
      });

      return result;
    }

    // Get transition definition
    const transitionDef = this.getTransition(from, to);
    if (!transitionDef) {
      return {
        valid: false,
        error: `No transition definition from ${from} to ${to}`,
        warnings: [],
      };
    }

    // Run validation if present
    const warnings: string[] = [];
    if (transitionDef.validation) {
      try {
        const valid = await transitionDef.validation(context);
        if (!valid) {
          const result: StateTransitionResult = {
            valid: false,
            error: transitionDef.errorMessage || `Validation failed for transition to ${to}`,
            warnings,
          };

          this.events.emit('orchestrator:validation-failed', {
            taskId,
            state: to,
            issues: [transitionDef.errorMessage || 'Validation failed'],
            timestamp: new Date().toISOString(),
          });

          return result;
        }
      } catch (error) {
        return {
          valid: false,
          error: `Validation error: ${(error as Error).message}`,
          warnings,
        };
      }
    }

    // Update task state
    this.setTaskState(taskId, {
      taskId,
      state: to,
      previousState: from,
      enteredAt: new Date(),
      metadata: context || {},
    });

    // Emit state change event
    this.events.emit('orchestrator:state-changed', {
      taskId,
      from,
      to,
      timestamp: new Date().toISOString(),
      phase: transitionDef.phase,
    });

    return {
      valid: true,
      warnings,
    };
  }

  /**
   * Get task state
   */
  getTaskState(taskId: string): TaskState | undefined {
    return this.taskStates.get(taskId);
  }

  /**
   * Set task state
   */
  setTaskState(taskId: string, state: TaskState): void {
    this.taskStates.set(taskId, state);
  }

  /**
   * Remove task state
   */
  removeTaskState(taskId: string): void {
    this.taskStates.delete(taskId);
  }

  /**
   * Get all task states
   */
  getAllTaskStates(): Map<string, TaskState> {
    return new Map(this.taskStates);
  }

  /**
   * Get tasks in a specific state
   */
  getTasksInState(state: OrchestratorTaskState): string[] {
    const result: string[] = [];
    for (const [taskId, taskState] of this.taskStates.entries()) {
      if (taskState.state === state) {
        result.push(taskId);
      }
    }
    return result;
  }

  /**
   * Clear all task states
   */
  clearAllStates(): void {
    this.taskStates.clear();
  }

  /**
   * Get state machine statistics
   */
  getStats(): {
    totalTasks: number;
    tasksByState: Record<OrchestratorTaskState, number>;
    averageTimeInState: Record<OrchestratorTaskState, number>;
  } {
    const tasksByState: Record<OrchestratorTaskState, number> = {
      todo: 0,
      researching: 0,
      in_progress: 0,
      in_review: 0,
      queue_for_pr: 0,
      pr_created: 0,
      pr_fixes_needed: 0,
      ready_for_merge: 0,
      completed: 0,
    };

    const totalTimeInState: Record<OrchestratorTaskState, number[]> = {
      todo: [],
      researching: [],
      in_progress: [],
      in_review: [],
      queue_for_pr: [],
      pr_created: [],
      pr_fixes_needed: [],
      ready_for_merge: [],
      completed: [],
    };

    const now = Date.now();

    for (const taskState of this.taskStates.values()) {
      tasksByState[taskState.state]++;

      const timeInState = now - taskState.enteredAt.getTime();
      totalTimeInState[taskState.state].push(timeInState);
    }

    const averageTimeInState: Record<OrchestratorTaskState, number> = {
      todo: 0,
      researching: 0,
      in_progress: 0,
      in_review: 0,
      queue_for_pr: 0,
      pr_created: 0,
      pr_fixes_needed: 0,
      ready_for_merge: 0,
      completed: 0,
    };

    for (const state of Object.keys(totalTimeInState) as OrchestratorTaskState[]) {
      const times = totalTimeInState[state];
      if (times.length > 0) {
        const sum = times.reduce((a, b) => a + b, 0);
        averageTimeInState[state] = sum / times.length;
      }
    }

    return {
      totalTasks: this.taskStates.size,
      tasksByState,
      averageTimeInState,
    };
  }

  /**
   * Export state machine diagram (Mermaid format)
   */
  exportMermaidDiagram(): string {
    const lines = ['```mermaid', 'stateDiagram-v2', '    [*] --> todo'];

    // Collect all unique transitions
    const seen = new Set<string>();
    for (const [from, transitions] of this.transitions.entries()) {
      for (const transition of transitions) {
        const key = `${from}_${transition.to}`;
        if (!seen.has(key)) {
          seen.add(key);
          lines.push(`    ${from} --> ${transition.to}`);
        }
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Validate a full workflow path
   */
  validateWorkflowPath(path: OrchestratorTaskState[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];

      if (!this.isValidTransition(from, to)) {
        errors.push(`Invalid transition at position ${i}: ${from} -> ${to}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Create a state machine with default configuration
 */
export function createOrchestratorStateMachine(
  events: EventEmitter,
  config?: Partial<StateMachineConfig>
): OrchestratorStateMachine {
  return new OrchestratorStateMachine(events, config);
}
