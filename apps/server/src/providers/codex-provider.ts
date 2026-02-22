/**
 * Codex Provider - Executes queries using Codex CLI
 *
 * Spawns the Codex CLI and converts JSONL output into ProviderMessage format.
 */

import path from 'path';
import { BaseProvider } from './base-provider.js';
import {
  spawnJSONLProcess,
  spawnProcess,
  findCodexCliPath,
  getCodexAuthIndicators,
  secureFs,
  getDataDirectory,
  getCodexConfigDir,
} from '@automaker/platform';
import { checkCodexAuthentication } from '../lib/codex-auth.js';
import {
  formatHistoryAsText,
  extractTextFromContent,
  classifyError,
  getUserFriendlyErrorMessage,
  createLogger,
} from '@automaker/utils';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';
import {
  supportsReasoningEffort,
  validateBareModelId,
  calculateReasoningTimeout,
  type CodexApprovalPolicy,
  type CodexSandboxMode,
  type CodexAuthStatus,
} from '@automaker/types';
import { CodexConfigManager } from './codex-config-manager.js';
import { executeCodexSdkQuery } from './codex-sdk-client.js';
import {
  resolveCodexToolCall,
  extractCodexTodoItems,
  getCodexTodoToolName,
} from './codex-tool-mapping.js';
import { SettingsService } from '../services/settings-service.js';
import { createTempEnvOverride } from '../lib/auth-utils.js';
import { checkSandboxCompatibility } from '../lib/sdk-options.js';
import { CODEX_MODELS } from './codex-models.js';

const CODEX_COMMAND = 'codex';
const CODEX_EXEC_SUBCOMMAND = 'exec';
const CODEX_JSON_FLAG = '--json';
const CODEX_MODEL_FLAG = '--model';
const CODEX_VERSION_FLAG = '--version';
const CODEX_CONFIG_FLAG = '--config';
const CODEX_ADD_DIR_FLAG = '--add-dir';
const CODEX_OUTPUT_SCHEMA_FLAG = '--output-schema';
const CODEX_SKIP_GIT_REPO_CHECK_FLAG = '--skip-git-repo-check';
const CODEX_REASONING_EFFORT_KEY = 'reasoning_effort';
const CODEX_YOLO_FLAG = '--dangerously-bypass-approvals-and-sandbox';
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
const CODEX_EXECUTION_MODE_CLI = 'cli';
const CODEX_EXECUTION_MODE_SDK = 'sdk';
const ERROR_CODEX_CLI_REQUIRED =
  'Codex CLI is required for tool-enabled requests. Please install Codex CLI and run `codex login`.';
const ERROR_CODEX_AUTH_REQUIRED = "Codex authentication is required. Please run 'codex login'.";
const ERROR_CODEX_SDK_AUTH_REQUIRED = 'OpenAI API key required for Codex SDK execution.';

const CODEX_EVENT_TYPES = {
  itemCompleted: 'item.completed',
  itemStarted: 'item.started',
  itemUpdated: 'item.updated',
  turnCompleted: 'turn.completed',
  error: 'error',
} as const;

const CODEX_ITEM_TYPES = {
  reasoning: 'reasoning',
  agentMessage: 'agent_message',
  commandExecution: 'command_execution',
  todoList: 'todo_list',
} as const;

const SYSTEM_PROMPT_LABEL = 'System instructions';
const HISTORY_HEADER = 'Current request:\n';
const TEXT_ENCODING = 'utf-8';
/**
 * Default timeout for Codex CLI operations in milliseconds.
 * This is the "no output" timeout - if the CLI doesn't produce any JSONL output
 * for this duration, the process is killed. For reasoning models with high
 * reasoning effort, this timeout is dynamically extended via calculateReasoningTimeout().
 *
 * For feature generation (which can generate 50+ features), we use a much longer
 * base timeout (5 minutes) since Codex models are slower at generating large JSON responses.
 *
 * @see calculateReasoningTimeout from @automaker/types
 */
