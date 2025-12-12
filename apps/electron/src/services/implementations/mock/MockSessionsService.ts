/**
 * Mock implementation of ISessionsService
 * For web development and testing without Electron
 */

import type {
  ISessionsService,
  SessionListItem,
  SessionCreateResult,
} from "../../interfaces/ISessionsService";
import type { ServiceResult } from "../../types";

// Mock sessions storage
let mockSessions: SessionListItem[] = [];

export class MockSessionsService implements ISessionsService {
  async list(includeArchived?: boolean): Promise<ServiceResult<SessionListItem[]>> {
    console.log("[MockSessionsService] Listing sessions", { includeArchived });

    const sessions = includeArchived
      ? mockSessions
      : mockSessions.filter((s) => !s.isArchived);

    return { success: true, data: sessions };
  }

  async create(
    name: string,
    projectPath: string,
    _workingDirectory?: string
  ): Promise<ServiceResult<SessionCreateResult>> {
    console.log("[MockSessionsService] Creating session:", { name, projectPath });

    const sessionId = `session-${Date.now()}`;
    const now = new Date().toISOString();

    const newSession: SessionListItem = {
      id: sessionId,
      name,
      projectPath,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      isArchived: false,
      tags: [],
      preview: "",
    };

    mockSessions.push(newSession);

    return {
      success: true,
      data: {
        sessionId,
        name,
        projectPath,
        createdAt: now,
      },
    };
  }

  async update(
    sessionId: string,
    name?: string,
    tags?: string[]
  ): Promise<ServiceResult> {
    console.log("[MockSessionsService] Updating session:", { sessionId, name, tags });

    const session = mockSessions.find((s) => s.id === sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    if (name !== undefined) session.name = name;
    if (tags !== undefined) session.tags = tags;
    session.updatedAt = new Date().toISOString();

    return { success: true };
  }

  async archive(sessionId: string): Promise<ServiceResult> {
    console.log("[MockSessionsService] Archiving session:", sessionId);

    const session = mockSessions.find((s) => s.id === sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    session.isArchived = true;
    session.updatedAt = new Date().toISOString();

    return { success: true };
  }

  async unarchive(sessionId: string): Promise<ServiceResult> {
    console.log("[MockSessionsService] Unarchiving session:", sessionId);

    const session = mockSessions.find((s) => s.id === sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    session.isArchived = false;
    session.updatedAt = new Date().toISOString();

    return { success: true };
  }

  async delete(sessionId: string): Promise<ServiceResult> {
    console.log("[MockSessionsService] Deleting session:", sessionId);

    const index = mockSessions.findIndex((s) => s.id === sessionId);
    if (index === -1) {
      return { success: false, error: "Session not found" };
    }

    mockSessions.splice(index, 1);

    return { success: true };
  }

  async markClean(sessionId: string): Promise<ServiceResult> {
    console.log("[MockSessionsService] Marking session clean:", sessionId);

    const session = mockSessions.find((s) => s.id === sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    session.isDirty = false;

    return { success: true };
  }
}
