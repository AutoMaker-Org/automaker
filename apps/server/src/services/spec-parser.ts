/**
 * Spec Parser - Pure functions for parsing spec content and detecting markers
 *
 * Extracts tasks from generated specs, detects progress markers,
 * and extracts summary content from various formats.
 */

import type { ParsedTask } from '@automaker/types';

/**
 * Parse a single task line
 * Format: - [ ] T###: Description | File: path/to/file
 */
function parseTaskLine(line: string, currentPhase?: string): ParsedTask | null {
  // Match pattern: - [ ] T###: Description | File: path
  const taskMatch = line.match(/- \[ \] (T\d{3}):\s*([^|]+)(?:\|\s*File:\s*(.+))?$/);
  if (!taskMatch) {
    // Try simpler pattern without file
    const simpleMatch = line.match(/- \[ \] (T\d{3}):\s*(.+)$/);
    if (simpleMatch) {
      return {
        id: simpleMatch[1],
        description: simpleMatch[2].trim(),
        phase: currentPhase,
        status: 'pending',
      };
    }
    return null;
  }

  return {
    id: taskMatch[1],
    description: taskMatch[2].trim(),
    filePath: taskMatch[3]?.trim(),
    phase: currentPhase,
    status: 'pending',
  };
}

/**
 * Parse tasks from generated spec content
 * Looks for the ```tasks code block and extracts task lines
 * Format: - [ ] T###: Description | File: path/to/file
 */