const CODEX_CLI_TIMEOUT_MS = 120000; // 2 minutes — matches CLI provider base timeout
const CODEX_FEATURE_GENERATION_BASE_TIMEOUT_MS = 300000; // 5 minutes for feature generation
const SYSTEM_PROMPT_SEPARATOR = '\n\n';
const CODEX_INSTRUCTIONS_DIR = '.codex';
const CODEX_INSTRUCTIONS_SECTION = 'Codex Project Instructions';
const CODEX_INSTRUCTIONS_PATH_LABEL = 'Path';
const CODEX_INSTRUCTIONS_SOURCE_LABEL = 'Source';
const CODEX_INSTRUCTIONS_USER_SOURCE = 'User instructions';
const CODEX_INSTRUCTIONS_PROJECT_SOURCE = 'Project instructions';
const CODEX_USER_INSTRUCTIONS_FILE = 'AGENTS.md';
const CODEX_PROJECT_INSTRUCTIONS_FILES = ['AGENTS.md'] as const;
const CODEX_SETTINGS_DIR_FALLBACK = './data';
const DEFAULT_CODEX_AUTO_LOAD_AGENTS = false;
const DEFAULT_CODEX_SANDBOX_MODE: CodexSandboxMode = 'workspace-write';
const DEFAULT_CODEX_APPROVAL_POLICY: CodexApprovalPolicy = 'on-request';
const TOOL_USE_ID_PREFIX = 'codex-tool-';
const ITEM_ID_KEYS = ['id', 'item_id', 'call_id', 'tool_use_id', 'command_id'] as const;
const EVENT_ID_KEYS = ['id', 'event_id', 'request_id'] as const;
const COMMAND_OUTPUT_FIELDS = ['output', 'stdout', 'stderr', 'result'] as const;
const COMMAND_OUTPUT_SEPARATOR = '\n';
const OUTPUT_SCHEMA_FILENAME = 'output-schema.json';
const OUTPUT_SCHEMA_INDENT_SPACES = 2;
const IMAGE_TEMP_DIR = '.codex-images';
const IMAGE_FILE_PREFIX = 'image-';
const IMAGE_FILE_EXT = '.png';
const DEFAULT_ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'WebSearch',
  'WebFetch',
] as const;
const SEARCH_TOOL_NAMES = new Set(['WebSearch', 'WebFetch']);
const MIN_MAX_TURNS = 1;
const CONFIG_KEY_MAX_TURNS = 'max_turns';
const CONSTRAINTS_SECTION_TITLE = 'Codex Execution Constraints';
const CONSTRAINTS_MAX_TURNS_LABEL = 'Max turns';
const CONSTRAINTS_ALLOWED_TOOLS_LABEL = 'Allowed tools';
const CONSTRAINTS_OUTPUT_SCHEMA_LABEL = 'Output format';
const CONSTRAINTS_SESSION_ID_LABEL = 'Session ID';
const CONSTRAINTS_NO_TOOLS_VALUE = 'none';
const CONSTRAINTS_OUTPUT_SCHEMA_VALUE = 'Respond with JSON that matches the provided schema.';

type CodexExecutionMode = typeof CODEX_EXECUTION_MODE_CLI | typeof CODEX_EXECUTION_MODE_SDK;
type CodexExecutionPlan = {
  mode: CodexExecutionMode;
  cliPath: string | null;
  openAiApiKey?: string | null;
};

const ALLOWED_ENV_VARS = [
  OPENAI_API_KEY_ENV,
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'USER',
  'LANG',
  'LC_ALL',
];

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ALLOWED_ENV_VARS) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }
  return env;
}

async function resolveOpenAiApiKey(): Promise<string | null> {
  const envKey = process.env[OPENAI_API_KEY_ENV];
  if (envKey) {
    return envKey;
  }

  try {
    const settingsService = new SettingsService(getCodexSettingsDir());
    const credentials = await settingsService.getCredentials();
    const storedKey = credentials.apiKeys.openai?.trim();
    return storedKey ? storedKey : null;
  } catch {
    return null;
  }
}

function hasMcpServersConfigured(options: ExecuteOptions): boolean {
  return Boolean(options.mcpServers && Object.keys(options.mcpServers).length > 0);
}

function isNoToolsRequested(options: ExecuteOptions): boolean {
  return Array.isArray(options.allowedTools) && options.allowedTools.length === 0;
}

function isSdkEligible(options: ExecuteOptions): boolean {
  return isNoToolsRequested(options) && !hasMcpServersConfigured(options);
}

function isSdkEligibleWithApiKey(options: ExecuteOptions): boolean {
  // When using an API key (not CLI OAuth), prefer SDK over CLI to avoid OAuth issues.
  // SDK mode is used when MCP servers are not configured (MCP requires CLI).
  // Tool requests are handled by the SDK, so we allow SDK mode even with tools.
  return !hasMcpServersConfigured(options);
}

async function resolveCodexExecutionPlan(options: ExecuteOptions): Promise<CodexExecutionPlan> {
  const cliPath = await findCodexCliPath();
  const authIndicators = await getCodexAuthIndicators();
  const openAiApiKey = await resolveOpenAiApiKey();
  const hasApiKey = Boolean(openAiApiKey);
  const cliAvailable = Boolean(cliPath);
  // CLI OAuth login takes priority: if the user has logged in via `codex login`,
  // use the CLI regardless of whether an API key is also stored.
  // hasOAuthToken = OAuth session from `codex login`
  // authIndicators.hasApiKey = API key stored in Codex's own auth file (via `codex login --api-key`)
  // Both are "CLI-native" auth — distinct from an API key stored in Automaker's credentials.
  const hasCliNativeAuth = authIndicators.hasOAuthToken || authIndicators.hasApiKey;
  const sdkEligible = isSdkEligible(options);

  // If CLI is available and the user authenticated via the CLI (`codex login`),
  // prefer CLI mode over SDK. This ensures `codex login` sessions take priority
  // over API keys stored in Automaker's credentials.
  if (cliAvailable && hasCliNativeAuth) {
    return {
      mode: CODEX_EXECUTION_MODE_CLI,
      cliPath,
      openAiApiKey,
    };
  }

  // No CLI-native auth — prefer SDK when an API key is available.
  // Using SDK with an API key avoids OAuth issues that can arise with the CLI.
  // MCP servers still require CLI mode since the SDK doesn't support MCP.
  if (hasApiKey && isSdkEligibleWithApiKey(options)) {
    return {
      mode: CODEX_EXECUTION_MODE_SDK,
      cliPath,
      openAiApiKey,
    };
  }

  // MCP servers are requested with an API key but no CLI-native auth — use CLI mode
  // with the API key passed as an environment variable.
  if (hasApiKey && cliAvailable) {
    return {
      mode: CODEX_EXECUTION_MODE_CLI,
      cliPath,
      openAiApiKey,
    };
  }

  if (sdkEligible) {
    if (!cliAvailable) {
      throw new Error(ERROR_CODEX_SDK_AUTH_REQUIRED);
    }
  }

  if (!cliAvailable) {
    throw new Error(ERROR_CODEX_CLI_REQUIRED);
  }

  // At this point, neither hasCliNativeAuth nor hasApiKey is true,
  // so authentication is required regardless.
  throw new Error(ERROR_CODEX_AUTH_REQUIRED);
}

