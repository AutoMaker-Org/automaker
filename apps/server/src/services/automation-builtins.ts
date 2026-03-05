import vm from 'node:vm';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, isAbsolute } from 'node:path';
import { exec } from 'node:child_process';
import type { ExecException } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AutomationStep,
  AutomationStepExecutionContext,
  AutomationVariableValue,
  PhaseModelEntry,
  ThinkingLevel,
  ReasoningEffort,
  Credentials,
  ClaudeCompatibleProvider,
} from '@automaker/types';
import { execGitCommand, getCurrentBranch, parseGitStatus, isGitRepo } from '@automaker/git-utils';
import { createLogger } from '@automaker/utils';
import { FeatureLoader } from './feature-loader.js';
import { simpleQuery, type SimpleQueryResult } from '../providers/simple-query-service.js';
import type { SettingsService } from './settings-service.js';
import { getProviderByModelId } from '../lib/settings-helpers.js';

const logger = createLogger('AutomationBuiltins');

const execAsync = promisify(exec);
const DEFAULT_SCRIPT_EXEC_MAX_BUFFER = 4 * 1024 * 1024;
/** Default execution timeout for run-typescript-code when not specified by step.timeoutMs */
const DEFAULT_TYPESCRIPT_EXEC_TIMEOUT_MS = 5_000;
/** Maximum milliseconds allowed for evaluating an if-step condition expression */
const IF_CONDITION_EVAL_TIMEOUT_MS = 250;
const SUPPORTED_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type SupportedHttpMethod = (typeof SUPPORTED_HTTP_METHODS)[number];
const MANAGE_FEATURE_ACTIONS = ['start', 'stop', 'edit', 'delete'] as const;
type ManageFeatureAction = (typeof MANAGE_FEATURE_ACTIONS)[number];

// ============================================================================
// Git Constants
// ============================================================================

/** Default git remote name used when not specified in config */
const DEFAULT_GIT_REMOTE = 'origin';
/** Regex pattern to extract commit hash from git commit output */
const COMMIT_HASH_REGEX = /\[.*?\s([a-f0-9]+)\]/;
/** Git branch actions supported by the git-branch step */
const GIT_BRANCH_ACTIONS = ['list', 'create', 'delete', 'current'] as const;
type GitBranchAction = (typeof GIT_BRANCH_ACTIONS)[number];

/** Blocked hostnames that could be used for SSRF attacks */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS metadata endpoint
  'metadata.google.internal', // GCP metadata endpoint
]);

/** Dangerous command patterns that should be blocked */
const DANGEROUS_COMMAND_PATTERNS = [
  /\b(sudo|su)\b/i, // privilege escalation
  /\b(rm\s+-rf|mkfs|dd\s+if=)/i, // destructive operations
  />\s*\/dev\//i, // device access
  /\b(eval|exec)\s*\(/i, // code execution
  /\$\([^)]+\)/, // command substitution $(...)
  /`[^`]+`/, // backtick command substitution
  /\|\s*(bash|sh|zsh|fish|cmd|powershell)\b/i, // shell pipe
];

/**
 * Extended context type that includes optional runtime capabilities.
 * The autoMode interface is defined in AutomationStepExecutionContext from @automaker/types
 * and is not duplicated here to avoid maintenance burden and type drift.
 */
type ExtendedAutomationStepExecutionContext = AutomationStepExecutionContext & {
  projectPath?: string;
  resolveTemplate?: <T = unknown>(value: T) => T;
  emitEvent?: (type: string, payload: Record<string, unknown>) => void;
  executeAutomationById?: (
    automationId: string,
    options?: { scope?: 'global' | 'project'; variables?: Record<string, AutomationVariableValue> }
  ) => Promise<unknown>;
  executeSteps?: (
    steps: AutomationStep[],
    options?: { initialInput?: unknown }
  ) => Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function requireProjectPath(context: ExtendedAutomationStepExecutionContext): string {
  if (!context.projectPath) {
    throw new Error(`Step "${context.step.id}" requires projectPath`);
  }
  return context.projectPath;
}

function parseManageFeatureAction(value: unknown): ManageFeatureAction {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('manage-feature requires config.action');
  }

  if ((MANAGE_FEATURE_ACTIONS as readonly string[]).includes(value)) {
    return value as ManageFeatureAction;
  }

  throw new Error(`Unsupported manage-feature action: ${value}`);
}

function parseHttpMethod(value: unknown): SupportedHttpMethod {
  if (value === undefined) return 'GET';
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      `call-http-endpoint requires a valid method (${SUPPORTED_HTTP_METHODS.join(', ')})`
    );
  }

  const normalized = value.toUpperCase();
  if ((SUPPORTED_HTTP_METHODS as readonly string[]).includes(normalized)) {
    return normalized as SupportedHttpMethod;
  }

  throw new Error(
    `Unsupported HTTP method "${value}". Supported methods: ${SUPPORTED_HTTP_METHODS.join(', ')}`
  );
}

function resolvedConfig(context: ExtendedAutomationStepExecutionContext): Record<string, unknown> {
  const rawConfig = toRecord(context.step.config);
  if (!context.resolveTemplate) {
    return rawConfig;
  }
  return toRecord(context.resolveTemplate(rawConfig));
}

function normalizeNestedStep(step: unknown, index: number): AutomationStep {
  if (!isRecord(step)) {
    throw new Error(`Nested step at index ${index} must be an object`);
  }

  const id = step.id;
  const type = step.type;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error(`Nested step at index ${index} is missing "id"`);
  }
  if (typeof type !== 'string' || !type.trim()) {
    throw new Error(`Nested step "${id}" is missing "type"`);
  }

  return {
    id,
    type,
    name: typeof step.name === 'string' ? step.name : undefined,
    input: step.input,
    config: isRecord(step.config) ? step.config : undefined,
    output: typeof step.output === 'string' ? step.output : undefined,
    continueOnError: Boolean(step.continueOnError),
    timeoutMs: typeof step.timeoutMs === 'number' ? step.timeoutMs : undefined,
  };
}

function parseNestedSteps(raw: unknown, configKey: string): AutomationStep[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${configKey} must be an array of steps`);
  }
  return raw.map((step, index) => normalizeNestedStep(step, index));
}

