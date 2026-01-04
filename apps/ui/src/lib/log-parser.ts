/**
 * Log Parser Utility
 * Parses agent output into structured sections for display
 */

import type {
  CursorStreamEvent,
  CursorSystemEvent,
  CursorAssistantEvent,
  CursorToolCallEvent,
  CursorResultEvent,
} from '@automaker/types';

/**
 * Cleans up fragmented streaming text by removing spurious newlines
 * This handles cases where streaming providers send partial text chunks
 * that got separated by newlines during accumulation
 */
function cleanFragmentedText(content: string): string {
  // Remove newlines that break up words (newline between letters)
  // e.g., "sum\n\nmary" -> "summary"
  let cleaned = content.replace(/([a-zA-Z])\n+([a-zA-Z])/g, '$1$2');

  // Also clean up fragmented XML-like tags
  // e.g., "<sum\n\nmary>" -> "<summary>"
  cleaned = cleaned.replace(/<([a-zA-Z]+)\n*([a-zA-Z]*)\n*>/g, '<$1$2>');
  cleaned = cleaned.replace(/<\/([a-zA-Z]+)\n*([a-zA-Z]*)\n*>/g, '</$1$2>');

  return cleaned;
}

export type LogEntryType =
  | 'prompt'
  | 'tool_call'
  | 'tool_result'
  | 'phase'
  | 'error'
  | 'success'
  | 'info'
  | 'debug'
  | 'warning'
  | 'thinking';

export type ToolCategory =
  | 'read'
  | 'edit'
  | 'write'
  | 'bash'
  | 'search'
  | 'todo'
  | 'task'
  | 'other';

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  Read: 'read',
  Edit: 'edit',
  Write: 'write',
  Bash: 'bash',
  Grep: 'search',
  Glob: 'search',
  Ls: 'read',
  Delete: 'write',
  WebSearch: 'search',
  WebFetch: 'read',
  TodoWrite: 'todo',
  Task: 'task',
  NotebookEdit: 'edit',
  KillShell: 'bash',
  SemanticSearch: 'search',
  ReadLints: 'read',
};

/**
 * Categorizes a tool name into a predefined category
 */
export function categorizeToolName(toolName: string): ToolCategory {
  return TOOL_CATEGORIES[toolName] || 'other';
}

export interface LogEntryMetadata {
  toolName?: string;
  toolCategory?: ToolCategory;
  filePath?: string;
  summary?: string;
  phase?: string;
}

export interface LogEntry {
  id: string;
  type: LogEntryType;
  title: string;
  content: string;
  timestamp?: string;
  collapsed?: boolean;
  metadata?: LogEntryMetadata;
}

/**
 * Generates a deterministic ID based on content and position
 * This ensures the same log entry always gets the same ID,
 * preserving expanded/collapsed state when new logs stream in
 *
 * Uses only the first 200 characters of content to ensure stability
 * even when entries are merged (which appends content at the end)
 */
const generateDeterministicId = (content: string, lineIndex: number): string => {
  // Use first 200 chars to ensure stability when entries are merged
  const stableContent = content.slice(0, 200);
  // Simple hash function for the content
  let hash = 0;
  const str = stableContent + '|' + lineIndex.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'log_' + Math.abs(hash).toString(36);
};

/**
 * Detects the type of log entry based on content patterns
 */
