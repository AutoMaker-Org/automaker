/**
 * RecoveryService - Crash recovery and feature resumption
 */

import path from 'path';
import type { Feature, FeatureStatusWithPipeline } from '@automaker/types';
import { DEFAULT_MAX_CONCURRENCY } from '@automaker/types';
import {
  createLogger,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
} from '@automaker/utils';
import {
  getFeatureDir,
  getFeaturesDir,
  getExecutionStatePath,
  ensureAutomakerDir,
} from '@automaker/platform';
import * as secureFs from '../lib/secure-fs.js';
import { getPromptCustomization } from '../lib/settings-helpers.js';
import type { TypedEventBus } from './typed-event-bus.js';
import type { ConcurrencyManager, RunningFeature } from './concurrency-manager.js';
import type { SettingsService } from './settings-service.js';
import type { PipelineStatusInfo } from './pipeline-orchestrator.js';

const logger = createLogger('RecoveryService');

export interface ExecutionState {
  version: 1;
  autoLoopWasRunning: boolean;
  maxConcurrency: number;
  projectPath: string;
  branchName: string | null;
  runningFeatureIds: string[];
  savedAt: string;
}

export const DEFAULT_EXECUTION_STATE: ExecutionState = {
  version: 1,
  autoLoopWasRunning: false,
  maxConcurrency: DEFAULT_MAX_CONCURRENCY,
  projectPath: '',
  branchName: null,
  runningFeatureIds: [],
  savedAt: '',
};

export type ExecuteFeatureFn = (
  projectPath: string,
  featureId: string,
  useWorktrees: boolean,
  isAutoMode: boolean,
  providedWorktreePath?: string,
  options?: { continuationPrompt?: string; _calledInternally?: boolean }
) => Promise<void>;
export type LoadFeatureFn = (projectPath: string, featureId: string) => Promise<Feature | null>;
export type DetectPipelineStatusFn = (
  projectPath: string,
  featureId: string,
  status: FeatureStatusWithPipeline
) => Promise<PipelineStatusInfo>;
export type ResumePipelineFn = (
  projectPath: string,
  feature: Feature,
  useWorktrees: boolean,
  pipelineInfo: PipelineStatusInfo
) => Promise<void>;
export type IsFeatureRunningFn = (featureId: string) => boolean;
export type AcquireRunningFeatureFn = (options: {
  featureId: string;
  projectPath: string;
  isAutoMode: boolean;
  allowReuse?: boolean;
}) => RunningFeature;
export type ReleaseRunningFeatureFn = (featureId: string) => void;

export class RecoveryService {
  constructor(
    private eventBus: TypedEventBus,
    private concurrencyManager: ConcurrencyManager,
    private settingsService: SettingsService | null,
    private executeFeatureFn: ExecuteFeatureFn,
    private loadFeatureFn: LoadFeatureFn,
    private detectPipelineStatusFn: DetectPipelineStatusFn,
    private resumePipelineFn: ResumePipelineFn,
    private isFeatureRunningFn: IsFeatureRunningFn,
    private acquireRunningFeatureFn: AcquireRunningFeatureFn,
    private releaseRunningFeatureFn: ReleaseRunningFeatureFn
  ) {}

  async saveExecutionStateForProject(
    projectPath: string,
    branchName: string | null,
    maxConcurrency: number
  ): Promise<void> {
    try {
      await ensureAutomakerDir(projectPath);
      const runningFeatureIds = this.concurrencyManager
        .getAllRunning()
        .filter((f) => f.projectPath === projectPath)
        .map((f) => f.featureId);
      const state: ExecutionState = {
        version: 1,
        autoLoopWasRunning: true,
        maxConcurrency,
        projectPath,
        branchName,
        runningFeatureIds,
        savedAt: new Date().toISOString(),
      };
      await secureFs.writeFile(
        getExecutionStatePath(projectPath),
        JSON.stringify(state, null, 2),
        'utf-8'
      );
    } catch {
      /* ignore */
    }
  }

  async saveExecutionState(
    projectPath: string,
    autoLoopWasRunning = false,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY
  ): Promise<void> {
    try {
      await ensureAutomakerDir(projectPath);
      const state: ExecutionState = {
        version: 1,
        autoLoopWasRunning,
        maxConcurrency,
        projectPath,
        branchName: null,
        runningFeatureIds: this.concurrencyManager.getAllRunning().map((rf) => rf.featureId),
        savedAt: new Date().toISOString(),
      };
      await secureFs.writeFile(
        getExecutionStatePath(projectPath),
        JSON.stringify(state, null, 2),
        'utf-8'
      );
    } catch {
      /* ignore */
    }
  }

  async loadExecutionState(projectPath: string): Promise<ExecutionState> {
    try {
      const content = (await secureFs.readFile(
        getExecutionStatePath(projectPath),
        'utf-8'
      )) as string;
      return JSON.parse(content) as ExecutionState;
    } catch {
      return DEFAULT_EXECUTION_STATE;
    }
  }

