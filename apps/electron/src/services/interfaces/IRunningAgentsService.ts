/**
 * Running Agents Service Interface
 * Tracks currently running agent instances
 */

import type { ServiceResult, IService } from "../types";

export interface RunningAgent {
  featureId: string;
  projectPath: string;
  projectName: string;
  isAutoMode: boolean;
}

export interface RunningAgentsResult {
  runningAgents: RunningAgent[];
  totalCount: number;
  autoLoopRunning: boolean;
}

export interface IRunningAgentsService extends IService {
  /**
   * Get all currently running agents
   */
  getAll(): Promise<ServiceResult<RunningAgentsResult>>;
}
