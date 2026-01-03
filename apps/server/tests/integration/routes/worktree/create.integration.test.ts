import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCreateHandler } from '@/routes/worktree/routes/create.js';
import { AUTOMAKER_INITIAL_COMMIT_MESSAGE } from '@/routes/worktree/common.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execAsync = promisify(exec);

describe('worktree create route - repositories without commits', () => {
  let repoPath: string | null = null;

  async function initRepoWithoutCommit() {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'automaker-no-commit-'));
    await execAsync('git init', { cwd: repoPath });
    // Don't set git config - use environment variables in commit operations instead
    // to avoid affecting user's git config
    // Intentionally skip creating an initial commit
  }

  afterEach(async () => {
    if (!repoPath) {
      return;
    }
    await fs.rm(repoPath, { recursive: true, force: true });
    repoPath = null;
  });

  it('creates an initial commit before adding a worktree when HEAD is missing', async () => {
    await initRepoWithoutCommit();
    const handler = createCreateHandler();

    const json = vi.fn();
    const status = vi.fn().mockReturnThis();
    const req = {
      body: { projectPath: repoPath, branchName: 'feature/no-head' },
    } as any;
    const res = {
      json,
      status,
    } as any;

    await handler(req, res);

    expect(status).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalled();
    const payload = json.mock.calls[0][0];
    expect(payload.success).toBe(true);

    const { stdout: commitCount } = await execAsync('git rev-list --count HEAD', {
      cwd: repoPath!,
    });
    expect(Number(commitCount.trim())).toBeGreaterThan(0);

    const { stdout: latestMessage } = await execAsync('git log -1 --pretty=%B', { cwd: repoPath! });
    expect(latestMessage.trim()).toBe(AUTOMAKER_INITIAL_COMMIT_MESSAGE);
  });
});
