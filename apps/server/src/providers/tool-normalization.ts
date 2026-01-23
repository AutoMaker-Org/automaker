/**
 * Shared tool normalization utilities for AI providers
 *
 * These utilities help normalize tool inputs from various AI providers
 * to the standard format expected by the application.
 */

/**
 * Valid todo status values in the standard format
 */
type TodoStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Set of valid status values for validation
 */
const VALID_STATUSES = new Set<TodoStatus>(['pending', 'in_progress', 'completed']);

/**
 * Todo item from various AI providers (Gemini, Copilot, etc.)
 */
interface ProviderTodo {
  description?: string;
  content?: string;
  status?: string;
}

/**
 * Standard todo format used by the application
 */
interface NormalizedTodo {
  content: string;
  status: TodoStatus;
  activeForm: string;
}

/**
 * Normalize a provider status value to a valid TodoStatus
 */
function normalizeStatus(status: string | undefined): TodoStatus {
  if (!status) return 'pending';
  if (status === 'cancelled' || status === 'canceled') return 'completed';
  if (VALID_STATUSES.has(status as TodoStatus)) return status as TodoStatus;
  return 'pending';
}

/**
 * Normalize todos array from provider format to standard format
 *
 * Handles different formats from providers:
 * - Gemini: { description, status } with 'cancelled' as possible status
 * - Copilot: { content/description, status } with 'cancelled' as possible status
 *
 * Output format (Claude/Standard):
 * - { content, status, activeForm } where status is 'pending'|'in_progress'|'completed'
 */
export function normalizeTodos(todos: ProviderTodo[] | null | undefined): NormalizedTodo[] {
  if (!todos) return [];
  return todos.map((todo) => ({
    content: todo.content || todo.description || '',
    status: normalizeStatus(todo.status),
    // Use content/description as activeForm since providers may not have it
    activeForm: todo.content || todo.description || '',
  }));
}

/**
 * Normalize file path parameters from various provider formats
 *
 * Different providers use different parameter names for file paths:
 * - path, file, filename, filePath -> file_path
 */
export function normalizeFilePathInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...input };
  if (!normalized.file_path) {
    if (input.path) normalized.file_path = input.path;
    else if (input.file) normalized.file_path = input.file;
    else if (input.filename) normalized.file_path = input.filename;
    else if (input.filePath) normalized.file_path = input.filePath;
  }
  return normalized;
}

/**
 * Normalize shell command parameters from various provider formats
 *
 * Different providers use different parameter names for commands:
 * - cmd, script -> command
 */
export function normalizeCommandInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...input };
  if (!normalized.command) {
    if (input.cmd) normalized.command = input.cmd;
    else if (input.script) normalized.command = input.script;
  }
  return normalized;
}

/**
 * Normalize search pattern parameters from various provider formats
 *
 * Different providers use different parameter names for search patterns:
 * - query, search, regex -> pattern
 */
export function normalizePatternInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...input };
  if (!normalized.pattern) {
    if (input.query) normalized.pattern = input.query;
    else if (input.search) normalized.pattern = input.search;
    else if (input.regex) normalized.pattern = input.regex;
  }
  return normalized;
}
