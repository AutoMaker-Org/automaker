/**
 * Memory Loader - Smart loading of agent memory files
 *
 * Loads relevant memory files from .automaker/memory/ based on:
 * - Tag matching with feature keywords
 * - Historical usefulness (usage stats)
 * - File importance
 *
 * Memory files use YAML frontmatter for metadata.
 */

import path from 'path';

/**
 * File system module interface (compatible with secureFs)
 */
export interface MemoryFsModule {
  access: (path: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  readFile: (path: string, encoding?: BufferEncoding) => Promise<string | Buffer>;
  writeFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<string | undefined>;
  appendFile: (path: string, content: string) => Promise<void>;
}

/**
 * Usage statistics for learning which files are helpful
 */
export interface UsageStats {
  loaded: number;
  referenced: number;
  successfulFeatures: number;
}

/**
 * Metadata stored in YAML frontmatter of memory files
 */
export interface MemoryMetadata {
  tags: string[];
  summary: string;
  relevantTo: string[];
  importance: number;
  relatedFiles: string[];
  usageStats: UsageStats;
}

/**
 * A loaded memory file with content and metadata
 */
export interface MemoryFile {
  name: string;
  content: string;
  metadata: MemoryMetadata;
}

/**
 * Result of loading memory files
 */
export interface MemoryLoadResult {
  files: MemoryFile[];
  formattedPrompt: string;
}

/**
 * Learning entry to be recorded
 * Based on Architecture Decision Record (ADR) format for rich context
 */
export interface LearningEntry {
  category: string;
  type: 'decision' | 'learning' | 'pattern' | 'gotcha';
  content: string;
  context?: string; // Problem being solved or situation faced
  why?: string; // Reasoning behind the approach
  rejected?: string; // Alternative considered and why rejected
  tradeoffs?: string; // What became easier/harder
  breaking?: string; // What breaks if changed/removed
}

/**
 * Create default metadata for new memory files
 * Returns a new object each time to avoid shared mutable state
 */
function createDefaultMetadata(): MemoryMetadata {
  return {
    tags: [],
    summary: '',
    relevantTo: [],
    importance: 0.5,
    relatedFiles: [],
    usageStats: {
      loaded: 0,
      referenced: 0,
      successfulFeatures: 0,
    },
  };
}

/**
 * In-memory locks to prevent race conditions when updating files
 */
const fileLocks = new Map<string, Promise<void>>();

/**
 * Acquire a lock for a file path, execute the operation, then release
 */
async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  // Wait for any existing lock on this file
  const existingLock = fileLocks.get(filePath);
  if (existingLock) {
    await existingLock;
  }

  // Create a new lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  fileLocks.set(filePath, lockPromise);

  try {
    return await operation();
  } finally {
    releaseLock!();
    fileLocks.delete(filePath);
  }
}

/**
 * Get the memory directory path for a project
 */
export function getMemoryDir(projectPath: string): string {
  return path.join(projectPath, '.automaker', 'memory');
}

/**
 * Parse YAML frontmatter from markdown content
 * Returns the metadata and the content without frontmatter
 */