function getEventType(event: Record<string, unknown>): string | null {
  if (typeof event.type === 'string') {
    return event.type;
  }
  if (typeof event.event === 'string') {
    return event.event;
  }
  return null;
}

function extractText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => extractText(item))
      .filter(Boolean)
      .join('\n');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') {
      return record.text;
    }
    if (typeof record.content === 'string') {
      return record.content;
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
  }
  return null;
}

function extractCommandText(item: Record<string, unknown>): string | null {
  const direct = extractText(item.command ?? item.input ?? item.content);
  if (direct) {
    return direct;
  }
  return null;
}

function extractCommandOutput(item: Record<string, unknown>): string | null {
  const outputs: string[] = [];
  for (const field of COMMAND_OUTPUT_FIELDS) {
    const value = item[field];
    const text = extractText(value);
    if (text) {
      outputs.push(text);
    }
  }

  if (outputs.length === 0) {
    return null;
  }

  const uniqueOutputs = outputs.filter((output, index) => outputs.indexOf(output) === index);
  return uniqueOutputs.join(COMMAND_OUTPUT_SEPARATOR);
}

function extractItemType(item: Record<string, unknown>): string | null {
  if (typeof item.type === 'string') {
    return item.type;
  }
  if (typeof item.kind === 'string') {
    return item.kind;
  }
  return null;
}

function resolveSystemPrompt(systemPrompt?: unknown): string | null {
  if (!systemPrompt) {
    return null;
  }
  if (typeof systemPrompt === 'string') {
    return systemPrompt;
  }
  if (typeof systemPrompt === 'object' && systemPrompt !== null) {
    const record = systemPrompt as Record<string, unknown>;
    if (typeof record.append === 'string') {
      return record.append;
    }
  }
  return null;
}

function buildCombinedPrompt(options: ExecuteOptions, systemPromptText?: string | null): string {
  const promptText =
    typeof options.prompt === 'string' ? options.prompt : extractTextFromContent(options.prompt);
  const historyText = options.conversationHistory
    ? formatHistoryAsText(options.conversationHistory)
    : '';
  const resolvedSystemPrompt = systemPromptText ?? resolveSystemPrompt(options.systemPrompt);

  const systemSection = resolvedSystemPrompt
    ? `${SYSTEM_PROMPT_LABEL}:\n${resolvedSystemPrompt}\n\n`
    : '';

  return `${historyText}${systemSection}${HISTORY_HEADER}${promptText}`;
}

function formatConfigValue(value: string | number | boolean): string {
  return String(value);
}

function buildConfigOverrides(
  overrides: Array<{ key: string; value: string | number | boolean }>
): string[] {
  const args: string[] = [];
  for (const override of overrides) {
    args.push(CODEX_CONFIG_FLAG, `${override.key}=${formatConfigValue(override.value)}`);
  }
  return args;
}

function resolveMaxTurns(maxTurns?: number): number | null {
  if (typeof maxTurns !== 'number' || Number.isNaN(maxTurns) || !Number.isFinite(maxTurns)) {
    return null;
  }
  const normalized = Math.floor(maxTurns);
  return normalized >= MIN_MAX_TURNS ? normalized : null;
}

function resolveSearchEnabled(allowedTools: string[], restrictTools: boolean): boolean {
  const toolsToCheck = restrictTools ? allowedTools : Array.from(DEFAULT_ALLOWED_TOOLS);
  return toolsToCheck.some((tool) => SEARCH_TOOL_NAMES.has(tool));
}

