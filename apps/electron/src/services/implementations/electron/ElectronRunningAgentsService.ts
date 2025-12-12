/**
 * Electron implementation of IRunningAgentsService
 * Wraps window.electronAPI.runningAgents methods
 */

import type {
  IRunningAgentsService,
  RunningAgentsResult,
} from "../../interfaces/IRunningAgentsService";
import type { ServiceResult } from "../../types";

export class ElectronRunningAgentsService implements IRunningAgentsService {
  async getAll(): Promise<ServiceResult<RunningAgentsResult>> {
    if (!window.electronAPI?.runningAgents) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.runningAgents.getAll();

    if (result.success) {
      return {
        success: true,
        data: {
          runningAgents: result.runningAgents || [],
          totalCount: result.totalCount || 0,
          autoLoopRunning: result.autoLoopRunning || false,
        },
      };
    }

    return { success: false, error: result.error || "Failed to get running agents" };
  }
}
