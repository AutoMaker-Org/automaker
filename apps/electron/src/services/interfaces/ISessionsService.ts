/**
 * Sessions Service Interface
 * Manages chat session CRUD operations
 */

import type { ServiceResult, IService } from "../types";

export interface SessionListItem {
  id: string;
  name: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isArchived: boolean;
  isDirty?: boolean;
  tags: string[];
  preview: string;
}

export interface SessionCreateResult {
  sessionId: string;
  name: string;
  projectPath: string;
  createdAt: string;
}

export interface ISessionsService extends IService {
  /**
   * List all sessions
   */
  list(includeArchived?: boolean): Promise<ServiceResult<SessionListItem[]>>;

  /**
   * Create a new session
   */
  create(
    name: string,
    projectPath: string,
    workingDirectory?: string
  ): Promise<ServiceResult<SessionCreateResult>>;

  /**
   * Update session metadata
   */
  update(
    sessionId: string,
    name?: string,
    tags?: string[]
  ): Promise<ServiceResult>;

  /**
   * Archive a session
   */
  archive(sessionId: string): Promise<ServiceResult>;

  /**
   * Unarchive a session
   */
  unarchive(sessionId: string): Promise<ServiceResult>;

  /**
   * Delete a session permanently
   */
  delete(sessionId: string): Promise<ServiceResult>;

  /**
   * Mark session as clean/reviewed
   */
  markClean?(sessionId: string): Promise<ServiceResult>;
}