function buildCodexConstraintsPrompt(
  options: ExecuteOptions,
  config: {
    allowedTools: string[];
    restrictTools: boolean;
    maxTurns: number | null;
    hasOutputSchema: boolean;
  }
): string | null {
  const lines: string[] = [];

  if (config.maxTurns !== null) {
    lines.push(`${CONSTRAINTS_MAX_TURNS_LABEL}: ${config.maxTurns}`);
  }

  if (config.restrictTools) {
    const allowed =
      config.allowedTools.length > 0 ? config.allowedTools.join(', ') : CONSTRAINTS_NO_TOOLS_VALUE;
    lines.push(`${CONSTRAINTS_ALLOWED_TOOLS_LABEL}: ${allowed}`);
  }

  if (config.hasOutputSchema) {
    lines.push(`${CONSTRAINTS_OUTPUT_SCHEMA_LABEL}: ${CONSTRAINTS_OUTPUT_SCHEMA_VALUE}`);
  }

  if (options.sdkSessionId) {
    lines.push(`${CONSTRAINTS_SESSION_ID_LABEL}: ${options.sdkSessionId}`);
  }

  if (lines.length === 0) {
    return null;
  }

  return `## ${CONSTRAINTS_SECTION_TITLE}\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

async function writeOutputSchemaFile(
  cwd: string,
  outputFormat?: ExecuteOptions['outputFormat']
): Promise<string | null> {
  if (!outputFormat || outputFormat.type !== 'json_schema') {
    return null;
  }
  if (!outputFormat.schema || typeof outputFormat.schema !== 'object') {
    throw new Error('Codex output schema must be a JSON object.');
  }

  const schemaDir = path.join(cwd, CODEX_INSTRUCTIONS_DIR);
  await secureFs.mkdir(schemaDir, { recursive: true });
  const schemaPath = path.join(schemaDir, OUTPUT_SCHEMA_FILENAME);
  const schemaContent = JSON.stringify(outputFormat.schema, null, OUTPUT_SCHEMA_INDENT_SPACES);
  await secureFs.writeFile(schemaPath, schemaContent, TEXT_ENCODING);
  return schemaPath;
}

type ImageBlock = {
  type: 'image';
  source: {
    type: string;
    media_type: string;
    data: string;
  };
};

function extractImageBlocks(prompt: ExecuteOptions['prompt']): ImageBlock[] {
  if (typeof prompt === 'string') {
    return [];
  }
  if (!Array.isArray(prompt)) {
    return [];
  }

  const images: ImageBlock[] = [];
  for (const block of prompt) {
    if (
      block &&
      typeof block === 'object' &&
      'type' in block &&
      block.type === 'image' &&
      'source' in block &&
      block.source &&
      typeof block.source === 'object' &&
      'data' in block.source &&
      'media_type' in block.source
    ) {
      images.push(block as ImageBlock);
    }
  }
  return images;
}

async function writeImageFiles(cwd: string, imageBlocks: ImageBlock[]): Promise<string[]> {
  if (imageBlocks.length === 0) {
    return [];
  }

  const imageDir = path.join(cwd, CODEX_INSTRUCTIONS_DIR, IMAGE_TEMP_DIR);
  await secureFs.mkdir(imageDir, { recursive: true });

  const imagePaths: string[] = [];
  for (let i = 0; i < imageBlocks.length; i++) {
    const imageBlock = imageBlocks[i];
    const imageName = `${IMAGE_FILE_PREFIX}${Date.now()}-${i}${IMAGE_FILE_EXT}`;
    const imagePath = path.join(imageDir, imageName);

    // Convert base64 to buffer
    const imageData = Buffer.from(imageBlock.source.data, 'base64');
    await secureFs.writeFile(imagePath, imageData);
    imagePaths.push(imagePath);
  }

  return imagePaths;
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function getIdentifierFromRecord(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const id = normalizeIdentifier(record[key]);
    if (id) {
      return id;
    }
  }
  return null;
}

function getItemIdentifier(
  event: Record<string, unknown>,
  item: Record<string, unknown>
): string | null {
  return (
    getIdentifierFromRecord(item, ITEM_ID_KEYS) ?? getIdentifierFromRecord(event, EVENT_ID_KEYS)
  );
}

class CodexToolUseTracker {
  private readonly toolUseIdsByItem = new Map<string, string>();
  private readonly anonymousToolUses: string[] = [];
  private sequence = 0;

  register(event: Record<string, unknown>, item: Record<string, unknown>): string {
    const itemId = getItemIdentifier(event, item);
    const toolUseId = this.nextToolUseId();
    if (itemId) {
      this.toolUseIdsByItem.set(itemId, toolUseId);
    } else {
      this.anonymousToolUses.push(toolUseId);
    }
    return toolUseId;
  }

  resolve(event: Record<string, unknown>, item: Record<string, unknown>): string | null {
    const itemId = getItemIdentifier(event, item);
    if (itemId) {
      const toolUseId = this.toolUseIdsByItem.get(itemId);
      if (toolUseId) {
        this.toolUseIdsByItem.delete(itemId);
        return toolUseId;
      }
    }

    if (this.anonymousToolUses.length > 0) {
      return this.anonymousToolUses.shift() || null;
    }

    return null;
  }

  private nextToolUseId(): string {
    this.sequence += 1;
    return `${TOOL_USE_ID_PREFIX}${this.sequence}`;
  }
}

type CodexCliSettings = {
  autoLoadAgents: boolean;
  sandboxMode: CodexSandboxMode;
  approvalPolicy: CodexApprovalPolicy;
  enableWebSearch: boolean;
  enableImages: boolean;
  additionalDirs: string[];
  threadId?: string;
};

function getCodexSettingsDir(): string {
  const configured = getDataDirectory() ?? process.env.DATA_DIR;
  return configured ? path.resolve(configured) : path.resolve(CODEX_SETTINGS_DIR_FALLBACK);
}

async function loadCodexCliSettings(
  overrides?: ExecuteOptions['codexSettings']
): Promise<CodexCliSettings> {
  const defaults: CodexCliSettings = {
    autoLoadAgents: DEFAULT_CODEX_AUTO_LOAD_AGENTS,
    sandboxMode: DEFAULT_CODEX_SANDBOX_MODE,
    approvalPolicy: DEFAULT_CODEX_APPROVAL_POLICY,
    enableWebSearch: false,
    enableImages: true,
    additionalDirs: [],
    threadId: undefined,
  };

  try {
    const settingsService = new SettingsService(getCodexSettingsDir());
    const settings = await settingsService.getGlobalSettings();
    const resolved: CodexCliSettings = {
      autoLoadAgents: settings.codexAutoLoadAgents ?? defaults.autoLoadAgents,
      sandboxMode: settings.codexSandboxMode ?? defaults.sandboxMode,
      approvalPolicy: settings.codexApprovalPolicy ?? defaults.approvalPolicy,
      enableWebSearch: settings.codexEnableWebSearch ?? defaults.enableWebSearch,
      enableImages: settings.codexEnableImages ?? defaults.enableImages,
      additionalDirs: settings.codexAdditionalDirs ?? defaults.additionalDirs,
      threadId: settings.codexThreadId,
    };

    if (!overrides) {
      return resolved;
    }

    return {
      autoLoadAgents: overrides.autoLoadAgents ?? resolved.autoLoadAgents,
      sandboxMode: overrides.sandboxMode ?? resolved.sandboxMode,
      approvalPolicy: overrides.approvalPolicy ?? resolved.approvalPolicy,
      enableWebSearch: overrides.enableWebSearch ?? resolved.enableWebSearch,
      enableImages: overrides.enableImages ?? resolved.enableImages,
      additionalDirs: overrides.additionalDirs ?? resolved.additionalDirs,
      threadId: overrides.threadId ?? resolved.threadId,
    };
  } catch {
    return {
      autoLoadAgents: overrides?.autoLoadAgents ?? defaults.autoLoadAgents,
      sandboxMode: overrides?.sandboxMode ?? defaults.sandboxMode,
      approvalPolicy: overrides?.approvalPolicy ?? defaults.approvalPolicy,
      enableWebSearch: overrides?.enableWebSearch ?? defaults.enableWebSearch,
      enableImages: overrides?.enableImages ?? defaults.enableImages,
      additionalDirs: overrides?.additionalDirs ?? defaults.additionalDirs,
      threadId: overrides?.threadId ?? defaults.threadId,
    };
  }
}

function buildCodexInstructionsPrompt(
  filePath: string,
  content: string,
  sourceLabel: string
): string {
  return `## ${CODEX_INSTRUCTIONS_SECTION}\n**${CODEX_INSTRUCTIONS_SOURCE_LABEL}:** ${sourceLabel}\n**${CODEX_INSTRUCTIONS_PATH_LABEL}:** \`${filePath}\`\n\n${content}`;
}

