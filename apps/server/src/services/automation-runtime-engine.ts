/**
 * Automation Runtime Engine - Loads, parses, and executes automation definitions.
 *
 * Features:
 * - Automation definition loading from global/project scope
 * - Validation/parsing for automation JSON files
 * - Extensible step-type registry
 * - Variable resolution with system/project/workflow/steps scopes
 * - Step input/output piping and run status tracking
 */

import path from 'path';
import { createLogger } from '@automaker/utils';
import {
  getGlobalAutomationsDir,
  getProjectAutomationsDir,
  ensureGlobalAutomationsDir,
  ensureProjectAutomationsDir,
  getAutomakerDir,
} from '@automaker/platform';
import type {
  AutomationDefinition,
  AutomationRun,
  AutomationRunError,
  AutomationScope,
  AutomationStep,
  AutomationStepExecutor,
  AutomationStepExecutionContext,
  AutomationStepRun,
  AutomationTrigger,
  AutomationVariableValue,
  ExecuteAutomationOptions,
  VariableContext,
} from '@automaker/types';
import * as secureFs from '../lib/secure-fs.js';
import { registerAutomationBuiltins } from './automation-builtins.js';
import type { EventEmitter } from '../lib/events.js';
import { getAutomationVariableService } from './automation-variable-service.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('AutomationRuntimeEngine');
const AUTOMATION_FILE_EXTENSION = '.json';
/** Maximum nesting depth for template variable resolution — prevents runaway recursion */
const MAX_TEMPLATE_RESOLUTION_DEPTH = 10;

interface RunVariableContext {
  run: {
    id: string;
    automationId: string;
    startedAt: string;
  };
  system: Record<string, AutomationVariableValue>;
  project: Record<string, AutomationVariableValue>;
  workflow: Record<string, AutomationVariableValue>;
  steps: Record<string, { output: unknown }>;
}

interface LoadAutomationOptions {
  scope?: AutomationScope;
  projectPath?: string;
  /** When false, throws if a file with the same id already exists (default: true) */
  overwrite?: boolean;
}

interface ExecuteByIdOptions extends ExecuteAutomationOptions {
  scope?: AutomationScope;
}

class AutomationDefinitionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AutomationDefinitionError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAutomationVariableValue(value: unknown): value is AutomationVariableValue {
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isAutomationVariableValue(entry));
  }

  if (isRecord(value)) {
    return Object.values(value).every((entry) => isAutomationVariableValue(entry));
  }

  return false;
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toRunError(error: unknown, stepId?: string): AutomationRunError {
  if (error instanceof AutomationDefinitionError) {
    return {
      code: error.code,
      message: error.message,
      stepId,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'EXECUTION_ERROR',
      message: error.message,
      stepId,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
    stepId,
  };
}

function parseAutomationStep(rawStep: unknown, index: number): AutomationStep {
  if (!isRecord(rawStep)) {
    throw new AutomationDefinitionError(
      `Step at index ${index} must be an object`,
      'INVALID_STEP_STRUCTURE'
    );
  }

  const id = rawStep.id;
  const type = rawStep.type;

  if (typeof id !== 'string' || !id.trim()) {
    throw new AutomationDefinitionError(
      `Step at index ${index} is missing a valid "id"`,
      'INVALID_STEP_ID'
    );
  }

  if (typeof type !== 'string' || !type.trim()) {
    throw new AutomationDefinitionError(
      `Step "${id}" is missing a valid "type"`,
      'INVALID_STEP_TYPE'
    );
  }

  if (
    rawStep.output !== undefined &&
    (typeof rawStep.output !== 'string' || !rawStep.output.trim())
  ) {
    throw new AutomationDefinitionError(
      `Step "${id}" has invalid "output"; expected non-empty string`,
      'INVALID_STEP_OUTPUT'
    );
  }

  if (
    rawStep.timeoutMs !== undefined &&
    (typeof rawStep.timeoutMs !== 'number' || rawStep.timeoutMs <= 0)
  ) {
    throw new AutomationDefinitionError(
      `Step "${id}" has invalid "timeoutMs"; expected positive number`,
      'INVALID_STEP_TIMEOUT'
    );
  }

  return {
    id,
    type,
    name: typeof rawStep.name === 'string' ? rawStep.name : undefined,
    input: rawStep.input,
    config: isRecord(rawStep.config) ? rawStep.config : undefined,
    output: typeof rawStep.output === 'string' ? rawStep.output : undefined,
    continueOnError: Boolean(rawStep.continueOnError),
    timeoutMs: typeof rawStep.timeoutMs === 'number' ? rawStep.timeoutMs : undefined,
  };
}

export function parseAutomationDefinition(
  rawDefinition: unknown,
  defaultScope?: AutomationScope
): AutomationDefinition {
  if (!isRecord(rawDefinition)) {
    throw new AutomationDefinitionError(
      'Automation definition must be an object',
      'INVALID_DEFINITION'
    );
  }

  const version = rawDefinition.version;
  if (version !== 1) {
    throw new AutomationDefinitionError(
      `Unsupported automation version: ${String(version)}. Expected version 1`,
      'UNSUPPORTED_VERSION'
    );
  }

  const id = rawDefinition.id;
  const name = rawDefinition.name;
  const scope = rawDefinition.scope;
  const trigger = rawDefinition.trigger;
  const steps = rawDefinition.steps;

  if (typeof id !== 'string' || !id.trim()) {
    throw new AutomationDefinitionError('Automation "id" is required', 'INVALID_AUTOMATION_ID');
  }

  if (typeof name !== 'string' || !name.trim()) {
    throw new AutomationDefinitionError('Automation "name" is required', 'INVALID_AUTOMATION_NAME');
  }

  const resolvedScope = scope === 'global' || scope === 'project' ? scope : defaultScope;

  if (!resolvedScope) {
    throw new AutomationDefinitionError(
      'Automation "scope" must be "global" or "project"',
      'INVALID_AUTOMATION_SCOPE'
    );
  }

  if (!isRecord(trigger)) {
    throw new AutomationDefinitionError('Automation "trigger" is required', 'INVALID_TRIGGER');
  }

  if (
    trigger.type !== 'manual' &&
    trigger.type !== 'event' &&
    trigger.type !== 'schedule' &&
    trigger.type !== 'webhook' &&
    trigger.type !== 'date'
  ) {
    throw new AutomationDefinitionError(
      'Automation trigger.type must be one of: manual, event, schedule, webhook, date',
      'INVALID_TRIGGER_TYPE'
    );
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new AutomationDefinitionError(
      'Automation "steps" must be a non-empty array',
      'INVALID_STEPS'
    );
  }

  const parsedSteps = steps.map((step, index) => parseAutomationStep(step, index));
  const stepIds = new Set<string>();
  for (const step of parsedSteps) {
    if (stepIds.has(step.id)) {
      throw new AutomationDefinitionError(
        `Duplicate step id "${step.id}" is not allowed`,
        'DUPLICATE_STEP_ID'
      );
    }
    stepIds.add(step.id);
  }

  const rawVariables = rawDefinition.variables;
  let parsedVariables: Record<string, AutomationVariableValue> | undefined;
  if (rawVariables !== undefined) {
    if (!isRecord(rawVariables)) {
      throw new AutomationDefinitionError(
        'Automation "variables" must be an object',
        'INVALID_VARIABLES'
      );
    }

    parsedVariables = {};
    for (const [key, value] of Object.entries(rawVariables)) {
      if (!isAutomationVariableValue(value)) {
        throw new AutomationDefinitionError(
          `Automation variable "${key}" is not JSON-compatible`,
          'INVALID_VARIABLE_VALUE'
        );
      }
      parsedVariables[key] = value;
    }
  }

  return {
    version: 1,
    id,
    name,
    description:
      typeof rawDefinition.description === 'string' ? rawDefinition.description : undefined,
    enabled: typeof rawDefinition.enabled === 'boolean' ? rawDefinition.enabled : true,
    scope: resolvedScope,
    trigger: {
      type: trigger.type,
      event: typeof trigger.event === 'string' ? trigger.event : undefined,
      cron: typeof trigger.cron === 'string' ? trigger.cron : undefined,
      timezone: typeof trigger.timezone === 'string' ? trigger.timezone : undefined,
      date: typeof trigger.date === 'string' ? trigger.date : undefined,
      methods: Array.isArray(trigger.methods)
        ? (trigger.methods.filter(
            (method) =>
              method === 'GET' || method === 'POST' || method === 'PUT' || method === 'PATCH'
          ) as ('GET' | 'POST' | 'PUT' | 'PATCH')[])
        : undefined,
      secret: typeof trigger.secret === 'string' ? trigger.secret : undefined,
      filter: typeof trigger.filter === 'string' ? trigger.filter : undefined,
      metadata: isRecord(trigger.metadata)
        ? trigger.metadata
        : {
            ...(typeof trigger.timezone === 'string' ? { timezone: trigger.timezone } : {}),
            ...(typeof trigger.date === 'string' ? { date: trigger.date } : {}),
            ...(Array.isArray(trigger.methods) ? { methods: trigger.methods } : {}),
            ...(typeof trigger.secret === 'string' ? { secret: trigger.secret } : {}),
            ...(typeof trigger.filter === 'string' ? { filter: trigger.filter } : {}),
          },
    },
    variables: parsedVariables,
    steps: parsedSteps,
    createdAt: typeof rawDefinition.createdAt === 'string' ? rawDefinition.createdAt : undefined,
    updatedAt: typeof rawDefinition.updatedAt === 'string' ? rawDefinition.updatedAt : undefined,
  };
}

function buildProjectVariables(projectPath?: string): Record<string, AutomationVariableValue> {
  if (!projectPath) {
    return {
      path: null,
      name: null,
      automakerDir: null,
    };
  }

  return {
    path: projectPath,
    name: path.basename(projectPath),
    automakerDir: getAutomakerDir(projectPath),
  };
}

function getPathValue(root: unknown, segments: string[]): unknown {
  let current: unknown = root;

  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function resolvePathExpression(expression: string, context: RunVariableContext): unknown {
  const trimmed = expression.trim();
  if (!trimmed) return undefined;

  const [scope, ...segments] = trimmed.split('.').filter(Boolean);
  if (!scope) return undefined;

  switch (scope) {
    case 'run':
      return segments.length === 0 ? context.run : getPathValue(context.run, segments);
    case 'system':
      return segments.length === 0 ? context.system : getPathValue(context.system, segments);
    case 'project':
      return segments.length === 0 ? context.project : getPathValue(context.project, segments);
    case 'workflow':
      return segments.length === 0 ? context.workflow : getPathValue(context.workflow, segments);
    case 'steps':
      return segments.length === 0 ? context.steps : getPathValue(context.steps, segments);
    default:
      return undefined;
  }
}

function resolveTemplate(value: unknown, context: RunVariableContext, depth = 0): unknown {
  if (depth > MAX_TEMPLATE_RESOLUTION_DEPTH) {
    throw new AutomationDefinitionError(
      'Variable resolution exceeded maximum depth (possible cycle)',
      'VARIABLE_RESOLUTION_DEPTH_EXCEEDED'
    );
  }

  if (typeof value === 'string') {
    const fullMatch = value.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
    if (fullMatch) {
      const resolved = resolvePathExpression(fullMatch[1], context);
      if (resolved === undefined) {
        throw new AutomationDefinitionError(
          `Unable to resolve variable: ${fullMatch[1]}`,
          'UNRESOLVED_VARIABLE'
        );
      }
      return typeof resolved === 'string' && resolved.includes('{{')
        ? resolveTemplate(resolved, context, depth + 1)
        : resolved;
    }

    if (!value.includes('{{')) {
      return value;
    }

    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expression: string) => {
      const resolved = resolvePathExpression(expression, context);
      if (resolved === undefined) {
        throw new AutomationDefinitionError(
          `Unable to resolve variable: ${expression}`,
          'UNRESOLVED_VARIABLE'
        );
      }
      if (resolved !== null && typeof resolved === 'object') {
        return JSON.stringify(resolved);
      }
      return String(resolved);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplate(item, context, depth + 1));
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = resolveTemplate(nestedValue, context, depth + 1);
    }
    return output;
  }

  return value;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number,
  timeoutMessage = 'Step execution timeout'
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new AutomationDefinitionError(timeoutMessage, 'STEP_TIMEOUT'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export class AutomationStepRegistry {
  private executors = new Map<string, AutomationStepExecutor>();

  register(executor: AutomationStepExecutor): void {
    if (!executor.type?.trim()) {
      throw new AutomationDefinitionError('Executor type is required', 'INVALID_EXECUTOR_TYPE');
    }
    this.executors.set(executor.type, executor);
  }

  unregister(type: string): boolean {
    return this.executors.delete(type);
  }

  get(type: string): AutomationStepExecutor | undefined {
    return this.executors.get(type);
  }

  has(type: string): boolean {
    return this.executors.has(type);
  }

  listTypes(): string[] {
    return Array.from(this.executors.keys()).sort((a, b) => a.localeCompare(b));
  }
}

function createDefaultStepRegistry(
  settingsService?: SettingsService | null
): AutomationStepRegistry {
  const registry = new AutomationStepRegistry();

  registerAutomationBuiltins(registry, undefined, settingsService);

  registry.register({
    type: 'noop',
    execute: (context) => context.input,
  });

  registry.register({
    type: 'template',
    execute: (context) => {
      const templateValue = context.step.config?.template;
      return templateValue === undefined ? context.input : templateValue;
    },
  });

  registry.register({
    type: 'fail',
    execute: (context) => {
      const message =
        typeof context.step.config?.message === 'string'
          ? context.step.config.message
          : 'Automation step failed intentionally';
      throw new AutomationDefinitionError(message, 'STEP_FAILURE');
    },
  });

  return registry;
}

export class AutomationDefinitionStore {
  constructor(private readonly dataDir: string) {}

  private getScopeDir(scope: AutomationScope, projectPath?: string): string {
    if (scope === 'global') {
      return getGlobalAutomationsDir(this.dataDir);
    }

    if (!projectPath) {
      throw new AutomationDefinitionError(
        'projectPath is required for project-scoped automations',
        'PROJECT_PATH_REQUIRED'
      );
    }

    return getProjectAutomationsDir(projectPath);
  }

  async listAutomations(options: LoadAutomationOptions = {}): Promise<AutomationDefinition[]> {
    const scope = options.scope ?? 'global';
    const dir = this.getScopeDir(scope, options.projectPath);

    try {
      const entries = (await secureFs.readdir(dir)) as string[];
      const jsonFiles = entries.filter((entry) => entry.endsWith(AUTOMATION_FILE_EXTENSION));

      const automations: AutomationDefinition[] = [];
      for (const fileName of jsonFiles) {
        const fullPath = path.join(dir, fileName);
        try {
          const content = (await secureFs.readFile(fullPath, 'utf-8')) as string;
          const raw = JSON.parse(content);
          automations.push(parseAutomationDefinition(raw, scope));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`Skipping invalid automation file ${fullPath}: ${errorMessage}`);
        }
      }

      return automations;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Load a single automation definition by ID.
   *
   * Uses direct file path lookup (O(1)) when possible instead of listing all
   * files and scanning for the matching ID (O(n)). Falls back to list scan
   * only when the direct-read file contains a different ID than expected
   * (defensive: automation was renamed on disk without renaming the file).
   */
  async loadAutomationById(
    automationId: string,
    options: LoadAutomationOptions = {}
  ): Promise<AutomationDefinition | null> {
    const fileName = `${automationId}${AUTOMATION_FILE_EXTENSION}`;

    if (options.scope) {
      const dir = this.getScopeDir(options.scope, options.projectPath);
      const definition = await this.loadFileByPath(path.join(dir, fileName), options.scope);
      if (definition && definition.id === automationId) return definition;
      // File name doesn't match ID (renamed file) — fall back to scan
      const automations = await this.listAutomations(options);
      return automations.find((a) => a.id === automationId) ?? null;
    }

    if (options.projectPath) {
      const dir = this.getScopeDir('project', options.projectPath);
      const definition = await this.loadFileByPath(path.join(dir, fileName), 'project');
      if (definition && definition.id === automationId) return definition;
    }

    const globalDir = this.getScopeDir('global');
    const definition = await this.loadFileByPath(path.join(globalDir, fileName), 'global');
    if (definition && definition.id === automationId) return definition;

    return null;
  }

  private async loadFileByPath(
    filePath: string,
    defaultScope: AutomationScope
  ): Promise<AutomationDefinition | null> {
    try {
      const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
      const raw = JSON.parse(content);
      return parseAutomationDefinition(raw, defaultScope);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to load automation from ${filePath}: ${errorMessage}`);
      return null;
    }
  }

  async ensureScopeDir(scope: AutomationScope, projectPath?: string): Promise<string> {
    if (scope === 'global') {
      return ensureGlobalAutomationsDir(this.dataDir);
    }

    if (!projectPath) {
      throw new AutomationDefinitionError(
        'projectPath is required for project-scoped automations',
        'PROJECT_PATH_REQUIRED'
      );
    }

    return ensureProjectAutomationsDir(projectPath);
  }

  /**
   * Save an automation definition to disk. Creates or overwrites the file.
   * Returns the saved definition with updated timestamps.
   *
   * When `options.overwrite` is explicitly `false`, throws if a definition with
   * the same id already exists in the target scope.
   */
  async saveAutomation(
    definition: AutomationDefinition,
    options: LoadAutomationOptions = {}
  ): Promise<AutomationDefinition> {
    const scope = definition.scope ?? options.scope ?? 'global';
    const projectPath = options.projectPath;

    const dir = await this.ensureScopeDir(scope, projectPath);
    const filePath = path.join(dir, `${definition.id}${AUTOMATION_FILE_EXTENSION}`);

    // If overwrite is explicitly false, reject if file already exists
    if (options.overwrite === false) {
      try {
        await secureFs.readFile(filePath, 'utf-8');
        throw new AutomationDefinitionError(
          `Automation with id "${definition.id}" already exists`,
          'AUTOMATION_ALREADY_EXISTS'
        );
      } catch (error) {
        if (error instanceof AutomationDefinitionError) throw error;
        // ENOENT means file doesn't exist — proceed normally
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }

    const now = nowIso();
    const saved: AutomationDefinition = {
      ...definition,
      scope,
      createdAt: definition.createdAt ?? now,
      updatedAt: now,
    };

    await secureFs.writeFile(filePath, JSON.stringify(saved, null, 2), 'utf-8');
    logger.info(`Saved automation definition: ${definition.id} (scope: ${scope})`);
    return saved;
  }

  /**
   * Delete an automation definition from disk.
   * Returns true if deleted, false if not found.
   */
  async deleteAutomation(
    automationId: string,
    options: LoadAutomationOptions = {}
  ): Promise<boolean> {
    const scope = options.scope ?? 'global';
    const dir = this.getScopeDir(scope, options.projectPath);
    const filePath = path.join(dir, `${automationId}${AUTOMATION_FILE_EXTENSION}`);

    try {
      await secureFs.unlink(filePath);
      logger.info(`Deleted automation definition: ${automationId} (scope: ${scope})`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }
}

export class AutomationRuntimeEngine {
  private readonly runStore = new Map<string, AutomationRun>();
  /** Ordered map of run IDs to sequence numbers (most-recent first). Uses monotonic counter to avoid Date.now() collisions. */
  private readonly runOrder = new Map<string, number>();
  /** Monotonic counter for deterministic ordering of runs tracked within the same millisecond. */
  private runSequence = 0;
  private readonly maxStoredRuns = 200;

  constructor(
    private readonly dataDir: string,
    private readonly registry: AutomationStepRegistry = createDefaultStepRegistry(),
    private readonly definitionStore: AutomationDefinitionStore = new AutomationDefinitionStore(
      dataDir
    ),
    private readonly events?: EventEmitter,
    private readonly settingsService?: SettingsService | null
  ) {}

  /**
   * Create a new AutomationRuntimeEngine with settings service support.
   * This factory method ensures the step registry has access to credentials
   * for AI prompt execution.
   */
  static create(
    dataDir: string,
    settingsService?: SettingsService | null,
    events?: EventEmitter
  ): AutomationRuntimeEngine {
    const registry = createDefaultStepRegistry(settingsService);
    const definitionStore = new AutomationDefinitionStore(dataDir);
    return new AutomationRuntimeEngine(dataDir, registry, definitionStore, events, settingsService);
  }

  getStepRegistry(): AutomationStepRegistry {
    return this.registry;
  }

  getDefinitionStore(): AutomationDefinitionStore {
    return this.definitionStore;
  }

  listRuns(automationId?: string): AutomationRun[] {
    // Sort by timestamp descending (most recent first)
    const sortedIds = [...this.runOrder.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

    const runs = sortedIds
      .map((runId) => this.runStore.get(runId))
      .filter((run): run is AutomationRun => Boolean(run));

    if (!automationId) {
      return runs;
    }

    return runs.filter((run) => run.automationId === automationId);
  }

  getRun(runId: string): AutomationRun | null {
    return this.runStore.get(runId) ?? null;
  }

  /**
   * Clear all stored runs (preserving currently running ones if specified)
   * @param preserveRunning If true, keep runs with status 'running'
   * @returns Number of runs cleared
   */
  clearRuns(preserveRunning = true): number {
    const toDelete: string[] = [];

    for (const [runId, run] of this.runStore) {
      if (preserveRunning && run.status === 'running') {
        continue;
      }
      toDelete.push(runId);
    }

    for (const runId of toDelete) {
      this.runStore.delete(runId);
      this.runOrder.delete(runId);
    }

    logger.info(`Cleared ${toDelete.length} automation runs`);
    return toDelete.length;
  }

  private trackRun(run: AutomationRun): void {
    this.runStore.set(run.id, run);
    // Store with monotonic sequence number for deterministic ordering (newer = higher number)
    this.runOrder.set(run.id, ++this.runSequence);

    // Enforce max runs limit by removing oldest entries
    if (this.runOrder.size > this.maxStoredRuns) {
      // Sort by timestamp and remove oldest
      const sortedEntries = [...this.runOrder.entries()].sort((a, b) => a[1] - b[1]);
      const toRemove = sortedEntries.slice(0, sortedEntries.length - this.maxStoredRuns);
      for (const [runId] of toRemove) {
        this.runStore.delete(runId);
        this.runOrder.delete(runId);
      }
    }
  }

  async executeById(
    automationId: string,
    options: ExecuteByIdOptions = {}
  ): Promise<AutomationRun> {
    const definition = await this.definitionStore.loadAutomationById(automationId, {
      scope: options.scope,
      projectPath: options.projectPath,
    });

    if (!definition) {
      throw new AutomationDefinitionError(
        `Automation definition not found: ${automationId}`,
        'AUTOMATION_NOT_FOUND'
      );
    }

    return this.executeDefinition(definition, options);
  }

  async executeDefinition(
    definition: AutomationDefinition,
    options: ExecuteAutomationOptions = {}
  ): Promise<AutomationRun> {
    if (definition.enabled === false) {
      throw new AutomationDefinitionError(
        `Automation "${definition.id}" is disabled`,
        'AUTOMATION_DISABLED'
      );
    }

    const startedAt = nowIso();
    const runId = generateId('run');
    const trigger: AutomationTrigger = {
      ...definition.trigger,
      ...options.trigger,
      type: options.trigger?.type ?? definition.trigger.type,
    };

    const variableContext: RunVariableContext = {
      run: {
        id: runId,
        automationId: definition.id,
        startedAt,
      },
      system: await getAutomationVariableService().getSystemVariables(options.projectPath),
      project: buildProjectVariables(options.projectPath),
      workflow: {
        ...(definition.variables || {}),
        ...(options.variables || {}),
      },
      steps: {},
    };

    const run: AutomationRun = {
      id: runId,
      automationId: definition.id,
      scope: definition.scope,
      status: 'running',
      trigger,
      startedAt,
      stepRuns: [],
      variables: {
        system: variableContext.system,
        project: variableContext.project,
        workflow: variableContext.workflow,
        steps: variableContext.steps,
      },
    };

    this.trackRun(run);

    const executeStepSequence = async (
      steps: AutomationStep[],
      initialPreviousOutput?: unknown,
      trackInRun = false
    ): Promise<unknown> => {
      let localPreviousOutput = initialPreviousOutput;

      for (const step of steps) {
        if (options.signal?.aborted) {
          run.status = 'cancelled';
          run.error = {
            code: 'RUN_CANCELLED',
            message: 'Automation execution was cancelled',
          };
          break;
        }

        const stepRun: AutomationStepRun = {
          stepId: step.id,
          stepType: step.type,
          status: 'running',
          startedAt: nowIso(),
        };
        if (trackInRun) {
          run.stepRuns.push(stepRun);
        }

        try {
          const resolvedInput = resolveTemplate(
            step.input === undefined ? localPreviousOutput : step.input,
            variableContext
          );

          stepRun.input = resolvedInput;

          const executor = this.registry.get(step.type);
          if (!executor) {
            throw new AutomationDefinitionError(
              `No executor registered for step type "${step.type}"`,
              'STEP_TYPE_NOT_REGISTERED'
            );
          }

          const context = {
            runId,
            automationId: definition.id,
            projectPath: options.projectPath,
            step,
            input: resolvedInput,
            previousOutput: localPreviousOutput,
            variables: run.variables,
            setWorkflowVariable: (name: string, value: AutomationVariableValue | unknown) => {
              run.variables.workflow[name] = value as AutomationVariableValue;
            },
            resolveTemplate: <T = unknown>(value: T) =>
              resolveTemplate(value, variableContext) as T,
            emitEvent: (type: string, payload: Record<string, unknown>) => {
              logger.debug(`Automation emitted event: ${type}`, payload);
              this.events?.emit('auto-mode:event', {
                type,
                source: 'automation',
                automationId: definition.id,
                runId,
                stepId: step.id,
                payload,
              });
            },
            executeAutomationById: async (
              automationId: string,
              callOptions?: {
                scope?: AutomationScope;
                variables?: Record<string, AutomationVariableValue>;
              }
            ) =>
              this.executeById(automationId, {
                projectPath: options.projectPath,
                scope: callOptions?.scope,
                variables: callOptions?.variables,
                trigger: {
                  type: 'event',
                  event: 'automation.call',
                  metadata: {
                    parentAutomationId: definition.id,
                    parentRunId: runId,
                    stepId: step.id,
                  },
                },
                signal: options.signal,
                autoMode: options.autoMode,
              }),
            executeSteps: async (
              nestedSteps: AutomationStep[],
              nestedOptions?: { initialInput?: unknown }
            ) => executeStepSequence(nestedSteps, nestedOptions?.initialInput, false),
            autoMode: options.autoMode,
          } as AutomationStepExecutionContext;

          const output = await withTimeout(
            Promise.resolve(executor.execute(context)).then((result) =>
              resolveTemplate(result, variableContext)
            ),
            step.timeoutMs,
            `Step "${step.id}" timed out after ${step.timeoutMs}ms`
          );

          localPreviousOutput = output;
          run.variables.steps[step.id] = { output };
          if (step.output) {
            run.variables.workflow[step.output] = output as AutomationVariableValue;
          }

          stepRun.output = output;
          stepRun.status = 'completed';
          stepRun.endedAt = nowIso();
        } catch (error) {
          stepRun.status = 'failed';
          stepRun.endedAt = nowIso();
          stepRun.error = toRunError(error, step.id);

          if (step.continueOnError) {
            continue;
          }

          throw error;
        }
      }

      return localPreviousOutput;
    };

    try {
      const previousOutput = await executeStepSequence(definition.steps, undefined, true);

      if (run.status === 'running') {
        run.status = 'completed';
      }
      run.output = previousOutput;
    } catch (error) {
      run.status = 'failed';
      run.error = toRunError(error);
      logger.error(`Automation run failed (${definition.id}, run=${run.id}):`, error);
    } finally {
      run.endedAt = nowIso();
      this.trackRun(run);
    }

    return run;
  }
}

export { AutomationDefinitionError, createDefaultStepRegistry };
