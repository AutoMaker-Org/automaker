import { useState, useMemo, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Wrench,
  Zap,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Bug,
  Info,
  FileOutput,
  Brain,
  Eye,
  Pencil,
  Terminal,
  Search,
  ListTodo,
  Layers,
  X,
  Filter,
  Circle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseLogOutput,
  getLogTypeColors,
  shouldCollapseByDefault,
  type LogEntry,
  type LogEntryType,
  type ToolCategory,
} from '@/lib/log-parser';

interface LogViewerProps {
  output: string;
  className?: string;
}

const getLogIcon = (type: LogEntryType) => {
  switch (type) {
    case 'prompt':
      return <MessageSquare className="w-4 h-4" />;
    case 'tool_call':
      return <Wrench className="w-4 h-4" />;
    case 'tool_result':
      return <FileOutput className="w-4 h-4" />;
    case 'phase':
      return <Zap className="w-4 h-4" />;
    case 'error':
      return <AlertCircle className="w-4 h-4" />;
    case 'success':
      return <CheckCircle2 className="w-4 h-4" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4" />;
    case 'thinking':
      return <Brain className="w-4 h-4" />;
    case 'debug':
      return <Bug className="w-4 h-4" />;
    default:
      return <Info className="w-4 h-4" />;
  }
};

/**
 * Returns a tool-specific icon based on the tool category
 */
const getToolCategoryIcon = (category: ToolCategory | undefined) => {
  switch (category) {
    case 'read':
      return <Eye className="w-4 h-4" />;
    case 'edit':
      return <Pencil className="w-4 h-4" />;
    case 'write':
      return <FileOutput className="w-4 h-4" />;
    case 'bash':
      return <Terminal className="w-4 h-4" />;
    case 'search':
      return <Search className="w-4 h-4" />;
    case 'todo':
      return <ListTodo className="w-4 h-4" />;
    case 'task':
      return <Layers className="w-4 h-4" />;
    default:
      return <Wrench className="w-4 h-4" />;
  }
};

/**
 * Returns color classes for a tool category
 */
const getToolCategoryColor = (category: ToolCategory | undefined): string => {
  switch (category) {
    case 'read':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    case 'edit':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'write':
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    case 'bash':
      return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
    case 'search':
      return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    case 'todo':
      return 'text-green-400 bg-green-500/10 border-green-500/30';
    case 'task':
      return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
    default:
      return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
  }
};

/**
 * Interface for parsed todo items from TodoWrite tool
 */
interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

/**
 * Parses TodoWrite JSON content and extracts todo items
 */
function parseTodoContent(content: string): TodoItem[] | null {
  try {
    // Find the JSON object in the content
    const jsonMatch = content.match(/\{[\s\S]*"todos"[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { todos?: TodoItem[] };
    if (!parsed.todos || !Array.isArray(parsed.todos)) return null;

    return parsed.todos;
  } catch {
    return null;
  }
}

/**
 * Renders a list of todo items with status icons and colors
 */
function TodoListRenderer({ todos }: { todos: TodoItem[] }) {
  const getStatusIcon = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'in_progress':
        return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
      case 'pending':
        return <Circle className="w-4 h-4 text-zinc-500" />;
      default:
        return <Circle className="w-4 h-4 text-zinc-500" />;
    }
  };

  const getStatusColor = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return 'text-emerald-300 line-through opacity-70';
      case 'in_progress':
        return 'text-amber-300';
      case 'pending':
        return 'text-zinc-400';
      default:
        return 'text-zinc-400';
    }
  };

  const getStatusBadge = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 ml-auto">
            Done
          </span>
        );
      case 'in_progress':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 ml-auto">
            In Progress
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-1">
      {todos.map((todo, index) => (
        <div
          key={index}
          className={cn(
            'flex items-start gap-2 p-2 rounded-md transition-colors',
            todo.status === 'in_progress' && 'bg-amber-500/5 border border-amber-500/20',
            todo.status === 'completed' && 'bg-emerald-500/5',
            todo.status === 'pending' && 'bg-zinc-800/30'
          )}
        >
          <div className="mt-0.5 flex-shrink-0">{getStatusIcon(todo.status)}</div>
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm', getStatusColor(todo.status))}>{todo.content}</p>
            {todo.status === 'in_progress' && todo.activeForm && (
              <p className="text-xs text-amber-400/70 mt-0.5 italic">{todo.activeForm}</p>
            )}
          </div>
          {getStatusBadge(todo.status)}
        </div>
      ))}
    </div>
  );
}

