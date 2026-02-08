/**
 * Forge Detector - Auto-detect git forge type (GitHub, Gitea) from remote URL
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';
import type { ForgeType, ForgeRemoteInfo } from '@automaker/types';

const logger = createLogger('ForgeDetector');
const execAsync = promisify(exec);

// Extended PATH for common tool installation locations
const extendedPath = [
  process.env.PATH,
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/home/linuxbrew/.linuxbrew/bin',
  `${process.env.HOME}/.local/bin`,
]
  .filter(Boolean)
  .join(':');

const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

const GITHUB_HTTPS_REGEX = /https:\/\/github\.com\/([^/]+)\/([^/.]+)/;
const GITHUB_SSH_REGEX = /git@github\.com:([^/]+)\/([^/.]+)/;

// Generic HTTPS git remote: https://host/owner/repo.git or https://host/owner/repo
const GENERIC_HTTPS_REGEX = /https?:\/\/([^/]+)\/([^/]+)\/([^/.]+?)(?:\.git)?$/;
// Generic SSH git remote: git@host:owner/repo.git
const GENERIC_SSH_REGEX = /git@([^:]+):([^/]+)\/([^/.]+?)(?:\.git)?$/;

/** Cache entry for forge detection results */
interface CacheEntry {
  result: ForgeRemoteInfo;
  timestamp: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const forgeCache = new Map<string, CacheEntry>();

/**
 * Detect the forge type for a git project by inspecting its remote URL.
 *
 * 1. If URL matches github.com → type 'github'
 * 2. Otherwise, probe {baseUrl}/api/v1/version to detect Gitea
 * 3. Falls back to 'unknown'
 */
export async function detectForge(projectPath: string): Promise<ForgeRemoteInfo> {
  const result: ForgeRemoteInfo = {
    type: 'unknown',
    baseUrl: null,
    owner: null,
    repo: null,
    remoteUrl: null,
  };

  // Get the remote URL
  let remoteUrl = '';
  try {
    const { stdout } = await execAsync('git remote get-url origin', {
      cwd: projectPath,
      env: execEnv,
    });
    remoteUrl = stdout.trim();
    result.remoteUrl = remoteUrl || null;
  } catch {
    return result;
  }

  if (!remoteUrl) {
    return result;
  }

  // Check for GitHub
  const githubHttps = remoteUrl.match(GITHUB_HTTPS_REGEX);
  const githubSsh = remoteUrl.match(GITHUB_SSH_REGEX);
  const githubMatch = githubHttps || githubSsh;

  if (githubMatch) {
    result.type = 'github';
    result.baseUrl = 'https://github.com';
    result.owner = githubMatch[1];
    result.repo = githubMatch[2].replace(/\.git$/, '');
    return result;
  }

  // Try to parse as generic git remote and probe for Gitea
  const httpsMatch = remoteUrl.match(GENERIC_HTTPS_REGEX);
  const sshMatch = remoteUrl.match(GENERIC_SSH_REGEX);

  if (httpsMatch) {
    const [, host, owner, repo] = httpsMatch;
    const baseUrl = `https://${host}`;
    result.owner = owner;
    result.repo = repo;
    result.baseUrl = baseUrl;

    if (await isGiteaInstance(baseUrl)) {
      result.type = 'gitea';
      return result;
    }
  } else if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    const baseUrl = `https://${host}`;
    result.owner = owner;
    result.repo = repo;
    result.baseUrl = baseUrl;

    if (await isGiteaInstance(baseUrl)) {
      result.type = 'gitea';
      return result;
    }
  }

  return result;
}

/**
 * Cached version of detectForge with 60s TTL.
 */
export async function detectForgeCached(projectPath: string): Promise<ForgeRemoteInfo> {
  const cached = forgeCache.get(projectPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const result = await detectForge(projectPath);
  forgeCache.set(projectPath, { result, timestamp: Date.now() });
  return result;
}

/**
 * Probe a URL to check if it's a Gitea instance by calling /api/v1/version.
 */
async function isGiteaInstance(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/api/v1/version`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { version?: string };
    // Gitea returns { "version": "1.x.x" }
    return typeof data.version === 'string';
  } catch (error) {
    logger.debug(`Gitea probe failed for ${baseUrl}:`, error);
    return false;
  }
}
