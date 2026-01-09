export type CodexToolResolution = {
  name: string;
  input: Record<string, unknown>;
};

export type CodexTodoItem = {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
};

const TOOL_NAME_BASH = 'Bash';
const TOOL_NAME_READ = 'Read';
const TOOL_NAME_EDIT = 'Edit';
const TOOL_NAME_WRITE = 'Write';
const TOOL_NAME_GREP = 'Grep';
const TOOL_NAME_GLOB = 'Glob';
const TOOL_NAME_TODO = 'TodoWrite';
const TOOL_NAME_DELETE = 'Delete';
const TOOL_NAME_LS = 'Ls';

const INPUT_KEY_COMMAND = 'command';
const INPUT_KEY_FILE_PATH = 'file_path';
const INPUT_KEY_PATTERN = 'pattern';

const SHELL_WRAPPER_PATTERNS = [
  /^\/bin\/bash\s+-lc\s+["']([\s\S]+)["']$/,
  /^bash\s+-lc\s+["']([\s\S]+)["']$/,
  /^\/bin\/sh\s+-lc\s+["']([\s\S]+)["']$/,
  /^sh\s+-lc\s+["']([\s\S]+)["']$/,
  /^cmd\.exe\s+\/c\s+["']?([\s\S]+)["']?$/i,
  /^powershell(?:\.exe)?\s+-Command\s+["']?([\s\S]+)["']?$/i,
  /^pwsh(?:\.exe)?\s+-Command\s+["']?([\s\S]+)["']?$/i,
] as const;

const COMMAND_SEPARATOR_PATTERN = /\s*(?:&&|\|\||;)\s*/;
const SEGMENT_SKIP_PREFIXES = ['cd ', 'export ', 'set ', 'pushd '] as const;
const WRAPPER_COMMANDS = new Set(['sudo', 'env', 'command']);
const READ_COMMANDS = new Set(['cat', 'sed', 'head', 'tail', 'less', 'more', 'bat', 'stat', 'wc']);
const SEARCH_COMMANDS = new Set(['rg', 'grep', 'ag', 'ack']);
const GLOB_COMMANDS = new Set(['ls', 'find', 'fd', 'tree']);
const DELETE_COMMANDS = new Set(['rm', 'del', 'erase', 'remove', 'unlink']);
const LIST_COMMANDS = new Set(['ls', 'dir', 'll', 'la']);
const WRITE_COMMANDS = new Set(['tee', 'touch', 'mkdir']);
const APPLY_PATCH_COMMAND = 'apply_patch';
const APPLY_PATCH_PATTERN = /\bapply_patch\b/;
const REDIRECTION_TARGET_PATTERN = /(?:>>|>)\s*([^\s]+)/;
const SED_IN_PLACE_FLAGS = new Set(['-i', '--in-place']);
const PERL_IN_PLACE_FLAG = /-.*i/;
const SEARCH_PATTERN_FLAGS = new Set(['-e', '--regexp']);
const SEARCH_VALUE_FLAGS = new Set([
  '-g',
  '--glob',
  '--iglob',
  '--type',
  '--type-add',
  '--type-clear',
  '--encoding',
]);
const SEARCH_FILE_LIST_FLAGS = new Set(['--files']);
const TODO_LINE_PATTERN = /^[-*]\s*(?:\[(?<status>[ x~])\]\s*)?(?<content>.+)$/;
const TODO_STATUS_COMPLETED = 'completed';
const TODO_STATUS_IN_PROGRESS = 'in_progress';
const TODO_STATUS_PENDING = 'pending';
const PATCH_FILE_MARKERS = [
  '*** Update File: ',
  '*** Add File: ',
  '*** Delete File: ',
  '*** Move to: ',
] as const;

function stripShellWrapper(command: string): string {
  const trimmed = command.trim();
  for (const pattern of SHELL_WRAPPER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return unescapeCommand(match[1].trim());
    }
  }
  return trimmed;
}

function unescapeCommand(command: string): string {
  return command.replace(/\\(["'])/g, '$1');
}

function extractPrimarySegment(command: string): string {
  const segments = command
    .split(COMMAND_SEPARATOR_PATTERN)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const shouldSkip = SEGMENT_SKIP_PREFIXES.some((prefix) => segment.startsWith(prefix));
    if (!shouldSkip) {
      return segment;
    }
  }

  return command.trim();
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let isEscaped = false;

  for (const char of command) {
    if (isEscaped) {
      current += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function stripWrapperTokens(tokens: string[]): string[] {
  let index = 0;
  while (index < tokens.length && WRAPPER_COMMANDS.has(tokens[index].toLowerCase())) {
    index += 1;
  }
  return tokens.slice(index);
}

function extractFilePathFromTokens(tokens: string[]): string | null {
  const candidates = tokens.slice(1).filter((token) => token && !token.startsWith('-'));
  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1];
}

function extractSearchPattern(tokens: string[]): string | null {
  const remaining = tokens.slice(1);

  for (let index = 0; index < remaining.length; index += 1) {
    const token = remaining[index];
    if (token === '--') {
      return remaining[index + 1] ?? null;
    }
    if (SEARCH_PATTERN_FLAGS.has(token)) {
      return remaining[index + 1] ?? null;
    }
    if (SEARCH_VALUE_FLAGS.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }
    return token;
  }

  return null;
}

function extractTeeTarget(tokens: string[]): string | null {
  const teeIndex = tokens.findIndex((token) => token === 'tee');
  if (teeIndex < 0) return null;
  const candidate = tokens[teeIndex + 1];
  return candidate && !candidate.startsWith('-') ? candidate : null;
}

function extractRedirectionTarget(command: string): string | null {
  const match = command.match(REDIRECTION_TARGET_PATTERN);
  return match?.[1] ?? null;
}

function extractFilePathFromDeleteTokens(tokens: string[]): string | null {
  // rm file.txt or rm /path/to/file.txt
  // Skip flags and get the first non-flag argument
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token && !token.startsWith('-')) {
      return token;
    }
  }
  return null;
}

function hasSedInPlaceFlag(tokens: string[]): boolean {
  return tokens.some((token) => SED_IN_PLACE_FLAGS.has(token) || token.startsWith('-i'));
}

function hasPerlInPlaceFlag(tokens: string[]): boolean {
  return tokens.some((token) => PERL_IN_PLACE_FLAG.test(token));
}

function extractPatchFilePath(command: string): string | null {
  for (const marker of PATCH_FILE_MARKERS) {
    const index = command.indexOf(marker);
    if (index < 0) continue;
    const start = index + marker.length;
    const end = command.indexOf('\n', start);
    const rawPath = (end === -1 ? command.slice(start) : command.slice(start, end)).trim();
    if (rawPath) return rawPath;
  }
  return null;
}

function buildInputWithFilePath(filePath: string | null): Record<string, unknown> {
  return filePath ? { [INPUT_KEY_FILE_PATH]: filePath } : {};
}

function buildInputWithPattern(pattern: string | null): Record<string, unknown> {
  return pattern ? { [INPUT_KEY_PATTERN]: pattern } : {};
}

export function resolveCodexToolCall(command: string): CodexToolResolution {
  const normalized = stripShellWrapper(command);
  const primarySegment = extractPrimarySegment(normalized);
  const tokens = stripWrapperTokens(tokenizeCommand(primarySegment));
  const commandToken = tokens[0]?.toLowerCase() ?? '';

  const redirectionTarget = extractRedirectionTarget(primarySegment);
  if (redirectionTarget) {
    return {
      name: TOOL_NAME_WRITE,
      input: buildInputWithFilePath(redirectionTarget),
    };
  }

  if (commandToken === APPLY_PATCH_COMMAND || APPLY_PATCH_PATTERN.test(primarySegment)) {
    return {
      name: TOOL_NAME_EDIT,
      input: buildInputWithFilePath(extractPatchFilePath(primarySegment)),
    };
  }

  if (commandToken === 'sed' && hasSedInPlaceFlag(tokens)) {
    return {
      name: TOOL_NAME_EDIT,
      input: buildInputWithFilePath(extractFilePathFromTokens(tokens)),
    };
  }

  if (commandToken === 'perl' && hasPerlInPlaceFlag(tokens)) {
    return {
      name: TOOL_NAME_EDIT,
      input: buildInputWithFilePath(extractFilePathFromTokens(tokens)),
    };
  }

  if (WRITE_COMMANDS.has(commandToken)) {
    const filePath =
      commandToken === 'tee' ? extractTeeTarget(tokens) : extractFilePathFromTokens(tokens);
    return {
      name: TOOL_NAME_WRITE,
      input: buildInputWithFilePath(filePath),
    };
  }

  if (SEARCH_COMMANDS.has(commandToken)) {
    if (tokens.some((token) => SEARCH_FILE_LIST_FLAGS.has(token))) {
      return {
        name: TOOL_NAME_GLOB,
        input: buildInputWithPattern(extractFilePathFromTokens(tokens)),
      };
    }

    return {
      name: TOOL_NAME_GREP,
      input: buildInputWithPattern(extractSearchPattern(tokens)),
    };
  }

  // Handle Delete commands (rm, del, erase, remove, unlink)
  if (DELETE_COMMANDS.has(commandToken)) {
    // Skip if -r or -rf flags (recursive delete should go to Bash)
    if (
      tokens.some((token) => token === '-r' || token === '-rf' || token === '-f' || token === '-rf')
    ) {
      return {
        name: TOOL_NAME_BASH,
        input: { [INPUT_KEY_COMMAND]: normalized },
      };
    }
    // Simple file deletion - extract the file path
    const filePath = extractFilePathFromDeleteTokens(tokens);
    if (filePath) {
      return {
        name: TOOL_NAME_DELETE,
        input: { path: filePath },
      };
    }
    // Fall back to bash if we can't determine the file path
    return {
      name: TOOL_NAME_BASH,
      input: { [INPUT_KEY_COMMAND]: normalized },
    };
  }

  // Handle simple Ls commands (just listing, not find/glob)
  if (LIST_COMMANDS.has(commandToken)) {
    const filePath = extractFilePathFromTokens(tokens);
    return {
      name: TOOL_NAME_LS,
      input: { path: filePath || '.' },
    };
  }

  if (GLOB_COMMANDS.has(commandToken)) {
    return {
      name: TOOL_NAME_GLOB,
      input: buildInputWithPattern(extractFilePathFromTokens(tokens)),
    };
  }

  if (READ_COMMANDS.has(commandToken)) {
    return {
      name: TOOL_NAME_READ,
      input: buildInputWithFilePath(extractFilePathFromTokens(tokens)),
    };
  }

  return {
    name: TOOL_NAME_BASH,
    input: { [INPUT_KEY_COMMAND]: normalized },
  };
}

function parseTodoLines(lines: string[]): CodexTodoItem[] {
  const todos: CodexTodoItem[] = [];

  for (const line of lines) {
    const match = line.match(TODO_LINE_PATTERN);
    if (!match?.groups?.content) continue;

    const statusToken = match.groups.status;
    const status =
      statusToken === 'x'
        ? TODO_STATUS_COMPLETED
        : statusToken === '~'
          ? TODO_STATUS_IN_PROGRESS
          : TODO_STATUS_PENDING;

    todos.push({ content: match.groups.content.trim(), status });
  }

  return todos;
}

function extractTodoFromArray(value: unknown[]): CodexTodoItem[] {
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return { content: entry, status: TODO_STATUS_PENDING };
      }
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const content =
          typeof record.content === 'string'
            ? record.content
            : typeof record.text === 'string'
              ? record.text
              : typeof record.title === 'string'
                ? record.title
                : null;
        if (!content) return null;
        const status =
          record.status === TODO_STATUS_COMPLETED ||
          record.status === TODO_STATUS_IN_PROGRESS ||
          record.status === TODO_STATUS_PENDING
            ? (record.status as CodexTodoItem['status'])
            : TODO_STATUS_PENDING;
        const activeForm = typeof record.activeForm === 'string' ? record.activeForm : undefined;
        return { content, status, activeForm };
      }
      return null;
    })
    .filter((item): item is CodexTodoItem => Boolean(item));
}

export function extractCodexTodoItems(item: Record<string, unknown>): CodexTodoItem[] | null {
  const todosValue = item.todos;
  if (Array.isArray(todosValue)) {
    const todos = extractTodoFromArray(todosValue);
    return todos.length > 0 ? todos : null;
  }

  const itemsValue = item.items;
  if (Array.isArray(itemsValue)) {
    const todos = extractTodoFromArray(itemsValue);
    return todos.length > 0 ? todos : null;
  }

  const textValue =
    typeof item.text === 'string'
      ? item.text
      : typeof item.content === 'string'
        ? item.content
        : null;
  if (!textValue) return null;

  const lines = textValue
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const todos = parseTodoLines(lines);
  return todos.length > 0 ? todos : null;
}

export function getCodexTodoToolName(): string {
  return TOOL_NAME_TODO;
}
