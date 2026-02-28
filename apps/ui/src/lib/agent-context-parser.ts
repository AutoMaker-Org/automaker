/**
 * Agent Context Parser
 * Extracts useful information from agent context files for display in kanban cards
 */

import type { ClaudeCompatibleProvider } from '@automaker/types';

export interface AgentTaskInfo {
  // Task list extracted from TodoWrite tool calls
  todos: {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
  }[];

  // Progress stats
  toolCallCount: number;
  lastToolUsed?: string;

  // Phase info
  currentPhase?: 'planning' | 'action' | 'verification';

  // Summary (if feature is completed)
  summary?: string;

  // Estimated progress percentage based on phase and tool calls
  progressPercentage: number;
}

/**
 * Default model used by the feature executor
 */
export const DEFAULT_MODEL = 'claude-opus-4-6';

/**
 * Options for formatting model names
 */
export interface FormatModelNameOptions {
  /** Provider ID to look up custom display names */
  providerId?: string;
  /** List of Claude-compatible providers to search for display names */
  claudeCompatibleProviders?: ClaudeCompatibleProvider[];
}

/**
 * Formats a model name for display, with optional provider-aware lookup.
 *
 * When a providerId and providers array are supplied, this function will:
 * 1. Look up the provider configuration
 * 2. Find the model in the provider's models array
 * 3. Return the displayName from that configuration
 *
 * This allows Claude-compatible providers (like GLM, MiniMax, OpenRouter) to
 * show their own model names (e.g., "GLM 4.7", "MiniMax M2.1") instead of
 * the internal Claude model aliases (e.g., "Sonnet 4.5").
 */
export function formatModelName(model: string, options?: FormatModelNameOptions): string {
  // If we have a providerId and providers array, look up the display name from the provider
  if (options?.providerId && options?.claudeCompatibleProviders) {
    const provider = options.claudeCompatibleProviders.find((p) => p.id === options.providerId);
    if (provider?.models) {
      const providerModel = provider.models.find((m) => m.id === model);
      if (providerModel?.displayName) {
        return providerModel.displayName;
      }
    }
  }

  // Claude models
  if (model.includes('opus-4-6') || model === 'claude-opus') return 'Opus 4.6';
  if (model.includes('opus')) return 'Opus 4.5';
  if (model.includes('sonnet-4-6') || model === 'claude-sonnet') return 'Sonnet 4.6';
  if (model.includes('sonnet')) return 'Sonnet 4.5';
  if (model.includes('haiku')) return 'Haiku 4.5';

  // Codex/GPT models - specific formatting
  if (model === 'codex-gpt-5.3-codex') return 'GPT-5.3 Codex';
  if (model === 'codex-gpt-5.2-codex') return 'GPT-5.2 Codex';
  if (model === 'codex-gpt-5.2') return 'GPT-5.2';
  if (model === 'codex-gpt-5.1-codex-max') return 'GPT-5.1 Max';
  if (model === 'codex-gpt-5.1-codex-mini') return 'GPT-5.1 Mini';
  if (model === 'codex-gpt-5.1') return 'GPT-5.1';
  // Generic fallbacks for other GPT models
  if (model.startsWith('gpt-')) return model.toUpperCase();
  if (model.match(/^o\d/)) return model.toUpperCase(); // o1, o3, etc.

  // Cursor models
  if (model === 'cursor-auto' || model === 'auto') return 'Cursor Auto';
  if (model === 'cursor-composer-1' || model === 'composer-1') return 'Composer 1';
  if (model.startsWith('cursor-sonnet')) return 'Cursor Sonnet';
  if (model.startsWith('cursor-opus')) return 'Cursor Opus';
  if (model.startsWith('cursor-gpt')) return model.replace('cursor-', '').replace('gpt-', 'GPT-');
  if (model.startsWith('cursor-gemini'))
    return model.replace('cursor-', 'Cursor ').replace('gemini', 'Gemini');
  if (model.startsWith('cursor-grok')) return 'Cursor Grok';

  // OpenCode static models (canonical opencode- prefix)
  if (model === 'opencode-big-pickle') return 'Big Pickle';
  if (model === 'opencode-glm-5-free') return 'GLM 5 Free';
  if (model === 'opencode-gpt-5-nano') return 'GPT-5 Nano';
  if (model === 'opencode-kimi-k2.5-free') return 'Kimi K2.5';
  if (model === 'opencode-minimax-m2.5-free') return 'MiniMax M2.5';

  // OpenCode dynamic models (provider/model format like "google/gemini-2.5-pro")
  if (model.includes('/') && !model.includes('://')) {
    const slashIndex = model.indexOf('/');
    const modelName = model.substring(slashIndex + 1);
    // Extract last path segment (handles nested paths like "arcee-ai/trinity-large-preview:free")
    let lastSegment = modelName.split('/').pop()!;
    // Detect and save tier suffixes like ":free", ":extended", ":beta", ":preview"
    const tierMatch = lastSegment.match(/:(free|extended|beta|preview)$/i);
    if (tierMatch) {
      lastSegment = lastSegment.slice(0, lastSegment.length - tierMatch[0].length);
    }
    // Clean up the model name for display (remove version tags, capitalize)
    const cleanedName = lastSegment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    // Append tier as a human-friendly label in parentheses
    if (tierMatch) {
      const capitalizedTier =
        tierMatch[1].charAt(0).toUpperCase() + tierMatch[1].slice(1).toLowerCase();
      return `${cleanedName} (${capitalizedTier})`;
    }
    return cleanedName;
  }

  // Default: split by dash and capitalize
  return model.split('-').slice(1, 3).join(' ');
}

