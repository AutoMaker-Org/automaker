/**
 * Helper for creating test git repositories for integration tests
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a temporary git repository for testing
 */
export async function createTestGitRepo(): Promise<TestRepo> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'automaker-test-'));

  // Initialize git repo
  await execAsync('git init', { cwd: tmpDir });

  // Use environment variables instead of git config to avoid affecting user's git config
  // These env vars override git config without modifying it
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test User',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test User',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  // Create initial commit
  await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test Project\n');
  await execAsync('git add .', { cwd: tmpDir, env: gitEnv });
  await execAsync('git commit -m "Initial commit"', { cwd: tmpDir, env: gitEnv });

  // Create main branch explicitly
  await execAsync('git branch -M main', { cwd: tmpDir });

  return {
    path: tmpDir,
    cleanup: async () => {
      try {
        // Remove all worktrees first
        const { stdout } = await execAsync('git worktree list --porcelain', {
          cwd: tmpDir,
        }).catch(() => ({ stdout: '' }));

        const worktrees = stdout
          .split('\n\n')
          .slice(1) // Skip main worktree
          .map((block) => {
            const pathLine = block.split('\n').find((line) => line.startsWith('worktree '));
            return pathLine ? pathLine.replace('worktree ', '') : null;
          })
          .filter(Boolean);

        for (const worktreePath of worktrees) {
          try {
            await execAsync(`git worktree remove "${worktreePath}" --force`, {
              cwd: tmpDir,
            });
          } catch (err) {
            // Ignore errors
          }
        }

        // Remove the repository
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (error) {
        console.error('Failed to cleanup test repo:', error);
      }
    },
  };
}

/**
 * Create a feature file in the test repo
 */
export async function createTestFeature(
  repoPath: string,
  featureId: string,
  featureData: any
): Promise<void> {
  const featuresDir = path.join(repoPath, '.automaker', 'features');
  const featureDir = path.join(featuresDir, featureId);

  await fs.mkdir(featureDir, { recursive: true });
  await fs.writeFile(path.join(featureDir, 'feature.json'), JSON.stringify(featureData, null, 2));
}

/**
 * Get list of git branches
 */
export async function listBranches(repoPath: string): Promise<string[]> {
  const { stdout } = await execAsync('git branch --list', { cwd: repoPath });
  return stdout
    .split('\n')
    .map((line) => line.trim().replace(/^[*+]\s*/, ''))
    .filter(Boolean);
}

/**
 * Get list of git worktrees
 */
export async function listWorktrees(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: repoPath,
    });

    return stdout
      .split('\n\n')
      .slice(1) // Skip main worktree
      .map((block) => {
        const pathLine = block.split('\n').find((line) => line.startsWith('worktree '));
        return pathLine ? pathLine.replace('worktree ', '') : null;
      })
      .filter(Boolean) as string[];
  } catch {
    return [];
  }
}

/**
 * Check if a branch exists
 */
export async function branchExists(repoPath: string, branchName: string): Promise<boolean> {
  const branches = await listBranches(repoPath);
  return branches.includes(branchName);
}

/**
 * Check if a worktree exists
 */
export async function worktreeExists(repoPath: string, worktreePath: string): Promise<boolean> {
  const worktrees = await listWorktrees(repoPath);
  return worktrees.some((wt) => wt === worktreePath);
}
