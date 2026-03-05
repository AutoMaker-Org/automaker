/**
 * Automation File Watcher Service
 *
 * Monitors automation files on disk for changes and syncs them to the running server.
 * Supports both global and project-scoped automations.
 */

import { EventEmitter } from 'events';
import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import { createLogger } from '@automaker/utils';
import type { AutomationSchedulerService } from './automation-scheduler-service.js';
import type { AutomationDefinitionStore } from './automation-runtime-engine.js';
import type { AutomationDefinition, AutomationScope } from '@automaker/types';
import { getGlobalAutomationsDir, getProjectAutomationsDir } from '@automaker/platform';

const logger = createLogger('AutomationFileWatcher');

const AUTOMATION_FILE_EXTENSION = '.json';
/** Time to wait for file write completion before processing (prevents partial file reads) */
const FILE_STABILITY_THRESHOLD_MS = 500;
/** Polling interval during file stability check */
const FILE_STABILITY_POLL_INTERVAL_MS = 100;

export interface AutomationFileWatcherOptions {
  /** The data directory for global automations */
  dataDir: string;
  /** The automation scheduler service for refreshing schedules */
  scheduler: AutomationSchedulerService;
  /** The automation definition store for loading/saving automations */
  store: AutomationDefinitionStore;
  /** Event emitter for broadcasting file change events */
  events?: EventEmitter;
}

export interface AutomationFileChangeEvent {
  /** Type of change that occurred */
  type: 'add' | 'change' | 'unlink';
  /** Automation ID (from filename without extension) */
  automationId: string;
  /** Scope of the automation was affected */
  scope: AutomationScope;
  /** Project path (if project-scoped) */
  projectPath?: string;
  /** Full path to the file that changed */
  filePath: string;
  /** The new/updated automation definition (if available) */
  automation?: AutomationDefinition;
  /** Error if parsing failed */
  error?: string;
}

/**
 * File watching service for automation definitions.
 *
 * Detects changes to automation JSON files on disk and syncs them to the running server.
 * When files are added, modified, or deleted, the scheduler is refreshed to update schedules.
 *
 * Usage:
 * ```typescript
 * const watcher = new AutomationFileWatcher(dataDir, scheduler, store, events);
 * watcher.start(); // Start watching
 * watcher.stop();  // Stop watching
 *
 * // Listen for events
 * events.on('automation:file-changed', (event) => {
 *   console.log('File change:', event);
 * });
 * ```
 */
export class AutomationFileWatcher {
  private watcher: FSWatcher | null = null;
  private readonly dataDir: string;
  private readonly scheduler: AutomationSchedulerService;
  private readonly store: AutomationDefinitionStore;
  private readonly events?: EventEmitter;
  private readonly watchedProjectDirs = new Map<string, string>();
  private globalDir: string;

  constructor(options: AutomationFileWatcherOptions) {
    this.dataDir = options.dataDir;
    this.scheduler = options.scheduler;
    this.store = options.store;
    this.events = options.events;
    this.globalDir = getGlobalAutomationsDir(this.dataDir);
  }