  async clearExecutionState(projectPath: string, _branchName: string | null = null): Promise<void> {
    try {
      await secureFs.unlink(getExecutionStatePath(projectPath));
    } catch {
      /* ignore */
    }
  }

  async contextExists(projectPath: string, featureId: string): Promise<boolean> {
    try {
      await secureFs.access(path.join(getFeatureDir(projectPath, featureId), 'agent-output.md'));
      return true;
    } catch {
      return false;
    }
  }

  private async executeFeatureWithContext(
    projectPath: string,
    featureId: string,
    context: string,
    useWorktrees: boolean
  ): Promise<void> {
    const feature = await this.loadFeatureFn(projectPath, featureId);
    if (!feature) throw new Error(`Feature ${featureId} not found`);
    const prompts = await getPromptCustomization(this.settingsService, '[RecoveryService]');
    const featurePrompt = `## Feature Implementation Task\n\n**Feature ID:** ${feature.id}\n**Title:** ${feature.title || 'Untitled Feature'}\n**Description:** ${feature.description}\n`;
    let prompt = prompts.taskExecution.resumeFeatureTemplate;
    prompt = prompt
      .replace(/\{\{featurePrompt\}\}/g, featurePrompt)
      .replace(/\{\{previousContext\}\}/g, context);
    return this.executeFeatureFn(projectPath, featureId, useWorktrees, false, undefined, {
      continuationPrompt: prompt,
      _calledInternally: true,
    });
  }

  async resumeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = false,
    _calledInternally = false
  ): Promise<void> {
    if (!_calledInternally && this.isFeatureRunningFn(featureId)) return;
    this.acquireRunningFeatureFn({
      featureId,
      projectPath,
      isAutoMode: false,
      allowReuse: _calledInternally,
    });
    try {
      const feature = await this.loadFeatureFn(projectPath, featureId);
      if (!feature) throw new Error(`Feature ${featureId} not found`);
      const pipelineInfo = await this.detectPipelineStatusFn(
        projectPath,
        featureId,
        (feature.status || '') as FeatureStatusWithPipeline
      );
      if (pipelineInfo.isPipeline)
        return await this.resumePipelineFn(projectPath, feature, useWorktrees, pipelineInfo);
      const hasContext = await this.contextExists(projectPath, featureId);
      if (hasContext) {
        const context = (await secureFs.readFile(
          path.join(getFeatureDir(projectPath, featureId), 'agent-output.md'),
          'utf-8'
        )) as string;
        this.eventBus.emitAutoModeEvent('auto_mode_feature_resuming', {
          featureId,
          featureName: feature.title,
          projectPath,
          hasContext: true,
          message: `Resuming feature "${feature.title}" from saved context`,
        });
        return await this.executeFeatureWithContext(projectPath, featureId, context, useWorktrees);
      }
      this.eventBus.emitAutoModeEvent('auto_mode_feature_resuming', {
        featureId,
        featureName: feature.title,
        projectPath,
        hasContext: false,
        message: `Starting fresh execution for interrupted feature "${feature.title}"`,
      });
      return await this.executeFeatureFn(projectPath, featureId, useWorktrees, false, undefined, {
        _calledInternally: true,
      });
    } finally {
      this.releaseRunningFeatureFn(featureId);
    }
  }

  async resumeInterruptedFeatures(projectPath: string): Promise<void> {
    const featuresDir = getFeaturesDir(projectPath);
    try {
      const entries = await secureFs.readdir(featuresDir, { withFileTypes: true });
      const featuresWithContext: Feature[] = [];
      const featuresWithoutContext: Feature[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const result = await readJsonWithRecovery<Feature | null>(
            path.join(featuresDir, entry.name, 'feature.json'),
            null,
            { maxBackups: DEFAULT_BACKUP_COUNT, autoRestore: true }
          );
          logRecoveryWarning(result, `Feature ${entry.name}`, logger);
          const feature = result.data;
          if (!feature) continue;
          if (
            feature.status === 'in_progress' ||
            (feature.status && feature.status.startsWith('pipeline_'))
          ) {
            (await this.contextExists(projectPath, feature.id))
              ? featuresWithContext.push(feature)
              : featuresWithoutContext.push(feature);
          }
        }
      }
      const allInterruptedFeatures = [...featuresWithContext, ...featuresWithoutContext];
      if (allInterruptedFeatures.length === 0) return;
      this.eventBus.emitAutoModeEvent('auto_mode_resuming_features', {
        message: `Resuming ${allInterruptedFeatures.length} interrupted feature(s)`,
        projectPath,
        featureIds: allInterruptedFeatures.map((f) => f.id),
        features: allInterruptedFeatures.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          branchName: f.branchName ?? null,
          hasContext: featuresWithContext.some((fc) => fc.id === f.id),
        })),
      });
      for (const feature of allInterruptedFeatures) {
        try {
          if (!this.isFeatureRunningFn(feature.id))
            await this.resumeFeature(projectPath, feature.id, true);
        } catch {
          /* continue */
        }
      }
    } catch {
      /* ignore */
    }
  }
}
