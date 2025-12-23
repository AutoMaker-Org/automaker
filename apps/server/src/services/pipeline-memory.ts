/**
 * Pipeline Memory Service
 *
 * Manages memory for pipeline steps to avoid repeating feedback
 * across iterations.
 */

import path from 'node:path';
import type { PipelineStepResult } from '@automaker/types';
import { secureFs } from '@automaker/platform';

interface StoredMemory {
  iterations: IterationData[];
  resolvedIssues: Set<string>;
}

interface IterationData {
  timestamp: string;
  issues: IssueInfo[];
  summary: string;
}

interface IssueInfo {
  hash: string;
  summary: string;
  location?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface StepFeedback {
  issues: Array<{
    hash: string;
    summary: string;
    location?: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  summary: string;
}

export interface IterationMemory {
  previousIssues: Array<{
    hash: string;
    summary: string;
    location?: string;
  }>;
  resolvedHashes: string[];
  iterationCount: number;
  avoidRepeating: boolean;
}

export class PipelineMemory {
  private memoryStore = new Map<string, StoredMemory>();
  private projectPath: string;
  private memoryPath: string;

  constructor(projectPath?: string) {
    this.projectPath = projectPath || '';
    this.memoryPath = projectPath
      ? path.join(projectPath, '.automaker', 'pipeline-memory.json')
      : '';
  }

  /**
   * Store feedback from a step iteration
   */
  async storeFeedback(stepId: string, featureId: string, feedback: StepFeedback): Promise<void> {
    const key = `${stepId}:${featureId}`;
    const existing = this.memoryStore.get(key) || {
      iterations: [],
      resolvedIssues: new Set(),
    };

    const iteration: IterationData = {
      timestamp: new Date().toISOString(),
      issues: feedback.issues,
      summary: feedback.summary,
    };

    existing.iterations.push(iteration);

    // Mark issues as resolved for next iteration
    feedback.issues.forEach((issue) => {
      existing.resolvedIssues.add(issue.hash);
    });

    this.memoryStore.set(key, existing);

    // Persist to disk if project path is available
    if (this.projectPath) {
      await this.persistToDisk();
    }
  }

  /**
   * Get memory for the next iteration
   */
  async getMemoryForNextIteration(
    stepId: string,
    featureId: string
  ): Promise<IterationMemory | null> {
    const key = `${stepId}:${featureId}`;
    const stored = this.memoryStore.get(key);

    if (!stored || stored.iterations.length === 0) {
      return null;
    }

    const lastIteration = stored.iterations[stored.iterations.length - 1];

    return {
      previousIssues: lastIteration.issues,
      resolvedHashes: Array.from(stored.resolvedIssues),
      iterationCount: stored.iterations.length,
      avoidRepeating: true,
    };
  }

  /**
   * Clear memory for a specific step
   */
  async clear(stepId: string, featureId: string): Promise<void> {
    const key = `${stepId}:${featureId}`;
    this.memoryStore.delete(key);

    if (this.projectPath) {
      await this.persistToDisk();
    }
  }

  /**
   * Clear all memory for a feature
   */
  async clearFeature(featureId: string): Promise<void> {
    const keysToDelete: string[] = [];

    for (const key of this.memoryStore.keys()) {
      if (key.endsWith(`:${featureId}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.memoryStore.delete(key));

    if (this.projectPath) {
      await this.persistToDisk();
    }
  }

  /**
   * Clear all old memories (older than specified days)
   */
  async clearOld(daysOld: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const keysToDelete: string[] = [];

    for (const [key, stored] of this.memoryStore.entries()) {
      const lastIteration = stored.iterations[stored.iterations.length - 1];
      if (lastIteration && new Date(lastIteration.timestamp) < cutoffDate) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.memoryStore.delete(key));

    if (this.projectPath) {
      await this.persistToDisk();
    }
  }

  /**
   * Export memory for debugging
   */
  async export(stepId?: string, featureId?: string): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    for (const [key, stored] of this.memoryStore.entries()) {
      const [sId, fId] = key.split(':');

      if (stepId && sId !== stepId) continue;
      if (featureId && fId !== featureId) continue;

      result[key] = {
        iterations: stored.iterations,
        resolvedIssues: Array.from(stored.resolvedIssues),
      };
    }

    return result;
  }

  /**
   * Import memory (for debugging or migration)
   */
  async import(data: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      const stored = value as StoredMemory;
      stored.resolvedIssues = new Set(stored.resolvedIssues);
      this.memoryStore.set(key, stored);
    }

    if (this.projectPath) {
      await this.persistToDisk();
    }
  }

  /**
   * Load memory from disk
   */
  async loadFromDisk(): Promise<void> {
    if (!this.projectPath || !this.memoryPath) {
      return;
    }

    try {
      // Check if file exists using access
      await secureFs.access(this.memoryPath);
    } catch {
      // File doesn't exist, nothing to load
      return;
    }

    try {
      const content = (await secureFs.readFile(this.memoryPath, 'utf-8')) as string;
      const data = JSON.parse(content);

      for (const [key, value] of Object.entries(data)) {
        const stored = value as any;
        if (stored.iterations && stored.resolvedIssues) {
          stored.resolvedIssues = new Set(stored.resolvedIssues);
          this.memoryStore.set(key, stored);
        }
      }
    } catch (error) {
      console.error('Failed to load pipeline memory:', error);
    }
  }

  /**
   * Persist memory to disk
   */
  private async persistToDisk(): Promise<void> {
    if (!this.projectPath) {
      return;
    }

    try {
      const data: Record<string, any> = {};

      for (const [key, stored] of this.memoryStore.entries()) {
        data[key] = {
          iterations: stored.iterations,
          resolvedIssues: Array.from(stored.resolvedIssues),
        };
      }

      // Ensure directory exists
      const dir = path.dirname(this.memoryPath);
      await secureFs.mkdir(dir, { recursive: true });

      // Write to temporary file first
      const tempPath = this.memoryPath + '.tmp';
      await secureFs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await secureFs.rename(tempPath, this.memoryPath);
    } catch (error) {
      console.error('Failed to persist pipeline memory:', error);
    }
  }

  /**
   * Get statistics about memory usage
   */
  getStats(): {
    totalMemories: number;
    totalIterations: number;
    totalIssues: number;
    oldestMemory?: string;
    newestMemory?: string;
  } {
    let totalIterations = 0;
    let totalIssues = 0;
    let oldestTimestamp: string | null = null;
    let newestTimestamp: string | null = null;

    for (const stored of this.memoryStore.values()) {
      totalIterations += stored.iterations.length;

      for (const iteration of stored.iterations) {
        totalIssues += iteration.issues.length;

        if (!oldestTimestamp || iteration.timestamp < oldestTimestamp) {
          oldestTimestamp = iteration.timestamp;
        }
        if (!newestTimestamp || iteration.timestamp > newestTimestamp) {
          newestTimestamp = iteration.timestamp;
        }
      }
    }

    return {
      totalMemories: this.memoryStore.size,
      totalIterations,
      totalIssues,
      oldestMemory: oldestTimestamp || undefined,
      newestMemory: newestTimestamp || undefined,
    };
  }
}
