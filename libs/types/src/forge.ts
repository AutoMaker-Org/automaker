/**
 * Forge Types - Shared type definitions for git forge integration (GitHub, Gitea, etc.)
 */

/** Supported forge types */
export type ForgeType = 'github' | 'gitea' | 'unknown';

/** Information about a detected git forge remote */
export interface ForgeRemoteInfo {
  /** Detected forge type */
  type: ForgeType;
  /** Base URL of the forge instance (e.g., 'https://github.com' or 'https://gitea.example.com') */
  baseUrl: string | null;
  /** Repository owner/organization */
  owner: string | null;
  /** Repository name */
  repo: string | null;
  /** Full remote URL as configured in git */
  remoteUrl: string | null;
}
