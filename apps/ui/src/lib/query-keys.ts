/**
 * Query Keys Factory
 *
 * Centralized query key definitions for React Query.
 * Following the factory pattern for type-safe, consistent query keys.
 *
 * @see https://tkdodo.eu/blog/effective-react-query-keys
 */

/**
 * Query keys for all API endpoints
 *
 * Structure follows the pattern:
 * - ['entity'] for listing/global
 * - ['entity', id] for single item
 * - ['entity', id, 'sub-resource'] for nested resources
 */
export const queryKeys = {
  // ============================================
  // Features
  // ============================================
  features: {
    /** All features for a project */
    all: (projectPath: string) => ['features', projectPath] as const,
    /** Single feature */
    single: (projectPath: string, featureId: string) =>
      ['features', projectPath, featureId] as const,
    /** Agent output for a feature */
    agentOutput: (projectPath: string, featureId: string) =>
      ['features', projectPath, featureId, 'output'] as const,
  },

  // ============================================
  // Worktrees
  // ============================================
  worktrees: {
    /** All worktrees for a project */
    all: (projectPath: string) => ['worktrees', projectPath] as const,
    /** Single worktree info */
    single: (projectPath: string, featureId: string) =>
      ['worktrees', projectPath, featureId] as const,
    /** Branches for a worktree */
    branches: (worktreePath: string, includeRemote = false) =>
      ['worktrees', 'branches', worktreePath, { includeRemote }] as const,
    /** Worktree status */
    status: (projectPath: string, featureId: string) =>
      ['worktrees', projectPath, featureId, 'status'] as const,
    /** Worktree diffs */
    diffs: (projectPath: string, featureId: string) =>
      ['worktrees', projectPath, featureId, 'diffs'] as const,
    /** Init script for a project */
    initScript: (projectPath: string) => ['worktrees', projectPath, 'init-script'] as const,
    /** Available editors */
    editors: () => ['worktrees', 'editors'] as const,
  },

  // ============================================
  // GitHub
  // ============================================
  github: {
    /** GitHub issues for a project */
    issues: (projectPath: string) => ['github', 'issues', projectPath] as const,
    /** GitHub PRs for a project */
    prs: (projectPath: string) => ['github', 'prs', projectPath] as const,
    /** GitHub validations for a project */
    validations: (projectPath: string) => ['github', 'validations', projectPath] as const,
    /** Single validation */
    validation: (projectPath: string, issueNumber: number) =>
      ['github', 'validations', projectPath, issueNumber] as const,
    /** Issue comments */
    issueComments: (projectPath: string, issueNumber: number) =>
      ['github', 'issues', projectPath, issueNumber, 'comments'] as const,
    /** Remote info */
    remote: (projectPath: string) => ['github', 'remote', projectPath] as const,
  },

  // ============================================
  // Settings
  // ============================================
  settings: {
    /** Global settings */
    global: () => ['settings', 'global'] as const,
    /** Project-specific settings */
    project: (projectPath: string) => ['settings', 'project', projectPath] as const,
    /** Settings status */
    status: () => ['settings', 'status'] as const,
    /** Credentials (API keys) */
    credentials: () => ['settings', 'credentials'] as const,
    /** Discovered agents */
    agents: (projectPath: string, sources?: Array<'user' | 'project'>) =>
      ['settings', 'agents', projectPath, sources ?? []] as const,
  },

  // ============================================
  // Usage & Billing
  // ============================================
  usage: {
    /** Claude API usage */
    claude: () => ['usage', 'claude'] as const,
    /** Codex API usage */
    codex: () => ['usage', 'codex'] as const,
  },

  // ============================================
  // Models
  // ============================================
  models: {
    /** Available models */
    available: () => ['models', 'available'] as const,
    /** Codex models */
    codex: () => ['models', 'codex'] as const,
    /** OpenCode models */
    opencode: () => ['models', 'opencode'] as const,
    /** OpenCode providers */
    opencodeProviders: () => ['models', 'opencode', 'providers'] as const,
    /** Provider status */
    providers: () => ['models', 'providers'] as const,
  },

  // ============================================
  // Sessions
  // ============================================
  sessions: {
    /** All sessions */
    all: (includeArchived?: boolean) => ['sessions', { includeArchived }] as const,
    /** Session history */
    history: (sessionId: string) => ['sessions', sessionId, 'history'] as const,
    /** Session queue */
    queue: (sessionId: string) => ['sessions', sessionId, 'queue'] as const,
  },

  // ============================================
  // Running Agents
  // ============================================
  runningAgents: {
    /** All running agents */
    all: () => ['runningAgents'] as const,
  },

  // ============================================
  // Auto Mode
  // ============================================
  autoMode: {
    /** Auto mode status */
    status: (projectPath?: string) => ['autoMode', 'status', projectPath] as const,
    /** Context exists check */
    contextExists: (projectPath: string, featureId: string) =>
      ['autoMode', projectPath, featureId, 'context'] as const,
  },

  // ============================================
  // Ideation
  // ============================================
  ideation: {
    /** Ideation prompts */
    prompts: () => ['ideation', 'prompts'] as const,
    /** Ideas for a project */
    ideas: (projectPath: string) => ['ideation', 'ideas', projectPath] as const,
    /** Single idea */
    idea: (projectPath: string, ideaId: string) =>
      ['ideation', 'ideas', projectPath, ideaId] as const,
    /** Session */
    session: (projectPath: string, sessionId: string) =>
      ['ideation', 'session', projectPath, sessionId] as const,
  },

  // ============================================
  // CLI Status
  // ============================================
  cli: {
    /** Claude CLI status */
    claude: () => ['cli', 'claude'] as const,
    /** Cursor CLI status */
    cursor: () => ['cli', 'cursor'] as const,
    /** Codex CLI status */
    codex: () => ['cli', 'codex'] as const,
    /** OpenCode CLI status */
    opencode: () => ['cli', 'opencode'] as const,
    /** GitHub CLI status */
    github: () => ['cli', 'github'] as const,
    /** API keys status */
    apiKeys: () => ['cli', 'apiKeys'] as const,
    /** Platform info */
    platform: () => ['cli', 'platform'] as const,
  },

  // ============================================
  // Cursor Permissions
  // ============================================
  cursorPermissions: {
    /** Cursor permissions for a project */
    permissions: (projectPath?: string) => ['cursorPermissions', projectPath] as const,
  },

  // ============================================
  // Workspace
  // ============================================
  workspace: {
    /** Workspace config */
    config: () => ['workspace', 'config'] as const,
    /** Workspace directories */
    directories: () => ['workspace', 'directories'] as const,
  },

  // ============================================
  // MCP (Model Context Protocol)
  // ============================================
  mcp: {
    /** MCP server tools */
    tools: (serverId: string) => ['mcp', 'tools', serverId] as const,
  },

  // ============================================
  // Pipeline
  // ============================================
  pipeline: {
    /** Pipeline config for a project */
    config: (projectPath: string) => ['pipeline', projectPath] as const,
  },

  // ============================================
  // Suggestions
  // ============================================
  suggestions: {
    /** Suggestions status */
    status: () => ['suggestions', 'status'] as const,
  },

  // ============================================
  // Spec Regeneration
  // ============================================
  specRegeneration: {
    /** Spec regeneration status */
    status: (projectPath?: string) => ['specRegeneration', 'status', projectPath] as const,
  },

  // ============================================
  // Spec
  // ============================================
  spec: {
    /** Spec file content */
    file: (projectPath: string) => ['spec', 'file', projectPath] as const,
  },

  // ============================================
  // Context
  // ============================================
  context: {
    /** File description */
    file: (filePath: string) => ['context', 'file', filePath] as const,
    /** Image description */
    image: (imagePath: string) => ['context', 'image', imagePath] as const,
  },

  // ============================================
  // File System
  // ============================================
  fs: {
    /** Directory listing */
    readdir: (dirPath: string) => ['fs', 'readdir', dirPath] as const,
    /** File existence */
    exists: (filePath: string) => ['fs', 'exists', filePath] as const,
    /** File stats */
    stat: (filePath: string) => ['fs', 'stat', filePath] as const,
  },

  // ============================================
  // Git
  // ============================================
  git: {
    /** Git diffs for a project */
    diffs: (projectPath: string) => ['git', 'diffs', projectPath] as const,
    /** File diff */
    fileDiff: (projectPath: string, filePath: string) =>
      ['git', 'diffs', projectPath, filePath] as const,
  },
} as const;

/**
 * Type helper to extract query key types
 */
export type QueryKeys = typeof queryKeys;
