/**
 * Electron implementation of ISessionsService
 * Wraps window.electronAPI.sessions methods
 */

import type {
  ISessionsService,
  SessionListItem,
  SessionCreateResult,
} from "../../interfaces/ISessionsService";
import type { ServiceResult } from "../../types";

export class ElectronSessionsService implements ISessionsService {
  async list(includeArchived?: boolean): Promise<ServiceResult<SessionListItem[]>> {
    if (!window.electronAPI?.sessions) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.sessions.list(includeArchived);

    if (result.success && result.sessions) {
      return { success: true, data: result.sessions };
    }

    return { success: false, error: result.error || "Failed to list sessions" };
  }

  async create(
    name: string,
    projectPath: string,
    workingDirectory?: string
  ): Promise<ServiceResult<SessionCreateResult>> {
    if (!window.electronAPI?.sessions) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.sessions.create(
      name,
      projectPath,
      workingDirectory
    );

    if (result.success && result.sessionId) {
      return {
        success: true,
        data: {
          sessionId: result.sessionId,
          name: result.name || name,
          projectPath: result.projectPath || projectPath,
          createdAt: result.createdAt || new Date().toISOString(),
        },
      };
    }

    return { success: false, error: result.error || "Failed to create session" };
  }

  async update(
    sessionId: string,
    name?: string,
    tags?: string[]
  ): Promise<ServiceResult> {
    if (!window.electronAPI?.sessions) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.sessions.update(sessionId, name, tags);
    return { success: result.success, error: result.error };
  }

  async archive(sessionId: string): Promise<ServiceResult> {
    if (!window.electronAPI?.sessions) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.sessions.archive(sessionId);
    return { success: result.success, error: result.error };
  }

  async unarchive(sessionId: string): Promise<ServiceResult> {
    if (!window.electronAPI?.sessions) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.sessions.unarchive(sessionId);
    return { success: result.success, error: result.error };
  }

  async delete(sessionId: string): Promise<ServiceResult> {
    if (!window.electronAPI?.sessions) {
      return { success: false, error: "Electron API not available" };
    }

    const result = await window.electronAPI.sessions.delete(sessionId);
    return { success: result.success, error: result.error };
  }

  async markClean(sessionId: string): Promise<ServiceResult> {
    if (!window.electronAPI?.sessions?.markClean) {
      return { success: false, error: "Mark clean not available" };
    }

    const result = await window.electronAPI.sessions.markClean(sessionId);
    return { success: result.success, error: result.error };
  }
}