interface LogEntryItemProps {
  entry: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

function LogEntryItem({ entry, isExpanded, onToggle }: LogEntryItemProps) {
  const colors = getLogTypeColors(entry.type);
  const hasContent = entry.content.length > 100;

  // For tool_call entries, use tool-specific styling
  const isToolCall = entry.type === 'tool_call';
  const toolCategory = entry.metadata?.toolCategory;
  const toolCategoryColors = isToolCall ? getToolCategoryColor(toolCategory) : '';

  // Check if this is a TodoWrite entry and parse the todos
  const isTodoWrite = entry.metadata?.toolName === 'TodoWrite';
  const parsedTodos = useMemo(() => {
    if (!isTodoWrite) return null;
    return parseTodoContent(entry.content);
  }, [isTodoWrite, entry.content]);

  // Get the appropriate icon based on entry type and tool category
  const icon = isToolCall ? getToolCategoryIcon(toolCategory) : getLogIcon(entry.type);

  // Get collapsed preview text - prefer smart summary for tool calls
  const collapsedPreview = useMemo(() => {
    if (isExpanded) return '';

    // Use smart summary if available
    if (entry.metadata?.summary) {
      return entry.metadata.summary;
    }

    // Fallback to truncated content
    return entry.content.slice(0, 80) + (entry.content.length > 80 ? '...' : '');
  }, [isExpanded, entry.metadata?.summary, entry.content]);

  // Format content - detect and highlight JSON
  const formattedContent = useMemo(() => {
    let content = entry.content;

    // For tool_call entries, remove redundant "Tool: X" and "Input:" prefixes
    // since we already show the tool name in the header badge
    if (isToolCall) {
      // Remove "🔧 Tool: ToolName\n" or "Tool: ToolName\n" prefix
      content = content.replace(/^(?:🔧\s*)?Tool:\s*\w+\s*\n?/i, '');
      // Remove standalone "Input:" label (keep the JSON that follows)
      content = content.replace(/^Input:\s*\n?/i, '');
      content = content.trim();
    }

    // For summary entries, remove the <summary> and </summary> tags
    if (entry.title === 'Summary') {
      content = content.replace(/^<summary>\s*/i, '');
      content = content.replace(/\s*<\/summary>\s*$/i, '');
      content = content.trim();
    }

    // Try to find and format JSON blocks
    const jsonRegex = /(\{[\s\S]*?\}|\[[\s\S]*?\])/g;
    let lastIndex = 0;
    const parts: { type: 'text' | 'json'; content: string }[] = [];

    let match;
    while ((match = jsonRegex.exec(content)) !== null) {
      // Add text before JSON
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index),
        });
      }

      // Try to parse and format JSON
      try {
        const parsed = JSON.parse(match[1]);
        parts.push({
          type: 'json',
          content: JSON.stringify(parsed, null, 2),
        });
      } catch {
        // Not valid JSON, treat as text
        parts.push({ type: 'text', content: match[1] });
      }

      lastIndex = match.index + match[1].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({ type: 'text', content: content.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text' as const, content }];
  }, [entry.content, entry.title, isToolCall]);