async function readCodexInstructionFile(filePath: string): Promise<string | null> {
  try {
    const raw = await secureFs.readFile(filePath, TEXT_ENCODING);
    const content = String(raw).trim();
    return content ? content : null;
  } catch {
    return null;
  }
}

async function loadCodexInstructions(cwd: string, enabled: boolean): Promise<string | null> {
  if (!enabled) {
    return null;
  }

  const sources: Array<{ path: string; content: string; sourceLabel: string }> = [];
  const userInstructionsPath = path.join(getCodexConfigDir(), CODEX_USER_INSTRUCTIONS_FILE);
  const userContent = await readCodexInstructionFile(userInstructionsPath);
  if (userContent) {
    sources.push({
      path: userInstructionsPath,
      content: userContent,
      sourceLabel: CODEX_INSTRUCTIONS_USER_SOURCE,
    });
  }

  for (const fileName of CODEX_PROJECT_INSTRUCTIONS_FILES) {
    const projectPath = path.join(cwd, CODEX_INSTRUCTIONS_DIR, fileName);
    const projectContent = await readCodexInstructionFile(projectPath);
    if (projectContent) {
      sources.push({
        path: projectPath,
        content: projectContent,
        sourceLabel: CODEX_INSTRUCTIONS_PROJECT_SOURCE,
      });
    }
  }

  if (sources.length === 0) {
    return null;
  }

  const seen = new Set<string>();
  const uniqueSources = sources.filter((source) => {
    const normalized = source.content.trim();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });

  return uniqueSources
    .map((source) => buildCodexInstructionsPrompt(source.path, source.content, source.sourceLabel))
    .join('\n\n');
}

const logger = createLogger('CodexProvider');

export class CodexProvider extends BaseProvider {
  getName(): string {
    return 'codex';
  }

  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    // Validate that model doesn't have a provider prefix
    // AgentService should strip prefixes before passing to providers
    validateBareModelId(options.model, 'CodexProvider');