/**
 * Helper to extract a balanced JSON object from a string starting at a given position
 */
function extractJsonObject(str: string, startIdx: number): string | null {
  if (str[startIdx] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        return str.slice(startIdx, i + 1);
      }
    }
  }

  return null;
}

/**
 * Extracts todos from the context content
 * Looks for TodoWrite tool calls in the format:
 * 🔧 Tool: TodoWrite
 * Input: {"todos": [{"content": "...", "status": "..."}]}
 */
function extractTodos(content: string): AgentTaskInfo['todos'] {
  const todos: AgentTaskInfo['todos'] = [];

  // Find all occurrences of TodoWrite tool calls
  const todoWriteMarker = '🔧 Tool: TodoWrite';
  let searchStart = 0;

  while (true) {
    const markerIdx = content.indexOf(todoWriteMarker, searchStart);
    if (markerIdx === -1) break;

    // Look for "Input:" after the marker
    const inputIdx = content.indexOf('Input:', markerIdx);
    if (inputIdx === -1 || inputIdx > markerIdx + 100) {
      searchStart = markerIdx + 1;
      continue;
    }

    // Find the start of the JSON object
    const jsonStart = content.indexOf('{', inputIdx);
    if (jsonStart === -1) {
      searchStart = markerIdx + 1;
      continue;
    }

    // Extract the complete JSON object
    const jsonStr = extractJsonObject(content, jsonStart);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr) as {
          todos?: Array<{ content: string; status: string }>;
        };
        if (parsed.todos && Array.isArray(parsed.todos)) {
          // Clear previous todos - we want the latest state
          todos.length = 0;
          for (const item of parsed.todos) {
            if (item.content && item.status) {
              todos.push({
                content: item.content,
                status: item.status as 'pending' | 'in_progress' | 'completed',
              });
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    searchStart = markerIdx + 1;
  }

  // Also try to extract from markdown task lists as fallback
  if (todos.length === 0) {
    const markdownTodos = content.matchAll(/- \[([ xX])\] (.+)/g);
    for (const match of markdownTodos) {
      const isCompleted = match[1].toLowerCase() === 'x';
      const todoContent = match[2].trim();
      if (!todos.some((t) => t.content === todoContent)) {
        todos.push({
          content: todoContent,
          status: isCompleted ? 'completed' : 'pending',
        });
      }
    }
  }

  return todos;
}

/**
 * Counts tool calls in the content
 */
function countToolCalls(content: string): number {
  const matches = content.match(/🔧\s*Tool:/g);
  return matches?.length || 0;
}

/**
 * Gets the last tool used
 */
function getLastToolUsed(content: string): string | undefined {
  const matches = [...content.matchAll(/🔧\s*Tool:\s*(\S+)/g)];
  if (matches.length > 0) {
    return matches[matches.length - 1][1];
  }
  return undefined;
}

/**
 * Determines the current phase from the content
 */
function getCurrentPhase(content: string): 'planning' | 'action' | 'verification' | undefined {
  // Find the last phase marker
  const planningIndex = content.lastIndexOf('📋');
  const actionIndex = content.lastIndexOf('⚡');
  const verificationIndex = content.lastIndexOf('✅');

  const maxIndex = Math.max(planningIndex, actionIndex, verificationIndex);

  if (maxIndex === -1) return undefined;
  if (maxIndex === verificationIndex) return 'verification';
  if (maxIndex === actionIndex) return 'action';
  return 'planning';
}

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

/**
 * Extracts a summary from completed feature context
 * Looks for content between <summary> and </summary> tags
 * Returns the LAST summary found to ensure we get the most recent/updated one
 */
function extractSummary(content: string): string | undefined {
  // First, clean up any fragmented text from streaming
  const cleanedContent = cleanFragmentedText(content);

  // Define regex patterns to try in order of priority
  // Each pattern specifies which capture group contains the summary content
  const regexesToTry = [
    { regex: /<summary>([\s\S]*?)<\/summary>/gi, group: 1 },
    { regex: /## Summary[^\n]*\n([\s\S]*?)(?=\n## [^#]|\n🔧|$)/gi, group: 1 },
    {
      regex:
        /✓ (?:Feature|Verification|Task) (?:successfully|completed|verified)[^\n]*(?:\n[^\n]{1,200})?/gi,
      group: 0,
    },
    {
      regex: /(?:What was done|Changes made|Implemented)[^\n]*\n([\s\S]*?)(?=\n## [^#]|\n🔧|$)/gi,
      group: 1,
    },
  ];

  for (const { regex, group } of regexesToTry) {
    const matches = [...cleanedContent.matchAll(regex)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      return cleanFragmentedText(lastMatch[group]).trim();
    }
  }

  return undefined;
}

/**
 * Calculates progress percentage based on phase and context
 * Uses a more dynamic approach that better reflects actual progress
 */
function calculateProgress(
  phase: AgentTaskInfo['currentPhase'],
  toolCallCount: number,
  todos: AgentTaskInfo['todos']
): number {
  // If we have todos, primarily use them for progress calculation
  if (todos.length > 0) {
    const completedCount = todos.filter((t) => t.status === 'completed').length;
    const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;

    // Weight: completed = 1, in_progress = 0.5, pending = 0
    const progress = ((completedCount + inProgressCount * 0.5) / todos.length) * 90;

    // Add a small base amount and cap at 95%
    return Math.min(5 + progress, 95);
  }

  // Fallback: use phase-based progress with tool call scaling
  let phaseProgress = 0;
  switch (phase) {
    case 'planning':
      // Planning phase: 5-25%
      phaseProgress = 5 + Math.min(toolCallCount * 1, 20);
      break;
    case 'action':
      // Action phase: 25-75% based on tool calls (logarithmic scaling)
      phaseProgress = 25 + Math.min(Math.log2(toolCallCount + 1) * 10, 50);
      break;
    case 'verification':
      // Verification phase: 75-95%
      phaseProgress = 75 + Math.min(toolCallCount * 0.5, 20);
      break;
    default:
      // Starting: just use tool calls
      phaseProgress = Math.min(toolCallCount * 0.5, 10);
  }

  return Math.min(Math.round(phaseProgress), 95);
}

/**
 * Parses agent context content and extracts useful information
 */
export function parseAgentContext(content: string): AgentTaskInfo {
  if (!content || !content.trim()) {
    return {
      todos: [],
      toolCallCount: 0,
      progressPercentage: 0,
    };
  }

  const todos = extractTodos(content);
  const toolCallCount = countToolCalls(content);
  const lastToolUsed = getLastToolUsed(content);
  const currentPhase = getCurrentPhase(content);
  const summary = extractSummary(content);
  const progressPercentage = calculateProgress(currentPhase, toolCallCount, todos);

  return {
    todos,
    toolCallCount,
    lastToolUsed,
    currentPhase,
    summary,
    progressPercentage,
  };
}

/**
 * Quick stats for display in card badges
 */
export interface QuickStats {
  toolCalls: number;
  completedTasks: number;
  totalTasks: number;
  phase?: string;
}

/**
 * Extracts quick stats from context for compact display
 */
export function getQuickStats(content: string): QuickStats {
  const info = parseAgentContext(content);
  return {
    toolCalls: info.toolCallCount,
    completedTasks: info.todos.filter((t) => t.status === 'completed').length,
    totalTasks: info.todos.length,
    phase: info.currentPhase,
  };
}