function detectEntryType(content: string): LogEntryType {
  const trimmed = content.trim();
  // Clean fragmented text for pattern matching
  const cleaned = cleanFragmentedText(trimmed);

  // Tool calls
  if (trimmed.startsWith('🔧 Tool:') || trimmed.match(/^Tool:\s*/)) {
    return 'tool_call';
  }

  // Tool results / Input
  if (
    trimmed.startsWith('Input:') ||
    trimmed.startsWith('Result:') ||
    trimmed.startsWith('Output:')
  ) {
    return 'tool_result';
  }

  // Phase changes
  if (
    trimmed.startsWith('📋') ||
    trimmed.startsWith('⚡') ||
    trimmed.startsWith('✅') ||
    trimmed.match(/^(Planning|Action|Verification)/i) ||
    trimmed.match(/\[Phase:\s*([^\]]+)\]/) ||
    trimmed.match(/Phase:\s*\w+/i)
  ) {
    return 'phase';
  }

  // Feature creation events
  if (
    trimmed.match(/\[Feature Creation\]/i) ||
    trimmed.match(/Feature Creation/i) ||
    trimmed.match(/Creating feature/i)
  ) {
    return 'success';
  }

  // Errors
  if (trimmed.startsWith('❌') || trimmed.toLowerCase().includes('error:')) {
    return 'error';
  }

  // Success messages and summary sections
  // Check both raw and cleaned content for summary tags (handles fragmented streaming)
  if (
    trimmed.startsWith('✅') ||
    trimmed.toLowerCase().includes('success') ||
    trimmed.toLowerCase().includes('completed') ||
    // Summary tags (preferred format from agent) - check both raw and cleaned
    trimmed.startsWith('<summary>') ||
    cleaned.startsWith('<summary>') ||
    // Markdown summary headers (fallback)
    trimmed.match(/^##\s+(Summary|Feature|Changes|Implementation)/i) ||
    cleaned.match(/^##\s+(Summary|Feature|Changes|Implementation)/i) ||
    trimmed.match(/^(I've|I have) (successfully |now )?(completed|finished|implemented)/i)
  ) {
    return 'success';
  }

  // Warnings
  if (trimmed.startsWith('⚠️') || trimmed.toLowerCase().includes('warning:')) {
    return 'warning';
  }

  // Thinking/Preparation info (be specific to avoid matching summary content)
  if (
    trimmed.toLowerCase().includes('ultrathink') ||
    trimmed.match(/thinking level[:\s]*(low|medium|high|none|\d)/i) ||
    trimmed.match(/^thinking level\s*$/i) ||
    trimmed.toLowerCase().includes('estimated cost') ||
    trimmed.toLowerCase().includes('estimated time') ||
    trimmed.toLowerCase().includes('budget tokens') ||
    trimmed.match(/thinking.*preparation/i)
  ) {
    return 'thinking';
  }

  // Debug info (JSON, stack traces, etc.)
  if (
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.includes('at ') ||
    trimmed.match(/^\s*\d+\s*\|/)
  ) {
    return 'debug';
  }

  // Default to info
  return 'info';
}

/**
 * Extracts tool name from a tool call entry
 * Matches both "🔧 Tool: Name" and "Tool: Name" formats
 */
function extractToolName(content: string): string | undefined {
  // Try emoji format first, then plain format
  const match = content.match(/(?:🔧\s*)?Tool:\s*(\S+)/);
  return match?.[1];
}

/**
 * Extracts phase name from a phase entry
 */
function extractPhase(content: string): string | undefined {
  if (content.includes('📋')) return 'planning';
  if (content.includes('⚡')) return 'action';
  if (content.includes('✅')) return 'verification';

  // Extract from [Phase: ...] format
  const phaseMatch = content.match(/\[Phase:\s*([^\]]+)\]/);
  if (phaseMatch) {
    return phaseMatch[1].toLowerCase();
  }

  const match = content.match(/^(Planning|Action|Verification)/i);
  return match?.[1]?.toLowerCase();
}

/**
 * Extracts file path from tool input JSON
 */
function extractFilePath(content: string): string | undefined {
  try {
    const inputMatch = content.match(/Input:\s*([\s\S]*)/);
    if (!inputMatch) return undefined;

    const jsonStr = inputMatch[1].trim();
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    if (typeof parsed.file_path === 'string') return parsed.file_path;
    if (typeof parsed.path === 'string') return parsed.path;
    if (typeof parsed.notebook_path === 'string') return parsed.notebook_path;

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Generates a smart summary for tool calls based on the tool name and input
 */
export function generateToolSummary(toolName: string, content: string): string | undefined {
  try {
    // Try to parse JSON input
    const inputMatch = content.match(/Input:\s*([\s\S]*)/);
    if (!inputMatch) return undefined;

    const jsonStr = inputMatch[1].trim();
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    switch (toolName) {
      case 'Read': {
        const filePath = parsed.file_path as string | undefined;
        return `Reading ${filePath?.split('/').pop() || 'file'}`;
      }
      case 'Edit': {
        const filePath = parsed.file_path as string | undefined;
        const fileName = filePath?.split('/').pop() || 'file';
        return `Editing ${fileName}`;
      }
      case 'Write': {
        const filePath = parsed.file_path as string | undefined;
        return `Writing ${filePath?.split('/').pop() || 'file'}`;
      }
      case 'Bash': {
        const command = parsed.command as string | undefined;
        const cmd = command?.slice(0, 50) || '';
        return `Running: ${cmd}${(command?.length || 0) > 50 ? '...' : ''}`;
      }
      case 'Grep': {
        const pattern = parsed.pattern as string | undefined;
        return `Searching for "${pattern?.slice(0, 30) || ''}"`;
      }
      case 'Glob': {
        const pattern = parsed.pattern as string | undefined;
        return `Finding files: ${pattern || ''}`;
      }
      case 'TodoWrite': {
        const todos = parsed.todos as unknown[] | undefined;
        const todoCount = todos?.length || 0;
        return `${todoCount} todo item${todoCount !== 1 ? 's' : ''}`;
      }
      case 'Task': {
        const subagentType = parsed.subagent_type as string | undefined;
        const description = parsed.description as string | undefined;
        return `${subagentType || 'Agent'}: ${description || ''}`;
      }
      case 'WebSearch': {
        const query = parsed.query as string | undefined;
        return `Searching: "${query?.slice(0, 40) || ''}"`;
      }
      case 'WebFetch': {
        const url = parsed.url as string | undefined;
        return `Fetching: ${url?.slice(0, 40) || ''}`;
      }
      case 'NotebookEdit': {
        const notebookPath = parsed.notebook_path as string | undefined;
        return `Editing notebook: ${notebookPath?.split('/').pop() || 'notebook'}`;
      }
      case 'KillShell': {
        return 'Terminating shell session';
      }
      case 'SemanticSearch': {
        const query = parsed.query as string | undefined;
        return `Semantic search: "${query?.slice(0, 30) || ''}"`;
      }
      case 'ReadLints': {
        const paths = parsed.paths as string[] | undefined;
        const pathCount = paths?.length || 0;
        return `Reading lints for ${pathCount} file(s)`;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

// ============================================================================
// Cursor Event Parsing
// ============================================================================

/**
 * Detect if a parsed JSON object is a Cursor stream event
 */
function isCursorEvent(obj: unknown): obj is CursorStreamEvent {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'type' in obj &&
    'session_id' in obj &&
    ['system', 'user', 'assistant', 'tool_call', 'result'].includes(
      (obj as Record<string, unknown>).type as string
    )
  );
}

/**
 * Normalize Cursor tool call event to log entry
 */
function normalizeCursorToolCall(
  event: CursorToolCallEvent,
  baseEntry: { id: string; timestamp: string }
): LogEntry | null {
  const toolCall = event.tool_call;
  const isStarted = event.subtype === 'started';
  const isCompleted = event.subtype === 'completed';

  // Read tool
  if (toolCall.readToolCall) {
    const path = toolCall.readToolCall.args?.path || 'unknown';
    const result = toolCall.readToolCall.result?.success;

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Reading ${path}` : `Read ${path}`,
      content:
        isCompleted && result
          ? `${result.totalLines} lines, ${result.totalChars} chars`
          : `Path: ${path}`,
      collapsed: true,
      metadata: {
        toolName: 'Read',
        toolCategory: 'read' as ToolCategory,
        filePath: path,
        summary: isCompleted ? `Read ${result?.totalLines || 0} lines` : `Reading file...`,
      },
    };
  }

  // Write tool
  if (toolCall.writeToolCall) {
    const path =
      toolCall.writeToolCall.args?.path ||
      toolCall.writeToolCall.result?.success?.path ||
      'unknown';
    const result = toolCall.writeToolCall.result?.success;

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Writing ${path}` : `Wrote ${path}`,
      content:
        isCompleted && result
          ? `${result.linesCreated} lines, ${result.fileSize} bytes`
          : `Path: ${path}`,
      collapsed: true,
      metadata: {
        toolName: 'Write',
        toolCategory: 'write' as ToolCategory,
        filePath: path,
        summary: isCompleted ? `Wrote ${result?.linesCreated || 0} lines` : `Writing file...`,
      },
    };
  }

  // Edit tool
  if (toolCall.editToolCall) {
    const path = toolCall.editToolCall.args?.path || 'unknown';

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Editing ${path}` : `Edited ${path}`,
      content: `Path: ${path}`,
      collapsed: true,
      metadata: {
        toolName: 'Edit',
        toolCategory: 'edit' as ToolCategory,
        filePath: path,
        summary: isCompleted ? `Edited file` : `Editing file...`,
      },
    };
  }

  // Shell/Bash tool
  if (toolCall.shellToolCall) {
    const command = toolCall.shellToolCall.args?.command || '';
    const result = toolCall.shellToolCall.result;
    const shortCmd = command.length > 50 ? command.slice(0, 50) + '...' : command;

    let content = `Command: ${command}`;
    if (isCompleted && result?.success) {
      content += `\nExit code: ${result.success.exitCode}`;
    } else if (isCompleted && result?.rejected) {
      content += `\nRejected: ${result.rejected.reason}`;
    }

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Running: ${shortCmd}` : `Ran: ${shortCmd}`,
      content,
      collapsed: true,
      metadata: {
        toolName: 'Bash',
        toolCategory: 'bash' as ToolCategory,
        summary: isCompleted
          ? result?.success
            ? `Exit ${result.success.exitCode}`
            : result?.rejected
              ? 'Rejected'
              : 'Completed'
          : `Running...`,
      },
    };
  }

  // Delete tool
  if (toolCall.deleteToolCall) {
    const path = toolCall.deleteToolCall.args?.path || 'unknown';
    const result = toolCall.deleteToolCall.result;

    let content = `Path: ${path}`;
    if (isCompleted && result?.rejected) {
      content += `\nRejected: ${result.rejected.reason}`;
    }

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Deleting ${path}` : `Deleted ${path}`,
      content,
      collapsed: true,
      metadata: {
        toolName: 'Delete',
        toolCategory: 'write' as ToolCategory,
        filePath: path,
        summary: isCompleted ? (result?.rejected ? 'Rejected' : 'Deleted') : `Deleting...`,
      },
    };
  }

  // Grep tool
  if (toolCall.grepToolCall) {
    const pattern = toolCall.grepToolCall.args?.pattern || '';
    const searchPath = toolCall.grepToolCall.args?.path;
    const result = toolCall.grepToolCall.result?.success;

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Searching: "${pattern}"` : `Searched: "${pattern}"`,
      content: `Pattern: ${pattern}${searchPath ? `\nPath: ${searchPath}` : ''}${
        isCompleted && result ? `\nMatched ${result.matchedLines} lines` : ''
      }`,
      collapsed: true,
      metadata: {
        toolName: 'Grep',
        toolCategory: 'search' as ToolCategory,
        summary: isCompleted ? `Found ${result?.matchedLines || 0} matches` : `Searching...`,
      },
    };
  }

  // Ls tool
  if (toolCall.lsToolCall) {
    const path = toolCall.lsToolCall.args?.path || '.';
    const result = toolCall.lsToolCall.result?.success;

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Listing ${path}` : `Listed ${path}`,
      content: `Path: ${path}${
        isCompleted && result
          ? `\n${result.childrenFiles} files, ${result.childrenDirs} directories`
          : ''
      }`,
      collapsed: true,
      metadata: {
        toolName: 'Ls',
        toolCategory: 'read' as ToolCategory,
        filePath: path,
        summary: isCompleted
          ? `${result?.childrenFiles || 0} files, ${result?.childrenDirs || 0} dirs`
          : `Listing...`,
      },
    };
  }

  // Glob tool
  if (toolCall.globToolCall) {
    const pattern = toolCall.globToolCall.args?.globPattern || '';
    const targetDir = toolCall.globToolCall.args?.targetDirectory;
    const result = toolCall.globToolCall.result?.success;

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Finding: ${pattern}` : `Found: ${pattern}`,
      content: `Pattern: ${pattern}${targetDir ? `\nDirectory: ${targetDir}` : ''}${
        isCompleted && result ? `\nFound ${result.totalFiles} files` : ''
      }`,
      collapsed: true,
      metadata: {
        toolName: 'Glob',
        toolCategory: 'search' as ToolCategory,
        summary: isCompleted ? `Found ${result?.totalFiles || 0} files` : `Finding...`,
      },
    };
  }

  // Semantic Search tool
  if (toolCall.semSearchToolCall) {
    const query = toolCall.semSearchToolCall.args?.query || '';
    const targetDirs = toolCall.semSearchToolCall.args?.targetDirectories;
    const result = toolCall.semSearchToolCall.result?.success;
    const shortQuery = query.length > 40 ? query.slice(0, 40) + '...' : query;
    const resultCount = result?.codeResults?.length || 0;

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Semantic search: "${shortQuery}"` : `Searched: "${shortQuery}"`,
      content: `Query: ${query}${targetDirs?.length ? `\nDirectories: ${targetDirs.join(', ')}` : ''}${
        isCompleted
          ? `\n${resultCount > 0 ? `Found ${resultCount} result(s)` : result?.results || 'No results'}`
          : ''
      }`,
      collapsed: true,
      metadata: {
        toolName: 'SemanticSearch',
        toolCategory: 'search' as ToolCategory,
        summary: isCompleted
          ? resultCount > 0
            ? `Found ${resultCount} result(s)`
            : 'No results'
          : `Searching...`,
      },
    };
  }

  // Read Lints tool
  if (toolCall.readLintsToolCall) {
    const paths = toolCall.readLintsToolCall.args?.paths || [];
    const result = toolCall.readLintsToolCall.result?.success;
    const pathCount = paths.length;

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: isStarted ? `Reading lints for ${pathCount} file(s)` : `Read lints`,
      content: `Paths: ${paths.join(', ')}${
        isCompleted && result
          ? `\nFound ${result.totalDiagnostics} diagnostic(s) in ${result.totalFiles} file(s)`
          : ''
      }`,
      collapsed: true,
      metadata: {
        toolName: 'ReadLints',
        toolCategory: 'read' as ToolCategory,
        summary: isCompleted
          ? `${result?.totalDiagnostics || 0} diagnostic(s)`
          : `Reading lints...`,
      },
    };
  }

  // Generic function tool (fallback)
  if (toolCall.function) {
    const name = toolCall.function.name;
    const args = toolCall.function.arguments;

    // Determine category based on tool name
    const category = categorizeToolName(name);

    return {
      ...baseEntry,
      id: `${baseEntry.id}-${event.call_id}`,
      type: 'tool_call' as LogEntryType,
      title: `${name} ${isStarted ? 'started' : 'completed'}`,
      content: args || '',
      collapsed: true,
      metadata: {
        toolName: name,
        toolCategory: category,
        summary: `${name} ${event.subtype}`,
      },
    };
  }

  return null;
}

/**
 * Normalize Cursor stream event to log entry
 */
export function normalizeCursorEvent(event: CursorStreamEvent): LogEntry | null {
  const timestamp = new Date().toISOString();
  const baseEntry = {
    id: `cursor-${event.session_id}-${Date.now()}`,
    timestamp,
  };

  switch (event.type) {
    case 'system': {
      const sysEvent = event as CursorSystemEvent;
      return {
        ...baseEntry,
        type: 'info' as LogEntryType,
        title: 'Session Started',
        content: `Model: ${sysEvent.model}\nAuth: ${sysEvent.apiKeySource}\nCWD: ${sysEvent.cwd}`,
        collapsed: true,
        metadata: {
          phase: 'init',
        },
      };
    }

    case 'assistant': {
      const assistEvent = event as CursorAssistantEvent;
      const text = assistEvent.message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      if (!text.trim()) return null;

      return {
        ...baseEntry,
        type: 'info' as LogEntryType,
        title: 'Assistant',
        content: text,
        collapsed: false,
      };
    }

    case 'tool_call': {
      const toolEvent = event as CursorToolCallEvent;
      return normalizeCursorToolCall(toolEvent, baseEntry);
    }

    case 'result': {
      const resultEvent = event as CursorResultEvent;

      if (resultEvent.is_error) {
        return {
          ...baseEntry,
          type: 'error' as LogEntryType,
          title: 'Error',
          content: resultEvent.error || resultEvent.result || 'Unknown error',
          collapsed: false,
        };
      }

      return {
        ...baseEntry,
        type: 'success' as LogEntryType,
        title: 'Completed',
        content: `Duration: ${resultEvent.duration_ms}ms`,
        collapsed: true,
      };
    }

    default:
      return null;
  }
}

/**
 * Parse a single log line into a structured entry
 * Handles both Cursor JSON events and plain text
 */
export function parseLogLine(line: string): LogEntry | null {
  if (!line.trim()) return null;

  try {
    const parsed = JSON.parse(line);

    // Check if it's a Cursor stream event
    if (isCursorEvent(parsed)) {
      return normalizeCursorEvent(parsed);
    }

    // For other JSON, treat as debug info
    return {
      id: `json-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'debug',
      title: 'Debug Info',
      content: line,
      timestamp: new Date().toISOString(),
      collapsed: true,
    };
  } catch {
    // Non-JSON line - treat as plain text
    return {
      id: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'info',
      title: 'Output',
      content: line,
      timestamp: new Date().toISOString(),
      collapsed: false,
    };
  }
}

/**
 * Get provider-specific styling for log entries
 */
export function getProviderStyle(entry: LogEntry): { badge?: string; icon?: string } {
  // Check if entry has Cursor session ID pattern
  if (entry.id.startsWith('cursor-')) {
    return {
      badge: 'Cursor',
      icon: 'terminal',
    };
  }

  // Default (Claude/AutoMaker)
  return {
    badge: 'Claude',
    icon: 'bot',
  };
}

/**
 * Determines if an entry should be collapsed by default
 */
export function shouldCollapseByDefault(entry: LogEntry): boolean {
  // Collapse if content is long
  if (entry.content.length > 200) return true;

  // Collapse if contains multi-line JSON (> 5 lines)
  const lineCount = entry.content.split('\n').length;
  if (lineCount > 5 && (entry.content.includes('{') || entry.content.includes('['))) {
    return true;
  }

  // Collapse TodoWrite with multiple items
  if (entry.metadata?.toolName === 'TodoWrite') {
    try {
      const inputMatch = entry.content.match(/Input:\s*([\s\S]*)/);
      if (inputMatch) {
        const parsed = JSON.parse(inputMatch[1].trim()) as Record<string, unknown>;
        const todos = parsed.todos as unknown[] | undefined;
        if (todos && todos.length > 1) return true;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Collapse Edit with code blocks
  if (entry.metadata?.toolName === 'Edit' && entry.content.includes('old_string')) {
    return true;
  }

  return false;
}

/**
 * Generates a title for a log entry
 */
function generateTitle(type: LogEntryType, content: string): string {
  // Clean content for pattern matching
  const cleaned = cleanFragmentedText(content);

  switch (type) {
    case 'tool_call': {
      const toolName = extractToolName(content);
      return toolName ? `Tool Call: ${toolName}` : 'Tool Call';
    }
    case 'tool_result':
      return 'Tool Input/Result';
    case 'phase': {
      const phase = extractPhase(content);
      if (phase) {
        // Capitalize first letter of each word
        const formatted = phase
          .split(/\s+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        return `Phase: ${formatted}`;
      }
      return 'Phase Change';
    }
    case 'error':
      return 'Error';
    case 'success': {
      // Check if it's a summary section (check both raw and cleaned)
      if (
        content.startsWith('<summary>') ||
        content.includes('<summary>') ||
        cleaned.startsWith('<summary>') ||
        cleaned.includes('<summary>')
      ) {
        return 'Summary';
      }
      if (
        content.match(/^##\s+(Summary|Feature|Changes|Implementation)/i) ||
        cleaned.match(/^##\s+(Summary|Feature|Changes|Implementation)/i)
      ) {
        return 'Summary';
      }
      if (
        content.match(/^All tasks completed/i) ||
        content.match(/^(I've|I have) (successfully |now )?(completed|finished|implemented)/i)
      ) {
        return 'Summary';
      }
      return 'Success';
    }
    case 'warning':
      return 'Warning';
    case 'thinking':
      return 'Thinking Level';
    case 'debug':
      return 'Debug Info';
    case 'prompt':
      return 'Prompt';
    default:
      return 'Info';
  }
}

/**
 * Tracks bracket depth for JSON accumulation
 */
function calculateBracketDepth(line: string): { braceChange: number; bracketChange: number } {
  let braceChange = 0;
  let bracketChange = 0;
  let inString = false;
  let escapeNext = false;

  for (const char of line) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') braceChange++;
    else if (char === '}') braceChange--;
    else if (char === '[') bracketChange++;
    else if (char === ']') bracketChange--;
  }

  return { braceChange, bracketChange };
}

/**
 * Parses raw log output into structured entries
 */
export function parseLogOutput(rawOutput: string): LogEntry[] {
  if (!rawOutput || !rawOutput.trim()) {
    return [];
  }

  const entries: LogEntry[] = [];
  const lines = rawOutput.split('\n');

  let currentEntry: (Omit<LogEntry, 'id'> & { id?: string }) | null = null;
  let currentContent: string[] = [];
  let entryStartLine = 0; // Track the starting line for deterministic ID generation

  // JSON accumulation state
  let inJsonAccumulation = false;
  let jsonBraceDepth = 0;
  let jsonBracketDepth = 0;

  // Summary tag accumulation state
  let inSummaryAccumulation = false;

  const finalizeEntry = () => {
    if (currentEntry && currentContent.length > 0) {
      currentEntry.content = currentContent.join('\n').trim();
      if (currentEntry.content) {
        // Populate enhanced metadata for tool calls
        const toolName = currentEntry.metadata?.toolName;
        if (toolName && currentEntry.type === 'tool_call') {
          const toolCategory = categorizeToolName(toolName);
          const filePath = extractFilePath(currentEntry.content);
          const summary = generateToolSummary(toolName, currentEntry.content);

          currentEntry.metadata = {
            ...currentEntry.metadata,
            toolCategory,
            filePath,
            summary,
          };
        }

        // Generate deterministic ID based on content and position
        const entryWithId: LogEntry = {
          ...(currentEntry as Omit<LogEntry, 'id'>),
          id: generateDeterministicId(currentEntry.content, entryStartLine),
        };
        entries.push(entryWithId);
      }
    }
    currentContent = [];
    inJsonAccumulation = false;
    jsonBraceDepth = 0;
    jsonBracketDepth = 0;
    inSummaryAccumulation = false;
  };

  let lineIndex = 0;
  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines at the beginning
    if (!trimmedLine && !currentEntry) {
      lineIndex++;
      continue;
    }

    // Check for Cursor stream events (NDJSON lines)
    // These are complete JSON objects on a single line
    if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmedLine);
        if (isCursorEvent(parsed)) {
          // Finalize any pending entry before adding Cursor event
          finalizeEntry();
          const cursorEntry = normalizeCursorEvent(parsed);
          if (cursorEntry) {
            entries.push(cursorEntry);
          }
          lineIndex++;
          continue;
        }
      } catch {
        // Not valid JSON, continue with normal parsing
      }
    }

    // If we're in JSON accumulation mode, keep accumulating until depth returns to 0
    if (inJsonAccumulation) {
      currentContent.push(line);
      const { braceChange, bracketChange } = calculateBracketDepth(trimmedLine);
      jsonBraceDepth += braceChange;
      jsonBracketDepth += bracketChange;

      // JSON is complete when depth returns to 0
      if (jsonBraceDepth <= 0 && jsonBracketDepth <= 0) {
        inJsonAccumulation = false;
        jsonBraceDepth = 0;
        jsonBracketDepth = 0;
      }
      lineIndex++;
      continue;
    }

    // If we're in summary accumulation mode, keep accumulating until </summary>
    if (inSummaryAccumulation) {
      currentContent.push(line);
      // Summary is complete when we see closing tag
      if (trimmedLine.includes('</summary>')) {
        inSummaryAccumulation = false;
        // Don't finalize here - let normal flow handle it
      }
      lineIndex++;
      continue;
    }

    // Detect if this line starts a new entry
    const lineType = detectEntryType(trimmedLine);
    const isNewEntry =
      trimmedLine.startsWith('🔧') ||
      trimmedLine.startsWith('📋') ||
      trimmedLine.startsWith('⚡') ||
      trimmedLine.startsWith('✅') ||
      trimmedLine.startsWith('❌') ||
      trimmedLine.startsWith('⚠️') ||
      trimmedLine.startsWith('🧠') ||
      trimmedLine.match(/\[Phase:\s*([^\]]+)\]/) ||
      trimmedLine.match(/\[Feature Creation\]/i) ||
      trimmedLine.match(/\[Tool\]/i) ||
      trimmedLine.match(/\[Agent\]/i) ||
      trimmedLine.match(/\[Complete\]/i) ||
      trimmedLine.match(/\[ERROR\]/i) ||
      trimmedLine.match(/\[Status\]/i) ||
      trimmedLine.toLowerCase().includes('ultrathink preparation') ||
      trimmedLine.match(/thinking level[:\s]*(low|medium|high|none|\d)/i) ||
      // Summary tags (preferred format from agent) - check both raw and cleaned for fragmented streaming
      trimmedLine.startsWith('<summary>') ||
      cleanFragmentedText(trimmedLine).startsWith('<summary>') ||
      // Agent summary sections (markdown headers - fallback)
      trimmedLine.match(/^##\s+(Summary|Feature|Changes|Implementation)/i) ||
      cleanFragmentedText(trimmedLine).match(/^##\s+(Summary|Feature|Changes|Implementation)/i) ||
      // Summary introduction lines
      trimmedLine.match(/^All tasks completed/i) ||
      trimmedLine.match(/^(I've|I have) (successfully |now )?(completed|finished|implemented)/i);

    // Check if this is an Input: line that should trigger JSON accumulation
    const isInputLine = trimmedLine.startsWith('Input:') && currentEntry?.type === 'tool_call';

    if (isNewEntry) {
      // Finalize previous entry
      finalizeEntry();

      // Track starting line for deterministic ID
      entryStartLine = lineIndex;

      // Start new entry (ID will be generated when finalizing)
      currentEntry = {
        type: lineType,
        title: generateTitle(lineType, trimmedLine),
        content: '',
        metadata: {
          toolName: extractToolName(trimmedLine),
          phase: extractPhase(trimmedLine),
        },
      };
      currentContent.push(trimmedLine);

      // If this is a <summary> tag, start summary accumulation mode
      // Check both raw and cleaned for fragmented streaming
      const cleanedTrimmed = cleanFragmentedText(trimmedLine);
      if (
        (trimmedLine.startsWith('<summary>') || cleanedTrimmed.startsWith('<summary>')) &&
        !trimmedLine.includes('</summary>') &&
        !cleanedTrimmed.includes('</summary>')
      ) {
        inSummaryAccumulation = true;
      }
    } else if (isInputLine && currentEntry) {
      // Start JSON accumulation mode
      currentContent.push(trimmedLine);

      // Check if there's JSON on the same line after "Input:"
      const inputContent = trimmedLine.replace(/^Input:\s*/, '');
      if (inputContent) {
        const { braceChange, bracketChange } = calculateBracketDepth(inputContent);
        jsonBraceDepth = braceChange;
        jsonBracketDepth = bracketChange;

        // Only enter accumulation mode if JSON is incomplete
        if (jsonBraceDepth > 0 || jsonBracketDepth > 0) {
          inJsonAccumulation = true;
        }
      } else {
        // Input: line with JSON starting on next line
        inJsonAccumulation = true;
      }
    } else if (currentEntry) {
      // Continue current entry
      currentContent.push(line);

      // Check if this line starts a JSON block
      if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
        const { braceChange, bracketChange } = calculateBracketDepth(trimmedLine);
        if (braceChange > 0 || bracketChange > 0) {
          jsonBraceDepth = braceChange;
          jsonBracketDepth = bracketChange;
          if (jsonBraceDepth > 0 || jsonBracketDepth > 0) {
            inJsonAccumulation = true;
          }
        }
      }
    } else {
      // Track starting line for deterministic ID
      entryStartLine = lineIndex;

      // No current entry, create a default info entry
      currentEntry = {
        type: 'info',
        title: 'Info',
        content: '',
      };
      currentContent.push(line);
    }
    lineIndex++;
  }

  // Finalize last entry
  finalizeEntry();

  // Merge consecutive entries of the same type if they're both debug or info
  const mergedEntries = mergeConsecutiveEntries(entries);

  return mergedEntries;
}

/**
 * Merges consecutive entries of the same type for cleaner display
 */
function mergeConsecutiveEntries(entries: LogEntry[]): LogEntry[] {
  if (entries.length <= 1) return entries;

  const merged: LogEntry[] = [];
  let current: LogEntry | null = null;
  let mergeIndex = 0;

  for (const entry of entries) {
    if (
      current &&
      (current.type === 'debug' || current.type === 'info') &&
      current.type === entry.type
    ) {
      // Merge into current - regenerate ID based on merged content
      current.content += '\n\n' + entry.content;
      current.id = generateDeterministicId(current.content, mergeIndex);
    } else {
      if (current) {
        merged.push(current);
      }
      current = { ...entry };
      mergeIndex = merged.length;
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * Extracts summary content from raw log output
 * Returns the summary text if found, or null if no summary exists
 */
export function extractSummary(rawOutput: string): string | null {
  if (!rawOutput || !rawOutput.trim()) {
    return null;
  }

  // Try to find <summary> tags first (preferred format)
  const summaryTagMatch = rawOutput.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryTagMatch) {
    return summaryTagMatch[1].trim();
  }

  // Try to find markdown ## Summary section
  const summaryHeaderMatch = rawOutput.match(/^##\s+Summary\s*\n([\s\S]*?)(?=\n##\s+|$)/m);
  if (summaryHeaderMatch) {
    return summaryHeaderMatch[1].trim();
  }

  // Try other summary formats (Feature, Changes, Implementation)
  const otherHeaderMatch = rawOutput.match(
    /^##\s+(Feature|Changes|Implementation)\s*\n([\s\S]*?)(?=\n##\s+|$)/m
  );
  if (otherHeaderMatch) {
    return `## ${otherHeaderMatch[1]}\n${otherHeaderMatch[2].trim()}`;
  }

  // Try to find summary introduction lines
  const introMatch = rawOutput.match(
    /(^|\n)(All tasks completed[\s\S]*?)(?=\n🔧|\n📋|\n⚡|\n❌|$)/
  );
  if (introMatch) {
    return introMatch[2].trim();
  }

  const completionMatch = rawOutput.match(
    /(^|\n)((I've|I have) (successfully |now )?(completed|finished|implemented)[\s\S]*?)(?=\n🔧|\n📋|\n⚡|\n❌|$)/
  );
  if (completionMatch) {
    return completionMatch[2].trim();
  }

  return null;
}

/**
 * Gets the color classes for a log entry type
 */
export function getLogTypeColors(type: LogEntryType): {
  bg: string;
  border: string;
  text: string;
  icon: string;
  badge: string;
} {
  switch (type) {
    case 'prompt':
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-300',
        icon: 'text-blue-400',
        badge: 'bg-blue-500/20 text-blue-300',
      };
    case 'tool_call':
      return {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-300',
        icon: 'text-amber-400',
        badge: 'bg-amber-500/20 text-amber-300',
      };
    case 'tool_result':
      return {
        bg: 'bg-slate-500/10',
        border: 'border-slate-400/30',
        text: 'text-slate-300',
        icon: 'text-slate-400',
        badge: 'bg-slate-500/20 text-slate-300',
      };
    case 'phase':
      return {
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/30',
        text: 'text-cyan-300',
        icon: 'text-cyan-400',
        badge: 'bg-cyan-500/20 text-cyan-300',
      };
    case 'error':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-300',
        icon: 'text-red-400',
        badge: 'bg-red-500/20 text-red-300',
      };
    case 'success':
      return {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        text: 'text-emerald-300',
        icon: 'text-emerald-400',
        badge: 'bg-emerald-500/20 text-emerald-300',
      };
    case 'warning':
      return {
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        text: 'text-orange-300',
        icon: 'text-orange-400',
        badge: 'bg-orange-500/20 text-orange-300',
      };
    case 'thinking':
      return {
        bg: 'bg-indigo-500/10',
        border: 'border-indigo-500/30',
        text: 'text-indigo-300',
        icon: 'text-indigo-400',
        badge: 'bg-indigo-500/20 text-indigo-300',
      };
    case 'debug':
      return {
        bg: 'bg-primary/10',
        border: 'border-primary/30',
        text: 'text-primary',
        icon: 'text-primary',
        badge: 'bg-primary/20 text-primary',
      };
    default:
      return {
        bg: 'bg-zinc-500/10',
        border: 'border-zinc-500/30',
        text: 'text-zinc-300',
        icon: 'text-zinc-400',
        badge: 'bg-zinc-500/20 text-zinc-300',
      };
  }
}