export function parseTasksFromSpec(specContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  // Extract content within ```tasks ... ``` block
  const tasksBlockMatch = specContent.match(/```tasks\s*([\s\S]*?)```/);
  if (!tasksBlockMatch) {
    // Try fallback: look for task lines anywhere in content
    const taskLines = specContent.match(/- \[ \] T\d{3}:.*$/gm);
    if (!taskLines) {
      return tasks;
    }
    // Parse fallback task lines
    let currentPhase: string | undefined;
    for (const line of taskLines) {
      const parsed = parseTaskLine(line, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
    return tasks;
  }

  const tasksContent = tasksBlockMatch[1];
  const lines = tasksContent.split('\n');

  let currentPhase: string | undefined;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for phase header (e.g., "## Phase 1: Foundation")
    const phaseMatch = trimmedLine.match(/^##\s*(.+)$/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      continue;
    }

    // Check for task line
    if (trimmedLine.startsWith('- [ ]')) {
      const parsed = parseTaskLine(trimmedLine, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
  }

  return tasks;
}

/**
 * Detect [TASK_START] marker in text and extract task ID
 * Format: [TASK_START] T###: Description
 */
export function detectTaskStartMarker(text: string): string | null {
  const match = text.match(/\[TASK_START\]\s*(T\d{3})/);
  return match ? match[1] : null;
}

/**
 * Detect [TASK_COMPLETE] marker in text and extract task ID
 * Format: [TASK_COMPLETE] T###: Brief summary
 */
export function detectTaskCompleteMarker(text: string): string | null {
  const match = text.match(/\[TASK_COMPLETE\]\s*(T\d{3})/);
  return match ? match[1] : null;
}

/**
 * Detect [PHASE_COMPLETE] marker in text and extract phase number
 * Format: [PHASE_COMPLETE] Phase N complete
 */
export function detectPhaseCompleteMarker(text: string): number | null {
  const match = text.match(/\[PHASE_COMPLETE\]\s*Phase\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Fallback spec detection when [SPEC_GENERATED] marker is missing
 * Looks for structural elements that indicate a spec was generated.
 * This is especially important for non-Claude models that may not output
 * the explicit [SPEC_GENERATED] marker.
 *
 * @param text - The text content to check for spec structure
 * @returns true if the text appears to be a generated spec
 */
export function detectSpecFallback(text: string): boolean {
  // Check for key structural elements of a spec
  const hasTasksBlock = /```tasks[\s\S]*```/.test(text);
  const hasTaskLines = /- \[ \] T\d{3}:/.test(text);

  // Check for common spec sections (case-insensitive)
  const hasAcceptanceCriteria = /acceptance criteria/i.test(text);
  const hasTechnicalContext = /technical context/i.test(text);
  const hasProblemStatement = /problem statement/i.test(text);
  const hasUserStory = /user story/i.test(text);
  // Additional patterns for different model outputs
  const hasGoal = /\*\*Goal\*\*:/i.test(text);
  const hasSolution = /\*\*Solution\*\*:/i.test(text);
  const hasImplementation = /implementation\s*(plan|steps|approach)/i.test(text);
  const hasOverview = /##\s*(overview|summary)/i.test(text);

  // Spec is detected if we have task structure AND at least some spec content
  const hasTaskStructure = hasTasksBlock || hasTaskLines;
  const hasSpecContent =
    hasAcceptanceCriteria ||
    hasTechnicalContext ||
    hasProblemStatement ||
    hasUserStory ||
    hasGoal ||
    hasSolution ||
    hasImplementation ||
    hasOverview;

  return hasTaskStructure && hasSpecContent;
}

/**
 * Extract summary from text content
 * Checks for multiple formats in order of priority:
 * 1. Explicit <summary> tags
 * 2. ## Summary section (markdown)
 * 3. **Goal**: section (lite planning mode)
 * 4. **Problem**: or **Problem Statement**: section (spec/full modes)
 * 5. **Solution**: section as fallback
 *
 * Note: Uses last match for each pattern to avoid stale summaries
 * when agent output accumulates across multiple runs.
 *
 * @param text - The text content to extract summary from
 * @returns The extracted summary string, or null if no summary found
 */
export function extractSummary(text: string): string | null {
  // Helper to truncate content to first paragraph with max length
  const truncate = (content: string, maxLength: number): string => {
    const firstPara = content.split(/\n\n/)[0];
    return firstPara.length > maxLength ? `${firstPara.substring(0, maxLength)}...` : firstPara;
  };

  // Helper to get last match from matchAll results
  const getLastMatch = (matches: IterableIterator<RegExpMatchArray>): RegExpMatchArray | null => {
    const arr = [...matches];
    return arr.length > 0 ? arr[arr.length - 1] : null;
  };

  // Check for explicit <summary> tags first (use last match to avoid stale summaries)
  const summaryMatches = text.matchAll(/<summary>([\s\S]*?)<\/summary>/g);
  const summaryMatch = getLastMatch(summaryMatches);
  if (summaryMatch) {
    return summaryMatch[1].trim();
  }

  // Check for ## Summary section (use last match)
  const sectionMatches = text.matchAll(/##\s*Summary\s*\n+([\s\S]*?)(?=\n##|\n\*\*|$)/gi);
  const sectionMatch = getLastMatch(sectionMatches);
  if (sectionMatch) {
    return truncate(sectionMatch[1].trim(), 500);
  }

  // Check for **Goal**: section (lite mode, use last match)
  const goalMatches = text.matchAll(/\*\*Goal\*\*:\s*(.+?)(?:\n|$)/gi);
  const goalMatch = getLastMatch(goalMatches);
  if (goalMatch) {
    return goalMatch[1].trim();
  }

  // Check for **Problem**: or **Problem Statement**: section (spec/full modes, use last match)
  const problemMatches = text.matchAll(
    /\*\*Problem(?:\s*Statement)?\*\*:\s*([\s\S]*?)(?=\n\d+\.|\n\*\*|$)/gi
  );
  const problemMatch = getLastMatch(problemMatches);
  if (problemMatch) {
    return truncate(problemMatch[1].trim(), 500);
  }

  // Check for **Solution**: section as fallback (use last match)
  const solutionMatches = text.matchAll(/\*\*Solution\*\*:\s*([\s\S]*?)(?=\n\d+\.|\n\*\*|$)/gi);
  const solutionMatch = getLastMatch(solutionMatches);
  if (solutionMatch) {
    return truncate(solutionMatch[1].trim(), 300);
  }

  return null;
}
