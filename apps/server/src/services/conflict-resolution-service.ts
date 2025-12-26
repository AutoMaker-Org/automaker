/**
 * Conflict Resolution Service - AI-assisted merge conflict resolution
 *
 * Uses a layered approach:
 * 1. Deterministic auto-resolution for common patterns
 * 2. AI resolution for ambiguous conflicts (minimal context approach)
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface ConflictInfo {
  filePath: string;
  fullPath: string;
  ours: string;
  theirs: string;
  base?: string;
  resolved: boolean;
  resolution?: string;
  strategy?: 'auto' | 'ai' | 'manual';
}

export interface ConflictResolutionResult {
  success: boolean;
  conflicts: ConflictInfo[];
  allResolved: boolean;
  error?: string;
}

interface ConflictRegion {
  startLine: number;
  endLine: number;
  ours: string;
  theirs: string;
  base?: string;
}

/**
 * Service for resolving git merge conflicts with AI assistance
 */
export class ConflictResolutionService {
  /**
   * Detect and resolve merge conflicts in the given directory
   */
  async resolveConflicts(
    projectPath: string,
    featureDescription: string
  ): Promise<ConflictResolutionResult> {
    try {
      // Get list of conflicting files
      const conflictingFiles = await this.getConflictingFiles(projectPath);

      if (conflictingFiles.length === 0) {
        return {
          success: true,
          conflicts: [],
          allResolved: true,
        };
      }

      console.log(`[ConflictResolution] Found ${conflictingFiles.length} conflicting files`);

      const conflicts: ConflictInfo[] = [];

      for (const filePath of conflictingFiles) {
        const fullPath = path.join(projectPath, filePath);
        const conflict = await this.parseConflictFile(fullPath, filePath);

        if (conflict) {
          // Try auto-resolution first
          const autoResolved = await this.tryAutoResolve(conflict);

          if (autoResolved) {
            conflict.resolved = true;
            conflict.strategy = 'auto';
            console.log(`[ConflictResolution] Auto-resolved: ${filePath}`);
          } else {
            // Try AI resolution
            const aiResolved = await this.tryAIResolve(conflict, featureDescription);

            if (aiResolved) {
              conflict.resolved = true;
              conflict.strategy = 'ai';
              console.log(`[ConflictResolution] AI-resolved: ${filePath}`);
            } else {
              console.log(`[ConflictResolution] Could not resolve: ${filePath}`);
            }
          }

          // If resolved, write the file and stage it
          if (conflict.resolved && conflict.resolution) {
            await fs.writeFile(fullPath, conflict.resolution, 'utf-8');
            await execAsync(`git add "${filePath}"`, { cwd: projectPath });
          }

          conflicts.push(conflict);
        }
      }

      const allResolved = conflicts.every((c) => c.resolved);

      return {
        success: true,
        conflicts,
        allResolved,
      };
    } catch (error) {
      console.error('[ConflictResolution] Error:', error);
      return {
        success: false,
        conflicts: [],
        allResolved: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get list of files with merge conflicts
   */
  private async getConflictingFiles(projectPath: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git diff --name-only --diff-filter=U', {
        cwd: projectPath,
      });
      return stdout
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Parse a file with conflict markers and extract conflict regions
   */
  private async parseConflictFile(
    fullPath: string,
    relativePath: string
  ): Promise<ConflictInfo | null> {
    try {
      const content = await fs.readFile(fullPath, 'utf-8');

      // Check if file has conflict markers
      if (!content.includes('<<<<<<<') || !content.includes('>>>>>>>')) {
        return null;
      }

      // Extract ours and theirs from the conflict
      const regions = this.extractConflictRegions(content);

      if (regions.length === 0) {
        return null;
      }

      // Combine all conflict regions
      const ours = regions.map((r) => r.ours).join('\n---\n');
      const theirs = regions.map((r) => r.theirs).join('\n---\n');

      return {
        filePath: relativePath,
        fullPath,
        ours,
        theirs,
        resolved: false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract conflict regions from file content
   */
  private extractConflictRegions(content: string): ConflictRegion[] {
    const regions: ConflictRegion[] = [];
    const lines = content.split('\n');

    let i = 0;
    while (i < lines.length) {
      if (lines[i].startsWith('<<<<<<<')) {
        const startLine = i;
        let ours = '';
        let theirs = '';
        let base = '';
        let inOurs = true;
        let inBase = false;

        i++;
        while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
          if (lines[i].startsWith('|||||||')) {
            inOurs = false;
            inBase = true;
          } else if (lines[i].startsWith('=======')) {
            inOurs = false;
            inBase = false;
          } else if (inOurs) {
            ours += lines[i] + '\n';
          } else if (inBase) {
            base += lines[i] + '\n';
          } else {
            theirs += lines[i] + '\n';
          }
          i++;
        }

        regions.push({
          startLine,
          endLine: i,
          ours: ours.trim(),
          theirs: theirs.trim(),
          base: base.trim() || undefined,
        });
      }
      i++;
    }

    return regions;
  }

  /**
   * Try deterministic auto-resolution for common patterns
   */
  private async tryAutoResolve(conflict: ConflictInfo): Promise<boolean> {
    const { filePath, ours, theirs } = conflict;
    const filename = path.basename(filePath);

    // Pattern 1: Version file conflicts - accept theirs (newer version)
    if (filename === 'package.json' && this.isVersionOnlyConflict(ours, theirs)) {
      conflict.resolution = await this.resolveAcceptTheirs(conflict);
      return true;
    }

    // Pattern 2: Lock files - accept ours (regenerate later)
    if (
      filename === 'package-lock.json' ||
      filename === 'pnpm-lock.yaml' ||
      filename === 'yarn.lock'
    ) {
      conflict.resolution = await this.resolveAcceptOurs(conflict);
      return true;
    }

    // Pattern 3: Generated files - accept ours
    if (
      filePath.includes('/dist/') ||
      filePath.includes('/build/') ||
      filePath.endsWith('.min.js')
    ) {
      conflict.resolution = await this.resolveAcceptOurs(conflict);
      return true;
    }

    // Pattern 4: Whitespace-only conflicts - accept either
    if (this.isWhitespaceOnlyConflict(ours, theirs)) {
      conflict.resolution = await this.resolveAcceptTheirs(conflict);
      return true;
    }

    // Pattern 5: Import statements - try to merge unique lines
    if (this.isImportOnlyConflict(ours, theirs)) {
      const merged = this.mergeImports(ours, theirs);
      if (merged) {
        conflict.resolution = await this.replaceConflictRegions(conflict, merged);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if conflict is only about version numbers
   */
  private isVersionOnlyConflict(ours: string, theirs: string): boolean {
    const versionRegex = /"version"\s*:\s*"[^"]+"/;
    const oursClean = ours.replace(versionRegex, '');
    const theirsClean = theirs.replace(versionRegex, '');
    return oursClean.trim() === theirsClean.trim();
  }

  /**
   * Check if conflict is whitespace-only
   */
  private isWhitespaceOnlyConflict(ours: string, theirs: string): boolean {
    return ours.replace(/\s/g, '') === theirs.replace(/\s/g, '');
  }

  /**
   * Check if conflict is only in import statements
   */
  private isImportOnlyConflict(ours: string, theirs: string): boolean {
    const importRegex = /^(import\s+.*|from\s+['"].*['"]|require\s*\(.*\))$/gm;
    const oursIsImport = ours
      .split('\n')
      .every((line) => !line.trim() || importRegex.test(line.trim()));
    const theirsIsImport = theirs
      .split('\n')
      .every((line) => !line.trim() || importRegex.test(line.trim()));
    return oursIsImport && theirsIsImport;
  }

  /**
   * Merge import statements from both sides
   */
  private mergeImports(ours: string, theirs: string): string | null {
    const oursLines = ours.split('\n').filter((l) => l.trim());
    const theirsLines = theirs.split('\n').filter((l) => l.trim());

    // Combine unique imports
    const uniqueImports = new Set([...oursLines, ...theirsLines]);
    return Array.from(uniqueImports).join('\n');
  }

  /**
   * Resolve by accepting "ours" (current branch)
   */
  private async resolveAcceptOurs(conflict: ConflictInfo): Promise<string> {
    const content = await fs.readFile(conflict.fullPath, 'utf-8');
    return this.removeConflictMarkers(content, 'ours');
  }

  /**
   * Resolve by accepting "theirs" (incoming branch)
   */
  private async resolveAcceptTheirs(conflict: ConflictInfo): Promise<string> {
    const content = await fs.readFile(conflict.fullPath, 'utf-8');
    return this.removeConflictMarkers(content, 'theirs');
  }

  /**
   * Replace conflict regions with resolved content
   */
  private async replaceConflictRegions(conflict: ConflictInfo, resolved: string): Promise<string> {
    const content = await fs.readFile(conflict.fullPath, 'utf-8');
    // Replace the entire conflict block with resolved content
    const conflictPattern = /<<<<<<< .*\n[\s\S]*?>>>>>>> .*/g;
    return content.replace(conflictPattern, resolved);
  }

  /**
   * Remove conflict markers, keeping either "ours" or "theirs"
   */
  private removeConflictMarkers(content: string, keep: 'ours' | 'theirs'): string {
    const lines = content.split('\n');
    const result: string[] = [];

    let inConflict = false;
    let keepCurrent = keep === 'ours';
    let inBase = false;

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        inConflict = true;
        keepCurrent = keep === 'ours';
        continue;
      }
      if (line.startsWith('|||||||')) {
        inBase = true;
        continue;
      }
      if (line.startsWith('=======')) {
        inBase = false;
        keepCurrent = keep === 'theirs';
        continue;
      }
      if (line.startsWith('>>>>>>>')) {
        inConflict = false;
        continue;
      }

      if (!inConflict || (keepCurrent && !inBase)) {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Try AI resolution for ambiguous conflicts
   */
  private async tryAIResolve(conflict: ConflictInfo, featureDescription: string): Promise<boolean> {
    try {
      const content = await fs.readFile(conflict.fullPath, 'utf-8');

      // Build minimal context prompt
      const prompt = this.buildAIPrompt(conflict, featureDescription, content);

      // Call Claude with no tools for simple text completion
      const resolved = await this.callClaudeForResolution(prompt);

      if (resolved && this.isValidResolution(resolved, conflict)) {
        conflict.resolution = resolved;
        return true;
      }

      return false;
    } catch (error) {
      console.error('[ConflictResolution] AI resolution error:', error);
      return false;
    }
  }

  /**
   * Build minimal context prompt for AI resolution
   */
  private buildAIPrompt(
    conflict: ConflictInfo,
    featureDescription: string,
    fullContent: string
  ): string {
    // Extract just the conflict region with some context
    const lines = fullContent.split('\n');
    let conflictStart = -1;
    let conflictEnd = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('<<<<<<<') && conflictStart === -1) {
        conflictStart = Math.max(0, i - 5); // 5 lines context before
      }
      if (lines[i].startsWith('>>>>>>>')) {
        conflictEnd = Math.min(lines.length, i + 6); // 5 lines context after
      }
    }

    const contextRegion =
      conflictStart >= 0 && conflictEnd >= 0
        ? lines.slice(conflictStart, conflictEnd).join('\n')
        : fullContent.substring(0, 2000); // Fallback to first 2000 chars

    return `You are resolving a git merge conflict. Your task is to produce the correct merged code.

## Context
File: ${conflict.filePath}
Feature being merged: ${featureDescription}

## Code with Conflict
\`\`\`
${contextRegion}
\`\`\`

## Instructions
1. Analyze both versions (between <<<<<<< and =======, and between ======= and >>>>>>>)
2. Merge them intelligently:
   - Keep both changes if they're compatible
   - Preserve the intent of both versions
   - Ensure the result is syntactically correct
3. Return ONLY the resolved code for this section (no conflict markers, no explanations)
4. The code should be ready to use as-is

## Resolved Code:`;
  }

  /**
   * Call Claude for conflict resolution (minimal context, no tools)
   */
  private async callClaudeForResolution(prompt: string): Promise<string | null> {
    try {
      const options: Options = {
        model: 'claude-sonnet-4-20250514', // Use Sonnet for speed
        systemPrompt:
          'You are a code merge assistant. Output ONLY the resolved code, nothing else. No explanations, no markdown code blocks, just the pure resolved code.',
        maxTurns: 1,
        allowedTools: [], // No tools needed, just text generation
        permissionMode: 'default',
      };

      let result = '';

      const stream = query({ prompt, options });

      for await (const msg of stream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              result += block.text;
            }
          }
        }
      }

      // Clean up the result (remove any markdown code blocks if present)
      result = result
        .replace(/^```[\w]*\n?/gm, '')
        .replace(/\n?```$/gm, '')
        .trim();

      return result || null;
    } catch (error) {
      console.error('[ConflictResolution] Claude API error:', error);
      return null;
    }
  }

  /**
   * Validate that the resolution is reasonable
   */
  private isValidResolution(resolved: string, conflict: ConflictInfo): boolean {
    // Basic validation
    if (!resolved || resolved.length < 1) {
      return false;
    }

    // Should not contain conflict markers
    if (
      resolved.includes('<<<<<<<') ||
      resolved.includes('>>>>>>>') ||
      resolved.includes('=======')
    ) {
      return false;
    }

    // Should have some content from either version (not completely different)
    const oursWords = new Set(conflict.ours.split(/\s+/));
    const theirsWords = new Set(conflict.theirs.split(/\s+/));
    const resolvedWords = resolved.split(/\s+/);

    const matchingWords = resolvedWords.filter((w) => oursWords.has(w) || theirsWords.has(w));
    const overlapRatio = matchingWords.length / resolvedWords.length;

    // At least 30% of words should match original content
    return overlapRatio >= 0.3;
  }
}