  /**
   * Start watching automation directories for file changes.
   * Creates watchers for both global and project automation directories.
   */
  start(): void {
    if (this.watcher) {
      logger.warn('File watcher already running');
      return;
    }

    try {
      // Watch global automations directory
      this.watcher = chokidar.watch(this.globalDir, {
        ignored: /(^|\.)\../, // Ignore dotfiles
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: FILE_STABILITY_THRESHOLD_MS,
          pollInterval: FILE_STABILITY_POLL_INTERVAL_MS,
        },
      });

      this.watcher
        .on('add', (filePath: string) =>
          this.handleFileEvent('add', 'global', this.globalDir, filePath)
        )
        .on('change', (filePath: string) =>
          this.handleFileEvent('change', 'global', this.globalDir, filePath)
        )
        .on('unlink', (filePath: string) =>
          this.handleFileEvent('unlink', 'global', this.globalDir, filePath)
        )
        .on('error', (error: unknown) => {
          logger.error('File watcher error:', error);
        });

      logger.info(`Started watching automation files in ${this.globalDir}`);

      this.events?.emit('automation:watcher:started', {
        globalDir: this.globalDir,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to start watching global automations directory:', error);
    }
  }

  /**
   * Stop watching automation directories.
   */
  stop(): void {
    if (!this.watcher) {
      logger.debug('File watcher not running');
      return;
    }

    this.watcher.close();
    this.watcher = null;
    this.watchedProjectDirs.clear();

    logger.info('Stopped watching automation files');
    this.events?.emit('automation:watcher:stopped', {
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Add a project directory to watch.
   * The watcher will automatically detect changes in that project's automations.
   */
  addProjectWatch(projectPath: string): void {
    if (!this.watcher) {
      logger.warn('File watcher not started, cannot add project watch');
      return;
    }

    if (this.watchedProjectDirs.has(projectPath)) {
      logger.debug(`Already watching project: ${projectPath}`);
      return;
    }

    const projectDir = getProjectAutomationsDir(projectPath);
    try {
      this.watcher.add(projectDir);
      this.watchedProjectDirs.set(projectPath, projectDir);
      logger.info(`Started watching automation files in ${projectDir} for project ${projectPath}`);

      this.events?.emit('automation:watcher:project-added', {
        projectPath,
        projectDir,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`Failed to start watching project directory ${projectPath}:`, error);
    }
  }

  /**
   * Remove a project directory from watching.
   */
  removeProjectWatch(projectPath: string): void {
    if (!this.watcher) {
      logger.debug('File watcher not running');
      return;
    }

    const projectDir = this.watchedProjectDirs.get(projectPath);
    if (!projectDir) {
      logger.debug(`Not watching project: ${projectPath}`);
      return;
    }

    this.watcher.unwatch(projectDir);
    this.watchedProjectDirs.delete(projectPath);

    logger.info(`Stopped watching automation files in ${projectDir} for project ${projectPath}`);
    this.events?.emit('automation:watcher:project-removed', {
      projectPath,
      projectDir,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle file system events (add/change/unlink)
   */
  private handleFileEvent(
    type: 'add' | 'change' | 'unlink',
    scope: AutomationScope,
    baseDir: string,
    filePath: string
  ): void {
    const fileName = path.basename(filePath);
    if (!fileName.endsWith(AUTOMATION_FILE_EXTENSION)) {
      return;
    }

    const automationId = fileName.slice(0, -AUTOMATION_FILE_EXTENSION.length);

    // Determine project path for project-scoped automations
    let projectPath: string | undefined;
    if (scope === 'project') {
      // Find the matching project path from watched dirs
      for (const [pp, dir] of this.watchedProjectDirs.entries()) {
        if (filePath.startsWith(dir)) {
          projectPath = pp;
          break;
        }
      }
    }

    const event: AutomationFileChangeEvent = {
      type,
      automationId,
      scope,
      projectPath,
      filePath,
    };

    if (type === 'unlink') {
      this.emitFileChangeEvent(event);
      // Refresh scheduler to remove any scheduled runs
      this.scheduler.refreshSchedules().catch((error) => {
        logger.warn('Failed to refresh schedules after file unlink:', error);
      });
      return;
    }

    // For add/change events, try to load the automation to validate it
    this.store
      .loadAutomationById(automationId, { scope, projectPath })
      .then((automation) => {
        if (automation) {
          event.automation = automation;
          this.emitFileChangeEvent(event);
          // Refresh scheduler to pick up any trigger changes
          this.scheduler.refreshSchedules().catch((error) => {
            logger.warn('Failed to refresh schedules after file change:', error);
          });
        } else {
          event.error = 'Failed to load automation definition';
          this.emitFileChangeEvent(event);
        }
      })
      .catch((error) => {
        event.error = error instanceof Error ? error.message : String(error);
        this.emitFileChangeEvent(event);
      });
  }

  /**
   * Emit file change event through both Node EventEmitter and custom events emitter
   */
  private emitFileChangeEvent(event: AutomationFileChangeEvent): void {
    logger.info(`Automation file ${event.type}: ${event.automationId} (scope: ${event.scope})`);
    this.events?.emit('automation:file-changed', event);
  }
}