function resolveConfigReference(
  context: ExtendedAutomationStepExecutionContext,
  value: unknown
): unknown {
  if (!context.resolveTemplate || typeof value !== 'string' || !value.includes('{{')) {
    return value;
  }
  return context.resolveTemplate(value);
}

/**
 * Validates a URL for security purposes (SSRF prevention).
 * Only allows HTTP/HTTPS protocols and blocks internal/metadata endpoints.
 */
function validateUrl(url: string, options?: { allowInternal?: boolean }): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }

  // Only allow http/https protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL must use http or https protocol, got: ${parsed.protocol}`);
  }

  // Skip hostname/IP blocking when explicitly allowed (e.g. automation config opt-in)
  if (options?.allowInternal) {
    return url;
  }

  // Block internal/metadata hostnames in production
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Access to internal hostname "${hostname}" is not allowed`);
  }

  // Block private/reserved IP ranges not already covered by BLOCKED_HOSTNAMES
  // RFC 1918 (10.x, 172.16-31.x, 192.168.x), loopback (127.x), link-local (169.254.x),
  // IPv6 unique-local (fc/fd), link-local (fe80:), unspecified (::)
  if (
    hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('127.') ||
    hostname.startsWith('169.254.') ||
    /^f[cd][0-9a-f]{2}:/i.test(hostname) ||
    hostname.startsWith('fe80:') ||
    hostname === '::'
  ) {
    throw new Error(`Access to private IP addresses is not allowed`);
  }

  return url;
}

/**
 * Sanitizes a shell command to prevent dangerous operations.
 * Note: This is a defense-in-depth measure. Commands should still run
 * with minimal privileges in a controlled environment.
 * @param allowDangerous - When true, skips dangerous pattern checks (use with caution)
 */
function sanitizeCommand(command: string, allowDangerous = false): string {
  if (allowDangerous) {
    return command;
  }
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(
        `Command contains potentially dangerous pattern: ${pattern.source}. ` +
          'If this is intentional, consider using a more specific command.'
      );
    }
  }
  return command;
}

function evaluateCondition(
  condition: unknown,
  context: ExtendedAutomationStepExecutionContext,
  fallback = false
): boolean {
  if (typeof condition === 'boolean') return condition;
  if (typeof condition !== 'string' || !condition.trim()) return fallback;

  const conditionScript = new vm.Script(condition, {
    filename: `automation-if-${context.step.id}.js`,
  });
  const sandbox = vm.createContext({
    input: context.input,
    previousOutput: context.previousOutput,
    workflow: context.variables.workflow,
    project: context.variables.project,
    system: context.variables.system,
    steps: context.variables.steps,
  });
  return Boolean(conditionScript.runInContext(sandbox, { timeout: IF_CONDITION_EVAL_TIMEOUT_MS }));
}

/** Maximum number of retry attempts for transient Claude CLI failures */
const AI_QUERY_MAX_RETRIES = 2;
/** Delay between retries in milliseconds */
const AI_QUERY_RETRY_DELAY_MS = 2000;

/**
 * Check if an error is a transient Claude CLI process failure that should be retried.
 * These are known SDK errors where the spawned Claude Code process exits unexpectedly.
 *
 * Errors that include stderr context indicating auth/config issues are NOT retried
 * since they will consistently fail.
 */
function isRetryableAiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const isProcessFailure =
    message.includes('Claude Code process exited') ||
    message.includes('Claude Code process terminated by signal');

  if (!isProcessFailure) return false;

  // Don't retry errors with stderr indicating persistent issues
  const lowerMessage = message.toLowerCase();
  const hasAuthError =
    lowerMessage.includes('not authenticated') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('invalid api key') ||
    lowerMessage.includes('authentication') ||
    lowerMessage.includes('api key');
  const hasConfigError =
    lowerMessage.includes('invalid model') ||
    lowerMessage.includes('model not found') ||
    lowerMessage.includes('not found at');

  return !hasAuthError && !hasConfigError;
}

/**
 * Executes an AI query with the specified model configuration.
 *
 * Supports both legacy string format and PhaseModelEntry object format:
 * - String: "haiku" or "claude-sonnet-4-20250514"
 * - Object: { model: "claude-sonnet-4-20250514", thinkingLevel: "high" }
 *
 * Includes automatic retry for transient Claude CLI failures (e.g., "Claude Code
 * process exited unexpectedly") to improve reliability, following the same pattern
 * used by backlog plan generation and image description.
 *
 * @param context - The automation step execution context
 * @param prompt - The prompt to send to the AI
 * @param modelEntry - Model configuration (string or PhaseModelEntry)
 * @param maxTurns - Maximum number of turns for the conversation
 * @param systemPrompt - Optional system prompt
 * @returns The AI query result
 */
async function runAiQuery(
  context: ExtendedAutomationStepExecutionContext,
  prompt: string,
  modelEntry?: PhaseModelEntry | string,
  maxTurns?: number,
  systemPrompt?: string,
  settingsService?: SettingsService | null
): Promise<SimpleQueryResult> {
  // Parse model entry - supports both legacy string and PhaseModelEntry object
  let model: string | undefined;
  let thinkingLevel: ThinkingLevel | undefined;
  let reasoningEffort: ReasoningEffort | undefined;

  if (typeof modelEntry === 'string') {
    // Legacy string model - empty string becomes undefined (uses system default)
    model = modelEntry || undefined;
  } else if (modelEntry && typeof modelEntry === 'object') {
    // PhaseModelEntry object format
    model = modelEntry.model || undefined;
    thinkingLevel = modelEntry.thinkingLevel;
    reasoningEffort = modelEntry.reasoningEffort;
  }

  // Load credentials and provider configuration from settings service
  // This is critical for authentication - without credentials, the Claude API
  // call will fail when the API key is stored in the credentials file (UI settings)
  // rather than as an environment variable.
  let credentials: Credentials | undefined;
  let claudeCompatibleProvider: ClaudeCompatibleProvider | undefined;

  if (settingsService) {
    credentials = await settingsService.getCredentials();

    // If a model is specified, check if it belongs to a custom provider
    if (model) {
      const providerResult = await getProviderByModelId(
        model,
        settingsService,
        '[AutomationBuiltins]'
      );
      if (providerResult.provider) {
        claudeCompatibleProvider = providerResult.provider;
        // Use the provider's resolved model ID for the API call
        model = providerResult.resolvedModel || model;
      }
    }
  }

  logger.debug('[runAiQuery] Executing AI query:', {
    model: model || '(default)',
    hasCredentials: !!credentials?.apiKeys?.anthropic,
    hasProvider: !!claudeCompatibleProvider,
    thinkingLevel,
    maxTurns,
    cwd: context.projectPath ?? process.cwd(),
  });

  const queryOptions = {
    prompt,
    model,
    maxTurns,
    systemPrompt,
    thinkingLevel,
    reasoningEffort,
    cwd: context.projectPath ?? process.cwd(),
    credentials,
    claudeCompatibleProvider,
  };

  // Retry loop for transient Claude CLI process failures
  let lastError: unknown;
  for (let attempt = 0; attempt <= AI_QUERY_MAX_RETRIES; attempt++) {
    try {
      return await simpleQuery(queryOptions);
    } catch (error) {
      lastError = error;

      if (isRetryableAiError(error) && attempt < AI_QUERY_MAX_RETRIES) {
        logger.warn(
          `[runAiQuery] Transient Claude CLI failure (attempt ${attempt + 1}/${AI_QUERY_MAX_RETRIES + 1}), retrying in ${AI_QUERY_RETRY_DELAY_MS}ms:`,
          error instanceof Error ? error.message : String(error)
        );
        await new Promise((resolve) => setTimeout(resolve, AI_QUERY_RETRY_DELAY_MS));
        continue;
      }

      // Non-retryable error or max retries exhausted
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stderr = (error as { stderr?: string }).stderr;
      logger.error(`[runAiQuery] AI query failed:`, {
        error: errorMessage,
        attempt: attempt + 1,
        model: model || '(default)',
        hasCredentials: !!credentials?.apiKeys?.anthropic,
        ...(stderr && { stderr }),
      });
      throw error;
    }
  }

  // Should not reach here, but TypeScript needs it
  throw lastError;
}

export function registerAutomationBuiltins(
  registry: {
    register: (executor: {
      type: string;
      execute: (context: AutomationStepExecutionContext) => unknown;
    }) => void;
    get: (type: string) =>
      | {
          type: string;
          execute: (context: AutomationStepExecutionContext) => Promise<unknown> | unknown;
        }
      | undefined;
  },
  featureLoader = new FeatureLoader(),
  settingsService?: SettingsService | null
): void {
  registry.register({
    type: 'create-feature',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const projectPath = requireProjectPath(context);
      const config = resolvedConfig(context);
      const input = toRecord(context.input);

      // 'make' is a special config option - when true, create and start the feature immediately
      const makeFeature = config.make === true;

      // Build feature data, excluding the 'make' config option
      const { make: _make, ...configWithoutMake } = config;
      const featureData = {
        ...input,
        ...configWithoutMake,
        description: String(config.description ?? input.description ?? ''),
        category: String(config.category ?? input.category ?? 'Uncategorized'),
        ...(makeFeature
          ? { status: 'running' as const, startedAt: new Date().toISOString() }
          : config.status
            ? { status: String(config.status) }
            : {}),
      };

      return await featureLoader.create(projectPath, featureData);
    },
  });

  registry.register({
    type: 'manage-feature',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const projectPath = requireProjectPath(context);
      const config = resolvedConfig(context);
      const action = parseManageFeatureAction(config.action);
      const featureId = config.featureId;
      if (typeof featureId !== 'string' || !featureId.trim()) {
        throw new Error('manage-feature requires config.featureId');
      }

      if (action === 'delete') {
        const deleted = await featureLoader.delete(projectPath, featureId);
        return { deleted, featureId };
      }

      if (action === 'start') {
        return await featureLoader.update(projectPath, featureId, {
          status: 'running',
          startedAt: new Date().toISOString(),
        });
      }

      if (action === 'stop') {
        return await featureLoader.update(projectPath, featureId, {
          status: 'pending',
        });
      }

      if (action === 'edit') {
        const updates = isRecord(config.updates) ? config.updates : toRecord(context.input);
        return await featureLoader.update(projectPath, featureId, updates);
      }

      // Exhaustive check: all MANAGE_FEATURE_ACTIONS branches are handled above.
      const _exhaustive: never = action;
      throw new Error(`Unhandled manage-feature action: ${String(_exhaustive)}`);
    },
  });

  registry.register({
    type: 'run-ai-prompt',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const prompt = config.prompt ?? context.input;
      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('run-ai-prompt requires config.prompt or string input');
      }

      // Parse model config - supports both legacy string and PhaseModelEntry object
      // Also gracefully handles invalid types (null, number, etc.) by treating them as undefined
      let modelEntry: PhaseModelEntry | string | undefined;
      if (typeof config.model === 'string') {
        // Legacy string model format
        modelEntry = config.model || undefined;
      } else if (config.model !== null && typeof config.model === 'object') {
        // PhaseModelEntry object format - accept any object that looks like PhaseModelEntry
        // This allows partial objects like { thinkingLevel: 'high' } to work
        modelEntry = config.model as PhaseModelEntry;
      }
      // For null, number, or other invalid types, modelEntry remains undefined
      // which means the system default model will be used

      const result = await runAiQuery(
        context,
        prompt,
        modelEntry,
        typeof config.maxTurns === 'number' ? config.maxTurns : undefined,
        typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined,
        settingsService
      );

      return {
        text: result.text,
        structuredOutput: result.structured_output,
      };
    },
  });

  registry.register({
    type: 'run-typescript-code',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const rawCode = config.code;
      if (typeof rawCode !== 'string' || !rawCode.trim()) {
        throw new Error('run-typescript-code requires config.code');
      }

      let code = rawCode;
      try {
        const typescriptModule = (await import('typescript')) as typeof import('typescript');
        const transpiled = typescriptModule.transpileModule(rawCode, {
          compilerOptions: {
            target: typescriptModule.ScriptTarget.ES2022,
            module: typescriptModule.ModuleKind.ESNext,
          },
        });
        code = transpiled.outputText;
      } catch {
        // Fall back to direct execution if typescript transpilation is unavailable.
      }

      const sandbox = vm.createContext({
        input: context.input,
        previousOutput: context.previousOutput,
        workflow: context.variables.workflow,
        project: context.variables.project,
        system: context.variables.system,
        steps: context.variables.steps,
        setVariable: (name: string, value: AutomationVariableValue | unknown) =>
          context.setWorkflowVariable(name, value),
      });

      const script = new vm.Script(`(async () => {${code}\n})()`, {
        filename: `automation-ts-${context.step.id}.js`,
      });

      const timeoutMs =
        typeof config.timeoutMs === 'number' && config.timeoutMs > 0
          ? config.timeoutMs
          : DEFAULT_TYPESCRIPT_EXEC_TIMEOUT_MS;
      return await script.runInContext(sandbox, { timeout: timeoutMs });
    },
  });

  registry.register({
    type: 'define-variable',
    execute: (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const defineOnly = Boolean(config.defineOnly);

      if (isRecord(config.values)) {
        for (const [key, value] of Object.entries(config.values)) {
          if (!defineOnly || !(key in context.variables.workflow)) {
            context.setWorkflowVariable(key, value);
          }
        }
        return config.values;
      }

      const name = config.name;
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error('define-variable requires config.name or config.values');
      }

      if (defineOnly && name in context.variables.workflow) {
        return context.variables.workflow[name];
      }

      const value = config.value === undefined ? context.input : config.value;
      context.setWorkflowVariable(name, value);
      return value;
    },
  });

  // Alias for backwards compatibility with existing definitions.
  registry.register({
    type: 'set-variable',
    execute: (rawContext) => registry.get('define-variable')!.execute(rawContext),
  });

  registry.register({
    type: 'call-http-endpoint',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const method = parseHttpMethod(config.method);
      const rawUrl = config.url;
      if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        throw new Error('call-http-endpoint requires config.url');
      }

      // Validate URL for SSRF prevention (allowInternal opt-in for trusted internal API calls)
      const url = validateUrl(rawUrl, { allowInternal: Boolean(config.allowInternal) });

      const headers =
        isRecord(config.headers) &&
        Object.values(config.headers).every((v) => typeof v === 'string')
          ? (config.headers as Record<string, string>)
          : undefined;
      const bodyValue = config.body === undefined ? context.input : config.body;
      const requestBody =
        method === 'GET' || method === 'DELETE'
          ? undefined
          : bodyValue === undefined
            ? undefined
            : typeof bodyValue === 'string'
              ? bodyValue
              : JSON.stringify(bodyValue);

      const response = await fetch(url, {
        method,
        headers,
        body: requestBody,
      });

      let body: unknown;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      };
    },
  });

  registry.register({
    type: 'run-script-exec',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const rawCommand = config.command ?? context.input;
      if (typeof rawCommand !== 'string' || !rawCommand.trim()) {
        throw new Error('run-script-exec requires config.command or string input');
      }

      // Sanitize command for security (skip if user explicitly allows dangerous commands
      // either per-step via config or globally via automation settings)
      let allowDangerous = Boolean(config.allowDangerousCommands);
      if (!allowDangerous && settingsService) {
        try {
          const globalSettings = await settingsService.getGlobalSettings();
          if (globalSettings.automationSettings?.allowDangerousScriptCommands) {
            allowDangerous = true;
          }
        } catch {
          // If settings can't be loaded, keep the default (no dangerous commands)
        }
      }
      const command = sanitizeCommand(rawCommand, allowDangerous);

      const timeoutMs =
        typeof config.timeoutMs === 'number' && config.timeoutMs > 0 ? config.timeoutMs : undefined;
      const cwd =
        typeof config.cwd === 'string' && config.cwd.trim()
          ? config.cwd
          : (context.projectPath ?? process.cwd());
      const useShell = config.shell === undefined ? true : Boolean(config.shell);

      try {
        const result = await execAsync(command, {
          cwd,
          timeout: timeoutMs,
          shell: useShell ? '/bin/sh' : undefined,
          maxBuffer: DEFAULT_SCRIPT_EXEC_MAX_BUFFER,
        });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: 0,
        };
      } catch (error) {
        const execError = error as ExecException & { stdout?: string; stderr?: string };
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? execError.message,
          exitCode: typeof execError.code === 'number' ? execError.code : 1,
          signal: execError.signal,
        };
      }
    },
  });

  registry.register({
    type: 'emit-event',
    execute: (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const eventType = config.eventType;
      if (typeof eventType !== 'string' || !eventType.trim()) {
        throw new Error('emit-event requires config.eventType');
      }

      const payload = isRecord(config.payload)
        ? config.payload
        : isRecord(context.input)
          ? context.input
          : { value: context.input };

      context.emitEvent?.(eventType, payload);
      return { eventType, payload, emitted: Boolean(context.emitEvent) };
    },
  });

  registry.register({
    type: 'write-file',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);

      const rawFilePath = config.filePath ?? context.input;
      if (typeof rawFilePath !== 'string' || !rawFilePath.trim()) {
        throw new Error('write-file requires config.filePath');
      }

      const filePath = isAbsolute(rawFilePath)
        ? rawFilePath
        : resolve(context.projectPath ?? process.cwd(), rawFilePath);

      const rawContent =
        config.content !== undefined
          ? config.content
          : typeof context.input === 'string'
            ? context.input
            : '';
      // Coerce non-string values to string (e.g. when a variable resolves to a
      // number, boolean, or object).  This is common when the content field is
      // set to a single template variable like {{steps.prev.output}}.
      let content: string;
      if (typeof rawContent === 'string') {
        // Pretty-print JSON strings for readability
        try {
          const parsed = JSON.parse(rawContent);
          if (typeof parsed === 'object' && parsed !== null) {
            content = JSON.stringify(parsed, null, 2);
          } else {
            content = rawContent;
          }
        } catch {
          content = rawContent;
        }
      } else if (rawContent === null || rawContent === undefined) {
        content = '';
      } else if (typeof rawContent === 'object') {
        content = JSON.stringify(rawContent, null, 2);
      } else {
        content = String(rawContent);
      }

      const encoding = typeof config.encoding === 'string' ? config.encoding : 'utf8';
      const supportedEncodings = ['utf8', 'ascii', 'base64', 'binary'] as const;
      type FileEncoding = (typeof supportedEncodings)[number];
      if (!supportedEncodings.includes(encoding as FileEncoding)) {
        throw new Error(
          `write-file unsupported encoding: ${encoding}. Use one of: ${supportedEncodings.join(', ')}`
        );
      }

      const createDirs = config.createDirs === undefined ? true : Boolean(config.createDirs);
      const append = Boolean(config.append);

      if (createDirs) {
        await mkdir(dirname(filePath), { recursive: true });
      }

      const writeOptions = { encoding: encoding as FileEncoding, flag: append ? 'a' : 'w' };
      await writeFile(filePath, content, writeOptions);

      return {
        filePath,
        bytesWritten: Buffer.byteLength(content, encoding as FileEncoding),
        encoding,
        appended: append,
      };
    },
  });

  registry.register({
    type: 'if',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = toRecord(context.step.config);
      const matches = evaluateCondition(config.condition, context);
      const branchRaw = resolveConfigReference(
        context,
        matches ? config.thenSteps : config.elseSteps
      );
      if (!branchRaw) {
        return null;
      }

      const branchSteps = parseNestedSteps(branchRaw, matches ? 'thenSteps' : 'elseSteps');
      if (!context.executeSteps) {
        throw new Error('if step requires executeSteps support in runtime context');
      }
      return await context.executeSteps(branchSteps, { initialInput: context.input });
    },
  });

  registry.register({
    type: 'loop',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = toRecord(context.step.config);
      const steps = parseNestedSteps(resolveConfigReference(context, config.steps), 'steps');
      if (!context.executeSteps) {
        throw new Error('loop step requires executeSteps support in runtime context');
      }

      // Resolve the workflow variable names that will hold the current item and index.
      // These names come from the step config so authors can choose names that fit
      // their automation's vocabulary and avoid collisions with outer-scope variables.
      const itemVariableName =
        typeof config.itemVariable === 'string' && config.itemVariable.trim()
          ? config.itemVariable
          : 'loopItem';
      const indexVariableName =
        typeof config.indexVariable === 'string' && config.indexVariable.trim()
          ? config.indexVariable
          : 'loopIndex';

      const rawItems = context.resolveTemplate
        ? context.resolveTemplate(config.items ?? context.input)
        : (config.items ?? context.input);
      let items: unknown[] = [];
      if (Array.isArray(rawItems)) {
        items = rawItems;
      } else if (typeof config.count === 'number' && config.count >= 0) {
        items = Array.from({ length: config.count }, (_, index) => index);
      } else {
        throw new Error('loop requires config.items array or config.count number');
      }

      const outputs: unknown[] = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        context.setWorkflowVariable(indexVariableName, index);
        context.setWorkflowVariable(itemVariableName, item);
        const output = await context.executeSteps(steps, { initialInput: item });
        outputs.push(output);
      }

      return {
        iterations: items.length,
        outputs,
        lastOutput: outputs.length > 0 ? outputs[outputs.length - 1] : null,
      };
    },
  });

  registry.register({
    type: 'call-automation',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const automationId = config.automationId;
      if (typeof automationId !== 'string' || !automationId.trim()) {
        throw new Error('call-automation requires config.automationId');
      }
      if (!context.executeAutomationById) {
        throw new Error(
          'call-automation requires executeAutomationById support in runtime context'
        );
      }
      if (automationId === context.automationId) {
        throw new Error('call-automation cannot recursively call the current automation');
      }

      const run = (await context.executeAutomationById(automationId, {
        scope: config.scope === 'global' || config.scope === 'project' ? config.scope : undefined,
        variables: isRecord(config.variables)
          ? (config.variables as Record<string, AutomationVariableValue>)
          : undefined,
      })) as { id: string; status: string; output?: unknown; error?: unknown };

      return {
        runId: run.id,
        status: run.status,
        output: run.output,
        error: run.error,
      };
    },
  });

  // ============================================================================
  // Git Automation Steps
  // ============================================================================

  /**
   * Extended error type for git operations that may include stderr output.
   */
  interface GitError extends Error {
    stderr?: string;
  }

  /**
   * Type guard to check if an error is a GitError with stderr.
   */
  function isGitError(error: unknown): error is GitError {
    return error instanceof Error;
  }

  /**
   * Helper to get the working directory for git operations.
   * Uses config.path if provided, otherwise falls back to projectPath or cwd.
   *
   * @param context - The automation step execution context
   * @param config - The resolved step configuration
   * @returns The working directory path for git operations
   */
  function getGitWorkingDir(
    context: ExtendedAutomationStepExecutionContext,
    config: Record<string, unknown>
  ): string {
    const configPath = config.path;
    if (typeof configPath === 'string' && configPath.trim()) {
      return configPath;
    }
    return context.projectPath ?? process.cwd();
  }

  /**
   * Helper to validate that a path is a git repository.
   * Throws a descriptive error if the path is not a valid git repository.
   *
   * @param cwd - The directory path to validate
   * @throws Error if the path is not a git repository
   */
  async function requireGitRepo(cwd: string): Promise<void> {
    if (!(await isGitRepo(cwd))) {
      throw new Error(`Path "${cwd}" is not a git repository`);
    }
  }

  /**
   * Parses and validates a git branch action from config.
   *
   * @param value - The raw action value from config
   * @returns The validated GitBranchAction
   * @throws Error if the action is invalid
   */
  function parseGitBranchAction(value: unknown): GitBranchAction {
    if (typeof value !== 'string' || !GIT_BRANCH_ACTIONS.includes(value as GitBranchAction)) {
      throw new Error(`git-branch requires valid action: ${GIT_BRANCH_ACTIONS.join(', ')}`);
    }
    return value as GitBranchAction;
  }

  /**
   * git-status: Get the git status of a repository
   */
  registry.register({
    type: 'git-status',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const cwd = getGitWorkingDir(context, config);

      // Verify it's a git repository
      await requireGitRepo(cwd);

      // Get current branch
      const branch = await getCurrentBranch(cwd);

      // Get git status output
      const statusOutput = await execGitCommand(['status', '--porcelain'], cwd);
      const files = parseGitStatus(statusOutput);

      const isClean = files.length === 0;

      // Group files by status type
      const staged = files.filter(
        (f) => f.indexStatus && f.indexStatus !== ' ' && f.indexStatus !== '?'
      );
      const unstaged = files.filter(
        (f) => f.workTreeStatus && f.workTreeStatus !== ' ' && f.workTreeStatus !== '?'
      );
      const untracked = files.filter((f) => f.status === '?');

      return {
        branch,
        isClean,
        files,
        summary: {
          total: files.length,
          staged: staged.length,
          unstaged: unstaged.length,
          untracked: untracked.length,
        },
      };
    },
  });

  /**
   * git-branch: Create, list, or delete git branches
   */
  registry.register({
    type: 'git-branch',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const cwd = getGitWorkingDir(context, config);
      const action = parseGitBranchAction(config.action);

      // Verify it's a git repository
      await requireGitRepo(cwd);

      switch (action) {
        case 'current': {
          const branch = await getCurrentBranch(cwd);
          return { branch, action };
        }

        case 'list': {
          const output = await execGitCommand(['branch', '-a'], cwd);
          const branches = output
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const current = line.startsWith('* ');
              const name = line.replace(/^\*?\s*/, '').trim();
              const isRemote = name.startsWith('remotes/');
              return { name, current, isRemote };
            });
          return { branches, action };
        }

        case 'create': {
          const branchName = config.branch ?? context.input;
          if (typeof branchName !== 'string' || !branchName.trim()) {
            throw new Error('git-branch create requires config.branch');
          }
          const force = Boolean(config.force);
          const args = force ? ['branch', '-f', branchName.trim()] : ['branch', branchName.trim()];
          await execGitCommand(args, cwd);
          return { branch: branchName, action, created: true };
        }

        case 'delete': {
          const branchName = config.branch ?? context.input;
          if (typeof branchName !== 'string' || !branchName.trim()) {
            throw new Error('git-branch delete requires config.branch');
          }
          const force = Boolean(config.force);
          const args = force
            ? ['branch', '-D', branchName.trim()]
            : ['branch', '-d', branchName.trim()];
          await execGitCommand(args, cwd);
          return { branch: branchName, action, deleted: true };
        }

        default: {
          const _exhaustive: never = action;
          throw new Error(`Unhandled git-branch action: ${String(_exhaustive)}`);
        }
      }
    },
  });

  /**
   * git-commit: Stage files and create a commit
   */
  registry.register({
    type: 'git-commit',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const cwd = getGitWorkingDir(context, config);

      // Verify it's a git repository
      await requireGitRepo(cwd);

      // Get commit message
      const message = config.message ?? context.input;
      if (typeof message !== 'string' || !message.trim()) {
        throw new Error('git-commit requires config.message');
      }

      // Stage files
      const stageAll = Boolean(config.all);
      const files = config.files;
      const allowEmpty = Boolean(config.allowEmpty);

      if (stageAll) {
        await execGitCommand(['add', '-A'], cwd);
      } else if (Array.isArray(files) && files.length > 0) {
        // Stage specific files
        for (const file of files) {
          if (typeof file === 'string' && file.trim()) {
            await execGitCommand(['add', file.trim()], cwd);
          }
        }
      }
      // If neither stageAll nor files, rely on already-staged content

      // Create commit
      const commitArgs = ['commit', '-m', message.trim()];
      if (allowEmpty) {
        commitArgs.push('--allow-empty');
      }

      try {
        const output = await execGitCommand(commitArgs, cwd);
        // Extract commit hash from output like "[main abc123] message"
        const hashMatch = output.match(COMMIT_HASH_REGEX);
        const hash = hashMatch ? hashMatch[1] : null;

        return {
          success: true,
          message: message.trim(),
          hash,
          output,
        };
      } catch (error) {
        if (isGitError(error) && error.message.includes('nothing to commit')) {
          // Handle "nothing to commit" gracefully
          return {
            success: true,
            message: message.trim(),
            hash: null,
            output: 'Nothing to commit',
            nothingToCommit: true,
          };
        }
        throw error;
      }
    },
  });

  /**
   * git-push: Push local commits to a remote repository
   */
  registry.register({
    type: 'git-push',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const cwd = getGitWorkingDir(context, config);

      // Verify it's a git repository
      await requireGitRepo(cwd);

      const remote =
        typeof config.remote === 'string' && config.remote.trim()
          ? config.remote.trim()
          : DEFAULT_GIT_REMOTE;
      const branch =
        typeof config.branch === 'string' && config.branch.trim()
          ? config.branch.trim()
          : await getCurrentBranch(cwd);
      const force = Boolean(config.force);
      const setUpstream = Boolean(config.setUpstream);

      const args = ['push'];
      if (force) {
        args.push('--force');
      }
      if (setUpstream) {
        args.push('-u');
      }
      args.push(remote, branch);

      try {
        const output = await execGitCommand(args, cwd);
        return {
          success: true,
          remote,
          branch,
          force,
          setUpstream,
          output,
        };
      } catch (error) {
        if (isGitError(error)) {
          return {
            success: false,
            remote,
            branch,
            force,
            setUpstream,
            error: error.message,
            stderr: error.stderr,
          };
        }
        throw error;
      }
    },
  });

  /**
   * git-pull: Pull changes from a remote repository
   */
  registry.register({
    type: 'git-pull',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const cwd = getGitWorkingDir(context, config);

      // Verify it's a git repository
      await requireGitRepo(cwd);

      const remote =
        typeof config.remote === 'string' && config.remote.trim()
          ? config.remote.trim()
          : DEFAULT_GIT_REMOTE;
      const branch =
        typeof config.branch === 'string' && config.branch.trim()
          ? config.branch.trim()
          : undefined;
      const rebase = Boolean(config.rebase);

      const args = ['pull'];
      if (rebase) {
        args.push('--rebase');
      }
      args.push(remote);
      if (branch) {
        args.push(branch);
      }

      try {
        const output = await execGitCommand(args, cwd);
        const currentBranch = await getCurrentBranch(cwd);

        // Check if there were any updates
        const alreadyUpToDate = output.includes('Already up to date');

        return {
          success: true,
          remote,
          branch: branch ?? currentBranch,
          rebase,
          alreadyUpToDate,
          output,
        };
      } catch (error) {
        if (isGitError(error)) {
          return {
            success: false,
            remote,
            branch,
            rebase,
            error: error.message,
            stderr: error.stderr,
          };
        }
        throw error;
      }
    },
  });

  /**
   * git-checkout: Switch branches or restore working tree files
   */
  registry.register({
    type: 'git-checkout',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const config = resolvedConfig(context);
      const cwd = getGitWorkingDir(context, config);

      // Verify it's a git repository
      await requireGitRepo(cwd);

      const branch = config.branch ?? context.input;
      const createBranch = Boolean(config.createBranch);
      const force = Boolean(config.force);
      const files = config.files;

      // Restore specific files (if files array is provided without branch)
      if (Array.isArray(files) && files.length > 0 && !branch) {
        const args = ['checkout'];
        if (force) {
          args.push('--force');
        }
        const validFiles = files.filter(
          (f): f is string => typeof f === 'string' && Boolean(f.trim())
        );
        args.push('--', ...validFiles);

        await execGitCommand(args, cwd);
        return {
          success: true,
          action: 'restore',
          files,
          force,
        };
      }

      // Switch branches
      if (typeof branch !== 'string' || !branch.trim()) {
        throw new Error('git-checkout requires config.branch or config.files');
      }

      const args = ['checkout'];
      if (createBranch) {
        args.push('-b');
      }
      if (force) {
        args.push('--force');
      }
      args.push(branch.trim());

      try {
        const output = await execGitCommand(args, cwd);
        const currentBranch = await getCurrentBranch(cwd);

        return {
          success: true,
          action: createBranch ? 'create-and-switch' : 'switch',
          previousBranch: branch.trim(),
          currentBranch,
          created: createBranch,
          output,
        };
      } catch (error) {
        if (isGitError(error)) {
          return {
            success: false,
            branch: branch.trim(),
            createBranch,
            error: error.message,
            stderr: error.stderr,
          };
        }
        throw error;
      }
    },
  });

  // ============================================================================
  // Auto Mode Control Steps
  // ============================================================================

  /**
   * start-auto-mode: Start the autonomous feature execution loop
   */
  registry.register({
    type: 'start-auto-mode',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const projectPath = requireProjectPath(context);
      const config = resolvedConfig(context);

      if (!context.autoMode) {
        throw new Error('start-auto-mode requires autoMode support in runtime context');
      }

      const branchName =
        typeof config.branchName === 'string' && config.branchName.trim()
          ? config.branchName.trim()
          : null;
      const maxConcurrency =
        typeof config.maxConcurrency === 'number' && config.maxConcurrency > 0
          ? config.maxConcurrency
          : undefined;

      return await context.autoMode.start(projectPath, branchName, maxConcurrency);
    },
  });

  /**
   * stop-auto-mode: Stop the autonomous feature execution loop
   */
  registry.register({
    type: 'stop-auto-mode',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const projectPath = requireProjectPath(context);
      const config = resolvedConfig(context);

      if (!context.autoMode) {
        throw new Error('stop-auto-mode requires autoMode support in runtime context');
      }

      const branchName =
        typeof config.branchName === 'string' && config.branchName.trim()
          ? config.branchName.trim()
          : null;

      return await context.autoMode.stop(projectPath, branchName);
    },
  });

  /**
   * get-auto-mode-status: Get the current status of auto mode
   */
  registry.register({
    type: 'get-auto-mode-status',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const projectPath = requireProjectPath(context);
      const config = resolvedConfig(context);

      if (!context.autoMode) {
        throw new Error('get-auto-mode-status requires autoMode support in runtime context');
      }

      const branchName =
        typeof config.branchName === 'string' && config.branchName.trim()
          ? config.branchName.trim()
          : null;

      return await context.autoMode.getStatus(projectPath, branchName);
    },
  });

  /**
   * set-auto-mode-concurrency: Set the maximum concurrency for auto mode
   */
  registry.register({
    type: 'set-auto-mode-concurrency',
    execute: async (rawContext) => {
      const context = rawContext as ExtendedAutomationStepExecutionContext;
      const projectPath = requireProjectPath(context);
      const config = resolvedConfig(context);

      if (!context.autoMode) {
        throw new Error('set-auto-mode-concurrency requires autoMode support in runtime context');
      }

      const maxConcurrency = config.maxConcurrency;
      if (typeof maxConcurrency !== 'number' || maxConcurrency < 1) {
        throw new Error('set-auto-mode-concurrency requires config.maxConcurrency (number >= 1)');
      }

      const branchName =
        typeof config.branchName === 'string' && config.branchName.trim()
          ? config.branchName.trim()
          : null;

      return await context.autoMode.setConcurrency(projectPath, maxConcurrency, branchName);
    },
  });
}
