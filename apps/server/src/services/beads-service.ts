/**
 * Beads Service
 *
 * Wraps the Beads CLI (bd) to provide programmatic access to Beads functionality.
 * Beads is a dependency-aware issue tracker that gives AI agents long-term task memory.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import fsCallback from 'fs';

const execFileAsync = promisify(execFile);

export class BeadsService {
  private watchTimeout?: NodeJS.Timeout;

  /**
   * Check if bd CLI is installed
   */
  async isBeadsInstalled(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('which', ['bd']);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get bd CLI version
   */
  async getBeadsVersion(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('bd', ['--version']);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Validate Beads in a project
   */
  async validateBeadsInProject(projectPath: string): Promise<{
    installed: boolean;
    initialized: boolean;
    version?: string;
    error?: string;
  }> {
    const installed = await this.isBeadsInstalled();
    if (!installed) {
      return { installed: false, initialized: false, error: 'bd CLI not installed' };
    }

    const version = await this.getBeadsVersion();
    const dbPath = this.getDatabasePath(projectPath);

    try {
      await fs.access(dbPath);
      return { installed: true, initialized: true, version: version ?? undefined };
    } catch {
      return { installed: true, initialized: false, version: version ?? undefined };
    }
  }

  /**
   * Initialize Beads in a project
   */
  async initializeBeads(projectPath: string): Promise<void> {
    const beadsDir = path.join(projectPath, '.beads');

    try {
      await fs.access(beadsDir);
      // Already initialized
      return;
    } catch {
      // Not initialized, run bd init
      await execFileAsync('bd', ['init', '--quiet'], { cwd: projectPath });
    }
  }

  /**
   * Get the database path for a project
   */
  getDatabasePath(projectPath: string): string {
    return path.join(projectPath, '.beads/beads.db');
  }

  /**
   * List all issues in a project
   */
  async listIssues(
    projectPath: string,
    filters?: {
      status?: string[];
      type?: string[];
      labels?: string[];
      priorityMin?: number;
      priorityMax?: number;
      titleContains?: string;
      descContains?: string;
      ids?: string[];
    }
  ): Promise<any[]> {
    try {
      const args = ['list', '--json'];

      // Apply filters
      if (filters?.status?.length) {
        args.push('--status', filters.status.join(','));
      }
      if (filters?.type?.length) {
        args.push('--type', filters.type.join(','));
      }
      if (filters?.labels?.length) {
        args.push('--label', filters.labels.join(','));
      }
      if (filters?.priorityMin !== undefined) {
        args.push('--priority-min', String(filters.priorityMin));
      }
      if (filters?.priorityMax !== undefined) {
        args.push('--priority-max', String(filters.priorityMax));
      }
      if (filters?.titleContains) {
        args.push('--title-contains', filters.titleContains);
      }
      if (filters?.descContains) {
        args.push('--desc-contains', filters.descContains);
      }
      if (filters?.ids?.length) {
        args.push('--id', filters.ids.join(','));
      }

      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issues = JSON.parse(stdout);
      return issues;
    } catch (error) {
      // If beads not initialized, return empty array
      if (this.isNotInitializedError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a single issue by ID
   */
  async getIssue(projectPath: string, issueId: string): Promise<any> {
    try {
      const { stdout } = await execFileAsync('bd', ['show', issueId, '--json'], {
        cwd: projectPath,
      });
      const issue = JSON.parse(stdout);
      return issue;
    } catch (error) {
      throw new Error(`Failed to get issue ${issueId}: ${error}`);
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(
    projectPath: string,
    input: {
      title: string;
      description?: string;
      type?: string;
      priority?: number;
      labels?: string[];
    }
  ): Promise<any> {
    try {
      const args = ['create', input.title, '--json'];

      if (input.description) {
        args.push('--description', input.description);
      }
      if (input.type) {
        args.push('--type', input.type);
      }
      if (input.priority !== undefined) {
        args.push('--priority', String(input.priority));
      }
      if (input.labels?.length) {
        args.push('--labels', input.labels.join(','));
      }

      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issue = JSON.parse(stdout);
      return issue;
    } catch (error) {
      throw new Error(`Failed to create issue: ${error}`);
    }
  }

  /**
   * Update an existing issue
   */
  async updateIssue(
    projectPath: string,
    issueId: string,
    updates: {
      title?: string;
      description?: string;
      status?: string;
      type?: string;
      priority?: number;
      labels?: string[];
    }
  ): Promise<any> {
    try {
      const args = ['update', issueId, '--json'];

      if (updates.title) {
        args.push('--title', updates.title);
      }
      if (updates.description) {
        args.push('--description', updates.description);
      }
      if (updates.status) {
        args.push('--status', updates.status);
      }
      if (updates.type) {
        args.push('--type', updates.type);
      }
      if (updates.priority !== undefined) {
        args.push('--priority', String(updates.priority));
      }
      if (updates.labels) {
        args.push('--labels', updates.labels.join(','));
      }

      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issue = JSON.parse(stdout);
      return issue;
    } catch (error) {
      throw new Error(`Failed to update issue ${issueId}: ${error}`);
    }
  }

  /**
   * Delete an issue
   */
  async deleteIssue(projectPath: string, issueId: string, force = false): Promise<void> {
    try {
      const args = ['delete', issueId];
      if (force) {
        args.push('--force');
      }
      await execFileAsync('bd', args, { cwd: projectPath });
    } catch (error) {
      throw new Error(`Failed to delete issue ${issueId}: ${error}`);
    }
  }

  /**
   * Add a dependency between two issues
   */
  async addDependency(
    projectPath: string,
    issueId: string,
    depId: string,
    type: 'blocks' | 'related' | 'parent' | 'discovered-from'
  ): Promise<void> {
    try {
      const args = ['dep', 'add', issueId, depId, '--type', type];
      await execFileAsync('bd', args, { cwd: projectPath });
    } catch (error) {
      throw new Error(`Failed to add dependency: ${error}`);
    }
  }

  /**
   * Remove a dependency between two issues
   */
  async removeDependency(projectPath: string, issueId: string, depId: string): Promise<void> {
    try {
      const args = ['dep', 'remove', issueId, depId];
      await execFileAsync('bd', args, { cwd: projectPath });
    } catch (error) {
      throw new Error(`Failed to remove dependency: ${error}`);
    }
  }

  /**
   * Get ready work (issues with no open blockers)
   */
  async getReadyWork(projectPath: string, limit?: number): Promise<any[]> {
    try {
      const args = ['ready', '--json'];
      if (limit) {
        args.push('--limit', String(limit));
      }
      const { stdout } = await execFileAsync('bd', args, { cwd: projectPath });
      const issues = JSON.parse(stdout);
      return issues;
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get statistics about the database
   */
  async getStats(projectPath: string): Promise<any> {
    try {
      const { stdout } = await execFileAsync('bd', ['stats', '--json'], { cwd: projectPath });
      const stats = JSON.parse(stdout);
      return stats;
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return {
          totalIssues: 0,
          openIssues: 0,
          inProgressIssues: 0,
          closedIssues: 0,
        };
      }
      throw error;
    }
  }

  /**
   * Sync the database (flush changes to JSONL)
   */
  async sync(projectPath: string): Promise<void> {
    try {
      await execFileAsync('bd', ['sync'], { cwd: projectPath });
    } catch (error) {
      throw new Error(`Failed to sync database: ${error}`);
    }
  }

  /**
   * Watch the database for changes
   */
  async watchDatabase(projectPath: string, callback: () => void): Promise<() => void> {
    const dbPath = this.getDatabasePath(projectPath);

    try {
      const watcher = fsCallback.watch(dbPath, () => {
        // Debounce rapid changes
        if (this.watchTimeout) {
          clearTimeout(this.watchTimeout);
        }
        this.watchTimeout = setTimeout(() => {
          callback();
        }, 500);
      });

      // Return cleanup function
      return () => {
        watcher.close();
        if (this.watchTimeout) {
          clearTimeout(this.watchTimeout);
        }
      };
    } catch (error) {
      // If watching fails (e.g., database doesn't exist), return no-op cleanup
      return () => {};
    }
  }

  /**
   * Check if error is due to beads not being initialized
   */
  private isNotInitializedError(error: any): boolean {
    const errorMsg = error?.message || error?.toString() || '';
    return (
      errorMsg.includes('no such file') ||
      errorMsg.includes('database not found') ||
      errorMsg.includes('not initialized')
    );
  }
}
