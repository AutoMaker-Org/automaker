/**
 * Agent Context Parser
 * Extracts useful information from agent context files for display in kanban cards
 */

export interface AgentTaskInfo {
  // Task list extracted from TodoWrite tool calls
  todos: {
    content: string;
    status: "pending" | "in_progress" | "completed";
  }[];

  // Progress stats
  toolCallCount: number;
  lastToolUsed?: string;

  // Phase info
  currentPhase?: "planning" | "action" | "verification";

  // Summary (if feature is completed)
  summary?: string;

  // Estimated progress percentage based on phase and tool calls
  progressPercentage: number;
}

/**
 * Default model used by the feature executor
 */
export const DEFAULT_MODEL = "claude-opus-4-5-20251101";

/**
 * Formats a model name for display
 */
export function formatModelName(model: string): string {
  if (model.includes("opus")) return "Opus 4.5";
  if (model.includes("sonnet")) return "Sonnet 4.5";
  if (model.includes("haiku")) return "Haiku 4.5";
  return model.split("-").slice(1, 3).join(" ");
}

/**
 * Extracts todos from the context content
 * Looks for TodoWrite tool calls in the format:
 * TodoWrite: [{"content": "...", "status": "..."}]
 */
function extractTodos(content: string): AgentTaskInfo["todos"] {
  const todos: AgentTaskInfo["todos"] = [];

  // Look for TodoWrite tool inputs
  const todoMatches = content.matchAll(/TodoWrite.*?(?:"todos"\s*:\s*)?(\[[\s\S]*?\](?=\s*(?:\}|$|🔧|📋|⚡|✅|❌)))/g);

  for (const match of todoMatches) {
    try {
      // Try to find JSON array in the match
      const jsonStr = match[1] || match[0];
      const arrayMatch = jsonStr.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.content && item.status) {
              // Check if this todo already exists (avoid duplicates)
              if (!todos.some(t => t.content === item.content)) {
                todos.push({
                  content: item.content,
                  status: item.status,
                });
              }
            }
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Also try to extract from markdown task lists
  const markdownTodos = content.matchAll(/- \[([ xX])\] (.+)/g);
  for (const match of markdownTodos) {
    const isCompleted = match[1].toLowerCase() === "x";
    const content = match[2].trim();
    if (!todos.some(t => t.content === content)) {
      todos.push({
        content,
        status: isCompleted ? "completed" : "pending",
      });
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
function getCurrentPhase(content: string): "planning" | "action" | "verification" | undefined {
  // Find the last phase marker
  const planningIndex = content.lastIndexOf("📋");
  const actionIndex = content.lastIndexOf("⚡");
  const verificationIndex = content.lastIndexOf("✅");

  const maxIndex = Math.max(planningIndex, actionIndex, verificationIndex);

  if (maxIndex === -1) return undefined;
  if (maxIndex === verificationIndex) return "verification";
  if (maxIndex === actionIndex) return "action";
  return "planning";
}

/**
 * Extracts a summary from completed feature context
 */
function extractSummary(content: string): string | undefined {
  // Look for summary sections - capture everything including subsections (###)
  // Stop at same-level ## sections (but not ###), or tool markers, or end
  const summaryMatch = content.match(/## Summary[^\n]*\n([\s\S]*?)(?=\n## [^#]|\n🔧|$)/i);
  if (summaryMatch) {
    return summaryMatch[1].trim();
  }

  // Look for completion markers and extract surrounding text
  const completionMatch = content.match(/✓ (?:Feature|Verification|Task) (?:successfully|completed|verified)[^\n]*(?:\n[^\n]{1,200})?/i);
  if (completionMatch) {
    return completionMatch[0].trim();
  }

  // Look for "What was done" type sections
  const whatWasDoneMatch = content.match(/(?:What was done|Changes made|Implemented)[^\n]*\n([\s\S]*?)(?=\n## [^#]|\n🔧|$)/i);
  if (whatWasDoneMatch) {
    return whatWasDoneMatch[1].trim();
  }

  return undefined;
}

/**
 * Calculates progress percentage based on phase and context
 * Uses a more dynamic approach that better reflects actual progress
 */
function calculateProgress(phase: AgentTaskInfo["currentPhase"], toolCallCount: number, todos: AgentTaskInfo["todos"]): number {
  // If we have todos, primarily use them for progress calculation
  if (todos.length > 0) {
    const completedCount = todos.filter(t => t.status === "completed").length;
    const inProgressCount = todos.filter(t => t.status === "in_progress").length;

    // Weight: completed = 1, in_progress = 0.5, pending = 0
    const progress = ((completedCount + inProgressCount * 0.5) / todos.length) * 90;

    // Add a small base amount and cap at 95%
    return Math.min(5 + progress, 95);
  }

  // Fallback: use phase-based progress with tool call scaling
  let phaseProgress = 0;
  switch (phase) {
    case "planning":
      // Planning phase: 5-25%
      phaseProgress = 5 + Math.min(toolCallCount * 1, 20);
      break;
    case "action":
      // Action phase: 25-75% based on tool calls (logarithmic scaling)
      phaseProgress = 25 + Math.min(Math.log2(toolCallCount + 1) * 10, 50);
      break;
    case "verification":
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
    completedTasks: info.todos.filter(t => t.status === "completed").length,
    totalTasks: info.todos.length,
    phase: info.currentPhase,
  };
}