    try {
      const mcpServers = options.mcpServers ?? {};
      const hasMcpServers = Object.keys(mcpServers).length > 0;
      const codexSettings = await loadCodexCliSettings(options.codexSettings);
      const codexInstructions = await loadCodexInstructions(
        options.cwd,
        codexSettings.autoLoadAgents
      );
      const baseSystemPrompt = resolveSystemPrompt(options.systemPrompt);
      const resolvedMaxTurns = resolveMaxTurns(options.maxTurns);
      if (resolvedMaxTurns === null && options.maxTurns === undefined) {
        logger.warn(
          `[executeQuery] maxTurns not provided — Codex CLI will use its internal default. ` +
            `This may cause premature completion. Model: ${options.model}`
        );
      } else {
        logger.info(
          `[executeQuery] maxTurns: requested=${options.maxTurns}, resolved=${resolvedMaxTurns}, model=${options.model}`
        );
      }
      const resolvedAllowedTools = options.allowedTools ?? Array.from(DEFAULT_ALLOWED_TOOLS);
      const restrictTools = !hasMcpServers || options.mcpUnrestrictedTools === false;
      const wantsOutputSchema = Boolean(
        options.outputFormat && options.outputFormat.type === 'json_schema'
      );
      const constraintsPrompt = buildCodexConstraintsPrompt(options, {
        allowedTools: resolvedAllowedTools,
        restrictTools,
        maxTurns: resolvedMaxTurns,
        hasOutputSchema: wantsOutputSchema,
      });
      const systemPromptParts = [codexInstructions, baseSystemPrompt, constraintsPrompt].filter(
        (part): part is string => Boolean(part)
      );
      const combinedSystemPrompt = systemPromptParts.length
        ? systemPromptParts.join(SYSTEM_PROMPT_SEPARATOR)
        : null;

      const executionPlan = await resolveCodexExecutionPlan(options);
      if (executionPlan.mode === CODEX_EXECUTION_MODE_SDK) {
        const cleanupEnv = executionPlan.openAiApiKey
          ? createTempEnvOverride({ [OPENAI_API_KEY_ENV]: executionPlan.openAiApiKey })
          : null;
        try {
          yield* executeCodexSdkQuery(options, combinedSystemPrompt);
        } finally {
          cleanupEnv?.();
        }
        return;
      }

      if (hasMcpServers) {
        const configManager = new CodexConfigManager();
        await configManager.configureMcpServers(options.cwd, options.mcpServers!);
      }

      const toolUseTracker = new CodexToolUseTracker();
      const sandboxCheck = checkSandboxCompatibility(
        options.cwd,
        codexSettings.sandboxMode !== 'danger-full-access'
      );
      if (!sandboxCheck.enabled && sandboxCheck.message) {
        console.warn(`[CodexProvider] ${sandboxCheck.message}`);
      }
      const searchEnabled =
        codexSettings.enableWebSearch || resolveSearchEnabled(resolvedAllowedTools, restrictTools);
      const schemaPath = await writeOutputSchemaFile(options.cwd, options.outputFormat);
      const imageBlocks = codexSettings.enableImages ? extractImageBlocks(options.prompt) : [];
      const imagePaths = await writeImageFiles(options.cwd, imageBlocks);
      const approvalPolicy =
        hasMcpServers && options.mcpAutoApproveTools !== undefined
          ? options.mcpAutoApproveTools
            ? 'never'
            : 'on-request'
          : codexSettings.approvalPolicy;
      const promptText = buildCombinedPrompt(options, combinedSystemPrompt);
      const commandPath = executionPlan.cliPath || CODEX_COMMAND;

      // Build config overrides for max turns and reasoning effort
      const overrides: Array<{ key: string; value: string | number | boolean }> = [];
      if (resolvedMaxTurns !== null) {
        overrides.push({ key: CONFIG_KEY_MAX_TURNS, value: resolvedMaxTurns });
      }

      // Add reasoning effort if model supports it and reasoningEffort is specified
      if (
        options.reasoningEffort &&
        supportsReasoningEffort(options.model) &&
        options.reasoningEffort !== 'none'
      ) {
        overrides.push({ key: CODEX_REASONING_EFFORT_KEY, value: options.reasoningEffort });
      }

      // Add approval policy
      overrides.push({ key: 'approval_policy', value: approvalPolicy });

      // Add web search if enabled
      if (searchEnabled) {
        overrides.push({ key: 'features.web_search_request', value: true });
      }

      const configOverrideArgs = buildConfigOverrides(overrides);
      const preExecArgs: string[] = [];

      // Add additional directories with write access
      if (codexSettings.additionalDirs && codexSettings.additionalDirs.length > 0) {
        for (const dir of codexSettings.additionalDirs) {
          preExecArgs.push(CODEX_ADD_DIR_FLAG, dir);
        }
      }

      // If images were written to disk, add the image directory so the CLI can access them
      if (imagePaths.length > 0) {
        const imageDir = path.join(options.cwd, CODEX_INSTRUCTIONS_DIR, IMAGE_TEMP_DIR);
        preExecArgs.push(CODEX_ADD_DIR_FLAG, imageDir);
      }

      // Model is already bare (no prefix) - validated by executeQuery
      const args = [
        CODEX_EXEC_SUBCOMMAND,
        CODEX_YOLO_FLAG,
        CODEX_SKIP_GIT_REPO_CHECK_FLAG,
        ...preExecArgs,
        CODEX_MODEL_FLAG,
        options.model,
        CODEX_JSON_FLAG,
        ...configOverrideArgs,
        ...(schemaPath ? [CODEX_OUTPUT_SCHEMA_FLAG, schemaPath] : []),
        '-', // Read prompt from stdin to avoid shell escaping issues
      ];

      const envOverrides = buildEnv();
      if (executionPlan.openAiApiKey && !envOverrides[OPENAI_API_KEY_ENV]) {
        envOverrides[OPENAI_API_KEY_ENV] = executionPlan.openAiApiKey;
      }

      // Calculate dynamic timeout based on reasoning effort.
      // Higher reasoning effort (e.g., 'xhigh' for "xtra thinking" mode) requires more time
      // for the model to generate reasoning tokens before producing output.
      // This fixes GitHub issue #530 where features would get stuck with reasoning models.
      //
      // For feature generation with 'xhigh', use the extended 5-minute base timeout
      // since generating 50+ features takes significantly longer than normal operations.
      const baseTimeout =
        options.reasoningEffort === 'xhigh'
          ? CODEX_FEATURE_GENERATION_BASE_TIMEOUT_MS
          : CODEX_CLI_TIMEOUT_MS;
      const timeout = calculateReasoningTimeout(options.reasoningEffort, baseTimeout);

      const stream = spawnJSONLProcess({
        command: commandPath,
        args,
        cwd: options.cwd,
        env: envOverrides,
        abortController: options.abortController,
        timeout,
        stdinData: promptText, // Pass prompt via stdin
      });

      for await (const rawEvent of stream) {
        const event = rawEvent as Record<string, unknown>;
        const eventType = getEventType(event);

        // Track thread/session ID from events
        const threadId = event.thread_id;
        if (threadId && typeof threadId === 'string') {
          this._lastSessionId = threadId;
        }

        if (eventType === CODEX_EVENT_TYPES.error) {
          const errorText = extractText(event.error ?? event.message) || 'Codex CLI error';

          // Enhance error message with helpful context
          let enhancedError = errorText;
          const errorLower = errorText.toLowerCase();
          if (errorLower.includes('rate limit')) {
            enhancedError = `${errorText}\n\nTip: You're being rate limited. Try reducing concurrent tasks or waiting a few minutes before retrying.`;
          } else if (errorLower.includes('authentication') || errorLower.includes('unauthorized')) {
            enhancedError = `${errorText}\n\nTip: Check that your OPENAI_API_KEY is set correctly or run 'codex login' to authenticate.`;
          } else if (
            errorLower.includes('model does not exist') ||
            errorLower.includes('requested model does not exist') ||
            errorLower.includes('do not have access') ||
            errorLower.includes('model_not_found') ||
            errorLower.includes('invalid_model')
          ) {
            enhancedError =
              `${errorText}\n\nTip: The model '${options.model}' may not be available on your OpenAI plan. ` +
              `See https://platform.openai.com/docs/models for available models. ` +
              `Some models require a ChatGPT Pro/Plus subscription—authenticate with 'codex login' instead of an API key.`;
          } else if (
            errorLower.includes('stream disconnected') ||
            errorLower.includes('stream ended') ||
            errorLower.includes('connection reset')
          ) {
            enhancedError =
              `${errorText}\n\nTip: The connection to OpenAI was interrupted. This can happen due to:\n` +
              `- Network instability\n` +
              `- The model not being available on your plan\n` +
              `- Server-side timeouts for long-running requests\n` +
              `Try again, or switch to a different model.`;
          } else if (
            errorLower.includes('command not found') ||
            errorLower.includes('is not recognized as an internal or external command')
          ) {
            enhancedError = `${errorText}\n\nTip: Make sure the Codex CLI is installed. Run 'npm install -g @openai/codex-cli' to install.`;
          }

          console.error('[CodexProvider] CLI error event:', { errorText, event });
          yield { type: 'error', error: enhancedError };
          continue;
        }

        if (eventType === CODEX_EVENT_TYPES.turnCompleted) {
          const resultText = extractText(event.result) || undefined;
          yield { type: 'result', subtype: 'success', result: resultText };
          continue;
        }

        if (!eventType) {
          const fallbackText = extractText(event);
          if (fallbackText) {
            yield {
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: fallbackText }],
              },
            };
          }
          continue;
        }

        const item = (event.item ?? {}) as Record<string, unknown>;
        const itemType = extractItemType(item);

        if (
          eventType === CODEX_EVENT_TYPES.itemStarted &&
          itemType === CODEX_ITEM_TYPES.commandExecution
        ) {
          const commandText = extractCommandText(item) || '';
          const tool = resolveCodexToolCall(commandText);
          const toolUseId = toolUseTracker.register(event, item);
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  name: tool.name,
                  input: tool.input,
                  tool_use_id: toolUseId,
                },
              ],
            },
          };
          continue;
        }

        if (eventType === CODEX_EVENT_TYPES.itemUpdated && itemType === CODEX_ITEM_TYPES.todoList) {
          const todos = extractCodexTodoItems(item);
          if (todos) {
            yield {
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    name: getCodexTodoToolName(),
                    input: { todos },
                  },
                ],
              },
            };
          } else {
            const todoText = extractText(item) || '';
            const formatted = todoText ? `Updated TODO list:\n${todoText}` : 'Updated TODO list';
            yield {
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: formatted }],
              },
            };
          }
          continue;
        }

        if (eventType === CODEX_EVENT_TYPES.itemCompleted) {
          if (itemType === CODEX_ITEM_TYPES.reasoning) {
            const thinkingText = extractText(item) || '';
            yield {
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'thinking', thinking: thinkingText }],
              },
            };
            continue;
          }

          if (itemType === CODEX_ITEM_TYPES.commandExecution) {
            const commandOutput =
              extractCommandOutput(item) ?? extractCommandText(item) ?? extractText(item) ?? '';
            if (commandOutput) {
              const toolUseId = toolUseTracker.resolve(event, item);
              const toolResultBlock: {
                type: 'tool_result';
                content: string;
                tool_use_id?: string;
              } = { type: 'tool_result', content: commandOutput };
              if (toolUseId) {
                toolResultBlock.tool_use_id = toolUseId;
              }
              yield {
                type: 'assistant',
                message: {
                  role: 'assistant',
                  content: [toolResultBlock],
                },
              };
            }
            continue;
          }

          const text = extractText(item) || extractText(event);
          if (text) {
            yield {
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text }],
              },
            };
          }
        }
      }
    } catch (error) {
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);
      const enhancedMessage = errorInfo.isRateLimit
        ? `${userMessage}\n\nTip: If you're rate limited, try reducing concurrent tasks or waiting a few minutes.`
        : userMessage;

      console.error('[CodexProvider] executeQuery() error:', {
        type: errorInfo.type,
        message: errorInfo.message,
        isRateLimit: errorInfo.isRateLimit,
        retryAfter: errorInfo.retryAfter,
        stack: error instanceof Error ? error.stack : undefined,
      });

      yield { type: 'error', error: enhancedMessage };
    }
  }

  async detectInstallation(): Promise<InstallationStatus> {
    const cliPath = await findCodexCliPath();
    const hasApiKey = Boolean(await resolveOpenAiApiKey());
    const installed = !!cliPath;

    let version = '';
    if (installed) {
      try {
        const result = await spawnProcess({
          command: cliPath || CODEX_COMMAND,
          args: [CODEX_VERSION_FLAG],
          cwd: process.cwd(),
        });
        version = result.stdout.trim();
      } catch {
        version = '';
      }
    }

    // Determine auth status - always verify with CLI, never assume authenticated
    const authCheck = await checkCodexAuthentication(cliPath);
    const authenticated = authCheck.authenticated;

    return {
      installed,
      path: cliPath || undefined,
      version: version || undefined,
      method: 'cli' as const, // Installation method
      hasApiKey,
      authenticated,
    };
  }

  getAvailableModels(): ModelDefinition[] {
    // Return all available Codex/OpenAI models
    return CODEX_MODELS;
  }

  /**
   * Check authentication status for Codex CLI
   */
  async checkAuth(): Promise<CodexAuthStatus> {
    const cliPath = await findCodexCliPath();
    const hasApiKey = Boolean(await resolveOpenAiApiKey());
    const authIndicators = await getCodexAuthIndicators();

    // Check for API key in environment
    if (hasApiKey) {
      return { authenticated: true, method: 'api_key' };
    }

    // Check for OAuth/token from Codex CLI
    if (authIndicators.hasOAuthToken || authIndicators.hasApiKey) {
      return { authenticated: true, method: 'oauth' };
    }

    // CLI is installed but not authenticated via indicators - try CLI command
    if (cliPath) {
      try {
        // Try 'codex login status' first (same as checkCodexAuthentication)
        const result = await spawnProcess({
          command: cliPath || CODEX_COMMAND,
          args: ['login', 'status'],
          cwd: process.cwd(),
          env: {
            ...process.env,
            TERM: 'dumb',
          },
        });

        // Check both stdout and stderr - Codex CLI outputs to stderr
        const combinedOutput = (result.stdout + result.stderr).toLowerCase();
        const isLoggedIn = combinedOutput.includes('logged in');

        if (result.exitCode === 0 && isLoggedIn) {
          return { authenticated: true, method: 'oauth' };
        }
      } catch (error) {
        logger.warn('Error running login status command during auth check:', error);
      }
    }

    return { authenticated: false, method: 'none' };
  }

  /**
   * Get the detected CLI path (public accessor for status endpoints)
   */
  async getCliPath(): Promise<string | null> {
    const path = await findCodexCliPath();
    return path || null;
  }

  /**
   * Get the last CLI session ID (for tracking across queries)
   * This can be used to resume sessions in subsequent requests
   */
  getLastSessionId(): string | null {
    return this._lastSessionId ?? null;
  }

  /**
   * Set a session ID to use for CLI session resumption
   */
  setSessionId(sessionId: string | null): void {
    this._lastSessionId = sessionId;
  }

  private _lastSessionId: string | null = null;
}