  // Get colors - use tool category colors for tool_call entries
  const colorParts = toolCategoryColors.split(' ');
  const textColor = isToolCall ? colorParts[0] || 'text-zinc-400' : colors.text;
  const bgColor = isToolCall ? colorParts[1] || 'bg-zinc-500/10' : colors.bg;
  const borderColor = isToolCall ? colorParts[2] || 'border-zinc-500/30' : colors.border;

  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-200',
        bgColor,
        borderColor,
        'hover:brightness-110'
      )}
      data-testid={`log-entry-${entry.type}`}
    >
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 text-left"
        data-testid={`log-entry-toggle-${entry.id}`}
      >
        {hasContent ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          )
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <span
          className={cn(
            'flex-shrink-0',
            isToolCall ? toolCategoryColors.split(' ')[0] : colors.icon
          )}
        >
          {icon}
        </span>

        <span
          className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0',
            isToolCall ? toolCategoryColors : colors.badge
          )}
          data-testid="log-entry-badge"
        >
          {entry.title}
        </span>

        <span className="text-xs text-zinc-400 truncate flex-1 ml-2">{collapsedPreview}</span>
      </button>

      {(isExpanded || !hasContent) && (
        <div className="px-4 pb-3 pt-1" data-testid={`log-entry-content-${entry.id}`}>
          {/* Render TodoWrite entries with special formatting */}
          {parsedTodos ? (
            <TodoListRenderer todos={parsedTodos} />
          ) : (
            <div className="font-mono text-xs space-y-1">
              {formattedContent.map((part, index) => (
                <div key={index}>
                  {part.type === 'json' ? (
                    <pre className="bg-zinc-900/50 rounded p-2 overflow-x-auto scrollbar-styled text-xs text-primary">
                      {part.content}
                    </pre>
                  ) : (
                    <pre className={cn('whitespace-pre-wrap break-words', textColor)}>
                      {part.content}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ToolCategoryStats {
  read: number;
  edit: number;
  write: number;
  bash: number;
  search: number;
  todo: number;
  task: number;
  other: number;
}

export function LogViewer({ output, className }: LogViewerProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState<Set<LogEntryType>>(new Set());
  const [hiddenCategories, setHiddenCategories] = useState<Set<ToolCategory>>(new Set());
  // Track if user has "Expand All" mode active - new entries will auto-expand when this is true
  const [expandAllMode, setExpandAllMode] = useState(false);

  // Parse entries and compute initial expanded state together
  const { entries, initialExpandedIds } = useMemo(() => {
    const parsedEntries = parseLogOutput(output);
    const toExpand: string[] = [];

    parsedEntries.forEach((entry) => {
      // If entry should NOT collapse by default, mark it for expansion
      if (!shouldCollapseByDefault(entry)) {
        toExpand.push(entry.id);
      }
    });

    return {
      entries: parsedEntries,
      initialExpandedIds: new Set(toExpand),
    };
  }, [output]);

  // Merge initial expanded IDs with user-toggled ones
  // Use a ref to track if we've applied initial state
  const appliedInitialRef = useRef<Set<string>>(new Set());

  // Apply initial expanded state for new entries
  // Also auto-expand all entries when expandAllMode is active
  const effectiveExpandedIds = useMemo(() => {
    const result = new Set(expandedIds);

    // If expand all mode is active, expand all filtered entries
    if (expandAllMode) {
      entries.forEach((entry) => {
        result.add(entry.id);
      });
    } else {
      // Otherwise, only auto-expand entries based on initial state (shouldCollapseByDefault)
      initialExpandedIds.forEach((id) => {
        if (!appliedInitialRef.current.has(id)) {
          appliedInitialRef.current.add(id);
          result.add(id);
        }
      });
    }

    return result;
  }, [expandedIds, initialExpandedIds, expandAllMode, entries]);

  // Calculate stats for tool categories
  const stats = useMemo(() => {
    const toolCalls = entries.filter((e) => e.type === 'tool_call');
    const byCategory: ToolCategoryStats = {
      read: 0,
      edit: 0,
      write: 0,
      bash: 0,
      search: 0,
      todo: 0,
      task: 0,
      other: 0,
    };

    toolCalls.forEach((tc) => {
      const cat = tc.metadata?.toolCategory || 'other';
      byCategory[cat]++;
    });

    return {
      total: toolCalls.length,
      byCategory,
      errors: entries.filter((e) => e.type === 'error').length,
    };
  }, [entries]);

  // Filter entries based on search and hidden types/categories
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Filter by hidden types
      if (hiddenTypes.has(entry.type)) return false;

      // Filter by hidden tool categories (for tool_call entries)
      if (entry.type === 'tool_call' && entry.metadata?.toolCategory) {
        if (hiddenCategories.has(entry.metadata.toolCategory)) return false;
      }

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          entry.content.toLowerCase().includes(query) ||
          entry.title.toLowerCase().includes(query) ||
          entry.metadata?.toolName?.toLowerCase().includes(query) ||
          entry.metadata?.summary?.toLowerCase().includes(query) ||
          entry.metadata?.filePath?.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [entries, hiddenTypes, hiddenCategories, searchQuery]);

  const toggleEntry = (id: string) => {
    // When user manually collapses an entry, turn off expand all mode
    if (effectiveExpandedIds.has(id)) {
      setExpandAllMode(false);
    }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    // Enable expand all mode so new entries will also be expanded
    setExpandAllMode(true);
    setExpandedIds(new Set(filteredEntries.map((e) => e.id)));
  };

  const collapseAll = () => {
    // Disable expand all mode when collapsing all
    setExpandAllMode(false);
    setExpandedIds(new Set());
  };

  const toggleTypeFilter = (type: LogEntryType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleCategoryFilter = (category: ToolCategory) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setHiddenTypes(new Set());
    setHiddenCategories(new Set());
  };

  const hasActiveFilters = searchQuery || hiddenTypes.size > 0 || hiddenCategories.size > 0;

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <div className="text-center">
          <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No log entries yet. Logs will appear here as the process runs.</p>
          {output && output.trim() && (
            <div className="mt-4 p-3 bg-zinc-900/50 rounded text-xs font-mono text-left max-h-40 overflow-auto scrollbar-styled">
              <pre className="whitespace-pre-wrap">{output}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Count entries by type
  const typeCounts = entries.reduce(
    (acc, entry) => {
      acc[entry.type] = (acc[entry.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Tool categories to display in stats bar
  const toolCategoryLabels: { key: ToolCategory; label: string }[] = [
    { key: 'read', label: 'Read' },
    { key: 'edit', label: 'Edit' },
    { key: 'write', label: 'Write' },
    { key: 'bash', label: 'Bash' },
    { key: 'search', label: 'Search' },
    { key: 'todo', label: 'Todo' },
    { key: 'task', label: 'Task' },
    { key: 'other', label: 'Other' },
  ];

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Sticky header with search, stats, and filters */}
      {/* Use -top-4 to compensate for parent's p-4 padding, pt-4 to restore visual spacing */}
      <div className="sticky -top-4 z-10 bg-zinc-950/95 backdrop-blur-sm pt-4 pb-2 space-y-2 -mx-4 px-4">
        {/* Search bar */}
        <div className="flex items-center gap-2 px-1" data-testid="log-search-bar">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-900/50 border border-zinc-700/50 rounded-md text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
              data-testid="log-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                data-testid="log-search-clear"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800/50 transition-colors flex items-center gap-1"
              data-testid="log-clear-filters"
            >
              <X className="w-3 h-3" />
              Clear Filters
            </button>
          )}
        </div>

        {/* Tool category stats bar */}
        {stats.total > 0 && (
          <div className="flex items-center gap-1 px-1 flex-wrap" data-testid="log-stats-bar">
            <span className="text-xs text-zinc-500 mr-1">
              <Wrench className="w-3 h-3 inline mr-1" />
              {stats.total} tools:
            </span>
            {toolCategoryLabels.map(({ key, label }) => {
              const count = stats.byCategory[key];
              if (count === 0) return null;
              const isHidden = hiddenCategories.has(key);
              const colorClasses = getToolCategoryColor(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleCategoryFilter(key)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border transition-all flex items-center gap-1',
                    colorClasses,
                    isHidden && 'opacity-40 line-through'
                  )}
                  title={isHidden ? `Show ${label} tools` : `Hide ${label} tools`}
                  data-testid={`log-category-filter-${key}`}
                >
                  {getToolCategoryIcon(key)}
                  <span>{count}</span>
                </button>
              );
            })}
            {stats.errors > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {stats.errors}
              </span>
            )}
          </div>
        )}

        {/* Header with type filters and controls */}
        <div className="flex items-center justify-between px-1" data-testid="log-viewer-header">
          <div className="flex items-center gap-1 flex-wrap">
            <Filter className="w-3 h-3 text-zinc-500 mr-1" />
            {Object.entries(typeCounts).map(([type, count]) => {
              const colors = getLogTypeColors(type as LogEntryType);
              const isHidden = hiddenTypes.has(type as LogEntryType);
              return (
                <button
                  key={type}
                  onClick={() => toggleTypeFilter(type as LogEntryType)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full transition-all',
                    colors.badge,
                    isHidden && 'opacity-40 line-through'
                  )}
                  title={isHidden ? `Show ${type}` : `Hide ${type}`}
                  data-testid={`log-type-filter-${type}`}
                >
                  {type}: {count}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-500">
              {filteredEntries.length}/{entries.length}
            </span>
            <button
              onClick={expandAll}
              className={cn(
                'text-xs px-2 py-1 rounded transition-colors',
                expandAllMode
                  ? 'text-primary bg-primary/20 hover:bg-primary/30'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              )}
              data-testid="log-expand-all"
              title={
                expandAllMode ? 'Expand All (Active - new items will auto-expand)' : 'Expand All'
              }
            >
              Expand All{expandAllMode ? ' (On)' : ''}
            </button>
            <button
              onClick={collapseAll}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800/50 transition-colors"
              data-testid="log-collapse-all"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Log entries */}
      <div className="space-y-2 mt-2" data-testid="log-entries-container">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-4 text-zinc-500 text-sm">
            No entries match your filters.
            {hasActiveFilters && (
              <button onClick={clearFilters} className="ml-2 text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <LogEntryItem
              key={entry.id}
              entry={entry}
              isExpanded={effectiveExpandedIds.has(entry.id)}
              onToggle={() => toggleEntry(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
