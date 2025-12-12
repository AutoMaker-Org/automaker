/**
 * Mock implementation of IRunningAgentsService
 * For web development and testing without Electron
 */

import type {
  IRunningAgentsService,
  RunningAgentsResult,
} from "../../interfaces/IRunningAgentsService";
import type { ServiceResult } from "../../types";

export class MockRunningAgentsService implements IRunningAgentsService {
  async getAll(): Promise<ServiceResult<RunningAgentsResult>> {
    console.log("[Mock] Getting all running agents");

    // Return empty running agents in mock mode
    return {
      success: true,
      data: {
        runningAgents: [],
        totalCount: 0,
        autoLoopRunning: false,
      },
    };
  }
}
