/**
 * Beads Service
 *
 * Wraps the Beads CLI (bd) to provide programmatic access to Beads functionality.
 * Beads is a dependency-aware issue tracker that gives AI agents long-term task memory.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export class BeadsService {
  private watchTimeout?: NodeJS.Timeout;

  /**
   * Check if bd CLI is installed
   */
  async isBeadsInstalled(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('which bd');
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
      const { stdout } = await execAsync('bd --version');
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
      return { installed: true, initialized: true, version };
    } catch {
      return { installed: true, initialized: false, version };
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
      await execAsync('bd init --quiet', { cwd: projectPath });
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
      let command = 'bd list --json';

      // Apply filters
      if (filters?.status?.length) {
        command += ` --status ${filters.status.join(',')}`;
      }
      if (filters?.type?.length) {
        command += ` --type ${filters.type.join(',')}`;
      }
      if (filters?.labels?.length) {
        command += ` --label ${filters.labels.join(',')}`;
      }
      if (filters?.priorityMin !== undefined) {
        command += ` --priority-min ${filters.priorityMin}`;
      }
      if (filters?.priorityMax !== undefined) {
        command += ` --priority-max ${filters.priorityMax}`;
      }
      if (filters?.titleContains) {
        command += ` --title-contains "${filters.titleContains}"`;
      }
      if (filters?.descContains) {
        command += ` --desc-contains "${filters.descContains}"`;
      }
      if (filters?.ids?.length) {
        command += ` --id ${filters.ids.join(',')}`;
      }

      const { stdout } = await execAsync(command, { cwd: projectPath });
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
      const { stdout } = await execAsync(`bd show ${issueId} --json`, {
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
      let command = `bd create "${input.title}" --json`;

      if (input.description) {
        command += ` --description "${input.description}"`;
      }
      if (input.type) {
        command += ` --type ${input.type}`;
      }
      if (input.priority !== undefined) {
        command += ` --priority ${input.priority}`;
      }
      if (input.labels?.length) {
        command += ` --labels ${input.labels.join(',')}`;
      }

      const { stdout } = await execAsync(command, { cwd: projectPath });
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
      let command = `bd update ${issueId} --json`;

      if (updates.title) {
        command += ` --title "${updates.title}"`;
      }
      if (updates.description) {
        command += ` --description "${updates.description}"`;
      }
      if (updates.status) {
        command += ` --status ${updates.status}`;
      }
      if (updates.type) {
        command += ` --type ${updates.type}`;
      }
      if (updates.priority !== undefined) {
        command += ` --priority ${updates.priority}`;
      }
      if (updates.labels) {
        command += ` --labels ${updates.labels.join(',')}`;
      }

      const { stdout } = await execAsync(command, { cwd: projectPath });
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
      const command = force ? `bd delete ${issueId} --force` : `bd delete ${issueId}`;
      await execAsync(command, { cwd: projectPath });
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
      const command = `bd dep add ${issueId} ${depId} --type ${type}`;
      await execAsync(command, { cwd: projectPath });
    } catch (error) {
      throw new Error(`Failed to add dependency: ${error}`);
    }
  }

  /**
   * Remove a dependency between two issues
   */
  async removeDependency(projectPath: string, issueId: string, depId: string): Promise<void> {
    try {
      const command = `bd dep remove ${issueId} ${depId}`;
      await execAsync(command, { cwd: projectPath });
    } catch (error) {
      throw new Error(`Failed to remove dependency: ${error}`);
    }
  }

  /**
   * Get ready work (issues with no open blockers)
   */
  async getReadyWork(projectPath: string, limit?: number): Promise<any[]> {
    try {
      let command = 'bd ready --json';
      if (limit) {
        command += ` --limit ${limit}`;
      }
      const { stdout } = await execAsync(command, { cwd: projectPath });
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
      const { stdout } = await execAsync('bd stats --json', { cwd: projectPath });
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
      await execAsync('bd sync', { cwd: projectPath });
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
      const watcher = fs.watch(dbPath, () => {
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