export function parseFrontmatter(content: string): {
  metadata: MemoryMetadata;
  body: string;
} {
  // Handle both Unix (\n) and Windows (\r\n) line endings
  const frontmatterRegex = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: createDefaultMetadata(), body: content };
  }

  const frontmatterStr = match[1];
  const body = content.slice(match[0].length);

  try {
    // Simple YAML parsing for our specific format
    const metadata: MemoryMetadata = createDefaultMetadata();

    // Parse tags: [tag1, tag2, tag3]
    const tagsMatch = frontmatterStr.match(/tags:\s*\[(.*?)\]/);
    if (tagsMatch) {
      metadata.tags = tagsMatch[1]
        .split(',')
        .map((t) => t.trim().replace(/['"]/g, ''))
        .filter((t) => t.length > 0); // Filter out empty strings
    }

    // Parse summary
    const summaryMatch = frontmatterStr.match(/summary:\s*(.+)/);
    if (summaryMatch) {
      metadata.summary = summaryMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    // Parse relevantTo: [term1, term2]
    const relevantMatch = frontmatterStr.match(/relevantTo:\s*\[(.*?)\]/);
    if (relevantMatch) {
      metadata.relevantTo = relevantMatch[1]
        .split(',')
        .map((t) => t.trim().replace(/['"]/g, ''))
        .filter((t) => t.length > 0); // Filter out empty strings
    }

    // Parse importance (validate range 0-1)
    const importanceMatch = frontmatterStr.match(/importance:\s*([\d.]+)/);
    if (importanceMatch) {
      const value = parseFloat(importanceMatch[1]);
      metadata.importance = Math.max(0, Math.min(1, value)); // Clamp to 0-1
    }

    // Parse relatedFiles: [file1.md, file2.md]
    const relatedMatch = frontmatterStr.match(/relatedFiles:\s*\[(.*?)\]/);
    if (relatedMatch) {
      metadata.relatedFiles = relatedMatch[1]
        .split(',')
        .map((t) => t.trim().replace(/['"]/g, ''))
        .filter((t) => t.length > 0); // Filter out empty strings
    }

    // Parse usageStats
    const loadedMatch = frontmatterStr.match(/loaded:\s*(\d+)/);
    const referencedMatch = frontmatterStr.match(/referenced:\s*(\d+)/);
    const successMatch = frontmatterStr.match(/successfulFeatures:\s*(\d+)/);

    if (loadedMatch) metadata.usageStats.loaded = parseInt(loadedMatch[1], 10);
    if (referencedMatch) metadata.usageStats.referenced = parseInt(referencedMatch[1], 10);
    if (successMatch) metadata.usageStats.successfulFeatures = parseInt(successMatch[1], 10);

    return { metadata, body };
  } catch {
    return { metadata: createDefaultMetadata(), body: content };
  }
}

/**
 * Escape a string for safe YAML output
 * Quotes strings containing special characters
 */
function escapeYamlString(str: string): string {
  // If string contains special YAML characters, wrap in quotes
  if (/[:\[\]{}#&*!|>'"%@`\n\r]/.test(str) || str.trim() !== str) {
    // Escape any existing quotes and wrap in double quotes
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

/**
 * Serialize metadata back to YAML frontmatter
 */
export function serializeFrontmatter(metadata: MemoryMetadata): string {
  const escapedTags = metadata.tags.map(escapeYamlString);
  const escapedRelevantTo = metadata.relevantTo.map(escapeYamlString);
  const escapedRelatedFiles = metadata.relatedFiles.map(escapeYamlString);
  const escapedSummary = escapeYamlString(metadata.summary);

  return `---
tags: [${escapedTags.join(', ')}]
summary: ${escapedSummary}
relevantTo: [${escapedRelevantTo.join(', ')}]
importance: ${metadata.importance}
relatedFiles: [${escapedRelatedFiles.join(', ')}]
usageStats:
  loaded: ${metadata.usageStats.loaded}
  referenced: ${metadata.usageStats.referenced}
  successfulFeatures: ${metadata.usageStats.successfulFeatures}
---`;
}

/**
 * Extract terms from text for matching
 * Splits on spaces, removes common words, lowercases
 */
export function extractTerms(text: string): string[] {
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'is',
    'it',
    'this',
    'that',
    'be',
    'as',
    'are',
    'was',
    'were',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'dare',
    'ought',
    'used',
    'add',
    'create',
    'implement',
    'build',
    'make',
    'update',
    'fix',
    'change',
    'modify',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Count how many terms match between two arrays (case-insensitive)
 */
export function countMatches(arr1: string[], arr2: string[]): number {
  const set2 = new Set(arr2.map((t) => t.toLowerCase()));
  return arr1.filter((t) => set2.has(t.toLowerCase())).length;
}

/**
 * Calculate usage-based score for a memory file
 * Files that are referenced in successful features get higher scores
 */
export function calculateUsageScore(stats: UsageStats): number {
  if (stats.loaded === 0) return 1; // New file, neutral score

  const referenceRate = stats.referenced / stats.loaded;
  const successRate = stats.referenced > 0 ? stats.successfulFeatures / stats.referenced : 0;

  // Base 0.5 + up to 0.3 for reference rate + up to 0.2 for success rate
  return 0.5 + referenceRate * 0.3 + successRate * 0.2;
}

/**
 * Load relevant memory files for a feature
 *
 * Selects files based on:
 * - Tag matching with feature keywords (weight: 3)
 * - RelevantTo matching (weight: 2)
 * - Summary matching (weight: 1)
 * - Usage score (multiplier)
 * - Importance (multiplier)
 *
 * Always includes gotchas.md
 */
export async function loadRelevantMemory(
  projectPath: string,
  featureTitle: string,
  featureDescription: string,
  fsModule: MemoryFsModule
): Promise<MemoryLoadResult> {
  const memoryDir = getMemoryDir(projectPath);

  try {
    await fsModule.access(memoryDir);
  } catch {
    // Memory directory doesn't exist yet
    return { files: [], formattedPrompt: '' };
  }

  const allFiles = await fsModule.readdir(memoryDir);
  const featureTerms = extractTerms(featureTitle + ' ' + featureDescription);

  // Score each file
  const scored: Array<{ file: string; score: number; content: string; metadata: MemoryMetadata }> =
    [];

  for (const file of allFiles) {
    if (!file.endsWith('.md') || file === '_index.md') continue;

    const filePath = path.join(memoryDir, file);
    try {
      const content = (await fsModule.readFile(filePath, 'utf-8')) as string;
      const { metadata, body } = parseFrontmatter(content);

      // Calculate relevance score
      const tagScore = countMatches(metadata.tags, featureTerms) * 3;
      const relevantToScore = countMatches(metadata.relevantTo, featureTerms) * 2;
      const summaryTerms = extractTerms(metadata.summary);
      const summaryScore = countMatches(summaryTerms, featureTerms);

      // Usage-based scoring
      const usageScore = calculateUsageScore(metadata.usageStats);

      // Combined score
      const score = (tagScore + relevantToScore + summaryScore) * metadata.importance * usageScore;

      // Include if score > 0 or high importance
      if (score > 0 || metadata.importance >= 0.9) {
        scored.push({ file, score, content: body, metadata });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  // Sort by score, take top 5
  const topFiles = scored.sort((a, b) => b.score - a.score).slice(0, 5);

  // Always include gotchas.md if it exists
  const toLoad = new Set(['gotchas.md', ...topFiles.map((f) => f.file)]);

  const loaded: MemoryFile[] = [];
  for (const file of toLoad) {
    const existing = scored.find((s) => s.file === file);
    if (existing) {
      loaded.push({
        name: file,
        content: existing.content,
        metadata: existing.metadata,
      });
    } else if (file === 'gotchas.md') {
      // Try to load gotchas.md even if it wasn't scored
      const gotchasPath = path.join(memoryDir, 'gotchas.md');
      try {
        const content = (await fsModule.readFile(gotchasPath, 'utf-8')) as string;
        const { metadata, body } = parseFrontmatter(content);
        loaded.push({ name: file, content: body, metadata });
      } catch {
        // gotchas.md doesn't exist yet
      }
    }
  }

  // Build formatted prompt
  const formattedPrompt = buildMemoryPrompt(loaded);

  return { files: loaded, formattedPrompt };
}

/**
 * Build a formatted prompt from loaded memory files
 */
function buildMemoryPrompt(files: MemoryFile[]): string {
  if (files.length === 0) return '';

  const sections = files.map((file) => {
    return `## ${file.name.replace('.md', '').toUpperCase()}

${file.content}`;
  });

  return `# Project Memory

The following learnings and decisions from previous work are relevant to this task.
**IMPORTANT**: Review these carefully before making changes that could conflict with past decisions.

---

${sections.join('\n\n---\n\n')}

---
`;
}

/**
 * Increment a usage stat in a memory file
 * Uses file locking to prevent race conditions from concurrent updates
 */
export async function incrementUsageStat(
  filePath: string,
  stat: keyof UsageStats,
  fsModule: MemoryFsModule
): Promise<void> {
  await withFileLock(filePath, async () => {
    try {
      const content = (await fsModule.readFile(filePath, 'utf-8')) as string;
      const { metadata, body } = parseFrontmatter(content);

      metadata.usageStats[stat]++;

      // serializeFrontmatter ends with "---", add newline before body
      const newContent = serializeFrontmatter(metadata) + '\n' + body;
      await fsModule.writeFile(filePath, newContent);
    } catch {
      // File doesn't exist or can't be updated - that's fine
    }
  });
}

/**
 * Simple memory file reference for usage tracking
 */
export interface SimpleMemoryFile {
  name: string;
  content: string;
}

/**
 * Record memory usage after feature completion
 * Updates usage stats based on what was actually referenced
 */
export async function recordMemoryUsage(
  projectPath: string,
  loadedFiles: SimpleMemoryFile[],
  agentOutput: string,
  success: boolean,
  fsModule: MemoryFsModule
): Promise<void> {
  const memoryDir = getMemoryDir(projectPath);

  for (const file of loadedFiles) {
    const filePath = path.join(memoryDir, file.name);

    // Check if agent actually referenced this file's content
    // Simple heuristic: check if any significant terms from the file appear in output
    const fileTerms = extractTerms(file.content);
    const outputTerms = extractTerms(agentOutput);
    const wasReferenced = countMatches(fileTerms, outputTerms) >= 3;

    if (wasReferenced) {
      await incrementUsageStat(filePath, 'referenced', fsModule);
      if (success) {
        await incrementUsageStat(filePath, 'successfulFeatures', fsModule);
      }
    }
  }
}

/**
 * Format a learning entry for appending to a memory file
 * Uses ADR-style format for rich context
 */
export function formatLearning(learning: LearningEntry): string {
  const date = new Date().toISOString().split('T')[0];
  const lines: string[] = [];

  if (learning.type === 'decision') {
    lines.push(`\n### ${learning.content} (${date})`);
    if (learning.context) lines.push(`- **Context:** ${learning.context}`);
    if (learning.why) lines.push(`- **Why:** ${learning.why}`);
    if (learning.rejected) lines.push(`- **Rejected:** ${learning.rejected}`);
    if (learning.tradeoffs) lines.push(`- **Trade-offs:** ${learning.tradeoffs}`);
    if (learning.breaking) lines.push(`- **Breaking if changed:** ${learning.breaking}`);
    return lines.join('\n');
  }

  if (learning.type === 'gotcha') {
    lines.push(`\n#### [Gotcha] ${learning.content} (${date})`);
    if (learning.context) lines.push(`- **Situation:** ${learning.context}`);
    if (learning.why) lines.push(`- **Root cause:** ${learning.why}`);
    if (learning.tradeoffs) lines.push(`- **How to avoid:** ${learning.tradeoffs}`);
    return lines.join('\n');
  }

  // Pattern or learning
  const prefix = learning.type === 'pattern' ? '[Pattern]' : '[Learned]';
  lines.push(`\n#### ${prefix} ${learning.content} (${date})`);
  if (learning.context) lines.push(`- **Problem solved:** ${learning.context}`);
  if (learning.why) lines.push(`- **Why this works:** ${learning.why}`);
  if (learning.tradeoffs) lines.push(`- **Trade-offs:** ${learning.tradeoffs}`);
  return lines.join('\n');
}

/**
 * Append a learning to the appropriate category file
 * Creates the file with frontmatter if it doesn't exist
 * Uses file locking to prevent TOCTOU race conditions
 */
export async function appendLearning(
  projectPath: string,
  learning: LearningEntry,
  fsModule: MemoryFsModule
): Promise<void> {
  console.log(
    `[MemoryLoader] appendLearning called: category=${learning.category}, type=${learning.type}`
  );
  const memoryDir = getMemoryDir(projectPath);
  // Sanitize category name: lowercase, replace spaces with hyphens, remove special chars
  const sanitizedCategory = learning.category
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  const fileName = `${sanitizedCategory || 'general'}.md`;
  const filePath = path.join(memoryDir, fileName);

  // Use file locking to prevent race conditions when multiple processes
  // try to create the same file simultaneously
  await withFileLock(filePath, async () => {
    try {
      await fsModule.access(filePath);
      // File exists, append to it
      const formatted = formatLearning(learning);
      await fsModule.appendFile(filePath, '\n' + formatted);
      console.log(`[MemoryLoader] Appended learning to existing file: ${fileName}`);
    } catch {
      // File doesn't exist, create it with frontmatter
      console.log(`[MemoryLoader] Creating new memory file: ${fileName}`);
      const metadata: MemoryMetadata = {
        tags: [sanitizedCategory || 'general'],
        summary: `${learning.category} implementation decisions and patterns`,
        relevantTo: [sanitizedCategory || 'general'],
        importance: 0.7,
        relatedFiles: [],
        usageStats: { loaded: 0, referenced: 0, successfulFeatures: 0 },
      };

      const content =
        serializeFrontmatter(metadata) + `\n# ${learning.category}\n` + formatLearning(learning);

      await fsModule.writeFile(filePath, content);
    }
  });
}

/**
 * Initialize the memory folder for a project
 * Creates starter files if the folder doesn't exist
 */
export async function initializeMemoryFolder(
  projectPath: string,
  fsModule: MemoryFsModule
): Promise<void> {
  const memoryDir = getMemoryDir(projectPath);

  try {
    await fsModule.access(memoryDir);
    // Already exists
    return;
  } catch {
    // Create the directory
    await fsModule.mkdir(memoryDir, { recursive: true });

    // Create _index.md
    const indexMetadata: MemoryMetadata = {
      tags: ['index', 'overview'],
      summary: 'Overview of project memory categories',
      relevantTo: ['project', 'memory', 'overview'],
      importance: 0.5,
      relatedFiles: [],
      usageStats: { loaded: 0, referenced: 0, successfulFeatures: 0 },
    };

    const indexContent =
      serializeFrontmatter(indexMetadata) +
      `
# Project Memory Index

This folder contains agent learnings organized by category.
Categories are created automatically as agents work on features.

## How This Works

1. After each successful feature, learnings are extracted and categorized
2. Relevant memory files are loaded into agent context for future features
3. Usage statistics help prioritize which memories are most helpful

## Categories

- **gotchas.md** - Mistakes and edge cases to avoid
- Other categories are created automatically based on feature work
`;

    await fsModule.writeFile(path.join(memoryDir, '_index.md'), indexContent);

    // Create gotchas.md
    const gotchasMetadata: MemoryMetadata = {
      tags: ['gotcha', 'mistake', 'edge-case', 'bug', 'warning'],
      summary: 'Mistakes and edge cases to avoid',
      relevantTo: ['error', 'bug', 'fix', 'issue', 'problem'],
      importance: 0.9,
      relatedFiles: [],
      usageStats: { loaded: 0, referenced: 0, successfulFeatures: 0 },
    };

    const gotchasContent =
      serializeFrontmatter(gotchasMetadata) +
      `
# Gotchas

Mistakes and edge cases to avoid. These are lessons learned from past issues.

---

`;

    await fsModule.writeFile(path.join(memoryDir, 'gotchas.md'), gotchasContent);

    console.log(`[MemoryLoader] Initialized memory folder at ${memoryDir}`);
  }
}
