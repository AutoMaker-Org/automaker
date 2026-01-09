/**
 * Branch tracking utilities
 *
 * Tracks active branches in .automaker so users
 * can switch between branches even after worktrees are removed.
 */

import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { getBranchTrackingPath, ensureAutomakerDir } from '@automaker/platform';
import { createLogger } from '@automaker/utils';

const logger = createLogger('BranchTracking');

export interface TrackedBranch {
  name: string;
  createdAt: string;
  lastActivatedAt?: string;
}

interface BranchTrackingData {
  branches: TrackedBranch[];
}

/**
 * Read tracked branches from file
 */
export async function getTrackedBranches(projectPath: string): Promise<TrackedBranch[]> {
  try {
    const filePath = getBranchTrackingPath(projectPath);
    const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
    const data: BranchTrackingData = JSON.parse(content);
    return data.branches || [];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    logger.warn('Failed to read tracked branches:', error);
    return [];
  }
}

/**
 * Save tracked branches to file
 */
async function saveTrackedBranches(projectPath: string, branches: TrackedBranch[]): Promise<void> {
  const automakerDir = await ensureAutomakerDir(projectPath);
  const filePath = path.join(automakerDir, 'active-branches.json');
  const data: BranchTrackingData = { branches };
  await secureFs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Add a branch to tracking
 */
export async function trackBranch(projectPath: string, branchName: string): Promise<void> {
  const branches = await getTrackedBranches(projectPath);

  // Check if already tracked
  const existing = branches.find((b) => b.name === branchName);
  if (existing) {
    return; // Already tracked
  }

  branches.push({
    name: branchName,
    createdAt: new Date().toISOString(),
  });

  await saveTrackedBranches(projectPath, branches);
  logger.info(`Now tracking branch: ${branchName}`);
}

/**
 * Remove a branch from tracking
 */
export async function untrackBranch(projectPath: string, branchName: string): Promise<void> {
  const branches = await getTrackedBranches(projectPath);
  const filtered = branches.filter((b) => b.name !== branchName);

  if (filtered.length !== branches.length) {
    await saveTrackedBranches(projectPath, filtered);
    logger.info(`Stopped tracking branch: ${branchName}`);
  }
}

/**
 * Update last activated timestamp for a branch
 */
export async function updateBranchActivation(
  projectPath: string,
  branchName: string
): Promise<void> {
  const branches = await getTrackedBranches(projectPath);
  const branch = branches.find((b) => b.name === branchName);

  if (branch) {
    branch.lastActivatedAt = new Date().toISOString();
    await saveTrackedBranches(projectPath, branches);
  }
}

/**
 * Check if a branch is tracked
 */
export async function isBranchTracked(projectPath: string, branchName: string): Promise<boolean> {
  const branches = await getTrackedBranches(projectPath);
  return branches.some((b) => b.name === branchName);
}
