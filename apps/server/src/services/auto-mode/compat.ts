/**
 * Compatibility Shim - Provides AutoModeService-like interface using the new architecture
 *
 * This allows existing routes to work without major changes during the transition.
 * Routes receive this shim which delegates to GlobalAutoModeService and facades.
 *
 * This is a TEMPORARY shim - routes should be updated to use the new interface directly.
 */

import type { Feature } from '@automaker/types';
import type { EventEmitter } from '../../lib/events.js';
import { GlobalAutoModeService } from './global-service.js';
import { AutoModeServiceFacade } from './facade.js';
import type { SettingsService } from '../settings-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { ClaudeUsageService } from '../claude-usage-service.js';
import type { FacadeOptions, AutoModeStatus, RunningAgentInfo } from './types.js';

/**
 * AutoModeServiceCompat wraps GlobalAutoModeService and facades to provide
 * the old AutoModeService interface that routes expect.
 */
export class AutoModeServiceCompat {
  private readonly globalService: GlobalAutoModeService;
  private readonly facadeOptions: FacadeOptions;
  private readonly facadeCache = new Map<string, AutoModeServiceFacade>();

  constructor(
    events: EventEmitter,
    settingsService: SettingsService | null,
    featureLoader: FeatureLoader,
    claudeUsageService?: ClaudeUsageService | null
  ) {
    this.globalService = new GlobalAutoModeService(events, settingsService, featureLoader);
    const sharedServices = this.globalService.getSharedServices();

    this.facadeOptions = {
      events,
      settingsService,
      featureLoader,
      sharedServices,
      claudeUsageService: claudeUsageService ?? null,
    };
  }

  /**
   * Get the global service for direct access
   */
  getGlobalService(): GlobalAutoModeService {
    return this.globalService;
  }

  /**
   * Get or create a facade for a specific project.
   * Facades are cached by project path so that auto loop state
   * (stored in the facade's AutoLoopCoordinator) persists across API calls.
   */
  createFacade(projectPath: string): AutoModeServiceFacade {
    let facade = this.facadeCache.get(projectPath);
    if (!facade) {
      facade = AutoModeServiceFacade.create(projectPath, this.facadeOptions);
      this.facadeCache.set(projectPath, facade);
    }
    return facade;
  }

  // ===========================================================================
  // GLOBAL OPERATIONS (delegated to GlobalAutoModeService)
  // ===========================================================================

  getStatus(): AutoModeStatus {
    return this.globalService.getStatus();
  }

  getActiveAutoLoopProjects(): string[] {
    return this.globalService.getActiveAutoLoopProjects();
  }

  getActiveAutoLoopWorktrees(): Array<{ projectPath: string; branchName: string | null }> {
    return this.globalService.getActiveAutoLoopWorktrees();
  }

  async getRunningAgents(): Promise<RunningAgentInfo[]> {
    return this.globalService.getRunningAgents();
  }

  async markAllRunningFeaturesInterrupted(reason?: string): Promise<void> {
    return this.globalService.markAllRunningFeaturesInterrupted(reason);
  }

  // ===========================================================================
  // PER-PROJECT OPERATIONS (delegated to facades)
  // ===========================================================================

  async getStatusForProject(
    projectPath: string,
    branchName: string | null = null
  ): Promise<{
    isAutoLoopRunning: boolean;
    runningFeatures: string[];
    runningCount: number;
    maxConcurrency: number;
    branchName: string | null;
  }> {
    const facade = this.createFacade(projectPath);
    return facade.getStatusForProject(branchName);
  }

  isAutoLoopRunningForProject(projectPath: string, branchName: string | null = null): boolean {
    const facade = this.createFacade(projectPath);
    return facade.isAutoLoopRunning(branchName);
  }

  async startAutoLoopForProject(
    projectPath: string,
    branchName: string | null = null,
    maxConcurrency?: number
  ): Promise<number> {
    const facade = this.createFacade(projectPath);
    return facade.startAutoLoop(branchName, maxConcurrency);
  }

  async stopAutoLoopForProject(
    projectPath: string,
    branchName: string | null = null
  ): Promise<number> {
    const facade = this.createFacade(projectPath);
    return facade.stopAutoLoop(branchName);
  }

  async executeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = false,
    isAutoMode = false,
    providedWorktreePath?: string,
    options?: { continuationPrompt?: string; _calledInternally?: boolean }
  ): Promise<void> {
    const facade = this.createFacade(projectPath);
    return facade.executeFeature(
      featureId,
      useWorktrees,
      isAutoMode,
      providedWorktreePath,
      options
    );
  }

  async stopFeature(featureId: string): Promise<boolean> {
    // Stop feature is tricky - we need to find which project the feature is running in
    // The concurrency manager tracks this
    const runningAgents = await this.getRunningAgents();
    const agent = runningAgents.find((a) => a.featureId === featureId);
    if (agent) {
      const facade = this.createFacade(agent.projectPath);
      return facade.stopFeature(featureId);
    }
    return false;
  }

  async resumeFeature(projectPath: string, featureId: string, useWorktrees = false): Promise<void> {
    const facade = this.createFacade(projectPath);
    return facade.resumeFeature(featureId, useWorktrees);
  }

  async followUpFeature(
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[],
    useWorktrees = true
  ): Promise<void> {
    const facade = this.createFacade(projectPath);
    return facade.followUpFeature(featureId, prompt, imagePaths, useWorktrees);
  }

  async verifyFeature(projectPath: string, featureId: string): Promise<boolean> {
    const facade = this.createFacade(projectPath);
    return facade.verifyFeature(featureId);
  }

  async commitFeature(
    projectPath: string,
    featureId: string,
    providedWorktreePath?: string
  ): Promise<string | null> {
    const facade = this.createFacade(projectPath);
    return facade.commitFeature(featureId, providedWorktreePath);
  }

  async contextExists(projectPath: string, featureId: string): Promise<boolean> {
    const facade = this.createFacade(projectPath);
    return facade.contextExists(featureId);
  }

  async analyzeProject(projectPath: string): Promise<void> {
    const facade = this.createFacade(projectPath);
    return facade.analyzeProject();
  }

  async resolvePlanApproval(
    projectPath: string,
    featureId: string,
    approved: boolean,
    editedPlan?: string,
    feedback?: string
  ): Promise<{ success: boolean; error?: string }> {
    const facade = this.createFacade(projectPath);
    return facade.resolvePlanApproval(featureId, approved, editedPlan, feedback);
  }

  async resumeInterruptedFeatures(projectPath: string): Promise<void> {
    const facade = this.createFacade(projectPath);
    return facade.resumeInterruptedFeatures();
  }

  async checkWorktreeCapacity(
    projectPath: string,
    featureId: string
  ): Promise<{
    hasCapacity: boolean;
    currentAgents: number;
    maxAgents: number;
    branchName: string | null;
  }> {
    const facade = this.createFacade(projectPath);
    return facade.checkWorktreeCapacity(featureId);
  }

  async detectOrphanedFeatures(
    projectPath: string
  ): Promise<Array<{ feature: Feature; missingBranch: string }>> {
    const facade = this.createFacade(projectPath);
    return facade.detectOrphanedFeatures();
  }
}
